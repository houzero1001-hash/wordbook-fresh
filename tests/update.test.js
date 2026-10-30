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
import { shareURL, receiveShare, SHARE_LIMIT } from "../src/share.js";
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
  assert.deepEqual(statistics(words, 100), { due: 2, total: 4, known: 1 });
  assert.deepEqual(statistics([], 100), { due: 0, total: 0, known: 0 });
  assert.deepEqual(statistics(words, 100 + 86400000), {
    due: 3,
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
for (const text of [
  "study",
  "study book run",
  "study hard",
  "study & book\nright #mean",
  "don’t study",
])
  test("分享编码往返：" + text, () => {
    const url = shareURL("https://wordbook.example", text);
    assert.equal(new URL(url).search, "");
    assert.equal(receiveShare(url).text, text);
    assert.deepEqual(receiveShare(url).words, tokens(text));
  });
for (const value of [
  "https://example.com/study?word=book",
  "www.example.com/book",
  "example.org/path",
  "mailto:study@example.org",
])
  test("只有网址或邮件不生成候选：" + value, () =>
    assert.deepEqual(
      receiveShare(shareURL("https://wordbook.example", value)).words,
      [],
    ),
  );
test("url/title上下文不冒充选中文字", () => {
  for (const q of [
    "?url=https://example.org/study",
    "?title=English%20Article&url=https://example.org",
    "?text=&title=Study",
  ])
    assert.deepEqual(receiveShare("https://wordbook.example/" + q).words, []);
});
test("混合文字仅保留选中词，过滤网址", () =>
  assert.deepEqual(
    receiveShare(
      shareURL(
        "https://wordbook.example",
        "study https://example.org/book run",
      ),
    ).words,
    ["study", "run"],
  ));
test("兼容旧?text但不把%二次解码", () => {
  assert.deepEqual(
    receiveShare("https://wordbook.example/?text=study%20book").words,
    ["study", "book"],
  );
  assert.equal(
    receiveShare("https://wordbook.example/?text=study%2520book").text,
    "study%20book",
  );
});
test("分享超长拒绝，不静默截断", () => {
  assert.throws(
    () => shareURL("https://wordbook.example", "x".repeat(SHARE_LIMIT + 1)),
    /过长/,
  );
  assert.match(
    receiveShare(
      "https://wordbook.example/?text=" + "x".repeat(SHARE_LIMIT + 1),
    ).error,
    /超过/,
  );
});
test("分享只接收，不保存；确认后去重且保护掌握状态和复习记录", () => {
  let w = grade(addWords([], ["study"], 100)[0], true, 200);
  const before = JSON.stringify(w);
  const receipt = receiveShare(
    shareURL("https://wordbook.example", "study book study"),
  );
  assert.equal(JSON.stringify(w), before);
  const out = addWords([w], receipt.words, 300);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], w);
  assert.equal(
    mergeBackup(
      out,
      JSON.parse(JSON.stringify({ format: "wordbook-1", words: out })),
    )[0].lastReview,
    200,
  );
});
test("输入短语按词处理，弯引号归一，网址排除", () =>
  assert.deepEqual(tokens("study hard; don’t https://example.org/study"), [
    "study",
    "hard",
    "don't",
  ]));
