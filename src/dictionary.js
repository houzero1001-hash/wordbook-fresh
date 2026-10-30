import { assetURL } from "./paths.js";
const shards = new Map();
export async function lookup(word) {
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
  return row;
}
