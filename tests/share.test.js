import { test } from "node:test";
import assert from "node:assert/strict";
import { shareURL, receiveShare } from "../src/share.js";
import { addWords } from "../src/core.js";
test("分享接收与特殊字符编码、去重、链接过滤", () => {
  const r = receiveShare(shareURL("study & book study\nrun"));
  assert.deepEqual(r.words, ["study", "book", "run"]);
  assert.equal(new URL(shareURL("study")).search, "");
  assert.deepEqual(
    receiveShare(shareURL("https://example.org/study")).words,
    [],
  );
});
test("分享需要人工确认，保留已掌握记录，不把title/url当成词", () => {
  const known = { ...addWords([], ["study"])[0], status: "known", due: null };
  const before = JSON.stringify(known);
  const receipt = receiveShare(shareURL("study book"));
  assert.equal(JSON.stringify(known), before);
  const saved = addWords([known], receipt.words);
  assert.equal(saved.length, 2);
  assert.equal(saved[0], known);
  assert.equal(
    receiveShare("https://example.org/?title=study&url=https://example.org"),
    null,
  );
});
