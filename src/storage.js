import { openDB } from "idb";
const db = openDB("wordbook-fresh-1", 1, {
  upgrade(db) {
    db.createObjectStore("state");
  },
});
export async function read() {
  return (await (await db).get("state", "words")) || [];
}
export async function write(words) {
  await (await db).put("state", words, "words");
}
