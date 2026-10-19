# Calendar integration

Daybloom shows read-only events from external calendars next to local tasks on the dial. Two sources are supported:

- **Google Calendar**: any number of Google accounts at once (for example work and personal), signed in with OAuth.
- **ICS / webcal subscriptions**: any calendar published as an `.ics` link (Outlook, iCloud, Fastmail, school or sports calendars, or a Google "secret address"). This source also lets you test the feature without Google credentials.

All the code lives in `src/lib/calendar/`. It is plain TypeScript with no Svelte imports, so the UI wraps it.

## Architecture

```
UI (Svelte runes)
   │  subscribe / eventsBetween / connectGoogle / addIcs / sync …
   ▼
service.ts  ── createCalendarService() / calendarService singleton
   │  accounts + event cache, throttled parallel sync, persistence, cross-window reload
   ├── google.ts  CalendarProvider: OAuth (PKCE + loopback), token refresh, Calendar API v3
   └── ics.ts     CalendarProvider: feed fetch + RFC 5545 parser (parseIcs) + RRULE expansion
   ▼
platform.ts  fetch (no CORS in the shell) · secrets (OS keychain) · oauth.listen/wait · openExternal · load/save
```

| File | Purpose |
| --- | --- |
| `types.ts` | `CalendarAccount`, `CalendarInfo`, `CalendarProvider`, `TimeRange`, `CalendarError`, `RECONNECT` |
| `google.ts` | Google provider, `setGoogleClient` / `getGoogleClient`, pure mappers `mapGoogleEvent` / `mapCalendarListEntry` |
| `ics.ts` | ICS provider, `parseIcs(text, range)`, `zonedTimeToUtc`, `normalizeIcsUrl` |
| `service.ts` | `createCalendarService()`, `calendarService`, `defaultSyncWindow()` |
| `index.ts` | Public exports. UI code imports from `src/lib/calendar`. |

Events use the shared `CalendarEvent` type from `src/lib/engine/types.ts`. Event ids are `${calendarId}:${providerEventId}`. They are unique within an account, so the dial key `cal:<accountId>:<eventId>` is globally unique.

### Using it from the UI

```ts
import { calendarService as cal, type CalendarAccount } from './lib/calendar';
import type { CalendarEvent } from './lib/engine/types';

let accounts = $state.raw<readonly CalendarAccount[]>([]);
let events = $state.raw<CalendarEvent[]>([]);
const refresh = () => {
  accounts = cal.getAccounts();
  events = cal.eventsBetween(dayStart, dayEnd);
};
cal.subscribe(refresh);                  // any change: accounts, events, status
await cal.init();                        // loads accounts + offline cache
const stop = cal.startAutoSync();        // main window only (see below)
```

- Call `cal.sync(range)` when the user views a range outside the default window (yesterday through 14 days ahead), for example a month view. Calls are queued and throttled for each account, so calling it on every navigation is safe.
- `cal.sync(undefined, { force: true })` is for a "Sync now" button.
- `account.error === 'reconnect'` (`RECONNECT`) means the Google grant was revoked or expired. Show a **Reconnect** button that calls `cal.connectGoogle()`. Reconnecting the same Google account updates it in place. Any other non-null `error` is a message you can show to the user.
- All thrown errors are `CalendarError` with a `code` (`config`, `cancelled`, `auth`, `network`, `http`, `invalid`, `reconnect`) and a message that is friendly enough to show directly.
- Run `startAutoSync()` in the **main** window only. The widget window should just call `init()` and `subscribe()`. It reloads automatically when the main window saves, through `platform.onExternalChange`.

## Multiple accounts

- Each connected source is a `CalendarAccount`. Google accounts have the id `google:<sub>`, where `sub` is the stable OpenID subject from `userinfo`. ICS accounts have the id `ics:<hash of URL>`. Connecting the same Google account or URL again updates the existing entry and keeps the user's calendar toggles.
- The authorization URL uses `prompt=select_account consent`. Google therefore always shows the account picker, so a second account can be chosen, and always issues a fresh refresh token.
- Sync runs every enabled calendar of every enabled account in parallel, with at most 4 provider requests in flight. Each account and each calendar fails independently:
  - The error is recorded on that account.
  - The account's last good events stay in the cache.
  - Other accounts are unaffected.
