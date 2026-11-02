import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SITE_FILES = ["index.html", "app.js", "logic.js", "styles.css"];

export function stagePagesSite(repoRoot, pathPrefix) {
  const folder = pathPrefix.replace(/^\//, "");
  const reviewRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${folder}-pages-`));
  const mount = path.join(reviewRoot, folder);
  fs.mkdirSync(mount, { recursive: true });
  for (const file of SITE_FILES) {
    fs.copyFileSync(path.join(repoRoot, file), path.join(mount, file));
  }
  return { reviewRoot, mount, folder };
}

export function browserPath() {
  for (const p of [
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ]) {
    if (fs.existsSync(p)) return p;
  }
  return "msedge";
}
