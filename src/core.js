import { migrateWord, markNew } from "./learning.js";
export const normalize = (s) => s.trim().toLowerCase();
export function stripLinks(s) {
  return s
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"，。]+/gi, " ")
    .replace(/\b(?:mailto|tel|data|javascript):[^\s]+/gi, " ")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, " ")
    .replace(
      /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:[/?#][^\s<>"，。]*)?/gi,
      " ",
    );
}
export function statistics(words, now = Date.now()) {
  return {
    due: dueWords(words, now).length,
    total: words.length,
    known: words.filter((w) => w.status === "known").length,
  };
}
export function tokens(s) {
  s = stripLinks(s).replace(/[’‘]/g, "'");
  const found = new Set();
  for (const match of s.matchAll(/[a-zA-Z]+(?:['-][a-zA-Z]+)*/g)) {
    const word = normalize(match[0]);
    if (word.length > 1) found.add(word);
    if (found.size === 3000) break;
  }
  return [...found];
}
export function addWords(existing, words, now = Date.now()) {
  const map = new Map(existing.map((w) => [w.word, w]));
  for (const raw of words) {
    const word = normalize(raw);
    if (!/^[a-z]+(?:['-][a-z]+)*$/.test(word) || map.has(word)) continue;
    map.set(word, {
      word,
      original: raw,
      id: "word:" + word,
      schemaVersion: 2,
      status: "new",
      history: [],
      roundStreak: 0,
      lastLearned: null,
      knownAt: null,
      masterySource: null,
      reviewLevel: 0,
      created: now,
      lastReview: null,
      due: null,
      step: 0,
      card: null,
      error: null,
    });
  }
  return [...map.values()];
}
// Legacy compatibility helper only. New UI uses learning.js answerRound/schedule.
export function grade(w, known, now = Date.now()) {
  return {
    ...w,
    status: known ? "known" : "learning",
    lastReview: now,
    step: known ? w.step : Math.min(w.step + 1, 5),
    due: known ? null : now + [1, 2, 4, 7, 14][Math.min(w.step, 4)] * 86400000,
  };
}
export function restart(w, now = Date.now()) {
  return markNew(w, now);
}
export function dueWords(words, now = Date.now()) {
  return words.filter(
    (w) => w.status === "learning" && Number.isFinite(w.due) && w.due <= now,
  );
}
export function mergeBackup(current, input) {
  if (
    !["wordbook-1", "wordbook-2"].includes(input?.format) ||
    !Array.isArray(input.words) ||
    input.words.length > 100000
  )
    throw Error("备份格式不正确");
  const seen = new Set();
  const valid = input.words.map((w) => {
    if (
      !w ||
      typeof w.word !== "string" ||
      !/^[a-z]+(?:['-][a-z]+)*$/.test(w.word) ||
      !["known", "learning", "new"].includes(w.status) ||
      !Number.isInteger(w.step) ||
      w.step < 0 ||
      w.step > 100 ||
      !Number.isFinite(w.created) ||
      (w.lastReview !== null && !Number.isFinite(w.lastReview)) ||
      (w.status === "learning" && !Number.isFinite(w.due))
    )
      throw Error("备份包含无效记录，未导入");
    if (
      w.history !== undefined &&
      (!Array.isArray(w.history) ||
        w.history.some((h) => !h || !Number.isFinite(h.at)))
    )
      throw Error("备份学习历史无效");
    if (
      w.deletedExamples !== undefined &&
      (!Array.isArray(w.deletedExamples) ||
        w.deletedExamples.some((x) => typeof x !== "string"))
    )
      throw Error("备份例句删除记录无效");
    if (
      w.pendingRound &&
      (!Number.isInteger(w.pendingRound.streak) ||
        w.pendingRound.streak < 0 ||
        w.pendingRound.streak > 1 ||
        !Number.isInteger(w.pendingRound.attempts) ||
        w.pendingRound.attempts < 1 ||
        !Number.isFinite(w.pendingRound.resumeAt) ||
        typeof w.pendingRound.id !== "string")
    )
      throw Error("备份延后轮次无效");
    return migrateWord(w);
  });
  const out = [...current];
  for (const w of current) seen.add(w.word);
  for (const w of valid)
    if (!seen.has(w.word)) {
      out.push(w);
      seen.add(w.word);
    }
  return out;
}
export function senses(text) {
  if (typeof text !== "string") return [];
  return text
    .split(/\\n|\n/)
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^([a-z. &]+\.)\s*(.*)$/i);
      return { pos: m ? m[1] : "释义", text: m ? m[2] : line };
    });
}
