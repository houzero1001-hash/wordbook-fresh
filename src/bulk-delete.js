import { dueWords } from "./core.js";
import { nextRound } from "./learning.js";
export function libraryWords(
  words,
  filter = "all",
  search = "",
  now = Date.now(),
) {
  return words.filter(
    (w) =>
      (filter === "all" ||
        (filter === "due"
          ? dueWords([w], now).length > 0
          : w.status === filter)) &&
      w.word.includes(search),
  );
}
export const removeCandidates = (candidates) =>
  candidates.filter((c) => !c.selected);
export function removeSavedWords(
  words,
  selected,
  round = null,
  now = Date.now(),
) {
  const ids = new Set(selected),
    remaining = words.filter((w) => !ids.has(w.word));
  if (!round || !round.items.some((i) => ids.has(i.word)))
    return { words: remaining, round };
  const items = round.items.filter((i) => !ids.has(i.word));
  if (!items.length) return { words: remaining, round: null };
  const log = round.log.filter((word) => !ids.has(word));
  const next = {
    ...round,
    items: items.map((i) => ({
      ...i,
      lastIndex: i.lastIndex === null ? null : log.lastIndexOf(i.word),
    })),
    log,
  };
  if (ids.has(round.current))
    return nextRound(remaining, { ...next, phase: "answer" }, now);
  return { words: remaining, round: next };
}
