const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const API_PORT = 36530;
const API_READY_TIMEOUT_MS = 12000;
const API_READY_POLL_INTERVAL_MS = 150;
const API_READY_SETTLE_DELAY_MS = 250;

let kugouApiProcess = null;
let kugouApiStartupPromise = null;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBackendCandidates() {
  const candidates = [
    path.join(process.resourcesPath || "", "KuGouMusicApi"),
    path.resolve(__dirname, "../../../KuGouMusicApi"),
  ].filter((candidate) => candidate && fs.existsSync(candidate));

  // 诊断日志：记录找到的后端路径，帮助排查 API 版本问题
  if (candidates.length > 0) {
    console.log(
      "[KuGou API] 找到后端候选路径:",
      candidates.map((c) => c.replace(/\\/g, "/")),
    );
    // 尝试读取 package.json 确定 API 版本
    for (const candidate of candidates) {
      try {
        const pkgPath = path.join(candidate, "package.json");
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
          if (pkg.name || pkg.version) {
            console.log(
              `[KuGou API] 后端版本: ${pkg.name || "unknown"}@${pkg.version || "unknown"} (${candidate.replace(/\\/g, "/")})`,
            );
          }
        }
      } catch (_) {}
    }
  } else {
    console.warn("[KuGou API] 未找到任何后端候选路径");
  }

  return candidates;
}

function resolveBackendLaunch() {
  const candidates = getBackendCandidates();
  for (const backendRoot of candidates) {
    // 优先使用源码版 (app.js)，开发调试更方便
    const appScript = path.join(backendRoot, "app.js");
    if (fs.existsSync(appScript)) {
      return {
        command: process.execPath,
        args: [appScript],
        cwd: backendRoot,
        env: {
          ELECTRON_RUN_AS_NODE: "1",
        },
        label: appScript,
      };
    }

    const apiJs = path.join(backendRoot, "bin", "api_js", "app.js");
    if (fs.existsSync(apiJs)) {
      return {
        command: process.execPath,
        args: [apiJs],
        cwd: backendRoot,
        env: {
          ELECTRON_RUN_AS_NODE: "1",
        },
        label: apiJs,
      };
    }

    if (process.platform === "win32") {
      const winBinary = path.join(backendRoot, "bin", "app_win.exe");
      if (fs.existsSync(winBinary)) {
        return {
          command: winBinary,
          args: [],
          cwd: backendRoot,
          env: {},
          label: winBinary,
        };
      }
    }
  }

  return null;
}

function forwardChildOutput(child) {
  if (child.stdout) {
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text) console.log("[KuGou API]", text);
    });
  }

  if (child.stderr) {
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text) console.error("[KuGou API]", text);
    });
  }
}

function stopKugouMusicApi() {
  if (!kugouApiProcess) return;

  const child = kugouApiProcess;
  kugouApiProcess = null;

  try {
    child.removeAllListeners();
    if (!child.killed) {
      child.kill();
    }
  } catch (_) {}
}

function waitForServerListening(server, timeoutMs = 4000) {
  if (!server || server.listening) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("kugou-api-listen-timeout"));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      server.off("listening", onListening);
      server.off("error", onError);
    };

    const onListening = () => {
      cleanup();
      resolve();
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    server.once("listening", onListening);
    server.once("error", onError);
  });
}

/**
 * 预热 Windows Defender 防火墙，提前触发网络授权弹窗
 *
 * 首次启动时，Windows 防火墙检测到新程序请求出站连接会弹出安全警报。
 * 但后端子进程以 ELECTRON_RUN_AS_NODE=1 方式启动，弹窗可能被隐藏。
 * 本函数在主进程中主动发起多个外部请求，让防火墙弹窗在主窗口可见时出现，
 * 避免用户错过弹窗导致连接被静默阻止。
 *
 * 会尝试多个目标地址，覆盖不同安全软件可能监控的域名。
 */
function wakeWindowsFirewall() {
  // 只对 Windows 有效
  if (process.platform !== "win32") return Promise.resolve();

  const targets = [
    "http://www.baidu.com",
    "http://www.kugou.com",
    "http://www.qianqian.com",
  ];

  console.log("[Firewall] 正在预热防火墙规则，确保网络请求不会被拦截...");

  return Promise.allSettled(
    targets.map((target) => {
      return new Promise((resolve) => {
        const req = http.get(target, (res) => {
          res.resume();
          resolve();
        });
        req.setTimeout(2000, () => {
          req.destroy();
          resolve();
        });
        req.on("error", () => resolve());
      });
    }),
  ).then(() => {
    console.log("[Firewall] 防火墙预热完成");
  });
}

function probeServer(url, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode || 200);
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("kugou-api-probe-timeout"));
    });

    req.on("error", reject);
  });
}

/**
 * 验证端口上的服务是否真的是 KuGou API（而非旧版残留或其他程序）
 * 通过请求一个已知的 KuGou API 端点来确认身份
 */
function verifyApiIdentity(port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const url = `http://127.0.0.1:${port}/lyric?id=1`;
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk.toString();
      });
      res.on("end", () => {
        try {
          const data = JSON.parse(body);
          // KuGou API 响应特征：包含 errcode / data 等字段
          const isKugouApi =
            data &&
            typeof data === "object" &&
            ("errcode" in data || "data" in data || "status" in data);
          if (isKugouApi) {
            console.log("[KuGou API] 端口已有 KuGou API 运行，身份验证通过");
            resolve(true);
          } else {
            console.warn("[KuGou API] 端口上的服务不是 KuGou API，响应不匹配");
            resolve(false);
          }
        } catch (_) {
          console.warn(
            "[KuGou API] 端口上的服务返回非 JSON 响应，不是 KuGou API",
          );
          resolve(false);
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      console.warn("[KuGou API] 身份验证超时，端口上的服务不响应");
      resolve(false);
    });

    req.on("error", () => {
      resolve(false);
    });
  });
}

