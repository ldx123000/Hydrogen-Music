const { parentPort, workerData } = require("worker_threads");

let kugouApiServer = null;

function post(type, payload = {}) {
  try {
    parentPort.postMessage({ type, ...payload });
  } catch (_) {}
}

function errorMessage(error) {
  return error && error.message ? error.message : "unknown error";
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

async function start() {
  try {
    const entry = workerData && workerData.entry;
    if (!entry) throw new Error("kugou-api-entry-not-found");

    process.env.platform = process.env.platform || workerData.platform || "lite";
    process.env.PORT = String(workerData.port || 36530);
    process.env.HOST = workerData.host || "127.0.0.1";

    const kugouApi = require(entry);
    if (!kugouApi || typeof kugouApi.startService !== "function") {
      throw new Error("kugou-api-startService-not-found");
    }

    const appExt = await kugouApi.startService();
    kugouApiServer = appExt && appExt.service;
    await waitForServerListening(kugouApiServer);
    post("ready");
  } catch (error) {
    post("error", { error: errorMessage(error), stack: error && error.stack });
    process.exit(1);
  }
}

function stop() {
  const server = kugouApiServer;
  kugouApiServer = null;

  if (!server) {
    process.exit(0);
    return;
  }

  try {
    server.close(() => process.exit(0));
  } catch (_) {
    process.exit(0);
  }
}

parentPort.on("message", (message) => {
  if (message && message.type === "stop") stop();
});

process.on("uncaughtException", (error) => {
  post("error", { error: errorMessage(error), stack: error && error.stack });
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  post("error", { error: errorMessage(error), stack: error && error.stack });
  process.exit(1);
});

start();
