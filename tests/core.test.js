import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addWords,
  grade,
  restart,
  dueWords,
  mergeBackup,
  tokens,
  senses,
} from "../src/core.js";
const t = 123456789;
test("多词输入及去重", () =>
  assert.deepEqual(
    addWords([], tokens("Study study book!")).map((w) => w.word),
    ["study", "book"],
  ));
test("记住退出、再次收藏不改变状态、手动重学", () => {
  let w = grade(addWords([], ["study"], t)[0], true, t);
  assert.equal(dueWords([w], t).length, 0);
  assert.equal(addWords([w], ["STUDY"])[0].status, "known");
  assert.equal(dueWords([restart(w, t)], t).length, 1);
});
test("未记住使用1、2、4、7、14日间隔", () => {
  let w = addWords([], ["study"], t)[0];
  for (const days of [1, 2, 4, 7, 14, 14]) {
    w = grade(w, false, t);
    assert.equal(w.due, t + days * 86400000);
    assert.equal(w.lastReview, t);
    assert.equal(dueWords([w], t).length, 0);
    assert.equal(dueWords([w], w.due).length, 1);
  }
});
test("备份往返、去重且保留现有状态", () => {
  const known = grade(addWords([], ["study"], t)[0], true, t);
  const input = JSON.parse(
    JSON.stringify({
      format: "wordbook-1",
      words: addWords([], ["study", "book"], t),
    }),
  );
  const result = mergeBackup([known], input);
  assert.equal(result.length, 2);
  assert.equal(result[0].status, "known");
  assert.equal(mergeBackup(result, input).length, 2);
});
test("损坏备份不修改原数据", () => {
  const original = addWords([], ["study"], t),
    snapshot = JSON.stringify(original);
  assert.throws(() =>
    mergeBackup(original, { format: "wordbook-1", words: [{ word: "evil" }] }),
  );
  assert.equal(JSON.stringify(original), snapshot);
});
for (const [word, min] of [
  ["study", 2],
  ["book", 2],
  ["run", 3],
  ["right", 4],
  ["mean", 4],
])
  test(`${word}真实词库多词性`, () => {
    const d = JSON.parse(
      readFileSync(
        new URL(`../public/dict/${word.slice(0, 2)}.json`, import.meta.url),
      ),
    );
    assert.ok(d[word].ipa);
    assert.ok(senses(d[word].translation).length >= min);
  });
test("frief未收录，不编造释义", () => {
  const d = JSON.parse(
    readFileSync(new URL("../public/dict/fr.json", import.meta.url)),
  );
  assert.equal(d.frief, undefined);
});
test("明确词形链接且不会合并收藏原词形", () => {
  const d = JSON.parse(
    readFileSync(new URL("../public/dict/st.json", import.meta.url)),
  );
  assert.equal(d.studied.lemma, "study");
  const words = addWords([], ["study", "studied"]);
  assert.equal(words.length, 2);
  assert.equal(words[1].original, "studied");
});
test("run 的不规则过去式和过去分词映射准确", () => {
  const d = JSON.parse(
    readFileSync(new URL("../public/dict/ru.json", import.meta.url)),
  );
  assert.ok(d.run.exchange.includes("p:ran"));
  assert.ok(d.run.exchange.includes("d:run"));
});
