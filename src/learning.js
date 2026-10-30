// Temporary defaults, deliberately centralized. Two recognitions never imply mastery.
export const REVIEW_CONFIG = Object.freeze({
  intervalDays: [1, 3, 7, 14, 30],
  failureMinutes: 10,
  maxAttempts: 4,
  minInterveningWords: 2,
  automaticMastery: null,
  dailyOptions: [5, 10, 15, 25],
  dailyDefault: 10,
});
const DAY = 86400000;
export function migrateWord(w) {
  if (!w || typeof w.word !== "string") throw Error("单词记录损坏");
  const touched =
    w.lastReview != null ||
    w.lastLearned != null ||
    w.history?.length > 0 ||
    w.step > 0;
  const status =
    w.status === "known"
      ? "known"
      : w.status === "new"
        ? "new"
        : touched
          ? "learning"
          : "new";
  return {
    ...w,
    id: w.id || "word:" + w.word,
    schemaVersion: 2,
    status,
    lastLearned: w.lastLearned ?? null,
    lastReview: w.lastReview ?? null,
    due: status === "known" || status === "new" ? null : (w.due ?? Date.now()),
    history: Array.isArray(w.history) ? w.history : [],
    knownAt:
      w.knownAt ?? (status === "known" ? (w.lastReview ?? w.created) : null),
    masterySource: w.masterySource ?? (status === "known" ? "legacy" : null),
    roundStreak: w.roundStreak ?? 0,
    reviewLevel: w.reviewLevel ?? 0,
  };
}
export const migrateWords = (words) => words.map(migrateWord);
export const localDay = (now = Date.now()) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
export function newTask(
  words,
  limit = REVIEW_CONFIG.dailyDefault,
  now = Date.now(),
) {
  const day = localDay(now);
  const started = words.filter((w) =>
    w.history?.some((h) => h.mode === "learn" && localDay(h.at) === day),
  ).length;
  return words
    .filter((w) => w.status === "new")
    .slice(0, Math.max(0, limit - started));
}
export function createRound(words, mode, now = Date.now()) {
  const id = "round:" + now + ":" + Math.random().toString(36).slice(2);
  const ready = words.filter(
    (w) => !w.pendingRound || w.pendingRound.resumeAt <= now,
  );
  return {
    id,
    mode,
    created: now,
    phase: "question",
    current: ready[0]?.word ?? null,
    log: [],
    items: ready.map((w) => ({
      word: w.word,
      wordRoundId: w.pendingRound?.id || id,
      attempts: w.pendingRound?.attempts || 0,
      streak: w.pendingRound?.streak || 0,
      done: false,
      result: null,
      lastIndex: null,
    })),
    finished: ready.length === 0,
  };
}
export function schedule(w, passed, now = Date.now(), config = REVIEW_CONFIG) {
  const level = passed
    ? Math.min((w.reviewLevel || 0) + 1, config.intervalDays.length)
    : 0;
  return {
    ...w,
    status: "learning",
    reviewLevel: level,
    due:
      now +
      (passed
        ? config.intervalDays[Math.max(0, level - 1)] * DAY
        : config.failureMinutes * 60000),
  };
}
export function answerRound(
  words,
  round,
  choice,
  now = Date.now(),
  config = REVIEW_CONFIG,
) {
  if (!["yes", "no", "master"].includes(choice)) throw Error("无效判断");
  if (round.finished || round.phase !== "question" || !round.current)
    throw Error("本次判断已保存，请点下一个");
  const r = structuredClone(round),
    i = r.items.find((x) => x.word === r.current);
  i.attempts++;
  i.streak = choice === "yes" ? i.streak + 1 : 0;
  i.lastIndex = r.log.length;
  r.log.push(i.word);
  i.done =
    choice === "master" || i.streak >= 2 || i.attempts >= config.maxAttempts;
  i.result =
    choice === "master"
      ? "mastered"
      : i.streak >= 2
        ? "passed"
        : i.done
          ? "capped"
          : null;
  r.phase = "answer";
  const out = words.map((raw) => {
    if (raw.word !== i.word) return raw;
    let w = migrateWord(raw);
    const record = {
      roundId: i.wordRoundId || r.id,
      taskId: r.id,
      mode: r.mode,
      choice,
      at: now,
      streak: i.streak,
      attempt: i.attempts,
      result: i.result,
    };
    w = {
      ...w,
      status: "learning",
      lastLearned: r.mode === "learn" ? now : w.lastLearned,
      lastReview: r.mode === "review" ? now : w.lastReview,
      roundId: i.wordRoundId || r.id,
      pendingRound: null,
      roundStreak: i.streak,
      history: [...w.history, record],
    };
    if (choice === "master")
      return {
        ...w,
        status: "known",
        due: null,
        knownAt: now,
        masterySource: "manual-not-again",
      };
    // Even an interrupted round gets a safe next date; never becomes permanently known.
    if (i.result === "passed") return schedule(w, true, now, config);
    if (choice === "no" || i.result === "capped")
      return schedule(w, false, now, config);
    return { ...w, due: now + config.failureMinutes * 60000 };
  });
  return { words: out, round: r };
}
export function nextRound(
  words,
  round,
  now = Date.now(),
  config = REVIEW_CONFIG,
) {
  if (round.phase !== "answer") throw Error("请先判断当前单词");
  const r = structuredClone(round);
  const eligible = r.items.filter(
    (i) =>
      !i.done &&
      (i.lastIndex === null ||
        new Set(r.log.slice(i.lastIndex + 1)).size >=
          config.minInterveningWords),
  );
  const next = eligible.sort(
    (a, b) =>
      a.attempts - b.attempts || (a.lastIndex ?? -1) - (b.lastIndex ?? -1),
  )[0];
  if (next) {
    r.current = next.word;
    r.phase = "question";
    return { words, round: r };
  }
  // Too few intervening words: defer instead of immediately manufacturing a second recognition.
  const deferred = new Set(
    r.items
      .filter((i) => !i.done)
      .map((i) => {
        i.done = true;
        i.result = "deferred";
        return i.word;
      }),
  );
  const out = words.map((w) => {
    if (!deferred.has(w.word)) return w;
    const item = r.items.find((i) => i.word === w.word),
      resumeAt = now + config.failureMinutes * 60000;
    return {
      ...w,
      status: "learning",
      due: resumeAt,
      pendingRound: {
        id: item.wordRoundId || r.id,
        streak: item.streak,
        attempts: item.attempts,
        resumeAt,
      },
      history: [
        ...w.history,
        {
          roundId: item.wordRoundId || r.id,
          taskId: r.id,
          mode: r.mode,
          at: now,
          result: "deferred",
        },
      ],
    };
  });
  r.current = null;
  r.finished = true;
  return { words: out, round: r };
}
export function markNew(w, now = Date.now()) {
  return {
    ...migrateWord(w),
    status: "new",
    due: null,
    pendingRound: null,
    roundStreak: 0,
    reviewLevel: 0,
    knownAt: null,
    masterySource: null,
    history: [
      ...(w.history || []),
      {
        at: now,
        choice: "restart",
        previousMasterySource: w.masterySource ?? "legacy",
      },
    ],
  };
}