- `eventsBetween` returns only events from enabled accounts and calendars. Disabled calendars are not fetched.

## Where tokens live

| Data | Location |
| --- | --- |
| Google refresh token | OS keychain only, under `platform.secrets` key `google:<sub>`. Removing the account revokes it at Google and deletes it from the keychain. |
| Google access token | In memory only, per window. It is refreshed about 60 s before expiry, with a single refresh in flight per account. A 401 triggers one refresh and a retry. |
| Accounts (`calendars` key) | `platform.save` app-data JSON. The persisted fields are whitelisted and contain no tokens. |
| Event cache (`calendar-cache` key) | App-data JSON covering yesterday through +14 days, so the widget renders offline. |
| Custom OAuth client (`calendar-google-client` key) | App-data JSON. Set through `calendarService.setGoogleClient()`. |

| ICS feed URL | OS keychain only, under `platform.secrets` key `ics:<hash>:url` (`icsSecretKey`). A "secret address" URL is a read-only credential for that calendar. The accounts JSON keeps only a shortened `displayUrl` (for example `calendar.google.com/…/basic.ics`) and `urlInKeychain: true`. Plain URLs written by older versions move to the keychain on first load. Removing the account deletes the entry. |

Network behaviour: 429, 5xx and Google's 403 `rateLimitExceeded` are retried up to 2 times with jittered exponential backoff (honouring `Retry-After`). `invalid_grant` marks the account `reconnect` instead of failing the sync.

## Setting up Google Calendar (developer)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project, for example **Daybloom**.
2. Open **APIs & Services → Library**, search for **Google Calendar API**, and click **Enable**. If you skip this step, sync fails with "The Google Calendar API isn't enabled…".
3. Open **Google Auth Platform** (formerly *OAuth consent screen*) and click **Get started**:
   - Enter an app name and a support email.
   - Set **Audience** to **External**.
   - Enter a contact email.
   - Under **Data access**, add the scopes `openid`, `.../auth/userinfo.email` and `.../auth/calendar.readonly`.
4. **Test users:** while the app's publishing status is **Testing**, only the Google accounts listed under **Audience → Test users** can sign in (up to 100). Add every account you will connect, including both your work and personal accounts. Google expires refresh tokens for Testing-mode apps after **7 days**, so those accounts show `reconnect` weekly. Publishing to production removes that limit. `calendar.readonly` is a *sensitive* scope, so production requires Google's app verification.
5. Open **Clients → Create client** and choose **Application type: Desktop app**. Name it and click **Create**. Copy the **Client ID** and **Client secret**.
   - Desktop clients accept any `http://127.0.0.1:<port>` loopback redirect, so there are no redirect URIs to register.
   - The secret of a Desktop client is not confidential. Google expects it to ship inside installed apps, and Daybloom sends it alongside PKCE.
6. Create `.env.local` in the project root. It is ignored by `.gitignore` (`.env.*`).

   ```dotenv
   VITE_GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
   VITE_GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxx
   ```

7. Restart `npm run tauri dev`. Google sign-in needs the desktop shell, because the loopback listener is in Rust. In a plain browser, `connectGoogle()` rejects with a `config` error.

Users can also paste their own client ID and secret in Settings. The UI should call `calendarService.setGoogleClient({ clientId, clientSecret })`, which persists the values and shares them with the widget window. Pass `null` to fall back to `.env`. Changing the client invalidates existing refresh tokens, so those accounts show `reconnect`.

If no client ID is configured, `connectGoogle()` throws a `CalendarError('config')` that explains what is needed. `calendarService.googleConfigured` lets Settings show a setup hint before the user tries.

### Shell requirements (Rust and capabilities)

- `platform.fetch` uses `@tauri-apps/plugin-http`. Its capability scope must allow:
  - `https://oauth2.googleapis.com/*`
  - `https://openidconnect.googleapis.com/*`
  - `https://www.googleapis.com/*`
  - `https://*` and `http://*` for user-supplied ICS feeds
