<#
.SYNOPSIS
  Read-only on-device health check for the Hydrogen Music Android app.

.DESCRIPTION
  Uses the techniques from docs/ANDROID.md:
    - logcat for Node runtime startup lines (tag: NodejsPlugin) and front-end errors
    - adb forward + CDP to run JS inside the real device WebView and read live state
    - dumpsys for the media notification and the playback foreground service

  By default it does NOT restart the app; it only observes current state.
  Pass -Restart to force-stop and relaunch so the startup log is clean.

  Output: console summary + full report file (default <workspace>\diagnostics\device-health-<ts>.txt)

  NOTE: this file is intentionally ASCII-only. Windows PowerShell 5.1 decodes
  -File scripts using the ANSI codepage, so non-ASCII text here would corrupt parsing.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\mobile-test\device-health.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\mobile-test\device-health.ps1 -Restart -WaitSeconds 90
#>
[CmdletBinding()]
param(
  [string]$Adb,
  [string]$NodeBin,
  [string]$OutFile,
  [switch]$Restart,
  [int]$WaitSeconds = 75
)

$ErrorActionPreference = 'Continue'
$PKG  = 'com.hydrogen.music'
$PORT = 9222
if ($env:HM_DEVICE_CDP_PORT) { $PORT = [int]$env:HM_DEVICE_CDP_PORT }
$lines = New-Object System.Collections.Generic.List[string]

function Add([string]$s) { $script:lines.Add($s); Write-Host $s }
function Hdr([string]$s) { Add ''; Add ('=' * 70); Add "== $s"; Add ('=' * 70) }
function Kv($k, $v) { Add ("  {0,-34} {1}" -f $k, $v) }

function Resolve-AdbPath {
  param([string]$Explicit)
  if ($Explicit -and (Test-Path -LiteralPath $Explicit)) { return $Explicit }
  $c = 'C:\android-sdk\platform-tools\adb.exe'
  if (Test-Path -LiteralPath $c) { return $c }
  $cmd = Get-Command adb -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw 'adb not found'
}
function Resolve-NodePath {
  param([string]$Explicit)
  if ($Explicit -and (Test-Path -LiteralPath $Explicit)) { return $Explicit }
  $verDir = Join-Path $env:USERPROFILE '.workbuddy\binaries\node\versions'
  if (Test-Path -LiteralPath $verDir) {
    $c = Get-ChildItem -LiteralPath $verDir -Directory -ErrorAction SilentlyContinue |
         Sort-Object Name -Descending |
         ForEach-Object { Join-Path $_.FullName 'node.exe' } |
         Where-Object { Test-Path -LiteralPath $_ } |
         Select-Object -First 1
    if ($c) { return $c }
  }
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw 'node not found'
}

$Adb     = Resolve-AdbPath  $Adb
$NodeBin = Resolve-NodePath $NodeBin
$Repo    = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # project root

if (-not $OutFile) {
  $dir = Join-Path (Split-Path -Parent $Repo) 'diagnostics'
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $OutFile = Join-Path $dir ('device-health-{0:yyyyMMdd-HHmmss}.txt' -f (Get-Date))
}

function AdbOut([string[]]$a) { (& $Adb @a 2>&1 | Out-String) }

$script:LogCache = $null
function AllLog {
  if ($null -eq $script:LogCache) { $script:LogCache = (& $Adb logcat -d 2>&1) }
  return $script:LogCache
}
function LogcatGrep([string]$pattern, [int]$max = 40) {
  $hit = AllLog | Select-String -Pattern $pattern
  return ($hit | Select-Object -Last $max | ForEach-Object { $_.Line })
}

# ============================================================ device
Hdr '1. DEVICE'
$devRaw = AdbOut @('devices', '-l')
Add $devRaw.TrimEnd()
$serial = (($devRaw -split "`n") | Where-Object { $_ -match '\sdevice\s' } |
           ForEach-Object { ($_ -split '\s+')[0] } | Select-Object -First 1)
if (-not $serial) {
  Add '  !! no authorized device; cannot continue'
  $lines | Out-File -LiteralPath $OutFile -Encoding utf8
  exit 1
}
Kv 'serial'  $serial
Kv 'model'   (AdbOut @('shell','getprop','ro.product.model')).Trim()
Kv 'android' (AdbOut @('shell','getprop','ro.build.version.release')).Trim()
Kv 'sdk'     (AdbOut @('shell','getprop','ro.build.version.sdk')).Trim()
Kv 'abi'     (AdbOut @('shell','getprop','ro.product.cpu.abi')).Trim()
Kv 'screen'  ((AdbOut @('shell','wm','size') -replace '\s+', ' ').Trim())

