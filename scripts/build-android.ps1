<#
.SYNOPSIS
  One-shot Android APK build WITHOUT bash.

.DESCRIPTION
  This machine has no Git for Windows, therefore no bash, so
  `bash run-full-build.sh` cannot run. This script is the PowerShell equivalent:

    0. If the workspace path contains non-ASCII -> mirror sources to the ASCII build dir
    1. node scripts/build-android.cjs   (vite build + web assets + embedded Node runtime + marker)
    2. gradlew.bat assembleDebug        (debug APK)
    3. copy the APK to the output dir

  Differences from run-full-build.sh:
    - config via parameters/env instead of bash `grep -P` for the non-ASCII check
    - explicitly uses the WORKING node (the harness-bundled npm is broken, node is fine)
    - prints a per-step stopwatch; stops immediately on failure

  NOTE: this file is intentionally ASCII-only. Windows PowerShell 5.1 decodes
  -File scripts using the ANSI codepage, so non-ASCII text here would corrupt parsing.

.PARAMETER BuildDir
  ASCII build directory. Default C:\hydrogen-build (or env HM_BUILD_DIR).

.PARAMETER OutDir
  APK output directory. Default Desktop (or env OUT_DIR).

.PARAMETER SkipSync
  Skip mirroring sources into the build dir. Default: do not skip.

.PARAMETER NodeBin
  node executable. Auto-detected by default.

.PARAMETER DryRun
  Environment check and sync preview only; no build.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-android.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-android.ps1 -DryRun
