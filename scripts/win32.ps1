# Win32 helpers for scripts/windows-smoke.mjs (Windows PowerShell 5.1+).
# Usage: powershell -File win32.ps1 -Cmd <name> [-A ..] [-B ..] [-C ..] [-D ..]
# Every command prints a single JSON value on stdout.
param(
  [Parameter(Mandatory = $true)][string]$Cmd,
  [string]$A = '',
  [string]$B = '',
  [string]$C = '',
  [string]$D = ''
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Add-Type -ReferencedAssemblies System.Drawing, System.Windows.Forms -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class W {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint f, UIntPtr e);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool SystemParametersInfo(uint a, uint b, string c, uint d);
  [DllImport("user32.dll")] public static extern bool SetSysColors(int n, int[] el, int[] rgb);

  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }

  public class Win {
    public long hwnd; public uint pid; public string title; public string cls;
    public bool visible; public bool iconic; public int exStyle; public int z;
    public int x, y, w, h;
  }

  // Every top-level window, in z-order (z = 0 is the front-most).
  public static List<Win> All() {
    var list = new List<Win>();
    int z = 0;
    EnumWindows((h, l) => {
      var t = new StringBuilder(256); GetWindowText(h, t, 256);
      var c = new StringBuilder(256); GetClassName(h, c, 256);
      uint pid; GetWindowThreadProcessId(h, out pid);
      RECT r; GetWindowRect(h, out r);
      list.Add(new Win {
        hwnd = h.ToInt64(), pid = pid, title = t.ToString(), cls = c.ToString(),
        visible = IsWindowVisible(h), iconic = IsIconic(h), exStyle = GetWindowLong(h, -20), z = z++,
        x = r.Left, y = r.Top, w = r.Right - r.Left, h = r.Bottom - r.Top
      });
      return true;
    }, IntPtr.Zero);
    return list;
  }

  // Real hardware-level clicks (mouse_event), so the webview sees genuine input.
  public static void Click(int x, int y, int times) {
    SetCursorPos(x, y); Thread.Sleep(120);
    for (int i = 0; i < times; i++) {
      mouse_event(2, 0, 0, 0, UIntPtr.Zero); Thread.Sleep(45);
      mouse_event(4, 0, 0, 0, UIntPtr.Zero); Thread.Sleep(90);
    }
  }

  public static void Drag(int x, int y, int dx, int dy) {
    SetCursorPos(x, y); Thread.Sleep(120);
    mouse_event(2, 0, 0, 0, UIntPtr.Zero); Thread.Sleep(80);
    for (int i = 1; i <= 15; i++) { SetCursorPos(x + dx * i / 15, y + dy * i / 15); Thread.Sleep(35); }
    Thread.Sleep(200);
    mouse_event(4, 0, 0, 0, UIntPtr.Zero);
  }

  // Foreground-lock workaround: a synthetic Alt press lets a background process activate a window.
  public static bool Front(IntPtr h) {
    keybd_event(0x12, 0, 0, UIntPtr.Zero);
    bool ok = SetForegroundWindow(h);
    keybd_event(0x12, 0, 2, UIntPtr.Zero);
    return ok;
  }

  static Bitmap Grab(int x, int y, int w, int h) {
    var bmp = new Bitmap(w, h);
    using (var g = Graphics.FromImage(bmp)) g.CopyFromScreen(x, y, 0, 0, new Size(w, h));
    return bmp;
  }

  public static void Shot(string path, int x, int y, int w, int h) {
    using (var bmp = Grab(x, y, w, h)) bmp.Save(path, ImageFormat.Png);
  }

  public class Corners { public double black; public int r, g, b; }

  // Four corner patches of a window rect: outside the round dial they must show what is behind
  // the window. A "black box" makes them near-black.
  public static Corners Sample(int x, int y, int w, int h, int patch) {
    using (var bmp = Grab(x, y, w, h)) {
      int black = 0, total = 0; long r = 0, g = 0, b = 0;
      int[][] origins = { new[] { 3, 3 }, new[] { w - patch - 3, 3 }, new[] { 3, h - patch - 3 }, new[] { w - patch - 3, h - patch - 3 } };
      foreach (var o in origins)
        for (int i = 0; i < patch; i++)
          for (int j = 0; j < patch; j++) {
            var p = bmp.GetPixel(o[0] + i, o[1] + j);
            total++; r += p.R; g += p.G; b += p.B;
            if (p.R < 24 && p.G < 24 && p.B < 24) black++;
          }
      return new Corners { black = (double)black / total, r = (int)(r / total), g = (int)(g / total), b = (int)(b / total) };
    }
  }
}
'@