# wake + stay awake: a sleeping screen pauses the app and suspends the Node runtime
& $Adb shell input keyevent KEYCODE_WAKEUP | Out-Null
& $Adb shell svc power stayon true | Out-Null
Add '  screen woken, stayon=true'

# ============================================================ install state
Hdr '2. APP INSTALL STATE'
$dump = AdbOut @('shell','dumpsys','package',$PKG)
if ($dump -match 'Unable to find package') {
  Add "  ** $PKG is NOT installed **"
} else {
  $vm = [regex]::Match($dump, 'versionName=([^\s]+)')
  $vc = [regex]::Match($dump, 'versionCode=(\d+)')
  $lu = [regex]::Match($dump, 'lastUpdateTime=([^\r\n]+)')
  $fc = [regex]::Match($dump, 'firstInstallTime=([^\r\n]+)')
  Kv 'versionName'     $vm.Groups[1].Value
  Kv 'versionCode'     $vc.Groups[1].Value
  Kv 'lastUpdateTime'  $lu.Groups[1].Value.Trim()
  Kv 'firstInstallTime' $fc.Groups[1].Value.Trim()
  $apkPath = [regex]::Match($dump, 'codePath=([^\r\n]+)').Groups[1].Value.Trim()
  Kv 'codePath' $apkPath
  # codePath is a directory (also named base.apk); resolve the real file with `pm path`
  $pmPath = (AdbOut @('shell','pm','path',$PKG) -replace 'package:','').Trim()
  Kv 'pm path' $pmPath
  if ($pmPath) {
    $lsLine = (AdbOut @('shell', "ls -l '$pmPath'")).Trim()
    $sz = [regex]::Match($lsLine, '\s(\d+)\s')
    $szVal = '?'
    if ($sz.Success) { $szVal = $sz.Groups[1].Value }
    Kv 'installed apk size (bytes)' $szVal
  }
}

# ============================================================ restart (optional)
if ($Restart) {
  Hdr '3. RESTART FOR CLEAN STARTUP LOG'
  & $Adb shell am force-stop $PKG | Out-Null
  Start-Sleep -Seconds 2
  & $Adb logcat -c | Out-Null
  Add '  force-stopped, logcat cleared'
  & $Adb shell am start -n "$PKG/.MainActivity" | Out-Null
  Add "  launched, waiting $WaitSeconds s (first run unpacks 4800+ files, slow)"
  Start-Sleep -Seconds $WaitSeconds
  $script:LogCache = $null
} else {
  Hdr '3. NO RESTART (observing current state)'
  Add '  pass -Restart for a clean startup log'
}

# ============================================================ process
Hdr '4. PROCESS AND FOREGROUND'
$pid0 = (AdbOut @('shell','pidof',$PKG)).Trim()
if (-not $pid0) { $pid0 = '(not running)' }
Kv 'pid' $pid0
$top = AdbOut @('shell','dumpsys','activity','activities')
$m = [regex]::Match($top, 'topResumedActivity=ActivityRecord\{[^}]*\}')
$topAct = '(none)'
if ($m.Success) { $topAct = $m.Value }
Kv 'topResumedActivity' $topAct
$wake = (AllLog | Select-String -Pattern 'mWakefulness=' | Select-Object -First 1)
if ($wake) { Kv 'wakefulness' $wake.Line.Trim() }

# ============================================================ node log
Hdr '5. NODE RUNTIME LOG (tag NodejsPlugin / line prefix [node])'
$nodeLines = LogcatGrep 'NodejsPlugin|\[node\]' 60
if ($nodeLines) { $nodeLines | ForEach-Object { Add "  $_" } }
else { Add '  ** no Node log at all ** (plugin never started, or the screen was off)' }

Hdr '6. STARTUP READINESS MARKERS'
foreach ($k in @('Node runtime starting','runtime starting','API ready','bridge ready','config ready',
                 'node v18', '36530', '36531', 'anonymous_token', 'xeapi_public_key')) {
  $found = LogcatGrep $k 1
  $mark = '** MISSING **'
  if ($found) { $mark = 'FOUND' }
  Kv $k $mark
}

# ============================================================ error stats
Hdr '7. ERROR STATS (current logcat buffer)'
$allLog = AllLog
function Cnt([string]$p) { return @($allLog | Select-String -Pattern $p).Count }
Kv 'Request Success count'   (Cnt 'Request Success')
Kv 'Network Error count'     (Cnt 'Network Error')
Kv 'song/url lines'          (Cnt 'song/url')
Kv 'FATAL / AndroidRuntime'  (Cnt 'FATAL EXCEPTION|AndroidRuntime')
Kv 'Capacitor/Plugin lines'  (Cnt 'Capacitor/Plugin')
$errs = $allLog | Select-String -Pattern 'ERROR|Error:|error' | Select-Object -Last 15
if ($errs) {
  Add '  --- last 15 lines containing "error" ---'
  $errs | ForEach-Object { Add ('  ' + $_.Line) }
}