async function waitForApiReachable(
  url,
  timeoutMs = API_READY_TIMEOUT_MS,
  intervalMs = API_READY_POLL_INTERVAL_MS,
) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      await probeServer(url);
      return;
    } catch (error) {
      lastError = error;
      await delay(intervalMs);
    }
  }

  throw lastError || new Error("kugou-api-unreachable");
}

async function startKugouMusicApi() {
  if (kugouApiStartupPromise) {
    return kugouApiStartupPromise;
  }

  kugouApiStartupPromise = (async () => {
    const readyUrl = `http://127.0.0.1:${API_PORT}/`;

    // 预热防火墙：在主进程中先发一个外部请求，触发 Windows 防火墙弹窗
    // 避免后端子进程以 ELECTRON_RUN_AS_NODE 启动后弹窗被隐藏，导致请求被静默拦截
    await wakeWindowsFirewall();

    // 先探测端口是否有服务在监听
    try {
      await probeServer(readyUrl);
      // 端口有响应，但必须验证是否真的是 KuGou API
      // 旧版本的残留进程或其他程序可能占用了该端口
      const isGenuineApi = await verifyApiIdentity(API_PORT);
      if (isGenuineApi) {
        await delay(API_READY_SETTLE_DELAY_MS);
        console.log("[KuGou API] 复用已有的 KuGou API 进程");
        return { ready: true, reused: true };
      } else {
        // 端口上有不明服务，尝试杀死残留的旧版 API 进程
        console.warn("[KuGou API] 端口已有不明服务，尝试清理残留进程...");
        if (process.platform === "win32") {
          try {
            const { execSync } = require("child_process");
            // 查找并杀死占用 36530 端口的进程
            const result = execSync(
              `netstat -ano | findstr :${API_PORT} | findstr LISTENING`,
              { encoding: "utf8", timeout: 5000 },
            ).trim();
            if (result) {
              const lines = result.split(/\r?\n/);
              for (const line of lines) {
                const match = line.match(/\s+(\d+)\s*$/);
                if (match && match[1] && match[1] !== "0") {
                  try {
                    execSync(`taskkill /F /PID ${match[1]}`, { timeout: 5000 });
                    console.log(`[KuGou API] 已终止残留进程 PID=${match[1]}`);
                  } catch (_) {}
                }
              }
            }
          } catch (_) {}
        } else {
          // Linux/macOS: 使用 fuser 或 lsof
          try {
            const { execSync } = require("child_process");
            execSync(
              `fuser -k ${API_PORT}/tcp 2>/dev/null || lsof -ti:${API_PORT} | xargs kill -9 2>/dev/null`,
              { timeout: 5000 },
            );
            console.log("[KuGou API] 已尝试清理残留进程");
          } catch (_) {}
        }
        // 等待端口释放
        await delay(500);
      }
    } catch (_) {}

    const backendLaunch = resolveBackendLaunch();
    if (!backendLaunch) {
      const errorMessage = "kugou-api-entry-not-found";
      console.log("KuGou API unavailable:", errorMessage);
      return { ready: false, error: errorMessage };
    }

    console.log("KuGou API launch target:", backendLaunch.label);

    const child = spawn(backendLaunch.command, backendLaunch.args, {
      cwd: backendLaunch.cwd,
      env: {
        ...process.env,
        ...backendLaunch.env,
        platform: process.env.platform || "lite",
        PORT: String(API_PORT),
        HOST: "127.0.0.1",
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    kugouApiProcess = child;
    console.log("KuGou API process started:", child.pid);
    forwardChildOutput(child);

    child.once("exit", (code, signal) => {
      if (kugouApiProcess === child) {
        kugouApiProcess = null;
      }
      if (code !== 0 && signal !== "SIGTERM") {
        console.warn(
          "KuGou API process exited unexpectedly:",
          code,
          signal || "",
        );
      }
    });

    child.once("error", (error) => {
      if (kugouApiProcess === child) {
        kugouApiProcess = null;
      }
      console.error("KuGou API process failed to start:", error);
    });

    try {
      await waitForApiReachable(readyUrl);
      await delay(API_READY_SETTLE_DELAY_MS);
      return { ready: true, started: true };
    } catch (error) {
      stopKugouMusicApi();
      const errorMessage =
        error && error.message ? error.message : "unknown error";
      console.log("KuGou API unavailable:", errorMessage);
      return { ready: false, error: errorMessage };
    }
  })().finally(() => {
    kugouApiStartupPromise = null;
  });

  return kugouApiStartupPromise;
}

function getKugouMusicApiProcess() {
  return kugouApiProcess;
}

module.exports = {
  startKugouMusicApi,
  stopKugouMusicApi,
  getKugouMusicApiProcess,
  resolveBackendLaunch,
  waitForApiReachable,
  API_PORT,
  delay,
  probeServer,
  API_READY_TIMEOUT_MS,
  API_READY_POLL_INTERVAL_MS,
  API_READY_SETTLE_DELAY_MS,
};
