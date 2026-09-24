// Fails the build when VITE_API_BASE_URL is not allowed by the Content-Security
// Policy in vercel.json.
//
// A mismatch here produces no network entry and no HTTP status — the browser
// blocks the request before it leaves. It reads exactly like a dead backend,
// and it only shows up in production. Cheaper to catch at build time.
import fs from "node:fs";

const apiBase = process.env.VITE_API_BASE_URL;
const wsBase = process.env.VITE_WS_BASE_URL;

if (!apiBase) {
  console.log("[csp] VITE_API_BASE_URL tidak diset — melewati pemeriksaan.");
  process.exit(0);
}

let config;
try {
  config = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
} catch {
  console.log("[csp] vercel.json tidak ditemukan — melewati pemeriksaan.");
  process.exit(0);
}

const csp = config.headers
  ?.flatMap((h) => h.headers ?? [])
  .find((h) => h.key === "Content-Security-Policy")?.value;

if (!csp) {
  console.log("[csp] Tidak ada Content-Security-Policy di vercel.json.");
  process.exit(0);
}

const connectSrc = csp
  .split(";")
  .map((d) => d.trim())
  .find((d) => d.startsWith("connect-src"));

const allowed = (connectSrc ?? "").split(/\s+/).slice(1);
const problems = [];

const originOf = (value) => {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const permitted = (origin) =>
  allowed.some((entry) => entry === origin || entry === "*" || (entry.startsWith("*.") && origin.endsWith(entry.slice(1))));

const apiOrigin = originOf(apiBase);
if (apiOrigin && !permitted(apiOrigin)) {
  problems.push(`connect-src tidak mengizinkan API: ${apiOrigin}`);
}

const wsOrigin = originOf(wsBase ?? "");
if (wsOrigin && !permitted(wsOrigin)) {
  problems.push(`connect-src tidak mengizinkan WebSocket: ${wsOrigin}`);
}

if (wsBase && apiOrigin?.startsWith("https://") && wsBase.startsWith("ws://")) {
  problems.push(`VITE_WS_BASE_URL memakai ws:// padahal situsnya https — browser akan memblokirnya. Pakai wss://`);
}

if (problems.length === 0) {
  console.log("[csp] connect-src mengizinkan API dan WebSocket.");
  process.exit(0);
}

console.error("\n[csp] Build dihentikan:\n");
problems.forEach((p) => console.error("  - " + p));
console.error(`\n  connect-src saat ini: ${allowed.join(" ") || "(kosong)"}`);
console.error("  Perbarui Content-Security-Policy di web/vercel.json.\n");
process.exit(1);
