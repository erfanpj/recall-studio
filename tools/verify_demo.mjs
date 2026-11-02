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

async function withPage(baseUrl, fn, { denyStorage = false } = {}) {
  const dbgPort = 9960 + Math.floor(Math.random() * 40);
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "rs-verify-"));
  const proc = spawn(
    browserPath(),
    [
      "--headless=new",
      `--remote-debugging-port=${dbgPort}`,
      `--user-data-dir=${userData}`,
      "--disable-extensions",
      ...(denyStorage ? ["--disable-local-storage"] : []),
      "about:blank",
    ],
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
    await send("Page.navigate", { url: baseUrl });
    await new Promise((r) => setTimeout(r, 1000));
    const evalJs = async (expression) => {
      const r = await send("Runtime.evaluate", { expression, returnByValue: true });
      return r.result.value;
    };
    await fn({ evalJs, send });
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
    await withPage(base, async ({ evalJs }) => {
      await evalJs(`window.confirm = () => true`);
      const overlapPerson = await evalJs(`document.querySelector('#overlap-person').textContent`);
      if (overlapPerson !== "None") throw new Error(`person overlap: ${overlapPerson}`);
      await evalJs(`document.querySelector('#q1-c0').click()`);
      const locked = await evalJs(`document.querySelector('#q1-c1').disabled`);
      if (!locked) throw new Error("first-answer radios should lock");
      await evalJs(`document.querySelector('#q1-retry-1').click()`);
      if (!(await evalJs(`document.querySelector('#q1-retry-1').checked`))) {
        throw new Error("retry radio not checked after rerender");
      }
      await evalJs(`document.querySelector('#revealPracticeBtn').click()`);
      await evalJs(`document.querySelector('input[name=selfRate][value=matched]').click()`);
      await evalJs(`document.querySelector('#resetBtn').click()`);
      if (await evalJs(`document.querySelector('input[name=selfRate][value=matched]')?.checked`)) {
        throw new Error("practice rating should clear on reset");
      }
      if (await evalJs(`document.querySelector('#revealPracticeBtn').hidden`)) {
        throw new Error("reveal button should reappear after reset");
      }
    });

    await withPage(base, async ({ evalJs }) => {
      if (!(await evalJs(`!document.querySelector('#storageBanner').hidden`))) {
        throw new Error("expected storage-unavailable banner");
      }
    }, { denyStorage: true });

    console.log("verify_demo: ok", base);
  } finally {
    server.kill("SIGTERM");
    fs.rmSync(reviewRoot, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
