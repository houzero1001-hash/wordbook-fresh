import { assetURL } from "./paths.js";
const shards = new Map();
export async function lookup(word, seen = new Set()) {
  if (seen.has(word)) throw Error("词库原形链接循环，请核对拼写");
  seen.add(word);
  const key = word.slice(0, 2);
  if (!shards.has(key))
    shards.set(
      key,
      fetch(assetURL(`dict/${key}.json`))
        .then((r) => {
          if (r.status === 404) return {};
          if (!r.ok) throw Error("词典加载失败，请重试");
          return r.json();
        })
        .catch((e) => {
          shards.delete(key);
          throw e;
        }),
    );
  const row = (await shards.get(key))[word];
  if (!row) throw Error("词典未收录，请核对拼写；可保留并稍后重试");
  if (row.lemma && row.lemma !== word) {
    const base = await lookup(row.lemma, seen);
    return {
      ...row,
      validatedForms: (base.exchange || "")
        .split("/")
        .filter((x) => /^[s3dpi0]:/.test(x))
        .flatMap((x) => x.slice(x.indexOf(":") + 1).split(",")),
      formSource: "ECDICT explicit lemma/exchange",
    };
  }
  return row;
}
