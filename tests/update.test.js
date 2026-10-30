import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import {
  parseDocument,
  rtfText,
  docxText,
  decodeText,
} from "../src/document-text.js";
import {
  tokens,
  statistics,
  addWords,
  grade,
  mergeBackup,
} from "../src/core.js";
const bytes = (name) =>
  new Uint8Array(readFileSync(new URL("./fixtures/" + name, import.meta.url)));
const expected = ["study", "book", "run", "right", "mean"];
test("首页统计：到期、未来、已掌握与缺失词典均按真实数据计算", () => {
  let words = addWords([], ["study", "book", "run", "frief"], 100);
  words[1] = grade(words[1], false, 100);
  words[2] = grade(words[2], true, 100);
  assert.deepEqual(statistics(words, 100), { due: 0, total: 4, known: 1 });
  assert.deepEqual(statistics([], 100), { due: 0, total: 0, known: 0 });
  assert.deepEqual(statistics(words, 100 + 86400000), {
    due: 1,
    total: 4,
    known: 1,
  });
});
for (const [name, ext] of [
  ["words.txt", "txt"],
  ["words.md", "md"],
  ["words.rtf", "rtf"],
  ["words.docx", "docx"],
  ["rtf-word.doc", "doc"],
])
  test(`${ext}真实文件解析英文候选`, () => {
    const words = tokens(parseDocument(bytes(name), ext));
    assert.ok(expected.every((w) => words.includes(w)));
    assert.ok(!words.includes("example") && !words.includes("org"));
  });
test("RTF不提取字体表、图片和隐藏目标的乱码", () => {
  const text = rtfText(bytes("words.rtf"));
  assert.ok(!text.includes("Arial"));
  assert.ok(!text.includes("ignoredmetadata"));
  assert.ok(!text.includes("0123ABCD"));
});
test("RTF Unicode、十六进制、转义括号", () => {
  assert.equal(
    rtfText(
      strToU8(String.raw`{\rtf1\ansi\ansicpg1252 caf\'e9 \u233? \{book\}}`),
    ),
    "café é {book}",
  );
});
test("RTF二进制片段跳过", () =>
  assert.equal(
    rtfText(strToU8(String.raw`{\rtf1 study \bin4 abcd book}`)),
    "study  book",
  ));
test("RTF损坏不默默给出结果", () =>
  assert.throws(() => rtfText(strToU8("{\\rtf1 study")), /截断/));
test("真正二进制DOC明确拒绝并提示转换", () =>
  assert.throws(() => parseDocument(bytes("binary.doc"), "doc"), /二进制.doc/));
test("伪DOCX或缺少正文报具体错误", () => {
  assert.throws(() => docxText(strToU8("not a zip")), /DOCX解析失败/);
  assert.throws(() => docxText(zipSync({ "other.xml": strToU8("x") })), /缺少/);
});
test("DOCX跨run单词不会被错误拆成stu和dy", () =>
  assert.equal(tokens(docxText(bytes("words.docx")))[0], "study"));
test("DOCX拒绝解压超限", () =>
  assert.throws(
    () =>
      docxText(
        zipSync({ "word/document.xml": new Uint8Array(13 * 1024 * 1024) }),
      ),
    /超过12MB/,
  ));
test("UTF16与损坏编码", () => {
  assert.equal(
    decodeText(new Uint8Array([255, 254, 98, 0, 111, 0, 111, 0, 107, 0])),
    "book",
  );
  assert.throws(() => decodeText(new Uint8Array([0xff, 0xff, 0xff])), /编码/);
});
test("再次手动添加保留掌握状态和复习记录", () => {
  const w = grade(addWords([], ["study"], 100)[0], true, 200);
  const out = addWords([w], tokens("study book study"), 300);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], w);
  assert.equal(
    mergeBackup(out, { format: "wordbook-1", words: out })[0].lastReview,
    200,
  );
});
test("输入短语按词处理，弯引号归一，网址排除", () =>
  assert.deepEqual(tokens("study hard; don’t https://example.org/study"), [
    "study",
    "hard",
    "don't",
  ]));