#>
[CmdletBinding()]
param(
  [string]$BuildDir,
  [string]$OutDir,
  [string]$NodeBin,
  [switch]$SkipSync,
  [switch]$Clean,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$script:StepNo = 0
$script:Sw = [System.Diagnostics.Stopwatch]::StartNew()

function Say([string]$msg) { Write-Host $msg }
function Step([string]$msg) {
  $script:StepNo++
  $el = [math]::Round($script:Sw.Elapsed.TotalSeconds, 1)
  Write-Host ""
  Write-Host ("=" * 62) -ForegroundColor DarkGray
  Write-Host ("[{0}] {1}   (+{2}s)" -f $script:StepNo, $msg, $el) -ForegroundColor Cyan
  Write-Host ("=" * 62) -ForegroundColor DarkGray
}
function Ok([string]$msg)   { Write-Host "  OK   $msg" -ForegroundColor Green }
function Warn([string]$msg) { Write-Host "  WARN $msg" -ForegroundColor Yellow }
function Die([string]$msg)  { Write-Host "  FAIL $msg" -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------- paths
$Root = Split-Path -Parent $PSScriptRoot          # project root
if (-not $BuildDir) {
  if ($env:HM_BUILD_DIR) { $BuildDir = $env:HM_BUILD_DIR } else { $BuildDir = 'C:\hydrogen-build' }
}
$BuildDir = $BuildDir.TrimEnd('\')

function Test-NonAscii([string]$s) { return ($s -match '[^\x00-\x7F]') }
$RootHasNonAscii = Test-NonAscii $Root

# ---------------------------------------------------------------- node
function Resolve-NodeBin {
  param([string]$Explicit)
  if ($Explicit) {
    if (Test-Path -LiteralPath $Explicit) { return (Get-Item -LiteralPath $Explicit).FullName }
    Die "NODE_BIN does not exist: $Explicit"
  }
  if ($env:NODE_BIN -and (Test-Path -LiteralPath $env:NODE_BIN)) {
    return (Get-Item -LiteralPath $env:NODE_BIN).FullName
  }
  $candidates = @()
  $verDir = Join-Path $env:USERPROFILE '.workbuddy\binaries\node\versions'
  if (Test-Path -LiteralPath $verDir) {
    $candidates += (Get-ChildItem -LiteralPath $verDir -Directory -ErrorAction SilentlyContinue |
                    Sort-Object Name -Descending |
                    ForEach-Object { Join-Path $_.FullName 'node.exe' })
  }
  foreach ($c in $candidates) { if ($c -and (Test-Path -LiteralPath $c)) { return $c } }
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  Die "node not found; pass -NodeBin or set NODE_BIN"
}
$NodeBin = Resolve-NodeBin $NodeBin

# ---------------------------------------------------------------- env
if ($env:JAVA_HOME)        { $JdkHome    = $env:JAVA_HOME }        else { $JdkHome    = 'C:\jdk-21' }
if ($env:GRADLE_USER_HOME) { $GradleHome = $env:GRADLE_USER_HOME } else { $GradleHome = 'C:\hydrogen-gradle' }
if ($env:ANDROID_SDK_ROOT) { $SdkRoot    = $env:ANDROID_SDK_ROOT } else { $SdkRoot    = 'C:\android-sdk' }
if (-not $OutDir) {
  if ($env:OUT_DIR) { $OutDir = $env:OUT_DIR } else { $OutDir = [Environment]::GetFolderPath('Desktop') }
}

Say ""
Say "===== environment ====="
Say "  workspace       : $Root"
Say "  has non-ASCII   : $RootHasNonAscii"
Say "  build dir       : $BuildDir"
Say "  output dir      : $OutDir"
Say "  node            : $NodeBin"
Say ("  node version    : " + (& $NodeBin --version))
Say "  JAVA_HOME       : $JdkHome"
Say "  ANDROID_SDK_ROOT: $SdkRoot"
Say "  GRADLE_USER_HOME: $GradleHome"

$missing = @()
foreach ($p in @($JdkHome, $SdkRoot, $GradleHome)) {
  if (-not (Test-Path -LiteralPath $p)) { $missing += $p }
}
if ($missing.Count -gt 0) {
  Die ("missing paths:`n    " + ($missing -join "`n    "))
}
Ok "JDK / Android SDK / Gradle cache present"

# ---------------------------------------------------------------- 0) mirror sources
$WorkRoot = $Root
if ($RootHasNonAscii -and -not $SkipSync) {
  Step "0) mirror sources to ASCII build dir"
  if (-not (Test-Path -LiteralPath $BuildDir)) {
    Die ("build dir does not exist: $BuildDir`n" +
         "  initialize once:`n" +
         "    robocopy `"$Root`" `"$BuildDir`" /E /XD node_modules`n" +
         "    cd `"$BuildDir`" ; npm install`n" +
         "    cd `"$BuildDir\mobile-runtime`" ; npm install")
  }
  Push-Location $Root
  try {
    & $NodeBin 'scripts/sync-to-build.cjs' $BuildDir
    if ($LASTEXITCODE -ne 0) { Die "sync failed (exit $LASTEXITCODE)" }
  } finally { Pop-Location }
  Ok "sources mirrored to $BuildDir"
  $WorkRoot = $BuildDir
}
elseif ($RootHasNonAscii -and $SkipSync) {
  Warn "workspace has non-ASCII and -SkipSync given; gradle will likely fail (AGP rejects CJK paths)"
}

if ($DryRun) {
  Say ""
  Say "===== DryRun: stopping here, nothing built ====="
  Say "  would run:"
  Say "    cd $WorkRoot"
  Say "    & '$NodeBin' scripts/build-android.cjs"
  Say "    cd $WorkRoot\android ; .\gradlew.bat assembleDebug"
  Say "    copy android\app\build\outputs\apk\debug\app-debug.apk -> $OutDir\HydrogenMusic.apk"
  exit 0
}

# cap sync artifacts must already exist (this project does not run cap sync)
foreach ($rel in @('node_modules', 'mobile-runtime\node_modules',
                   'android\app\capacitor.build.gradle',
                   'android\capacitor-cordova-android-plugins\build.gradle',
                   'android\app\src\main\assets\capacitor.plugins.json')) {
  $full = Join-Path $WorkRoot $rel
  if (-not (Test-Path -LiteralPath $full)) {
    Die "build dir missing required artifact: $rel`n  (this project does not run cap sync; if the build dir was wiped, run npx cap sync android once)"
  }
}
Ok "cap sync artifacts present in build dir"

# ---------------------------------------------------------------- 0.5) optional deep clean
# Why this exists:
#   vite's emptyOutDir is disabled during the build (HM_KEEP_DIST=1), because wiping
#   dist/ deletes thousands of files at once and the sandbox blocks bulk deletions
#   (over ~50 files per round), which aborts the vite build.
#   The incremental pruner in build-android.cjs only removes 40 files per round, so it
#   can never catch up: every build leaves its hashed chunks behind and dist/ (plus
#   android/app/src/main/assets/public/assets) grows without bound -- APKs were
#   shipping 2700+ stale JS files (~86 MB of duplicates).
#   -Clean wipes both places in a single shot before the build, which the sandbox
#   allows when done explicitly by the user rather than inside the toolchain.
if ($Clean) {
  Step "0.5) clean stale web chunks (dist + android assets)"
  $distDir   = Join-Path $WorkRoot 'dist'
  $assetsDir = Join-Path $WorkRoot 'android\app\src\main\assets\public\assets'

  foreach ($dir in @($distDir, $assetsDir)) {
    if (Test-Path -LiteralPath $dir) {
      $before = (Get-ChildItem -LiteralPath $dir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
      Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
      Ok ("removed {0} ({1} files)" -f (Split-Path -Leaf $dir), $before)
    } else {
      Say ("  skip (not present): {0}" -f $dir)
    }
  }

  # dist must exist again before vite writes into it.
  if (-not (Test-Path -LiteralPath $distDir)) {
    New-Item -ItemType Directory -Path $distDir -Force | Out-Null
  }
  Ok "clean done (nodejs runtime under assets/public is preserved)"
}

# ---------------------------------------------------------------- 1) web + runtime
Step "1) prepare build artifacts (web bundle + embedded Node runtime)"
Push-Location $WorkRoot
try {
  $env:HM_KEEP_DIST = '1'
  & $NodeBin 'scripts/build-android.cjs'
  if ($LASTEXITCODE -ne 0) { Die "build-android.cjs failed (exit $LASTEXITCODE)" }
} finally { Pop-Location }
Ok "web bundle and runtime in place"

# ---------------------------------------------------------------- 2) gradle
Step "2) gradle assembleDebug"
$env:JAVA_HOME        = $JdkHome
$env:GRADLE_USER_HOME = $GradleHome
$env:ANDROID_HOME     = $SdkRoot
$env:ANDROID_SDK_ROOT = $SdkRoot
$env:PATH             = (Join-Path $JdkHome 'bin') + ';' + $env:PATH

$gradlew = Join-Path $WorkRoot 'android\gradlew.bat'
if (-not (Test-Path -LiteralPath $gradlew)) { Die "gradlew.bat not found: $gradlew" }
Push-Location (Join-Path $WorkRoot 'android')
try {
  & $gradlew 'assembleDebug'
  if ($LASTEXITCODE -ne 0) { Die "gradle failed (exit $LASTEXITCODE)" }
} finally { Pop-Location }
Ok "gradle build finished"

# ---------------------------------------------------------------- 3) output
Step "3) copy artifact"
$apkSrc = Join-Path $WorkRoot 'android\app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path -LiteralPath $apkSrc)) { Die "APK not found: $apkSrc" }
if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$apkDst = Join-Path $OutDir 'HydrogenMusic.apk'
Copy-Item -LiteralPath $apkSrc -Destination $apkDst -Force

$fi  = Get-Item -LiteralPath $apkDst
$md5 = (Get-FileHash -LiteralPath $apkDst -Algorithm MD5).Hash
Say ""
Say "  APK    : $apkDst"
Say ("  size   : {0} bytes ({1} MB)" -f $fi.Length, [math]::Round($fi.Length / 1MB, 1))
Say "  mtime  : $($fi.LastWriteTime)"
Say "  md5    : $md5"
Say ""
Say ("===== BUILD OK, total {0}s =====" -f [math]::Round($script:Sw.Elapsed.TotalSeconds, 1)) -ForegroundColor Green
