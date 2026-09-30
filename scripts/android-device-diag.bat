@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM ============================================================
REM  Hydrogen Music — Android 真机诊断
REM
REM  用途：安装 APK 并抓取内嵌 Node 运行时的启动日志，用于定位
REM        "API 请求错误 / 歌曲点开不能播 / 白屏" 这类问题。
REM
REM  用法：
REM      scripts\android-device-diag.bat [APK路径]
REM      （不传则用桌面上的 HydrogenMusic.apk）
REM
REM  前置：手机用 USB 连接，且已在手机上允许本机的 USB 调试。
REM
REM  已知坑：手机熄屏后 App 会进后台、Node 运行时被系统挂起，
REM          日志里表现为 "Capacitor: App paused" +
REM          "Not drawing due to screen off"，极易误判成插件没启动。
REM          所以脚本会先唤醒屏幕并设置充电时不熄屏。
REM ============================================================

set "PKG=com.hydrogen.music"
set "ACT=%PKG%/.MainActivity"
set "APK=%~1"
if "%APK%"=="" set "APK=%USERPROFILE%\Desktop\HydrogenMusic.apk"

REM ---------- 定位 adb ----------
set "ADB="
if exist "C:\android-sdk\platform-tools\adb.exe" set "ADB=C:\android-sdk\platform-tools\adb.exe"
if not defined ADB if defined ANDROID_HOME if exist "%ANDROID_HOME%\platform-tools\adb.exe" set "ADB=%ANDROID_HOME%\platform-tools\adb.exe"
if not defined ADB if defined ANDROID_SDK_ROOT if exist "%ANDROID_SDK_ROOT%\platform-tools\adb.exe" set "ADB=%ANDROID_SDK_ROOT%\platform-tools\adb.exe"
if not defined ADB (
  where adb >nul 2>nul
  if not errorlevel 1 set "ADB=adb"
)
if not defined ADB (
  echo [错误] 找不到 adb.exe
  echo         请设置 ANDROID_HOME，或把 platform-tools 加入 PATH
  pause
  exit /b 1
)

echo ============================================================
echo  adb : %ADB%
echo  APK : %APK%
echo ============================================================
echo.

echo [1/6] 检测设备 ...
"%ADB%" devices
echo.

echo [2/6] 唤醒屏幕并保持常亮（避免 App 被切后台导致 Node 挂起）...
"%ADB%" shell input keyevent KEYCODE_WAKEUP
"%ADB%" shell svc power stayon true
echo.

if exist "%APK%" (
  echo [3/6] 停止旧进程并安装 APK ...
  "%ADB%" shell am force-stop %PKG%
  "%ADB%" install -r "%APK%"
) else (
  echo [3/6] 未找到 APK，跳过安装：%APK%
  echo        如需安装请把 APK 路径作为第一个参数传入。
)
echo.

echo [4/6] 清空日志缓冲并启动 App ...
"%ADB%" logcat -c
"%ADB%" shell am start -n %ACT%
echo     等待 70 秒（首次启动要把运行时文件从 APK 解压出来，较慢）...
ping -n 71 127.0.0.1 >nul
echo.

echo [5/6] Node 运行时启动日志 ...
echo ------------------------------------------------------------
"%ADB%" logcat -d | findstr /i /c:"NodejsPlugin" /c:"[node]"
echo ------------------------------------------------------------
echo.

echo [6/6] 统计 ...
echo --- 成功请求数 ---
"%ADB%" logcat -d | findstr /c:"Request Success" | find /c "Request Success"
echo --- 前端 Network Error 数（应为 0） ---
"%ADB%" logcat -d | findstr /c:"Capacitor/Console" | findstr /c:"Network Error" | find /c "Network Error"
echo.
echo --- Node 侧报错（已隐去 cookie） ---
"%ADB%" logcat -d | findstr /c:"NodejsPlugin" | findstr /i /c:"ERROR" /c:"失败"
echo.
echo --- 播放地址接口（/song/url）成功数 ---
"%ADB%" logcat -d | findstr /c:"Request Success: /song/url" | find /c "Request Success"
echo.

echo ============================================================
echo  判读要点
echo    · 应出现：[node] 网易云 API 已就绪 / 转发层已就绪
echo    · 不该出现：Cannot find module / EACCES / Invalid property name
echo    · Network Error 应为 0；大于 0 说明前端与 Node 启动存在竞态
echo    · /song/url 成功数大于 0 说明歌曲能拿到播放地址
echo ============================================================
pause