[void][W]::SetProcessDPIAware()

function Out-Json($v) { ConvertTo-Json -InputObject $v -Depth 5 -Compress }

function Get-Tree([int]$root) {
  $all = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine)
  $ids = New-Object System.Collections.Generic.HashSet[int]
  [void]$ids.Add($root)
  do {
    $added = $false
    foreach ($p in $all) {
      if ($ids.Contains([int]$p.ParentProcessId) -and -not $ids.Contains([int]$p.ProcessId)) {
        [void]$ids.Add([int]$p.ProcessId); $added = $true
      }
    }
  } while ($added)
  $all | Where-Object { $ids.Contains([int]$_.ProcessId) }
}

function Get-Role($p) {
  if ($p.CommandLine -match '--type=([\w-]+)') {
    $t = $Matches[1]
    if ($p.CommandLine -match '--utility-sub-type=([\w.]+)') { $t += ':' + ($Matches[1] -split '\.')[0] }
    return $t
  }
  if ($p.Name -like 'msedgewebview2*') { return 'browser' }
  return 'app'
}

switch ($Cmd) {
  'windows' {
    # -A: optional comma-separated pids to keep.
    $all = [W]::All()
    if ($A) { $keep = $A -split ',' | ForEach-Object { [uint32]$_ }; $all = @($all | Where-Object { $keep -contains $_.pid }) }
    Out-Json @($all)
  }
  'click' { [W]::Click([int]$A, [int]$B, [int]($(if ($C) { $C } else { 1 }))); Out-Json $true }
  'drag' { [W]::Drag([int]$A, [int]$B, [int]$C, [int]$D); Out-Json $true }
  'move' { Out-Json ([W]::SetCursorPos([int]$A, [int]$B)) }
  'front' { Out-Json ([W]::Front([IntPtr][long]$A)) }
  'show' { Out-Json ([W]::ShowWindow([IntPtr][long]$A, [int]$B)) }
  'post' { Out-Json ([W]::PostMessage([IntPtr][long]$A, [uint32]$B, [IntPtr][long]$C, [IntPtr][long]$D)) }
  'place' {
    # -A hwnd, -B "x,y,w,h": move/resize without changing z-order or activation.
    $r = $B -split ',' | ForEach-Object { [int]$_ }
    Out-Json ([W]::SetWindowPos([IntPtr][long]$A, [IntPtr]::Zero, $r[0], $r[1], $r[2], $r[3], 0x14))
  }
  'tray' {
    # Delivers a notification-area callback (tray-icon's WM_USER_TRAYICON = 6002) exactly as the
    # shell would: -A app pid, -B mouse message (0x201 down, 0x202 up).
    $t = [W]::All() | Where-Object { $_.pid -eq [uint32]$A -and $_.cls -eq 'tray_icon_app' } | Select-Object -First 1
    if (-not $t) { Out-Json $null; break }
    [void][W]::PostMessage([IntPtr]$t.hwnd, 6002, [IntPtr]::Zero, [IntPtr][long]$B)
    Out-Json $t.hwnd
  }
  'shot' {
    if ($B) { $r = $B -split ',' | ForEach-Object { [int]$_ } }
    else { $v = [System.Windows.Forms.SystemInformation]::VirtualScreen; $r = @($v.X, $v.Y, $v.Width, $v.Height) }
    [W]::Shot($A, $r[0], $r[1], $r[2], $r[3]); Out-Json $A
  }
  'corners' { $r = $A -split ',' | ForEach-Object { [int]$_ }; Out-Json ([W]::Sample($r[0], $r[1], $r[2], $r[3], 12)) }
  'screen' {
    $s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    Out-Json @{ w = $s.Width; h = $s.Height }
  }
  'resolution' {
    # Set-DisplayResolution chatters in UTF-16 on some images; keep stdout to the one JSON line.
    try { $null = Set-DisplayResolution -Width ([int]$A) -Height ([int]$B) -Force -ErrorAction Stop 2>&1 } catch { }
    $s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    Out-Json @{ w = $s.Width; h = $s.Height }
  }
  'wallpaper' {
    # Solid colour desktop (no image) so transparency is measurable: -A "r,g,b".
    # (Not `$c`: PowerShell names are case-insensitive, so that is the [string] parameter $C.)
    $rgb = $A -split ',' | ForEach-Object { [int]$_ }
    [void][W]::SetSysColors(1, @(1), @($rgb[0] + ($rgb[1] -shl 8) + ($rgb[2] -shl 16)))
    Set-ItemProperty 'HKCU:\Control Panel\Desktop' -Name Wallpaper -Value ''
    [void][W]::SystemParametersInfo(0x14, 0, '', 3)
    Out-Json $true
  }
  'aumid' {
    $sh = New-Object -ComObject Shell.Application
    $item = $sh.Namespace((Split-Path $A)).ParseName((Split-Path $A -Leaf))
    Out-Json ([string]$item.ExtendedProperty('System.AppUserModel.ID'))
  }
  'tree' {
    Out-Json @(Get-Tree ([int]$A) | ForEach-Object { @{ pid = $_.ProcessId; name = $_.Name; role = (Get-Role $_) } })
  }
  'cpu' {
    # -A root pid, -B seconds. CPU is summed over the app and every WebView2 child process;
    # `oneCore` uses the same unit as macOS top / Activity Monitor (100 = one core).
    $tree = @(Get-Tree ([int]$A))
    $t0 = @{}
    foreach ($p in $tree) { try { $t0[[int]$p.ProcessId] = (Get-Process -Id $p.ProcessId).TotalProcessorTime.TotalMilliseconds } catch { } }
    $sw = [Diagnostics.Stopwatch]::StartNew()
    Start-Sleep -Seconds ([int]$B)
    $el = $sw.Elapsed.TotalMilliseconds
    $rows = @(foreach ($p in $tree) {
      try {
        $gp = Get-Process -Id $p.ProcessId
        if (-not $t0.ContainsKey([int]$p.ProcessId)) { continue }
        $ms = $gp.TotalProcessorTime.TotalMilliseconds - $t0[[int]$p.ProcessId]
        [pscustomobject]@{
          pid = $p.ProcessId; name = $p.Name; role = (Get-Role $p)
          cpu = [math]::Round(100 * $ms / $el, 2)
          privateMB = [math]::Round($gp.PrivateMemorySize64 / 1MB, 1)
          workingSetMB = [math]::Round($gp.WorkingSet64 / 1MB, 1)
        }
      } catch { }
    })
    $sum = ($rows | Measure-Object -Property cpu -Sum).Sum
    $mem = ($rows | Measure-Object -Property privateMB -Sum).Sum
    $cores = [Environment]::ProcessorCount
    Out-Json @{
      seconds = [math]::Round($el / 1000, 1); cores = $cores
      oneCore = [math]::Round($sum, 2); machine = [math]::Round($sum / $cores, 2)
      privateMB = [math]::Round($mem, 1); processes = $rows
    }
  }
  default { throw "unknown command $Cmd" }
}
