import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  containsTarget,
  allExamples,
  needsExamples,
  fetchExamples,
  mergeExamples,
  editExample,
  deleteExample,
  parseTatoeba,
  fillMissing,
} from "../src/examples.js";
import { speakEnglish } from "../src/speech.js";
const card = (word) =>
  JSON.parse(
    readFileSync(
      new URL("../public/dict/" + word.slice(0, 2) + ".json", import.meta.url),
    ),
  )[word];
for (const [word, en, expected] of [
  ["covenant", "The coven met.", false],
  ["coven", "A covenant was signed.", false],
  ["study", "She studies English.", true],
  ["studies", "She studies English.", true],
  ["run", "She is running.", true],
  ["running", "She is running.", true],
  ["book", "We are booking a room.", true],
  ["booking", "I read a book.", true],
  ["right", "It is bright.", false],
  ["frief", "My friend came.", false],
])
  test("完整词形 " + word + " / " + en, () =>
    assert.equal(containsTarget(en, word, card(word)), expected),
  );
const pair = (id = 1) => ({
  id,
  text: "We learn English at school.",
  lang: "eng",
  owner: "author",
  license: "CC BY 2.0 FR",
  is_unapproved: false,
  translations: [
    {
      id: 2,
      text: "我们在学校学习英语。",
      lang: "cmn",
      is_direct: true,
      owner: "translator",
      license: "CC BY 2.0 FR",
      is_unapproved: false,
    },
  ],
});
test("只接收官方直接配对中文翻译，记录两个作者与许可", () => {
  const e = parseTatoeba({ data: [pair()] }, "learn")[0];
  assert.equal(e.zh, "我们在学校学习英语。");
  assert.equal(e.translationAuthor, "translator");
  assert.ok(e.translationURL);
  for (const patch of [
    { is_direct: false },
    { lang: "fra" },
    { license: "PROBLEM" },
    { is_unapproved: true },
  ]) {
    const p = pair();
    p.translations[0] = { ...p.translations[0], ...patch };
    assert.equal(parseTatoeba({ data: [p] }, "learn").length, 0);
  }
});
test("不因中文字符就认定翻译：无关联译文不接收", () => {
  const p = pair();
  p.translations = [{ text: "随便中文" }];
  assert.equal(parseTatoeba({ data: [p] }, "learn").length, 0);
});
test("重复例句不添加，手动内容不覆盖，缺少翻译才补", () => {
  let w = {
    word: "learn",
    card: card("learn"),
    examples: [
      {
        id: "user",
        en: "We learn English at school.",
        zh: "我的人工译文",
        manual: true,
      },
    ],
  };
  let merged = mergeExamples(
    w,
    parseTatoeba({ data: [pair(), pair()] }, "learn"),
  );
  assert.equal(
    allExamples(merged).filter((x) => x.en === w.examples[0].en).length,
    1,
  );
  assert.equal(
    allExamples(merged).find((x) => x.id === "user").zh,
    "我的人工译文",
  );
  w = {
    word: "xyz",
    card: {},
    examples: [{ en: "We xyz at school.", zh: "" }],
  };
  merged = mergeExamples(w, [
    { en: "We xyz at school.", zh: "人工配对翻译", source: "test" },
  ]);
  assert.equal(allExamples(merged)[0].zh, "人工配对翻译");
});
test("编辑、删除持久字段及删除墓碑避免再次补回", () => {
  let w = { word: "study", card: card("study") };
  const e = allExamples(w)[0];
  w = editExample(w, e.id, e.en, "我修改的中文");
  assert.equal(allExamples(w).find((x) => x.id === e.id).manual, true);
  w = deleteExample(w, e.id);
  assert.ok(!allExamples(w).some((x) => x.id === e.id));
  w = mergeExamples(w, [e]);
  assert.ok(!allExamples(w).some((x) => x.en === e.en));
  assert.throws(() => editExample(w, null, "The coven met.", "中文"));
});
test("网络失败可见并缓存失败原因，强制重试真正联网", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    throw Error("offline");
  };
  const w = { word: "xyz", card: {} };
  let a = await fetchExamples(w, { fetcher, now: 100 });
  assert.equal(a.exampleFetch.status, "failed");
  assert.match(a.exampleFetch.error, /offline/);
  await fetchExamples(a, { fetcher, now: 200 });
  assert.equal(calls, 1);
  await fetchExamples(a, { fetcher, force: true, now: 200 });
  assert.equal(calls, 2);
});
test("成功缓存及并发去重", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return { ok: true, json: async () => ({ data: [pair()] }) };
  };
  const w = { word: "learn", card: card("learn") };
  const [a, b] = await Promise.all([
    fetchExamples(w, { fetcher, now: 100 }),
    fetchExamples(w, { fetcher, now: 100 }),
  ]);
  assert.equal(calls, 1);
  assert.equal(a.exampleFetch.status, "ready");
  assert.equal(b.exampleFetch.status, "ready");
  await fetchExamples(a, { fetcher, now: 200 });
  assert.equal(calls, 1);
});
test("疑似词必须词典先验证，空响应和限流明确失败", async () => {
  await assert.rejects(() => fetchExamples({ word: "frief" }), /词典/);
  for (const response of [
    { ok: false, status: 429 },
    { ok: true, json: async () => ({ data: [] }) },
  ]) {
    const a = await fetchExamples(
      { word: "xyz", card: {} },
      { fetcher: async () => response, force: true },
    );
    assert.equal(a.exampleFetch.status, "failed");
  }
});
test("批量只补缺失，保护手动并支持中止、进度", async () => {
  const controller = new AbortController();
  let words = [
      { word: "xyz", card: {} },
      { word: "study", card: card("study") },
    ],
    calls = 0,
    progress = [];
  const result = await fillMissing(
    () => words,
    async (word, next) => {
      words = words.map((w) => (w.word === word ? next : w));
      controller.abort();
    },
    {
      signal: controller.signal,
      provider: async (w) => {
        calls++;
        return {
          ...w,
          examples: [{ en: "We xyz.", zh: "中文", source: "test" }],
        };
      },
      onProgress: (p) => progress.push(p),
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.stopped, true);
  assert.equal(progress[0].total, 1);
});
test("例句朗读完整英文，复用英语语音，错误可提示", () => {
  let spoken;
  class U {
    constructor(text) {
      this.text = text;
    }
  }
  const synth = {
    getVoices: () => [{ lang: "en-US", localService: true }],
    cancel() {},
    speak(u) {
      spoken = u;
    },
  };
  let err;
  const u = speakEnglish("We learn English at school.", {
    synth,
    Utterance: U,
    onError: (e) => (err = e),
  });
  assert.equal(spoken.text, "We learn English at school.");
  u.onerror({ error: "failed" });
  assert.ok(err);
  assert.throws(
    () =>
      speakEnglish("hello", { synth: { getVoices: () => [] }, Utterance: U }),
    /英语语音/,
  );
});

test("原形明确词形表可识别running对应ran，不做任意后缀猜测", () => {
  assert.equal(
    containsTarget("She ran home.", "running", {
      ...card("running"),
      validatedForms: ["run", "ran", "running"],
    }),
    true,
  );
});
test("批量失败重试只选此前失败的缺失词", async () => {
  let calls = [];
  const result = await fillMissing(
    () => [
      { word: "xyz", card: {}, exampleFetch: { status: "failed" } },
      { word: "abc", card: {} },
    ],
    async () => {},
    {
      onlyFailed: true,
      provider: async (w) => {
        calls.push(w.word);
        return { ...w, exampleFetch: { status: "failed" } };
      },
    },
  );
  assert.deepEqual(calls, ["xyz"]);
  assert.equal(result.total, 1);
});
test("改写英文例句后原始本地句不复活，不出现重复ID", () => {
  let w = { word: "study", card: card("study") };
  const old = allExamples(w)[0];
  w = editExample(
    w,
    old.id,
    "I study English after work.",
    "我下班后学习英语。",
  );
  const examples = allExamples(w);
  assert.ok(!examples.some((e) => e.en === old.en));
  assert.equal(examples.filter((e) => e.id === old.id).length, 1);
  w = mergeExamples(w, [old]);
  assert.ok(!allExamples(w).some((e) => e.en === old.en));
});