- The `oauth_listen` / `oauth_wait` commands should bind `127.0.0.1` and return `code`, `state` and `error` from the first request to `/`, ignoring `/favicon.ico`. They should answer the browser with a short "You can close this tab" page.

## ICS subscriptions

`calendarService.addIcs(url, label?)` accepts `https://`, `http://`, `webcal://` and `webcals://` links (`webcal` is rewritten to `https`). The feed is fetched once to validate it and to read `X-WR-CALNAME` and `X-APPLE-CALENDAR-COLOR`. Each feed appears as a single calendar with the id `feed`. Feeds are fetched with `ETag` / `If-Modified-Since` and reused for 30 s within a sync.

`parseIcs(text, range)` is a pure function and supports:

- folding and text escapes
- `VALUE=DATE` all-day events, UTC, floating and `TZID` times, using `Intl` for IANA zones and also accepting Windows zone names, Mozilla-style prefixes and VTIMEZONE `X-LIC-LOCATION`
- `X-WR-TIMEZONE`
- `DTEND` and `DURATION`
- skipping `STATUS:CANCELLED`
- `RRULE` with FREQ `DAILY`/`WEEKLY`/`MONTHLY`/`YEARLY`, `INTERVAL`, `COUNT`, `UNTIL`, `BYDAY` (including ordinals like `2TU` and `-1FR` for monthly rules), `BYMONTHDAY`, `BYMONTH`, `BYSETPOS` and `WKST`
- `EXDATE`
- `RECURRENCE-ID` overrides (moved or cancelled instances)

Expansion is limited to the requested range and capped at 5,000 periods per series. Rules with unsupported parts (`BYHOUR`, `BYWEEKNO`, `HOURLY`, …) show only the first instance instead of guessing dates. In plain `vite dev`, most feeds are blocked by CORS, so test ICS feeds in `tauri dev`.

## Tests

```sh
npx vitest run src/lib/calendar
```

`platform` is mocked with `vi.mock('../platform', …)`. The tests cover ICS parsing and recurrence, Google mapping and the OAuth/refresh/retry flow (with mocked `fetch`), and service multi-account behaviour (with a fake provider).

## Path to write access (later)

1. **Scope upgrade.** Request the extra scope incrementally: run the same flow with `include_granted_scopes=true` and the new scope added, and check the `scope` returned with the token. The narrowest scope that fits is `https://www.googleapis.com/auth/calendar.app.created`, which lets Daybloom create a dedicated "Daybloom" calendar and manage only events on it. Use `calendar.events` only if writing into existing calendars is required. Store granted scopes on the account and expose `CalendarInfo.writable` from `accessRole` (`owner`/`writer`).
2. **Provider interface.** Add `createEvent` / `updateEvent` / `deleteEvent` to `CalendarProvider`. Use `events.insert` / `events.patch` with `If-Match: <etag>` to avoid overwriting remote edits.
3. **Mapping a Daybloom `Task` to a Google event:**
   - `summary` ← `title`
   - `description` ← `notes` plus the subtask checklist
   - Timed tasks: `start.dateTime` / `end.dateTime` ← `date` + `start` and `duration`, with `timeZone` set to the user's IANA zone.
   - "Anytime" tasks: `start.date` / `end.date` (end exclusive).
   - `recurrence` ← `RRULE:FREQ=…;INTERVAL=…;BYDAY=…;UNTIL=YYYYMMDDT235959Z|COUNT=…` built from `Task.recurrence`.
   - `skips` ← `EXDATE`s, or cancelled instances.
   - Per-occurrence `overrides` ← patches to individual instances.
   - `colorId` ← the nearest `GOOGLE_EVENT_COLORS` entry to the category colour.
   - `extendedProperties.private.daybloomTaskId` ← `task.id`. This keeps writes idempotent and lets sync skip echoing Daybloom's own events back as calendar events.
   - Completions stay local.
4. **Efficiency.** Switch the event fetch to incremental sync (`syncToken`), and handle `410 Gone` with a full resync.
