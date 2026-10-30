import { test } from "node:test";
import assert from "node:assert/strict";
import { addWords } from "../src/core.js";
import { createRound, answerRound } from "../src/learning.js";
import {
  removeCandidates,
  removeSavedWords,
  libraryWords,
} from "../src/bulk-delete.js";
const make = () => addWords([], ["study", "book", "run"], 100);
test("批量删除候选仅移除勾选，不改原数组或正式词库", () => {
  const cs = [
    { word: "study", selected: true },
    { word: "book", selected: false },
  ];
  assert.deepEqual(removeCandidates(cs), [cs[1]]);
  assert.equal(cs.length, 2);
  assert.deepEqual(removeCandidates([]), []);
});
test("批量删除正式词仅影响所选，保留其他词历史和掌握状态", () => {
  const words = make();
  words[1] = { ...words[1], status: "known", history: [{ at: 100 }] };
  const r = removeSavedWords(words, ["study", "missing"]);
  assert.deepEqual(
    r.words.map((w) => w.word),
    ["book", "run"],
  );
  assert.equal(r.words[0], words[1]);
  assert.equal(words.length, 3);
});
test("删除与当前轮次无关的词不重置轮次", () => {
  const words = make(),
    round = createRound(words.slice(0, 2), "learn");
  assert.equal(removeSavedWords(words, ["run"], round).round, round);
});
test("删除当前轮次的当前词安全推进，删除全部任务后清理轮次", () => {
  const words = make(),
    round = createRound(words, "learn");
  const out = removeSavedWords(words, ["study"], round, 200);
  assert.equal(out.round.current, "book");
  assert.equal(out.round.phase, "question");
  assert.ok(!out.round.items.some((i) => i.word === "study"));
  assert.equal(
    removeSavedWords(words, ["study", "book", "run"], round).round,
    null,
  );
});
test("删除已回答词正确维护轮次日志和剩余记录", () => {
  const words = make(),
    state = answerRound(words, createRound(words, "learn"), "yes", 200);
  const out = removeSavedWords(state.words, ["study"], state.round, 300);
  assert.ok(!out.round.log.includes("study"));
  assert.deepEqual(out.words[0].history, []);
});
test("全选使用当前筛选与搜索，掌握词不混入待学习筛选", () => {
  const words = make();
  words[1].status = "known";
  assert.deepEqual(
    libraryWords(words, "new", "").map((w) => w.word),
    ["study", "run"],
  );
  assert.deepEqual(
    libraryWords(words, "all", "bo").map((w) => w.word),
    ["book"],
  );
});
