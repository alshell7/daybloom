// Install steps for macOS, Windows and Android (once a release has its APK), one action per step (ASD-STE100 style, as in the
// README). The visitor's own system opens first; downloading ticks the first step in lume.

import { useEffect, useState } from "react";
import { Check, Download, RefreshCw, ShieldCheck } from "lucide-react";
import { mb, useRelease } from "@/lib/release";
import { cn } from "@/lib/utils";
import { DOWNLOADED, useOS } from "../DownloadButtons";
import { burst } from "../ui/confetti";
import { SectionHead } from "../ui/section-head";
import { Segmented } from "../ui/segmented";

type Sys = "mac" | "windows" | "android";

export function Install() {
  const os = useOS();
  const r = useRelease();
  const [sys, setSys] = useState<Sys>("mac");
  const [done, setDone] = useState<Record<Sys, boolean>>({
    mac: false,
    windows: false,
    android: false,
  });
  useEffect(() => {
    if (os === "windows") setSys("windows");
    if (os === "android" && r.android) setSys("android");
  }, [os, r.android]);
  useEffect(() => {
    const on = (e: Event) => {
      const which = (e as CustomEvent<Sys>).detail;
      setDone((d) => ({ ...d, [which]: true }));
      setSys(which);
    };
    window.addEventListener(DOWNLOADED, on);
    return () => window.removeEventListener(DOWNLOADED, on);
  }, []);

  const asset = sys === "mac" ? r.mac : sys === "windows" ? r.win : r.android;
  const steps =
    sys === "android"
      ? [
          <>
            On your phone, download{" "}
            <code className="code">
              {r.android?.name ?? "Daybloom_<version>_android.apk"}
            </code>
            .
          </>,
          <>Open the file.</>,
          <>If Android asks, allow your browser to install apps.</>,
          <>
            Tap <b>Install</b>, then <b>Open</b>.
          </>,
        ]
      : sys === "mac"
        ? [
            <>
              Download{" "}
              <code className="code">
                {r.mac?.name ?? "Daybloom_<version>_universal.dmg"}
              </code>
              . It works on Apple silicon and Intel Macs.
            </>,
            <>
              Open the <code className="code">.dmg</code> file.
            </>,
            <>
              Drag <b>Daybloom</b> into <b>Applications</b>.
            </>,
            <>
              Open Daybloom from <b>Applications</b>.
            </>,
            <>
              If macOS stops the app, open{" "}
              <b>System Settings › Privacy &amp; Security</b>.
            </>,
            <>
              Scroll to <b>Security</b>. Click <b>Open Anyway</b> next to the
              Daybloom message.
            </>,
          ]
        : [
            <>
              Download{" "}
              <code className="code">
                {r.win?.name ?? "Daybloom_<version>_x64-setup.exe"}
              </code>
              .
            </>,
            <>Run the installer.</>,
            <>
              If Microsoft Defender SmartScreen shows a warning, click{" "}
              <b>More info</b>.
            </>,
            <>
              Click <b>Run anyway</b>.
            </>,
          ];

  return (
    <section
      id="install"
      aria-labelledby="install-title"
      className="py-20 sm:py-28"
    >
      <div className="container-page grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,600px)] lg:gap-20">
        <div>
          <SectionHead
            id="install-title"
            title="Install Daybloom."
            lead="It takes a minute. Daybloom is small: a single universal app for Mac, and a light installer for Windows."
          />
          {os === "other" && (
            <p className="mt-5 max-w-[46ch] text-[15px] text-ink-2">
              Daybloom runs on Mac and Windows computers
              {r.android ? " and on Android phones" : ""}. Open this page on one
              of them to install it.
            </p>
          )}
          <dl className="tnum mt-9 grid max-w-[420px] grid-cols-2 gap-px overflow-hidden rounded-[18px] border border-line-strong bg-line-strong text-[14px]">
            {[
              ["macOS", "11 or later"],
              ["Windows", "10 and 11"],
              ["Mac download", r.mac ? mb(r.mac.size) : "—"],
              ["Windows download", r.win ? mb(r.win.size) : "—"],
              ...(r.android
                ? [
                    ["Android", "8 or later"],
                    ["Android download", mb(r.android.size)],
                  ]
                : []),
            ].map(([k, v]) => (
              <div key={k} className="bg-raised px-4 py-3.5">
                <dt className="text-[12.5px] text-ink-3">{k}</dt>
                <dd className="mt-0.5 font-medium text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-8 grid max-w-[460px] gap-3 text-[14px] leading-[1.55] text-ink-2">
            <p className="flex gap-2.5">
              <RefreshCw
                className="mt-0.5 size-4 shrink-0 text-ink-3"
                aria-hidden="true"
              />
              <span>
                Daybloom checks for updates when it starts and every 6 hours.
                When one is ready, an{" "}
                <b className="font-medium text-ink">Update</b> chip shows in the
                top bar. Click it, and Daybloom restarts with the new version.
              </span>
            </p>
            <p className="flex gap-2.5">
              <ShieldCheck
                className="mt-0.5 size-4 shrink-0 text-ink-3"
                aria-hidden="true"
              />
              <span>
                Daybloom installs only updates with a valid signature.
              </span>
            </p>
          </div>
        </div>

        <div className="rounded-[22px] border border-line bg-raised p-5 shadow-rest sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Segmented
              label="Your device"
              value={sys}
              onChange={setSys}
              size="lg"
              options={[
                { value: "mac", label: "macOS" },
                { value: "windows", label: "Windows" },
                ...(r.android
                  ? [{ value: "android" as const, label: "Android" }]
                  : []),
              ]}
            />
            <a
              href={asset?.url ?? r.page}
              onClick={(e) => {
                void burst(e.currentTarget);
                setDone((d) => ({ ...d, [sys]: true }));
              }}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-[14px] font-medium text-ink-inverse transition-[background-color,transform] duration-150 hover:bg-[color-mix(in_srgb,var(--ink),var(--signal)_12%)] active:scale-[0.97]"
            >
              <Download
                className="size-4"
                aria-hidden="true"
                strokeWidth={2.2}
              />
              {sys === "mac"
                ? "Download for macOS"
                : sys === "windows"
                  ? "Download for Windows"
                  : "Download for Android"}
            </a>
          </div>
          <ol className="mt-7 grid gap-1">
            {steps.map((s, i) => {
              const ticked = i === 0 && done[sys];
              return (
                <li
                  key={`${sys}${i}`}
                  className="grid grid-cols-[32px_1fr] items-start gap-3.5 rounded-[14px] px-1 py-2.5 [animation:rise-in_.35s_var(--ease-out)_both]"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <span
                    className={cn(
                      "tnum grid size-8 place-items-center rounded-full text-[13px] font-medium transition-colors duration-300",
                      ticked
                        ? "bg-lume text-[#141b29] shadow-[0_0_10px_color-mix(in_srgb,var(--lume)_55%,transparent)]"
                        : "bg-sunken text-ink-2",
                    )}
                  >
                    {ticked ? (
                      <Check
                        className="size-4"
                        strokeWidth={3}
                        aria-label="done"
                      />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span
                    className={cn(
                      "pt-1 text-[15.5px] leading-[1.5] text-ink [&_b]:font-medium",
                      ticked && "text-ink-3",
                    )}
                  >
                    {s}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-5 rounded-[14px] bg-sunken px-4 py-3 text-[13.5px] leading-[1.55] text-ink-2">
            {sys === "android"
              ? "Daybloom for Android comes from GitHub, not from Google Play, so Android asks you once. Later updates install with one tap in the app."
              : sys === "mac"
                ? "Daybloom is not notarised by Apple yet. Thus macOS asks you once. Later updates install without this step."
                : "The .msi file is an alternative for managed computers. Daybloom is not code-signed yet, so SmartScreen asks you once. Later updates install without this step."}
            {sys === "windows" && r.msi && (
              <>
                {" "}
                <a
                  href={r.msi.url}
                  className="font-medium text-ink underline underline-offset-4"
                >
                  Get the .msi ({mb(r.msi.size)})
                </a>
              </>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
