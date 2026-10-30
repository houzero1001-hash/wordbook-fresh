import { assetURL } from "./paths.js";
import "./style.css";
import {
  tokens,
  addWords,
  restart,
  dueWords,
  senses,
  statistics,
} from "./core.js";
import {
  read,
  write,
  readRound,
  saveLearning,
  readSettings,
  writeSettings,
} from "./storage.js";
import { lookup } from "./dictionary.js";
import { extract } from "./extract.js";
import { supplements } from "./supplement.js";
import {
  REVIEW_CONFIG,
  newTask,
  createRound,
  answerRound,
  nextRound,
} from "./learning.js";
import {
  allExamples,
  needsExamples,
  fetchExamples,
  fillMissing,
  mergeExamples,
  editExample,
  deleteExample,
} from "./examples.js";
import { speakEnglish } from "./speech.js";
import { receiveShare } from "./share.js";
import { makeBackup, restoreBackup } from "./backup.js";
let hydrationStop = false,
  hydrationRunning = false,
  hydrationProgress = "";
let settings = { daily: REVIEW_CONFIG.dailyDefault },
  detailWord = null,
  batchController = null,
  batchProgress = "",
  editingExample = null,
  sharedText = "",
  hasSharedReceipt = false;

const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let actionPending = false;
let words = [],
  page = "today",
  candidates = [],
  session = null,
  filter = "all",
  search = "",
  candidateLimit = 80,
  busy = false,
  cancelled = false,
  fileStatus = "",
  importError = "";
function toast(s) {
  $("#message")?.remove();
  const d = document.createElement("div");
  d.id = "message";
  d.textContent = s;
  document.body.append(d);
  setTimeout(() => d.remove(), 4500);
}
let persistence = Promise.resolve();
function mutate(fn) {
  const next = persistence.then(async () => {
    const value = fn(words);
    await write(value);
    words = value;
  });
  persistence = next.catch(() => {});
  return next;
}
async function learningMutation(fn) {
  const next = persistence.then(async () => {
    const value = fn(words, session);
    await saveLearning(value.words, value.round);
    words = value.words;
    session = value.round;
  });
  persistence = next.catch(() => {});
  return next;
}
async function commit(next) {
  await mutate(() => next);
}
async function update(word, fn) {
  await mutate((current) => current.map((w) => (w.word === word ? fn(w) : w)));
}
const btn = (text, id, cls = "") =>
  `<button type="button" class="${cls}" data-act="${id}">${text}</button>`;
function shell(content) {
  $("#app").innerHTML =
    `<header><strong>我的英语单词本</strong><span class="muted">每天一点，慢慢记住</span></header><main>${content}</main><nav>${[
      ["today", "今日复习"],
      ["collect", "收藏单词"],
      ["library", "单词本"],
    ]
      .map(([id, label]) =>
        btn(label, "nav:" + id, page === id ? "active" : ""),
      )
      .join("")}</nav>`;
}
const dateLabel = (n) =>
  Number.isFinite(n) ? new Date(n).toLocaleString("zh-CN") : "暂无";
