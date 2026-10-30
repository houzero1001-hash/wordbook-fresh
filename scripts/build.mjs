import { build } from "vite";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { normalizeBase } from "../src/paths.js";

const base = normalizeBase(process.env.VITE_BASE_PATH || "/");
const out = process.env.BUILD_OUT_DIR || "dist";
await build({build:{outDir:out}});
const assets = await readdir(`${out}/assets`);
const shell = [
  base,
  ...["index.html", "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-192.png", "icon-512.png"].map((p) => base + p),
  ...assets.map((name) => base + "assets/" + name),
];
// Stable release identity includes public assets as well as hashed JS/CSS.
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory()
    ? files(`${dir}/${entry.name}`)
    : `${dir}/${entry.name}`))).flat().sort();
}
const digest = createHash("sha256").update(base);
for (const path of await files(out)) {
  if (path === `${out}/sw.js`) continue;
  digest.update(path).update(await readFile(path));
}
let sw = await readFile(`${out}/sw.js`, "utf8");
sw = sw.replace(/\/\*__WB_SHELL__\*\/\s*\[[\s\S]*?\]/, JSON.stringify(shell))
  .replace("__WB_RELEASE__", digest.digest("hex").slice(0, 20));
if (sw.includes("__WB_SHELL__") || sw.includes("__WB_RELEASE__")) throw Error("离线资源构建失败");
await writeFile(`${out}/sw.js`, sw);
await writeFile(`${out}/.nojekyll`, "");
