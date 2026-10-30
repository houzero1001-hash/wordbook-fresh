import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { normalizeBase, assetURL } from "../src/paths.js";
test("静态资源路径和非法基础路径", () => {
  assert.equal(
    assetURL("/dict/st.json", "/wordbook-fresh/"),
    "/wordbook-fresh/dict/st.json",
  );
  for (const base of ["wordbook-fresh", "/foo", "https://example.org/", "/../"])
    assert.throws(() => normalizeBase(base));
});
test("保留添加、备份以及可折叠的分享兼容入口", () => {
  const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  for (const kept of [
    'id="input"',
    'id="image"',
    'id="camera"',
    'id="document"',
    "收藏选中的单词",
    "导出 JSON",
    "恢复 JSON",
    "receiveShare",
    "iphone-guide.html",
  ])
    assert.ok(app.includes(kept), kept);
  assert.ok(existsSync(new URL("../src/share.js", import.meta.url)));
});
