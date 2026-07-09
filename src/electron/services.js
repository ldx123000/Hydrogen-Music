const { app } = require("electron");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { Worker } = require("worker_threads");

const API_PORT = 36530;
const API_READY_TIMEOUT_MS = 12000;
const API_READY_POLL_INTERVAL_MS = 150;
const API_READY_SETTLE_DELAY_MS = 250;

let kugouApiWorker = null;
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

function resolveBackendModule() {
  const candidates = getBackendCandidates();
  for (const backendRoot of candidates) {
    const bundledMain = path.join(backendRoot, "bin", "api_js", "main.js");
    const sourceMain = path.join(backendRoot, "main.js");
    const orderedEntries = app.isPackaged
      ? [bundledMain, sourceMain]
      : [sourceMain, bundledMain];

    for (const entry of orderedEntries) {
      if (!fs.existsSync(entry)) continue;
      return {
        entry,
        cwd: backendRoot,
        label: entry,
      };
    }
  }

  return null;
}

function stopKugouMusicApi() {
  if (!kugouApiWorker) return;

  const worker = kugouApiWorker;
  kugouApiWorker = null;

  try {
    worker.postMessage({ type: "stop" });
  } catch (_) {}

  const timer = setTimeout(() => {
    worker.terminate().catch(() => {});
  }, 1000);
  if (typeof timer.unref === "function") timer.unref();
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

function startKugouApiWorker(backendModule) {
  const worker = new Worker(path.join(__dirname, "kugouApiWorker.js"), {
    workerData: {
      entry: backendModule.entry,
      port: API_PORT,
      host: "127.0.0.1",
      platform: process.env.platform || "lite",
    },
  });

  kugouApiWorker = worker;

  worker.on("message", (message) => {
    if (!message || typeof message !== "object") return;
    if (message.type === "log") console.log("[KuGou API]", message.text);
    if (message.type === "warn") console.warn("[KuGou API]", message.text);
    if (message.type === "error") {
      console.error("[KuGou API worker]", message.error || "unknown error");
    }
  });

  worker.once("exit", (code) => {
    if (kugouApiWorker === worker) kugouApiWorker = null;
    if (code !== 0) {
      console.warn("KuGou API worker exited unexpectedly:", code);
    }
  });

  worker.once("error", (error) => {
    if (kugouApiWorker === worker) kugouApiWorker = null;
    console.error("KuGou API worker failed:", error);
  });

  return worker;
}

function watchWorkerFailure(worker) {
  let cleanup = () => {};
  const promise = new Promise((_, reject) => {
    const fail = (error) => {
      cleanup();
      reject(error);
    };
    cleanup = () => {
      worker.off("message", onMessage);
      worker.off("error", onError);
      worker.off("exit", onExit);
    };
    const onMessage = (message) => {
      if (!message || message.type !== "error") return;
      fail(new Error(message.error || "kugou-api-worker-error"));
    };
    const onError = (error) => {
      fail(error);
    };
    const onExit = (code) => {
      fail(new Error(`kugou-api-worker-exit-${code}`));
    };

    worker.on("message", onMessage);
    worker.once("error", onError);
    worker.once("exit", onExit);
  });

  return { promise, cleanup };
}

async function startKugouMusicApi() {
  if (kugouApiStartupPromise) {
    return kugouApiStartupPromise;
  }

  kugouApiStartupPromise = (async () => {
    const readyUrl = `http://127.0.0.1:${API_PORT}/`;

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

    const backendModule = resolveBackendModule();
    if (!backendModule) {
      const errorMessage = "kugou-api-entry-not-found";
      console.log("KuGou API unavailable:", errorMessage);
      return { ready: false, error: errorMessage };
    }

    console.log("KuGou API module target:", backendModule.label);

    try {
      // ponytail: keep the backend in-process for firewall behavior; if backend CPU
      // work grows, upgrade this worker to utilityProcess.
      const worker = startKugouApiWorker(backendModule);
      const workerFailure = watchWorkerFailure(worker);
      try {
        await Promise.race([
          waitForApiReachable(readyUrl),
          workerFailure.promise,
        ]);
      } finally {
        workerFailure.cleanup();
      }
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

function getKugouMusicApiServer() {
  return kugouApiWorker;
}

function getKugouMusicApiProcess() {
  return kugouApiWorker;
}

module.exports = {
  startKugouMusicApi,
  stopKugouMusicApi,
  getKugouMusicApiProcess,
  getKugouMusicApiServer,
  resolveBackendModule,
  waitForApiReachable,
  API_PORT,
  delay,
  probeServer,
  API_READY_TIMEOUT_MS,
  API_READY_POLL_INTERVAL_MS,
  API_READY_SETTLE_DELAY_MS,
};
