#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PAGES_PATH_PREFIX } from "../logic.js";
import { allocatePort, pagesBaseUrl } from "./pages_server.mjs";
import { browserPath, stagePagesSite } from "./stage_site.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const outDir = path.join(repoRoot, "docs", "evidence");
fs.mkdirSync(outDir, { recursive: true });

async function capture(base, outPath, width, height, hash = "") {
  const dbgPort = 9970 + Math.floor(Math.random() * 25);
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "rs-cap-"));
  const proc = spawn(
    browserPath(),
    ["--headless=new", `--remote-debugging-port=${dbgPort}`, `--user-data-dir=${userData}`, "about:blank"],
    { stdio: "ignore" },
  );
  try {
    await new Promise((r) => setTimeout(r, 900));
    const tabs = await new Promise((res, rej) => {
      http.get(`http://127.0.0.1:${dbgPort}/json/list`, (r) => {
        let d = "";
        r.on("data", (c) => (d += c));
        r.on("end", () => res(JSON.parse(d)));
      }).on("error", rej);
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
    await send("Page.navigate", { url: base + hash });
    await new Promise((r) => setTimeout(r, 900));
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: width <= 400 ? 2 : 1,
      mobile: width <= 400,
    });
    if (width <= 400) {
      await send("Runtime.evaluate", {
        expression: `
          document.querySelector('#q1-c0')?.click();
          document.querySelector('#q1-retry-1')?.click();
          const block = document.querySelector('[data-question-id="q1"]');
          block?.scrollIntoView({ block: 'start', behavior: 'instant' });
        `,
      });
      await new Promise((r) => setTimeout(r, 300));
    }
    const shot = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(outPath, Buffer.from(shot.data, "base64"));
    ws.close();
  } finally {
    proc.kill("SIGTERM");
    try {
      fs.rmSync(userData, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  const port = await allocatePort();
  const { reviewRoot } = stagePagesSite(repoRoot, PAGES_PATH_PREFIX);
  const base = pagesBaseUrl(port, PAGES_PATH_PREFIX);
  const server = spawn(
    "python",
    ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", reviewRoot],
    { stdio: "ignore" },
  );
  await new Promise((r) => setTimeout(r, 500));
  try {
    const desktop = path.join(outDir, "lesson-splits-desktop-1280.png");
    const mobile = path.join(outDir, "quiz-locked-mobile-390.png");
    await capture(base, desktop, 1280, 800);
    await capture(base, mobile, 390, 844, "#questions");
    console.log("wrote", desktop, mobile);
  } finally {
    server.kill("SIGTERM");
    fs.rmSync(reviewRoot, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
