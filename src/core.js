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
      status: "learning",
      created: now,
      lastReview: null,
      due: now,
      step: 0,
      card: null,
      error: null,
    });
  }
  return [...map.values()];
}
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
  return { ...w, status: "learning", step: 0, due: now };
}
export function dueWords(words, now = Date.now()) {
  return words.filter((w) => w.status === "learning" && w.due <= now);
}
export function mergeBackup(current, input) {
  if (
    input?.format !== "wordbook-1" ||
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
      !["known", "learning"].includes(w.status) ||
      !Number.isInteger(w.step) ||
      w.step < 0 ||
      w.step > 5 ||
      !Number.isFinite(w.created) ||
      (w.lastReview !== null && !Number.isFinite(w.lastReview)) ||
      (w.status === "learning" && !Number.isFinite(w.due))
    )
      throw Error("备份包含无效记录，未导入");
    return { ...w, card: null, error: null };
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
  return text
    .split(/\\n|\n/)
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^([a-z. &]+\.)\s*(.*)$/i);
      return { pos: m ? m[1] : "释义", text: m ? m[2] : line };
    });
}
