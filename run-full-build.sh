#!/usr/bin/env bash
#
# Hydrogen Music — 一键构建 Android APK
#
# 用法：在项目根目录执行
#     bash run-full-build.sh
#
# 做的事：
#   0. 若当前路径含中文 → 自动把源码镜像到纯 ASCII 构建目录，并在那里继续
#   1. 构建前端 + 准备内嵌 Node 运行时（scripts/build-android.cjs）
#   2. gradle 打包 debug APK
#   3. 把 APK 拷到桌面
#
# 前置环境：
#   - JDK 21        默认 C:/jdk-21
#   - Android SDK   默认 C:/android-sdk（需含 NDK 与 CMake）
#   - Gradle 缓存   默认 C:/hydrogen-gradle
#   - Node 依赖已装 项目根与 mobile-runtime/ 下都执行过 npm install
#
# 为什么要求纯 ASCII 路径：
#   AGP 会拒绝在含中文的路径下构建；NDK/CMake 编译 libnode 的 JNI 层时，
#   若 GRADLE_USER_HOME 落在中文路径（如 C:\Users\<中文名>\.gradle）也会失败。
#   本脚本检测到中文路径时会自动同步到构建目录，因此直接在本工程里跑也没问题。
#
# 可用环境变量覆盖：
#   HM_BUILD_DIR（构建目录，默认 /c/hydrogen-build）
#   NODE_BIN / OUT_DIR / JAVA_HOME / ANDROID_SDK_ROOT / GRADLE_USER_HOME
#
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------- node 可执行文件 ----------
if [ -z "${NODE_BIN:-}" ]; then
  if command -v node >/dev/null 2>&1; then
    NODE_BIN="$(command -v node)"
  elif [ -x "/c/Users/北川/.workbuddy/binaries/node/versions/22.22.2-2/node.exe" ]; then
    NODE_BIN="/c/Users/北川/.workbuddy/binaries/node/versions/22.22.2-2/node.exe"
  else
    echo "✗ 找不到 node，请设置 NODE_BIN 环境变量指向 node 可执行文件" >&2
    exit 1
  fi
fi

# ---------- 路径自检：含中文则同步到构建目录后继续 ----------
if printf '%s' "$ROOT" | grep -qP '[^\x00-\x7F]' 2>/dev/null; then
  BUILD_DIR="${HM_BUILD_DIR:-/c/hydrogen-build}"
  # node 需要 Windows 形式（/c/x → C:/x）
  BUILD_DIR_WIN="$(printf '%s' "$BUILD_DIR" | sed -E 's|^/([a-zA-Z])/|\1:/|')"

  echo "===== 检测到工作区路径含非 ASCII 字符 ====="
  echo "  工作区  : $ROOT"
  echo "  构建目录: $BUILD_DIR"
  echo "  AGP / CMake 无法在中文路径下构建，改为镜像源码到构建目录后继续。"
  echo ""

  if [ ! -d "$BUILD_DIR" ]; then
    echo "✗ 构建目录不存在：$BUILD_DIR" >&2
    echo "  请先把它初始化出来（只需一次）：" >&2
    echo "    cp -r \"$ROOT\" \"$BUILD_DIR\" && rm -rf \"$BUILD_DIR/node_modules\"" >&2
    echo "    ( cd \"$BUILD_DIR\" && npm install )" >&2
    echo "    ( cd \"$BUILD_DIR/mobile-runtime\" && npm install )" >&2
    exit 1
  fi

  echo "===== 0/3 同步源码到构建目录 ====="
  ( cd "$ROOT" && "$NODE_BIN" scripts/sync-to-build.cjs "$BUILD_DIR_WIN" ) || exit 1
  echo ""
  echo "→ 切换到构建目录继续执行 ..."
  echo ""
  exec bash "$BUILD_DIR/run-full-build.sh"
fi

# ---------- 环境变量 ----------
export JAVA_HOME="${JAVA_HOME:-C:/jdk-21}"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-C:/hydrogen-gradle}"
export ANDROID_HOME="${ANDROID_HOME:-C:/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$PATH"

echo "===== 环境 ====="
echo "  项目根目录      : $ROOT"
echo "  node            : $NODE_BIN"
echo "  JAVA_HOME       : $JAVA_HOME"
echo "  GRADLE_USER_HOME: $GRADLE_USER_HOME"
echo "  ANDROID_SDK_ROOT: $ANDROID_SDK_ROOT"
echo ""

cd "$ROOT" || exit 1

# ---------- 1) 准备前端 + 运行时 ----------
echo "===== 1/3 准备构建产物 ====="
"$NODE_BIN" scripts/build-android.cjs
if [ $? -ne 0 ]; then
  echo "✗ 准备阶段失败" >&2
  exit 1
fi

# ---------- 2) gradle 打包 ----------
echo ""
echo "===== 2/3 gradle 打包 ====="
( cd android && ./gradlew assembleDebug )
if [ $? -ne 0 ]; then
  echo "✗ gradle 打包失败" >&2
  exit 1
fi

# ---------- 3) 拷贝产物 ----------
APK_SRC="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
OUT_DIR="${OUT_DIR:-$HOME/Desktop}"
APK_DST="$OUT_DIR/HydrogenMusic.apk"

echo ""
echo "===== 3/3 完成 ====="
if [ -f "$APK_SRC" ]; then
  mkdir -p "$OUT_DIR"
  cp -f "$APK_SRC" "$APK_DST"
  echo "  ✓ APK：$APK_DST"
  ls -la "$APK_DST"
else
  echo "✗ 未找到 APK 产物：$APK_SRC" >&2
  exit 1
fi