# ============================================================ notification / service
Hdr '8. MEDIA NOTIFICATION AND FOREGROUND SERVICE'
$noti = AdbOut @('shell','dumpsys','notification','--noredact')
$seg = ($noti -split "`n" | Select-String -Pattern 'com\.hydrogen\.music' -Context 0,12)
if ($seg) {
  $first = $seg | Select-Object -First 1
  Add ('  ' + $first.Line)
  $first.Context.PostContext | ForEach-Object { Add ('  ' + $_) }
} else {
  Add '  ** no notification found for this app **'
}
$svc = AdbOut @('shell','dumpsys','activity','services',$PKG)
$sseg = ($svc -split "`n" | Select-String -Pattern 'MediaPlaybackService|isForeground|foregroundId|types=')
if ($sseg) { $sseg | ForEach-Object { Add ('  ' + $_.Line.Trim()) } }
else { Add '  ** playback foreground service NOT running **' }

# ============================================================ CDP page state
Hdr '9. DEVICE WEBVIEW PAGE STATE (CDP)'
$pidNow = (AdbOut @('shell','pidof',$PKG)).Trim()
if (-not $pidNow) {
  Add '  app not running, skipping'
} else {
  & $Adb forward --remove-all 2>&1 | Out-Null
  & $Adb forward "tcp:$PORT" "localabstract:webview_devtools_remote_$pidNow" 2>&1 | Out-Null
  Start-Sleep -Milliseconds 900
  $exprFile = Join-Path $env:TEMP 'hm-health-expr.js'
  $expr = @'
(async () => {
  const out = {};
  const safe = (fn) => { try { return fn() } catch (e) { return 'ERR:' + e.message } };
  out.href = location.href;
  out.title = document.title;
  out.viewport = { w: innerWidth, h: innerHeight, dpr: devicePixelRatio };
  out.hasHMApp = window.__HM_APP__ === true;
  out.hasCapacitor = typeof window.Capacitor !== 'undefined';
  out.pluginNames = safe(() => (window.Capacitor && Capacitor.Plugins) ? Object.keys(Capacitor.Plugins) : []);
  out.hasMediaNotificationPlugin = safe(() => !!(window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.MediaNotification));
  out.hasNativeMediaSessionApi = safe(() => typeof navigator.mediaSession !== 'undefined');
  out.hasNotificationApi = safe(() => typeof Notification !== 'undefined');
  out.cookieNames = safe(() => document.cookie.split(';').map(s => s.trim().split('=')[0]).filter(Boolean));
  out.hasMusicU = safe(() => /(^|;\s*)MUSIC_U=/.test(document.cookie));
  out.localStorageKeys = safe(() => Object.keys(localStorage).slice(0, 30));
  out.readyState = document.readyState;
  out.isMobileFlag = safe(() => document.documentElement.getAttribute('data-hm-mobile'));
  out.appEl = safe(() => { const a = document.querySelector('#app'); return a ? { children: a.children.length, w: Math.round(a.getBoundingClientRect().width), h: Math.round(a.getBoundingClientRect().height) } : null });
  out.apiProbe = await (async () => {
    try {
      const r = await fetch('http://127.0.0.1:36531/__hm_ready', { cache: 'no-store' });
      return { reachable: true, status: r.status };
    } catch (e) { return { reachable: false, error: String(e && e.message) }; }
  })();
  return JSON.stringify(out, null, 2);
})()
'@
  Set-Content -LiteralPath $exprFile -Value $expr -Encoding utf8
  $cdp = Join-Path $PSScriptRoot 'device-cdp.cjs'
  if (Test-Path -LiteralPath $cdp) {
    Push-Location $Repo
    try { $r = (& $NodeBin $cdp $exprFile 2>&1 | Out-String) } finally { Pop-Location }
    ($r.TrimEnd() -split "`n") | ForEach-Object { Add ('  ' + $_) }
  } else {
    Add "  ** device-cdp.cjs not found at $cdp **"
  }
  & $Adb forward --remove-all 2>&1 | Out-Null
}

# ============================================================ done
Hdr '10. REPORT FILE'
Add "  $OutFile"
$lines | Out-File -LiteralPath $OutFile -Encoding utf8
Write-Host ""
Write-Host "report written: $OutFile" -ForegroundColor Green