function cardSources(examples, supplement) {
  const safeLink = (url) =>
    typeof url === "string" && url.startsWith("https://") ? esc(url) : "#";
  return `<details class="card-sources"><summary>资料来源</summary><p>词典：ECDICT 社区词库 · <a href="${assetURL("dict/LICENSE.txt")}">MIT许可</a>。</p>${supplement ? "<p>常用释义与辅助解释：项目学习整理，非权威词典原文。</p>" : ""}${examples.map((ex, i) => `<p>例句 ${i + 1}：${ex.url ? `<a href="${safeLink(ex.url)}" target="_blank" rel="noopener">${esc(ex.source || "来源")}</a>` : esc(ex.source || "来源未记录")} ${esc(ex.author || "")} ${esc(ex.license || "")}${ex.translationURL ? ` · <a href="${safeLink(ex.translationURL)}" target="_blank" rel="noopener">译文 ${esc(ex.translationAuthor || "")} ${esc(ex.translationLicense || "")}</a>` : ""}</p>`).join("")}</details>`;
}
function card(w) {
  const c = w.card;
  if (!c)
    return `<div class="card"><div class="word">${esc(w.original || w.word)}</div><p class="notice">${esc(w.error || "词典卡片尚未加载")}</p>${btn("重新查询", "retry:" + w.word)}</div>`;
  const s = supplements[c.isForm ? c.word : w.word];
  const examples = allExamples(w);
  const raw = senses(c.translation),
    common = s ? s.senses : raw.filter((x) => !x.text.startsWith("["));
  const more = s ? raw : raw.filter((x) => x.text.startsWith("["));
  return `<article class="card" data-word="${esc(w.word)}"><div class="row spread"><div class="word">${esc(w.word)}</div>${btn("▶ 发音", "speak:" + w.word)}</div><p class="muted">${esc(w.status === "known" ? "已掌握，不自动复习" : w.status === "new" ? "待学习" : "下次复习：" + dateLabel(w.due))}</p><p class="muted">/${esc(s?.ipa || c.ipa || "音标缺失")}/ · ${s ? "标准 IPA" : "词库旧式音标，待校对"} · 系统英语语音</p>${!common.length ? '<p class="notice">中文释义暂不可用，请重新查询核对。</p>' : ""}${common.map((x) => `<section><h3>${esc(Array.isArray(x) ? x[0] : x.pos)}</h3><p>${esc(Array.isArray(x) ? x[1] : x.text)}</p></section>`).join("")}${more.length ? `<details><summary>更多释义 · ECDICT 原始条目</summary>${more.map((x) => `<p>${esc(x.pos)} ${esc(x.text)}</p>`).join("")}</details>` : ""}<h3>英文辅助解释</h3>${
    (
      s?.en ||
      senses(c.definition)
        .slice(0, 2)
        .map((x) => x.text)
    )
      .map((x) => `<p>${esc(x)}</p>`)
      .join("") || '<p class="muted">暂无英文解释</p>'
  }${
    !s && senses(c.definition).length > 2
      ? `<details><summary>更多英文解释</summary>${senses(c.definition)
          .slice(2)
          .map((x) => `<p>${esc(x.text)}</p>`)
          .join("")}</details>`
      : ""
  }<h3>英文例句 · 中文对照</h3>${examples.length ? examples.map((ex, i) => `<section class="example"><div class="row spread"><p lang="en">${esc(ex.en)}${ex.manual ? '<span class="badge">手动编辑</span>' : ex.status === "local" ? '<span class="badge">AI辅助例句</span>' : ""}</p>${btn("▶ 读例句", "speak-example:" + i)}</div><p lang="zh-CN">${esc(ex.zh || "中文翻译暂不可用")}</p>${[ex.pos, ex.sense].some((value) => value && value !== "语料用法，具体词义请核对") ? `<p class="muted">${esc([ex.pos, ex.sense].filter((value) => value && value !== "语料用法，具体词义请核对").join(" · "))}</p>` : ""}${words.some((x) => x.word === w.word) ? `<div class="row">${btn("编辑", "edit-example:" + i)}${btn("删除", "delete-example:" + i)}</div>` : ""}</section>`).join("") : '<p class="muted">缺少可靠的中英例句，可尝试免费补充或手动填写。</p>'}${["failed", "partial"].includes(w.exampleFetch?.status) ? `<p class="notice">${esc(w.exampleFetch.error)}</p>` : ""}${words.some((x) => x.word === w.word) ? `<details><summary>管理与补充例句</summary><p class="muted">免费Tatoeba社区语料，直接关联译文不等于权威审校；具体词义请人工核对。不调用收费AI。</p>${btn("重新补充例句", "fill-example:" + w.word)}<form id="example-form" data-word="${esc(w.word)}"><label>英文例句<textarea id="example-en" required></textarea></label><label>对应中文翻译<textarea id="example-zh" required></textarea></label><label>词性 / 具体词义<input id="example-sense" placeholder="如 v. 学习"></label><button class="primary" type="submit">保存手动例句</button></form></details>` : ""}<h3>常用搭配</h3>${s ? s.phrases.map(([en, zh]) => `<p>${esc(en)} — ${esc(zh)}</p>`).join("") : '<p class="muted">暂无可靠搭配资料</p>'}${c.lemma ? `<p class="notice">词库关联原形：<b>${esc(c.lemma)}</b>。${btn("查看原形释义", "lemma:" + c.lemma)}原收藏词形 ${esc(w.word)} 保留为独立记录；不会自动合并。${c.isForm ? "本卡展示原形释义。" : ""}</p>` : ""}<p><a href="https://dictionary.cambridge.org/dictionary/english-chinese-simplified/${encodeURIComponent(w.word)}" target="_blank" rel="noopener noreferrer">在剑桥英汉词典核对释义与例句 ↗</a></p><h3>词形变化</h3><p>${esc(
    (c.exchange || "")
      .split("/")
      .filter(Boolean)
      .map((x) => {
        const [k, v] = x.split(":");
        return (
          ({
            s: "复数",
            3: "第三人称",
            d: "过去分词",
            p: "过去式",
            i: "现在分词",
            0: "原形",
            r: "比较级",
            t: "最高级",
          }[k] || k) +
          "：" +
          v
        );
      })
      .join(" · ") || "暂无词形资料",
  )}</p>${cardSources(examples, s)}</article>`;
}
function render() {
  if (page === "today") {
    if (session && !session.finished) {
      const w = words.find((x) => x.word === session.current);
      if (!w) {
        session = null;
        render();
        return;
      }
      const answered = session.phase === "answer";
      shell(
        `<p class="muted">${session.mode === "learn" ? "新词学习" : "到期复习"} · 本轮 ${session.items.filter((i) => i.done).length} / ${session.items.length}</p>${answered ? card(w) : `<div class="card"><p>先独立判断，再核对释义</p><div class="word">${esc(w.word)}</div>${btn("▶ 发音", "speak:" + w.word)}<div class="answers">${btn("不认识", "judge:no")}${btn("认识", "judge:yes", "primary")}${btn("不再出现", "judge:master")}</div></div>`}${answered ? `${btn("下一个", "next", "primary full")}` : ""}${btn("暂时退出（保留进度）", "leave")}`,
      );
    } else if (session) {
      const passed = session.items.filter((i) => i.result === "passed").length,
        known = session.items.filter((i) => i.result === "mastered").length;
      shell(
        `<h1>本轮完成</h1><div class="hero"><p>本轮通过 ${passed} 个 · 已掌握 ${known} 个</p><p>延后继续 ${session.items.length - passed - known} 个</p><small>词数不足以穿插时延后判断；未通过不会无限重复。只有“不再出现”会永久退出。</small></div>${btn("返回首页", "finish", "primary")}`,
      );
    } else {
      const stats = statistics(words),
        task = newTask(words, settings.daily);
      shell(
        `<section class="dashboard"><h1>每天记住一点</h1><div class="stats" aria-label="单词统计">${[
          ["all", "总单词", stats.total],
          ["due", "待复习", stats.due],
          ["known", "已掌握", stats.known],
        ]
          .map(
            ([id, label, n]) =>
              `<button data-act="list:${id}"><strong data-stat="${id}">${n}</strong><span>${label}</span></button>`,
          )
          .join(
            "",
          )}</div><div class="quick-links">${btn("开始学习", "start:learn", "primary")}${btn("去复习", "start:review")}</div><p class="muted">待学习 ${words.filter((w) => w.status === "new").length} 个 · 今日可学 ${task.length} 个${stats.due ? "" : " · 当前没有到期复习，休息一下吧。"}</p><label>每日新词 <select id="daily">${REVIEW_CONFIG.dailyOptions.map((n) => `<option value="${n}" ${settings.daily === n ? "selected" : ""}>${n} 个</option>`).join("")}</select></label><div class="quick-links">${btn("＋ 收藏单词", "nav:collect")}${btn("查看单词本", "list:all")}</div></section><details><summary>备份、安装与使用帮助</summary>${help()}</details>`,
      );
    }
  } else if (page === "collect") {
    shell(
      `<h1>收藏遇见的生词</h1><p class="muted">输入、拍照或导入文件，检查后再收藏。</p>${hasSharedReceipt ? `<p class="notice">收到分享，请检查候选后确认，不会自动入库。</p>` : ""}<textarea id="input" placeholder="输入一个或多个英文单词，用空格或换行分隔">${esc(sharedText)}</textarea><div class="row">${btn("检查单词", "parse", "primary")}<label class="file">照片 / 截图<input id="image" type="file" accept="image/*" hidden></label><label class="file">拍照<input id="camera" type="file" accept="image/*" capture="environment" hidden></label><label class="file">上传文件<input id="document" type="file" accept=".pdf,.docx,.txt,.md,.rtf,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,application/rtf,application/msword" hidden></label></div><p class="muted file-hint">PDF、DOCX、TXT、Markdown、RTF · 最大30MB。旧DOC仅支持RTF内容；二进制DOC请另存为DOCX。</p><p id="progress" role="status">${esc(fileStatus)}</p>${importError ? `<p class="notice" role="alert">${esc(importError)}</p>` : ""}${busy ? btn("停止处理，保留已提取候选", "cancel") : ""}<div id="candidates">${candidateHTML()}</div><details><summary>从其他App收藏（可选）</summary><p>也可以直接复制粘贴或截图OCR。</p><a href="${assetURL("iphone-guide.html")}" target="_blank" rel="noopener">查看iPhone快捷指令教程</a></details>`,
    );
  } else {
    const list = words.filter(
      (w) =>
        (filter === "all" ||
          (filter === "due"
            ? dueWords([w]).length > 0
            : w.status === filter)) &&
        w.word.includes(search),
    );
    shell(
      `${session ? btn("继续未完成的轮次", "nav:today", "primary") : ""}<div class="row spread"><h1>我的单词本</h1>${btn("备份与帮助", "help")}</div><details><summary>补充缺失例句</summary><p>只补缺少例句/翻译的词，不覆盖手动内容。免费语料需联网。</p>${btn("开始补充", "fill-missing")}${btn("失败重试", "retry-missing")}${btn("停止", "stop-examples")}<p id="batch-progress" role="status">${esc(batchProgress)}</p></details>${hydrationRunning ? `<p id="hydrate-progress" role="status">${esc(hydrationProgress)}</p>${btn("暂停词典补全", "stop-hydration")}` : ""}<input id="search" class="search" value="${esc(search)}" placeholder="搜索收藏的单词"><p><select id="filter"><option value="all">全部单词</option><option value="new" ${filter === "new" ? "selected" : ""}>待学习</option><option value="due" ${filter === "due" ? "selected" : ""}>到期待复习</option><option value="learning" ${filter === "learning" ? "selected" : ""}>学习中</option><option value="known" ${filter === "known" ? "selected" : ""}>已掌握</option></select> 共 ${list.length} 个</p>${
        list
          .slice(0, 300)
          .map(
            (w) =>
              `<button class="listword" data-act="open:${w.word}"><span>${esc(w.word)}</span><small>${w.status === "known" ? "已掌握" : w.status === "new" ? "待学习" : "学习中"} →</small></button>`,
          )
          .join("") ||
        `<p class="muted">${words.length ? "当前分类或搜索没有匹配单词，可切换分类。" : "还没有单词，去收藏第一个吧。"}</p>`
      }${list.length > 300 ? "<p>仅展示前300项，请搜索缩小范围。</p>" : ""}`,
    );
  }
}
function candidateHTML() {
  return candidates.length
    ? `<h2>检查候选词 <small>${candidates.length} 个</small></h2><p class="muted">已掌握的词默认不勾选；重复收藏不改变学习状态。</p>${btn("全选新词", "select-new")} ${btn("全部取消", "select-none")} ${candidates
        .slice(0, candidateLimit)
        .map(
          (c, i) =>
            `<div class="candidate"><input aria-label="选择 ${esc(c.word)}" type="checkbox" data-check="${i}" ${c.selected ? "checked" : ""}><input aria-label="修改候选单词" type="text" data-edit="${i}" value="${esc(c.word)}"><small>${words.find((w) => w.word === c.word)?.status === "known" ? "已掌握" : ""}</small><button aria-label="删除候选" data-act="remove:${i}">×</button></div>`,
        )
        .join(
          "",
        )}${candidates.length > candidateLimit ? btn("显示更多候选（还有 " + (candidates.length - candidateLimit) + " 个）", "more-candidates") : ""}${btn("收藏选中的单词", "save", "primary full")}`
    : "";
}
function help() {
  return `<div class="panel"><h3>数据只保存在这台设备</h3><p>清除网站数据、更换手机、删除主屏幕应用可能造成数据丢失。请定期导出备份。不同域名的数据不互通。</p><div class="row">${btn("导出 JSON", "export")}<label class="file">恢复 JSON<input type="file" id="backup" accept="application/json,.json" hidden></label>${btn("清空数据", "clear", "danger")}</div><h3>添加到 iPhone 主屏幕</h3><p>在 Safari 打开正式 HTTPS 地址 → 分享 → 添加到主屏幕。已打开过的卡片可离线查看；OCR 首次需要联网从本站加载模型，系统发音取决于设备语音。</p><h3>学习和复习</h3><p>新词先进入待学习；认识后核对答案，当前轮次连续两次认识才退出本轮，仍安排复习。“不再出现”才进入已掌握。临时间隔为${REVIEW_CONFIG.intervalDays.join("、")}天，未通过${REVIEW_CONFIG.failureMinutes}分钟后继续；每词每轮最多${REVIEW_CONFIG.maxAttempts}次，至少穿插${REVIEW_CONFIG.minInterveningWords}个不同词。自动永久掌握关闭，参数待确认。</p><p><a href="https://github.com/skywind3000/ECDICT" target="_blank" rel="noopener">ECDICT 词典来源</a> · <a href="${assetURL("dict/LICENSE.txt")}">MIT 授权</a>。免费社区词库不是付费权威词典，部分释义古旧、次序不理想、IPA为旧式记法。已有本地学习例句明确标记AI辅助编写，缺失时尝试免费Tatoeba直接配对译文；社区语料具体词义需核对，缺失或失败会明确提示。</p><p>OCR：Tesseract.js（Apache-2.0）；PDF：Mozilla PDF.js（Apache-2.0）。文件在浏览器处理，最大30MB；DOCX/TXT/MD/RTF在后台线程解析，PDF逐页处理，可停止。二进制DOC请先另存为DOCX。OCR模型随本站部署，首次需联网加载；设备内存不足、离线缓存不全时可能失败。</p></div>`;
}
async function loadCard(word) {
  try {
    const c = await lookup(word);
    await update(word, (w) => ({ ...w, card: c, error: null }));
    const current = words.find((w) => w.word === word);
    if (current && needsExamples(current)) {
      const supplemented = await fetchExamples(current);
      await update(word, (w) => ({
        ...mergeExamples(w, supplemented.examples || []),
        exampleFetch: supplemented.exampleFetch,
      }));
    }
  } catch (e) {
    await update(word, (w) => ({ ...w, error: e.message }));
  }
}
function prepare(text) {
  candidateLimit = 80;
  candidates = tokens(text).map((word) => ({
    word,
    selected: words.find((w) => w.word === word)?.status !== "known",
  }));
}
document.addEventListener("input", (e) => {
  if (e.target.dataset.edit !== undefined)
    candidates[+e.target.dataset.edit].word = e.target.value;
  if (e.target.id === "search") {
    search = e.target.value;
    const pos = e.target.selectionStart;
    render();
    $("#search").focus();
    $("#search").setSelectionRange(pos, pos);
  }
});
document.addEventListener("change", async (e) => {
  try {
    if (e.target.dataset.check !== undefined)
      candidates[+e.target.dataset.check].selected = e.target.checked;
    if (e.target.id === "daily") {
      settings = { ...settings, daily: Number(e.target.value) };
      await writeSettings(settings);
      render();
    }
    if (e.target.id === "filter") {
      filter = e.target.value;
      render();
    }
    if (e.target.id === "backup") {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 50 * 1024 * 1024) throw Error("备份文件过大");
      const input = JSON.parse(await f.text());
      await learningMutation((current) =>
        restoreBackup(current, input, session),
      );
      render();
      toast("恢复成功，重复词保留现有学习状态");
    }
    if (["image", "camera", "document"].includes(e.target.id)) {
      const f = e.target.files[0];
      if (!f || busy) return;
      busy = true;
      ((cancelled = false), (fileStatus = ""), (importError = ""));
      const seen = new Set(candidates.map((c) => c.word));
      render();
      try {
        await extract(
          f,
          (s) => {
            fileStatus = s;
            $("#progress") && ($("#progress").textContent = s);
          },
          () => cancelled,
          (t) => {
            for (const word of tokens(t)) {
              if (!seen.has(word)) {
                seen.add(word);
                candidates.push({
                  word,
                  selected:
                    words.find((w) => w.word === word)?.status !== "known",
                });
              }
            }
            if ($("#candidates")) $("#candidates").innerHTML = candidateHTML();
          },
        );
        fileStatus = cancelled
          ? "已停止，候选结果已保留"
          : "提取完成，请核对候选词（最多3000个）";
        toast(fileStatus);
      } catch (err) {
        importError = "处理失败：" + err.message + "。已提取候选仍保留。";
        fileStatus = "";
        toast(importError);
      } finally {
        busy = false;
        render();
      }
    }
  } catch (err) {
    toast(err.message);
  }
});
document.addEventListener("click", async (e) => {
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (!act) return;
  const [action, arg] = act.split(":");
  const guarded = [
    "judge",
    "next",
    "start",
    "finish",
    "save",
    "delete",
    "clear",
    "restart",
  ].includes(action);
  if (guarded && actionPending) return;
  if (guarded) actionPending = true;
  try {
    if (action === "nav") {
      if (actionPending) {
        toast("正在保存，请稍候");
        return;
      }
      detailWord = null;
      if (busy) {
        toast("请先停止文件处理");
        return;
      }
      page = arg;
      render();
    }
    if (action === "parse") {
      const typed = $("#input").value;
      sharedText = typed;
      hasSharedReceipt = false;
      prepare(typed);
      if (!candidates.length)
        toast("没有可收藏的英文文字；网址不会作为单词导入。");
      render();
    }
    if (action === "remove") {
      candidates.splice(+arg, 1);
      render();
    }
    if (action === "select-new" || action === "select-none") {
      candidates.forEach(
        (c) =>
          (c.selected =
            action === "select-new" && !words.some((w) => w.word === c.word)),
      );
      render();
    }
    if (action === "more-candidates") {
      candidateLimit += 80;
      render();
    }
    if (action === "cancel") {
      cancelled = true;
      toast("将在当前页面处理后停止");
    }
    if (action === "save") {
      if (busy) throw Error("请等待文件处理完成或先停止处理");
      const selected = candidates
        .filter((c) => c.selected)
        .map((c) => c.word.trim().toLowerCase());
      if (selected.some((w) => !/^[a-z]+(?:['-][a-z]+)*$/.test(w)))
        throw Error("请核对拼写，每行仅填写一个英文单词");
      const before = words.length;
      await commit(addWords(words, selected));
      toast(`已收藏 ${words.length - before} 个新词；重复词保留原状态`);
      candidates = [];
      sharedText = "";
      hasSharedReceipt = false;
      page = "library";
      filter = "all";
      search = "";
      render();
      hydrateWords([...new Set(selected)]).catch((err) =>
        toast("后台补全未完成：" + err.message),
      );
    }
    if (action === "list") {
      filter = arg;
      search = "";
      page = "library";
      detailWord = null;
      render();
    }
    if (action === "start") {
      if (session) {
        page = "today";
        render();
        return;
      }
      const selected =
        arg === "learn" ? newTask(words, settings.daily) : dueWords(words);
      if (!selected.length) {
        toast(
          arg === "learn"
            ? "今日新词任务已完成，或暂无待学习单词"
            : "当前没有到期复习",
        );
        return;
      }
      await learningMutation((current) => {
        const round = createRound(
          selected,
          arg === "learn" ? "learn" : "review",
        );
        const ids = new Set(selected.map((w) => w.word));
        return {
          words: current.map((w) =>
            ids.has(w.word)
              ? {
                  ...w,
                  roundStreak:
                    round.items.find((i) => i.word === w.word)?.streak || 0,
                  roundId:
                    round.items.find((i) => i.word === w.word)?.wordRoundId ||
                    round.id,
                }
              : w,
          ),
          round,
        };
      });
      page = "today";
      render();
    }
    if (action === "judge") {
      await learningMutation((current, round) => {
        const judged = answerRound(current, round, arg);
        return arg === "master"
          ? nextRound(judged.words, judged.round)
          : judged;
      });
      render();
      if (arg === "master") return;
      if (!words.find((w) => w.word === session.current)?.card)
        await loadCard(session.current);
      if (page === "today") render();
    }
    if (action === "next") {
      await learningMutation((current, round) => nextRound(current, round));
      render();
    }
    if (action === "leave") {
      page = "library";
      render();
      toast("进度已保留，返回首页继续");
    }
    if (action === "finish") {
      await learningMutation((current) => ({ words: current, round: null }));
      page = "today";
      render();
    }
    if (action === "open") {
      detailWord = arg;
      editingExample = null;
      if (!words.find((w) => w.word === arg).card) await loadCard(arg);
      const w = words.find((w) => w.word === arg);
      shell(
        `${btn("← 返回单词本", "nav:library")}${card(w)}<div class="row">${w.status === "known" ? btn("重新学习", "restart:" + arg) : '<span class="muted">学习中</span>'}${btn("删除单词", "delete:" + arg, "danger")}</div>`,
      );
    }
    if (action === "retry") {
      await loadCard(arg);
      toast(words.find((w) => w.word === arg)?.error || "查询成功");
      if (session) render();
      if (!session) {
        const w = words.find((w) => w.word === arg);
        shell(
          `${btn("← 返回", "nav:library")}${card(w)}${w.status === "known" ? btn("重新学习", "restart:" + arg) : ""}${btn("删除单词", "delete:" + arg, "danger")}`,
        );
      }
    }
    if (action === "lemma") {
      const c = await lookup(arg);
      shell(
        `${btn("← 返回单词本", "nav:library")}${card({ word: arg, original: arg, card: c })}<p class="muted">仅查看原形，不改变收藏记录。</p>`,
      );
    }
    if (action === "speak") speakEnglish(arg, { onError: toast });
    if (["speak-example", "edit-example", "delete-example"].includes(action)) {
      const word = e.target.closest("[data-word]")?.dataset.word;
      const w = words.find((w) => w.word === word),
        example = allExamples(w || { word, card: {} })[Number(arg)];
      if (!example) throw Error("例句不可用");
      if (action === "speak-example")
        speakEnglish(example.en, { onError: toast });
      if (action === "edit-example") {
        editingExample = example.id;
        const form = e.target.closest("article").querySelector("form");
        form.closest("details").open = true;
        form.querySelector("#example-en").value = example.en;
        form.querySelector("#example-zh").value = example.zh || "";
        form.querySelector("#example-sense").value = [
          example.pos,
          example.sense,
        ]
          .filter(Boolean)
          .join(" · ");
        form.scrollIntoView({ block: "center" });
      }
      if (action === "delete-example") {
        await update(word, (w) => deleteExample(w, example.id));
        showCurrent();
      }
    }
    if (action === "fill-example") {
      const w = words.find((w) => w.word === arg);
      if (!w?.card) throw Error("请先查询词典");
      toast("正在查询免费语料…");
      const filled = await fetchExamples(w, { force: true });
      await update(arg, (current) => ({
        ...mergeExamples(current, filled.examples || []),
        exampleFetch: filled.exampleFetch,
      }));
      toast(filled.exampleFetch?.error || "例句补充完成，请核对具体词义");
      showCurrent();
    }
    if (action === "stop-hydration") {
      hydrationStop = true;
      toast("当前查询结束后暂停，已收藏数据保留");
    }
    if (action === "stop-examples") batchController?.abort();
    if (action === "fill-missing" || action === "retry-missing") {
      if (batchController) throw Error("已有补充任务正在进行");
      batchController = new AbortController();
      try {
        const result = await fillMissing(
          () => words,
          (word, next) =>
            update(word, (w) => ({
              ...mergeExamples(
                { ...w, card: w.card || next.card },
                next.examples || [],
              ),
              exampleFetch: next.exampleFetch,
            })),
          {
            signal: batchController.signal,
            loadDictionary: lookup,
            force: action === "retry-missing",
            onlyFailed: action === "retry-missing",
            onProgress: (p) => {
              batchProgress = `已处理 ${p.done}/${p.total}，失败 ${p.failed} · ${p.word}`;
              if ($("#batch-progress"))
                $("#batch-progress").textContent = batchProgress;
            },
          },
        );
        batchProgress = `${result.stopped ? "已停止" : "完成"}：${result.done}/${result.total}，失败 ${result.failed}`;
        toast(batchProgress);
      } finally {
        batchController = null;
        if ($("#batch-progress"))
          $("#batch-progress").textContent = batchProgress;
      }
    }
    if (action === "restart") {
      await learningMutation((current) => ({
        words: current.map((w) => (w.word === arg ? restart(w) : w)),
        round: null,
      }));
      page = "library";
      render();
      filter = "new";
      render();
      toast("已重新加入待学习，历史保留");
    }
    if (action === "delete" && confirm(`删除 ${arg}？此操作无法撤销。`)) {
      await learningMutation((current) => ({
        words: current.filter((w) => w.word !== arg),
        round: null,
      }));
      page = "library";
      render();
    }
    if (
      action === "clear" &&
      confirm("确定清空所有单词和学习状态？请先导出备份。")
    ) {
      await learningMutation(() => ({ words: [], round: null }));
      render();
      toast("数据已清空");
    }
    if (action === "help") shell(`${btn("← 返回", "nav:library")}${help()}`);
    if (action === "export") {
      const blob = new Blob(
        [JSON.stringify(makeBackup(words, session), null, 2)],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `wordbook-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (err) {
    toast("操作未完成：" + err.message);
  } finally {
    if (guarded) actionPending = false;
  }
});

async function init() {
  try {
    words = await read();
    settings = await readSettings();
    if (!REVIEW_CONFIG.dailyOptions.includes(settings.daily))
      settings.daily = REVIEW_CONFIG.dailyDefault;
    session = await readRound();
    if (
      session &&
      !session.items?.every((i) => words.some((w) => w.word === i.word))
    )
      session = null;
    const receipt = receiveShare(location.href);
    if (receipt) {
      page = "collect";
      sharedText = receipt.text;
      hasSharedReceipt = true;
      prepare(sharedText);
      history.replaceState(null, "", location.pathname);
      if (receipt.error) toast(receipt.error);
    }
    render();
    navigator.storage?.persist?.().catch(() => {});
    if (import.meta.env.PROD && "serviceWorker" in navigator)
      navigator.serviceWorker
        .register(assetURL("sw.js"), { scope: assetURL() })
        .catch(() => {});
    window.speechSynthesis?.getVoices();
  } catch (e) {
    shell(
      "<h1>无法打开本地存储</h1><p>请退出无痕浏览并检查Safari存储设置。现有数据未清空。</p>",
    );
  }
}
init();

function showCurrent() {
  if (page === "today") {
    render();
    return;
  }
  if (detailWord) {
    const w = words.find((w) => w.word === detailWord);
    if (w) {
      shell(
        `${btn("← 返回单词本", "nav:library")}${card(w)}${w.status === "known" ? btn("重新学习", "restart:" + w.word) : ""}${btn("删除单词", "delete:" + w.word, "danger")}`,
      );
      return;
    }
  }
  render();
}
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "example-form") return;
  e.preventDefault();
  try {
    const form = e.target,
      word = form.dataset.word;
    await update(word, (w) =>
      editExample(
        w,
        editingExample,
        form.querySelector("#example-en").value,
        form.querySelector("#example-zh").value,
        "",
        form.querySelector("#example-sense").value,
      ),
    );
    editingExample = null;
    showCurrent();
    toast("手动例句已保存");
  } catch (err) {
    toast(err.message);
  }
});
window.addEventListener("hashchange", () => {
  const receipt = receiveShare(location.href);
  if (!receipt) return;
  page = "collect";
  sharedText = receipt.text;
  hasSharedReceipt = true;
  prepare(sharedText);
  history.replaceState(null, "", location.pathname);
  render();
  if (receipt.error) toast(receipt.error);
});

async function hydrateWords(selected) {
  if (hydrationRunning) {
    toast("已有补全任务；未加载的词可在详情或批量补充中继续查询");
    return;
  }
  hydrationRunning = true;
  hydrationStop = false;
  let done = 0;
  try {
    for (const word of selected) {
      if (hydrationStop) break;
      if (!words.find((w) => w.word === word)?.card) await loadCard(word);
      hydrationProgress = `词典补全 ${++done}/${selected.length}`;
      if (page === "library" && !detailWord) render();
      if (done < selected.length) await new Promise((r) => setTimeout(r, 1100));
    }
  } finally {
    hydrationRunning = false;
    if (page === "library" && !detailWord) render();
  }
}
