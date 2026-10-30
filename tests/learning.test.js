import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addWords,
  dueWords,
  statistics,
  mergeBackup,
  restart,
} from "../src/core.js";
import {
  REVIEW_CONFIG,
  migrateWords,
  createRound,
  answerRound,
  nextRound,
  newTask,
  schedule,
  localDay,
} from "../src/learning.js";
const now = 1000000000000;
const initial = () => addWords([], ["study", "book", "run"], now);
function make() {
  const words = initial();
  return { words, round: createRound(words, "learn", now) };
}
const answer = (state, choice) =>
  answerRound(state.words, state.round, choice, now);
const next = (state) => nextRound(state.words, state.round, now);
test("新收藏进入待学习，不占到期复习", () => {
  const w = initial();
  assert.equal(w[0].status, "new");
  assert.equal(w[0].due, null);
  assert.equal(dueWords(w, now).length, 0);
  assert.deepEqual(statistics(w, now), { total: 3, due: 0, known: 0 });
});
test("认识显示答案且只加本轮连续次数，不能重复点击", () => {
  const s = answer(make(), "yes");
  assert.equal(s.round.phase, "answer");
  assert.equal(s.words[0].roundStreak, 1);
  assert.equal(s.words[0].status, "learning");
  assert.throws(() => answer(s, "yes"));
});
test("不认识显示答案并保存历史", () => {
  const s = answer(make(), "no");
  assert.equal(s.round.phase, "answer");
  assert.equal(s.words[0].history[0].choice, "no");
  assert.equal(s.words[0].roundStreak, 0);
});
test("三个词穿插后第二次认识通过，但仍有未来复习日期", () => {
  let s = make();
  for (let i = 0; i < 3; i++) s = next(answer(s, "yes"));
  assert.equal(s.round.current, "study");
  s = answer(s, "yes");
  assert.equal(s.round.items[0].result, "passed");
  assert.equal(s.words[0].status, "learning");
  assert.ok(s.words[0].due > now);
  assert.equal(s.words[0].knownAt, null);
});
test("认识后不认识清零，再认识只有1次", () => {
  let s = make();
  for (let i = 0; i < 3; i++) s = next(answer(s, "yes"));
  s = answer(s, "no");
  assert.equal(s.words[0].roundStreak, 0);
  s = next(s);
  s = next(answer(s, "yes"));
  s = next(answer(s, "yes"));
  assert.equal(s.round.current, "study");
  s = answer(s, "yes");
  assert.equal(s.words[0].roundStreak, 1);
});
test("单词或两个词不能立即重复制造第二次认识", () => {
  for (const count of [1, 2]) {
    let words = initial().slice(0, count),
      s = { words, round: createRound(words, "learn", now) };
    for (let i = 0; i < count; i++) s = next(answer(s, "yes"));
    assert.equal(s.round.finished, true);
    assert.ok(s.round.items.every((i) => i.result === "deferred"));
    assert.ok(s.words.every((w) => w.status === "learning"));
  }
});
test("困难词每轮上限，不无限阻塞", () => {
  let s = make(),
    n = 0;
  while (!s.round.finished && n < 30) {
    s = next(answer(s, "no"));
    n++;
  }
  assert.equal(n, 3 * REVIEW_CONFIG.maxAttempts);
  assert.ok(s.round.items.every((i) => i.result === "capped"));
});
test("不再出现直接掌握，保留记录和来源，重新学习不丢历史", () => {
  let s = answer(make(), "master");
  const w = s.words[0];
  assert.equal(w.status, "known");
  assert.equal(w.due, null);
  assert.equal(w.masterySource, "manual-not-again");
  assert.equal(w.knownAt, now);
  const r = restart(w, now + 1);
  assert.equal(r.status, "new");
  assert.equal(r.history.length, 2);
  assert.equal(dueWords([w], now + 1e10).length, 0);
});
test("新词和到期复习独立选择，日限额可调", () => {
  let s = next(answer(make(), "yes"));
  assert.equal(newTask(s.words, 5, now).length, 2);
  assert.equal(newTask(s.words, 1, now).length, 0);
  assert.equal(dueWords(s.words, now + 600000).length, 1);
});
test("复习与新学相同两次通过规则，记录lastReview", () => {
  let words = initial().map((w) => ({
    ...w,
    status: "learning",
    lastLearned: now - 1,
    due: now,
  }));
  let s = { words, round: createRound(words, "review", now) };
  s = answer(s, "yes");
  assert.equal(s.words[0].lastReview, now);
  assert.equal(s.words[0].history[0].mode, "review");
  assert.equal(s.round.items[0].done, false);
});
test("轮次序列化后继续，答案不重复计数", () => {
  let s = JSON.parse(JSON.stringify(answer(make(), "yes")));
  assert.equal(s.round.phase, "answer");
  s = next(s);
  assert.equal(s.round.current, "book");
  assert.equal(s.words[0].history.length, 1);
});
test("旧数据迁移保留卡片、用户字段、旧掌握和历史", () => {
  const base = {
    word: "study",
    status: "learning",
    created: now,
    lastReview: null,
    step: 0,
    due: now,
    card: {
      translation: "v.学习",
      examples: [{ en: "I study.", zh: "我学习。" }],
    },
    custom: "keep",
  };
  const [a, b, c] = migrateWords([
    base,
    { ...base, word: "book", step: 1, lastReview: now },
    { ...base, word: "run", status: "known" },
  ]);
  assert.equal(a.status, "new");
  assert.equal(a.card, base.card);
  assert.equal(a.custom, "keep");
  assert.equal(b.status, "learning");
  assert.equal(c.masterySource, "legacy");
});
test("新旧备份恢复不丢卡片，重复保留当前修改，坏记录原子拒绝", () => {
  let s = answer(make(), "yes");
  s.words[0].card = {
    examples: [{ en: "I study English.", zh: "我学习英语。", manual: true }],
  };
  const restored = mergeBackup([], { format: "wordbook-2", words: s.words });
  assert.deepEqual(restored[0].card, s.words[0].card);
  assert.equal(restored[0].history.length, 1);
  assert.equal(
    mergeBackup(s.words, { format: "wordbook-1", words: s.words })[0],
    s.words[0],
  );
  const before = JSON.stringify(s.words);
  assert.throws(() =>
    mergeBackup(s.words, {
      format: "wordbook-2",
      words: [{ ...s.words[0], history: [{ at: "bad" }] }],
    }),
  );
  assert.equal(JSON.stringify(s.words), before);
});
test("复习成功延长，失败提前；没有自动永久掌握阈值", () => {
  let w = initial()[0];
  for (const days of REVIEW_CONFIG.intervalDays) {
    w = schedule(w, true, now);
    assert.equal(w.due, now + days * 86400000);
    assert.equal(w.status, "learning");
  }
  w = schedule(w, false, now);
  assert.equal(w.due, now + REVIEW_CONFIG.failureMinutes * 60000);
  assert.equal(REVIEW_CONFIG.automaticMastery, null);
});
test("所有临时参数可集中替换", () => {
  let s = make();
  const config = { ...REVIEW_CONFIG, maxAttempts: 1, failureMinutes: 5 };
  s = answerRound(s.words, s.round, "no", now, config);
  assert.equal(s.round.items[0].result, "capped");
  assert.equal(s.words[0].due, now + 300000);
});
test("首次认识不清空既有复习级别，完成本轮后真正延长间隔", () => {
  const words = initial().map((w) => ({
    ...w,
    status: "learning",
    reviewLevel: 2,
    lastLearned: now - 1,
    due: now,
  }));
  let s = { words, round: createRound(words, "review", now) };
  for (let i = 0; i < 3; i++) s = next(answer(s, "yes"));
  assert.equal(s.words[0].reviewLevel, 2);
  s = answer(s, "yes");
  assert.equal(s.words[0].reviewLevel, 3);
  assert.equal(s.words[0].due, now + 7 * 86400000);
});
test("少量词延后后保留同一单词轮次，不能立即刷两次，10分钟后可完成", () => {
  let words = initial().slice(0, 1),
    s = { words, round: createRound(words, "learn", now) };
  s = next(answer(s, "yes"));
  const id = s.words[0].pendingRound.id;
  assert.equal(createRound(s.words, "review", now + 1).items.length, 0);
  const due = now + REVIEW_CONFIG.failureMinutes * 60000;
  s = {
    words: s.words,
    round: createRound(dueWords(s.words, due), "review", due),
  };
  assert.equal(s.round.items[0].wordRoundId, id);
  assert.equal(s.round.items[0].streak, 1);
  s = answerRound(s.words, s.round, "yes", due);
  assert.equal(s.round.items[0].result, "passed");
  assert.equal(s.words[0].status, "learning");
  assert.equal(s.words[0].pendingRound, null);
  assert.ok(s.words[0].due > due);
});
