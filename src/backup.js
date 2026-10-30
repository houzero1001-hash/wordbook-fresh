import { mergeBackup } from "./core.js";
export function makeBackup(words, round = null, now = Date.now()) {
  return {
    format: "wordbook-2",
    exported: new Date(now).toISOString(),
    words,
    round,
  };
}
export function restoreBackup(current, input, currentRound = null) {
  const words = mergeBackup(current, input);
  let round = currentRound;
  // Resume a backed-up task only into an empty library, never over existing progress.
  if (!current.length && input.format === "wordbook-2" && input.round) {
    const r = input.round,
      ids = new Set(words.map((w) => w.word));
    if (
      typeof r.id !== "string" ||
      !["learn", "review"].includes(r.mode) ||
      !["question", "answer"].includes(r.phase) ||
      !Array.isArray(r.items) ||
      !Array.isArray(r.log) ||
      r.items.length > 100000 ||
      r.items.some(
        (i) =>
          !ids.has(i.word) ||
          !Number.isInteger(i.attempts) ||
          i.attempts < 0 ||
          i.attempts > 100 ||
          !Number.isInteger(i.streak) ||
          i.streak < 0 ||
          i.streak > 2,
      ) ||
      new Set(r.items.map((i) => i.word)).size !== r.items.length ||
      r.log.some((w) => !ids.has(w)) ||
      (!r.finished && !r.items.some((i) => i.word === r.current))
    )
      throw Error("备份轮次数据无效，未导入");
    round = structuredClone(r);
  }
  return { words, round };
}
