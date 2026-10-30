import { learningExamples } from "./learning-examples.js";
import { supplements } from "./supplement.js";
export const EXAMPLE_TTL = 7 * 86400000;
const inflight = new Map();
const key = (en) =>
  en
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9']/g, "");
export function targetForms(word, card = {}) {
  const set = new Set([word.toLowerCase(), ...(card.validatedForms || [])]);
  if (card.isForm && card.lemma) set.add(card.lemma);
  for (const entry of (card.exchange || "").split("/")) {
    const [tag, values] = entry.split(":");
    if (["s", "3", "d", "p", "i", "0"].includes(tag))
      for (const v of (values || "").split(","))
        if (/^[a-z'-]+$/.test(v)) set.add(v);
  }
  return set;
}
export function containsTarget(sentence, word, card = {}) {
  const forms = targetForms(word, card);
  return (
    String(sentence)
      .toLowerCase()
      .match(/[a-z]+(?:['’-][a-z]+)*/g) || []
  ).some((t) => forms.has(t.replace(/’/g, "'")));
}
export function localExamples(word, card = {}) {
  const base = card.isForm ? card.lemma || card.word : word;
  const labels = {
    study: [
      ["v.", "学习"],
      ["n.", "研究"],
    ],
    book: [
      ["n.", "书"],
      ["v.", "预订"],
    ],
    run: [
      ["v.", "跑步"],
      ["v.", "经营"],
    ],
    right: [
      ["adj.", "正确的"],
      ["adv.", "向右"],
    ],
    mean: [
      ["v.", "意思是"],
      ["adj.", "刻薄的"],
    ],
  };
  return [
    ...(supplements[base]?.examples || []),
    ...(learningExamples[base] || []),
  ]
    .map((row, i) => ({
      id: `local:${base}:${i}`,
      en: row[0],
      zh: row[1],
      pos: row[2] || labels[base]?.[i]?.[0] || "",
      sense: row[3] || labels[base]?.[i]?.[1] || "",
      source: "本地学习例句（AI辅助编写，非词典原文）",
      license: "CC0-1.0",
      status: "local",
      translationStatus: "paired-local",
      manual: false,
    }))
    .filter((e) => containsTarget(e.en, word, card));
}
export function allExamples(w) {
  const map = new Map();
  for (const ex of [
    ...(Array.isArray(w.card?.examples) ? w.card.examples : []),
    ...localExamples(w.word, w.card || {}),
    ...(Array.isArray(w.examples) ? w.examples : []),
  ]) {
    const e = Array.isArray(ex)
      ? { en: ex[0], zh: ex[1], source: "旧版例句（来源未记录）" }
      : ex;
    if (typeof e.en === "string" && e.en.trim())
      map.set(key(e.en), { ...e, id: e.id || "legacy:" + key(e.en) });
  }
  return [...map.values()].filter(
    (e) => !(w.deletedExamples || []).includes(key(e.en)),
  );
}
export function needsExamples(w) {
  const es = allExamples(w);
  return !es.length || es.some((e) => !e.zh?.trim());
}
export function mergeExamples(w, incoming) {
  const existing = allExamples(w),
    map = new Map(existing.map((e) => [key(e.en), e]));
  for (const e of incoming) {
    if (
      !e.en ||
      !e.zh ||
      !containsTarget(e.en, w.word, w.card || {}) ||
      (w.deletedExamples || []).includes(key(e.en))
    )
      continue;
    const old = map.get(key(e.en));
    if (!old) map.set(key(e.en), e);
    else if (!old.manual && !old.zh?.trim())
      map.set(key(e.en), {
        ...old,
        zh: e.zh,
        translationSource: e.source,
        translationStatus: e.translationStatus,
      });
  }
  return { ...w, examples: [...map.values()] };
}
export function deleteExample(w, id) {
  const old = allExamples(w).find((e) => e.id === id);
  return {
    ...w,
    examples: allExamples(w).filter((e) => e.id !== id),
    deletedExamples: [
      ...(w.deletedExamples || []),
      ...(old ? [key(old.en)] : []),
    ],
  };
}
export function editExample(w, id, en, zh, pos = "", sense = "") {
  if (!en.trim() || !zh.trim()) throw Error("请同时填写英文例句和对应中文翻译");
  if (!containsTarget(en, w.word, w.card || {}))
    throw Error("英文例句必须包含目标词或词库明确记录的词形");
  const old = allExamples(w).find((e) => e.id === id);
  const e = {
    ...old,
    id:
      old?.id ||
      "manual:" +
        (globalThis.crypto?.randomUUID?.() || Date.now() + ":" + Math.random()),
    en: en.trim(),
    zh: zh.trim(),
    pos,
    sense,
    source: "用户手动编辑（非词典原文）",
    originalSource: old?.originalSource || old?.source,
    manual: true,
    status: "manual",
    translationStatus: "user-paired",
  };
  const deleted = new Set(w.deletedExamples || []);
  if (old && key(old.en) !== key(e.en)) deleted.add(key(old.en));
  deleted.delete(key(e.en));
  return {
    ...w,
    deletedExamples: [...deleted],
    examples: [
      ...allExamples(w).filter((x) => x.id !== id && key(x.en) !== key(e.en)),
      e,
    ],
  };
}
export function parseTatoeba(data, word, card = {}) {
  if (!Array.isArray(data?.data)) throw Error("Tatoeba响应格式不正确");
  const out = [];
  for (const s of data.data) {
    if (
      s.lang !== "eng" ||
      s.is_unapproved ||
      !s.owner ||
      !["CC BY 2.0 FR", "CC0 1.0"].includes(s.license) ||
      !containsTarget(s.text || "", word, card)
    )
      continue;
    const t = (s.translations || []).find(
      (t) =>
        t.lang === "cmn" &&
        t.is_direct === true &&
        !t.is_unapproved &&
        t.owner &&
        ["CC BY 2.0 FR", "CC0 1.0"].includes(t.license) &&
        t.text?.trim(),
    );
    if (!t) continue;
    out.push({
      id: "tatoeba:" + s.id,
      en: s.text,
      zh: t.text,
      source: "Tatoeba 社区直接配对译文",
      url: `https://tatoeba.org/en/sentences/show/${s.id}`,
      translationURL: `https://tatoeba.org/en/sentences/show/${t.id}`,
      author: s.owner,
      translationAuthor: t.owner,
      license: s.license,
      translationLicense: t.license,
      pos: "",
      sense: "语料用法，具体词义请核对",
      status: "corpus",
      translationStatus: "direct-linked",
      manual: false,
    });
  }
  return [...new Map(out.map((e) => [key(e.en), e])).values()]
    .sort((a, b) => a.en.length - b.en.length)
    .slice(0, 4);
}
export function tatoebaURL(word) {
  const u = new URL("https://api.tatoeba.org/v1/sentences");
  u.search = new URLSearchParams({
    lang: "eng",
    q: word,
    sort: "relevance",
    limit: "20",
    "trans:lang": "cmn",
    "trans:is_direct": "yes",
    is_unapproved: "no",
    is_orphan: "no",
    "trans:is_unapproved": "no",
    "trans:is_orphan": "no",
    word_count: "3-20",
  });
  return u.href;
}
export async function fetchExamples(
  w,
  { fetcher = fetch, signal, force = false, now = Date.now() } = {},
) {
  if (!w.card) throw Error("请先成功查询词典，避免为可疑拼写匹配例句");
  if (!force && w.exampleFetch?.nextRetry > now) return w;
  const cacheKey = w.word;
  const task =
    inflight.get(cacheKey) ||
    (async () => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      const timeout = setTimeout(abort, 12000);
      try {
        const r = await fetcher(tatoebaURL(w.word), {
          signal: controller.signal,
        });
        if (!r.ok)
          throw Error(
            `Tatoeba HTTP ${r.status}${r.status === 429 ? "：请求过多，请稍后重试" : ""}`,
          );
        const examples = parseTatoeba(await r.json(), w.word, w.card);
        if (!examples.length)
          throw Error("Tatoeba没有符合完整词形、许可和直接中文配对要求的例句");
        return examples;
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
      }
    })();
  inflight.set(cacheKey, task);
  try {
    const merged = mergeExamples(w, await task);
    const partial = needsExamples(merged);
    return {
      ...merged,
      exampleFetch: {
        status: partial ? "partial" : "ready",
        error: partial
          ? "已获取匹配例句，但仍有缺少翻译或已被手动删除的内容；请手动核对。"
          : null,
        at: now,
        nextRetry: now + EXAMPLE_TTL,
        source: "Tatoeba",
      },
    };
  } catch (e) {
    if (signal?.aborted) throw e;
    return {
      ...w,
      exampleFetch: {
        status: "failed",
        at: now,
        nextRetry: now + 3600000,
        error: e.name === "AbortError" ? "例句查询超时或已停止" : e.message,
        source: "Tatoeba",
      },
    };
  } finally {
    if (inflight.get(cacheKey) === task) inflight.delete(cacheKey);
  }
}
export async function fillMissing(
  getWords,
  save,
  {
    signal,
    onProgress = () => {},
    force = false,
    onlyFailed = false,
    provider = fetchExamples,
    loadDictionary,
  } = {},
) {
  const targets = getWords()
    .filter(
      (w) =>
        needsExamples(w) &&
        (!onlyFailed || ["failed", "partial"].includes(w.exampleFetch?.status)),
    )
    .map((w) => w.word);
  let done = 0,
    failed = 0;
  for (const word of targets) {
    if (signal?.aborted) break;
    let w = getWords().find((w) => w.word === word);
    if (!w || !needsExamples(w)) {
      done++;
      continue;
    }
    if (!w.card) {
      try {
        if (!loadDictionary) throw Error("请先查询词典");
        w = { ...w, card: await loadDictionary(word) };
        await save(word, w);
        if (signal?.aborted) break;
        if (!needsExamples(w)) {
          done++;
          onProgress({ done, total: targets.length, failed, word });
          continue;
        }
      } catch (e) {
        await save(word, {
          ...w,
          exampleFetch: {
            status: "failed",
            error: "词典查询失败：" + e.message,
          },
        });
        failed++;
        done++;
        onProgress({ done, total: targets.length, failed, word });
        continue;
      }
    }
    let next;
    try {
      next = await provider(w, { signal, force });
    } catch (e) {
      if (signal?.aborted) break;
      next = { ...w, exampleFetch: { status: "failed", error: e.message } };
    }
    if (signal?.aborted) break;
    // Save through the caller's serialized mutation, preserving edits made while waiting.
    await save(word, next);
    if (["failed", "partial"].includes(next.exampleFetch?.status)) failed++;
    done++;
    onProgress({ done, total: targets.length, failed, word });
    if (done < targets.length)
      await new Promise((resolve) => {
        const finish = () => {
          clearTimeout(t);
          signal?.removeEventListener("abort", finish);
          resolve();
        };
        const t = setTimeout(finish, 1100);
        signal?.addEventListener("abort", finish, { once: true });
      });
  }
  return { done, total: targets.length, failed, stopped: !!signal?.aborted };
}
