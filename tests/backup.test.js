import { test } from "node:test";
import assert from "node:assert/strict";
import { addWords } from "../src/core.js";
import { createRound, answerRound, nextRound } from "../src/learning.js";
import { makeBackup, restoreBackup } from "../src/backup.js";
test("备份恢复正在显示答案的轮次，保留次数且不重复记分", () => {
  const words = addWords([], ["study", "book", "run"]);
  const state = answerRound(words, createRound(words, "learn"), "yes");
  const restored = restoreBackup(
    [],
    JSON.parse(JSON.stringify(makeBackup(state.words, state.round))),
  );
  assert.equal(restored.round.phase, "answer");
  assert.equal(restored.round.items[0].streak, 1);
  assert.equal(restored.words[0].history.length, 1);
  assert.equal(nextRound(restored.words, restored.round).round.current, "book");
});
test("导入不能覆盖当前已有轮次；无效轮次整笔拒绝", () => {
  const words = addWords([], ["study"]);
  const r = createRound(words, "learn");
  const input = makeBackup(words, r);
  assert.equal(restoreBackup(words, input, r).round, r);
  const before = JSON.stringify(words);
  assert.throws(
    () => restoreBackup([], { ...input, round: { ...r, current: "missing" } }),
    /轮次/,
  );
  assert.equal(JSON.stringify(words), before);
});
