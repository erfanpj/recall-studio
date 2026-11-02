#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const outDir = path.join(repoRoot, "docs", "evidence");
fs.mkdirSync(outDir, { recursive: true });

const reviewRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rs-cap-"));
const mount = path.join(reviewRoot, "recall-studio", "demo");
fs.mkdirSync(path.dirname(mount), { recursive: true });
fs.cpSync(path.join(repoRoot, "demo"), mount, { recursive: true });

const PORT = 8812;
const BASE = `http://127.0.0.1:${PORT}/recall-studio/demo/`;

const server = spawn(
  "python",
  ["-m", "http.server", String(PORT), "--bind", "127.0.0.1", "--directory", reviewRoot],
  { stdio: "ignore" },
);

function browser() {
  for (const p of [
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ]) {
    if (fs.existsSync(p)) return p;
  }
  return "msedge";
}

async function screenshot(url, outPath, width, height) {
  await withPage(url, async (evalJs, send) => {
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: width <= 400 ? 2 : 1,
      mobile: width <= 400,
    });
    const shot = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(outPath, Buffer.from(shot.data, "base64"));
  });
}

async function withPage(url, fn) {
  const dbgPort = 9970 + Math.floor(Math.random() * 20);
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "rs-cap-"));
  const proc = spawn(
    browser(),
    ["--headless=new", `--remote-debugging-port=${dbgPort}`, `--user-data-dir=${userData}`, "about:blank"],
    { stdio: "ignore" },
  );
  try {
    await new Promise((r) => setTimeout(r, 900));
    const tabs = await new Promise((res, rej) => {
      http
        .get(`http://127.0.0.1:${dbgPort}/json/list`, (r) => {
          let d = "";
          r.on("data", (c) => (d += c));
          r.on("end", () => res(JSON.parse(d)));
        })
        .on("error", rej);
    });
    const pageTab = tabs.find((t) => t.type === "page") || tabs[0];
    const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg);
    });
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const mid = ++id;
        pending.set(mid, (msg) => (msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    await new Promise((res, rej) => {
      ws.addEventListener("open", res);
      ws.addEventListener("error", rej);
    });
    await send("Page.navigate", { url });
    await new Promise((r) => setTimeout(r, 900));
    const evalJs = async (expression) => {
      const r = await send("Runtime.evaluate", { expression, returnByValue: true });
      return r.result.value;
    };
    await fn(evalJs, send);
    ws.close();
  } finally {
    proc.kill("SIGTERM");
    try {
      fs.rmSync(userData, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      /* Windows may lock profile briefly */
    }
  }
}

async function main() {
  await new Promise((r) => setTimeout(r, 600));
  const desktop = path.join(outDir, "lesson-splits-desktop-1280.png");
  const mobile = path.join(outDir, "quiz-progress-mobile-390.png");
  await screenshot(BASE, desktop, 1280, 800);
  await screenshot(BASE + "#questions", mobile, 390, 844);
  console.log("wrote", desktop, mobile);
  server.kill("SIGTERM");
  fs.rmSync(reviewRoot, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
