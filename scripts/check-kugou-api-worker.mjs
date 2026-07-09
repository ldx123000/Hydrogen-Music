import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, "..");
const workerPath = path.join(projectDir, "src", "electron", "kugouApiWorker.js");

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function probe(url) {
  return fetch(url).then(async (response) => ({
    status: response.status,
    text: await response.text(),
  }));
}

function waitForWorkerReady(worker) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("worker-ready-timeout"));
    }, 4000);

    const cleanup = () => {
      clearTimeout(timer);
      worker.off("message", onMessage);
      worker.off("error", onError);
      worker.off("exit", onExit);
    };
    const onMessage = (message) => {
      if (message?.type === "ready") {
        cleanup();
        resolve();
      } else if (message?.type === "error") {
        cleanup();
        reject(new Error(message.error || "worker-error"));
      }
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`worker-exit-${code}`));
    };

    worker.on("message", onMessage);
    worker.once("error", onError);
    worker.once("exit", onExit);
  });
}

async function waitForExit(worker) {
  const code = await new Promise((resolve) => worker.once("exit", resolve));
  assert.equal(code, 0);
}

const tempDir = await mkdtemp(path.join(tmpdir(), "kugou-worker-check-"));

try {
  const port = await findFreePort();
  const entry = path.join(tempDir, "fake-kugou-api.cjs");
  await writeFile(
    entry,
    `
const http = require("node:http");

exports.startService = async () => {
  const app = {};
  app.service = http
    .createServer((req, res) => {
      res.statusCode = 200;
      res.end("ok");
    })
    .listen(Number(process.env.PORT), process.env.HOST);
  return app;
};
`,
    "utf8",
  );

  const worker = new Worker(workerPath, {
    workerData: {
      entry,
      port,
      host: "127.0.0.1",
      platform: "lite",
    },
  });

  await waitForWorkerReady(worker);
  const response = await probe(`http://127.0.0.1:${port}/`);
  assert.equal(response.status, 200);
  assert.equal(response.text, "ok");

  worker.postMessage({ type: "stop" });
  await waitForExit(worker);
  console.log("kugou-api-worker check passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
