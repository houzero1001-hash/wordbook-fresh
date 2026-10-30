import { openDB } from "idb";
import { migrateWords, REVIEW_CONFIG } from "./learning.js";
const db = openDB("wordbook-fresh-1", 1, {
  upgrade(db) {
    db.createObjectStore("state");
  },
});
export async function read() {
  return migrateWords((await (await db).get("state", "words")) || []);
}
export async function readRound() {
  return (await (await db).get("state", "round")) || null;
}
export async function write(words) {
  await (await db).put("state", words, "words");
}
export async function saveLearning(words, round) {
  const tx = (await db).transaction("state", "readwrite");
  await tx.store.put(words, "words");
  await tx.store.put(round, "round");
  await tx.done;
}
export async function readSettings() {
  return (
    (await (await db).get("state", "settings")) || {
      daily: REVIEW_CONFIG.dailyDefault,
    }
  );
}
export async function writeSettings(settings) {
  await (await db).put("state", settings, "settings");
}
