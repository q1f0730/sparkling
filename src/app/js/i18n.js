function trZh(s){
  if (s == null) return s;
  const raw = String(s);
  const key = raw.trim();
  if (!key) return raw;
  let out = Object.prototype.hasOwnProperty.call(ZH, key) ? ZH[key] : null; // "constructor"/"toString" are not UI strings
  if (out == null) {
    for (let i = 0; i < ZH_PATTERNS.length; i++) {
      const m = key.match(ZH_PATTERNS[i][0]);
      if (m) { out = ZH_PATTERNS[i][1].apply(null, m); break; }
    }
  }
  if (out == null && key.indexOf(" · ") > 0) {
    const segs = key.split(" · ");
    const tr = segs.map(function(x){ return trZh(x); });
    if (tr.some(function(x, i){ return x !== segs[i]; })) out = tr.join(" · ");
  }
  if (out == null) return raw;
  return raw.replace(key, out);
}
/* plan presets: quick-start chip labels (this file loads after i18n.zh.js, so ZH already exists) */
Object.assign(ZH, {
  "I want to watch a film": "\u6211\u60f3\u770b\u4e00\u90e8\u7535\u5f71",
  "Saturday afternoon in Greenpoint, $40": "\u5468\u516d\u4e0b\u5348\uff0cGreenpoint\uff0c$40",
  "Plan for two · try with a sample friend": "两个人一起规划 · 用示例朋友试试",
});
function fixCase(x){ return String(x).replace(/\b([A-Z][a-z]{2,})([A-Z])([a-z]+)\b/g, function(_, a, b, c){ return a + b.toLowerCase() + c; }); }
function reasonZh(r){
  if (r) r = fixCase(r);
  if (LANG !== "zh" || !r) return r;
  var TY = {show:"剧集", film:"电影", music:"音乐", book:"书", place:"地点", tv:"剧集", artist:"艺人"};
  var MW = {films:"部电影", shows:"部剧", artists:"位艺人", books:"本书", places:"个地方", things:"样东西"};
  return String(r).replace(/"([^"]+)" is a ([a-z]+)(?: and a ([a-z]+))?\./g, function(_, m, a, b){ return "“" + m + "”既是" + (TY[a]||a) + (b ? "也是" + (TY[b]||b) : "") + "。"; })
    .replace(/(\d+) (films|shows|artists|books|places|things) are called ([^.]+)\./g, function(_, n, w, nm){ return "有 " + n + " " + (MW[w]||"样东西") + "都叫 " + nm + "。"; })
    .replace(/"([^"]+)" could be a few things\./g, "“$1”可能指好几样东西。")
    .replace(/"([^"]+)" is the name of (.+?)\. Pick the one you meant\./g, function(_, m, list){ var NZ = {"a film":"电影","a TV show":"剧集","a musician":"音乐人","a book":"书","a place":"地点","a person":"人物"}; return "“" + m + "”可能是" + list.split(/, | or /).map(function(x){ return NZ[x] || x; }).join("、") + "。选你指的那个。"; })
    .replace(/Not sure "([^"]+)" means ([^.]+?)\./g, "不确定“$1”是不是指 $2。")
    .replace(/\s*(?:Qloo|The catalogue) puts (.+?) closest to your taste(?: \(([\d.]+)\))?(?:, mostly through (.+?))?\./g, function(_, n, a, v){
      var top = n.replace(/\((\d{4}), ([a-z]+)\)/, function(_, y, k){ return "(" + y + ", " + (TY[k]||k) + ")"; });
      return "目录认为 " + top + " 最贴近你的口味" + (v ? "，主要因为 " + v.replace(/ and /g, " 和 ") : "") + "。";
    });
}
function reasonHtml(r){ var h = esc(reasonZh(r)); if (LANG !== "zh") return h; return h.replace(/[A-Za-z][A-Za-z0-9'’&:.\-]*(?: [A-Z][A-Za-z0-9'’&:.\-]*)*/g, function(m){ return '<span translate="no" style="margin:0 .18em">' + m + '</span>'; }); }
function t(s){ return LANG === "zh" ? trZh(s) : s; }
/* stayin:intent — mirror of stayIntent in src/plan.js (tests/stayin.test.mjs checks they agree) */
function stayIntent(text) {
  const s = String(text == null ? "" : text).toLowerCase();
  if (!s.trim()) return { mode: null, kinds: [] };
  const home = /\b(stay(ing)? in|at home|night in|home tonight|on the couch|on the sofa|cosy night|cozy night)\b|在家|宅家|宅着|不出门|不想出门|窝在|躺平/.test(s);
  const out = /cinema|movie theat|theatre|theater|bookstore|book store|bookshop|record (shop|store)|vinyl shop|caf[eé]|coffee|\bbar\b|pub|museum|galler|park|restaurant|bakery|jazz club|live music|concert|gig\b|go out|going out|walk around|stroll|neighbo(u)?rhood|电影院|影院|影城|书店|唱片店|咖啡|酒吧|博物馆|美术馆|画廊|公园|餐厅|饭店|livehouse|演唱会|音乐节|出门|外出|逛|散步|街区|去外面/.test(s);
  const k = [];
  const hit = (kind, re) => { const m = s.search(re); if (m >= 0) k.push([kind, m]); };
  hit("film", /\b(movies?|films?)\b|watch something|something to watch|电影|影片|片子|看部片|看个片/);
  hit("tv", /\b(series|tv show|tv|show to binge|binge|episodes?)\b|电视剧|美剧|日剧|韩剧|英剧|追剧|剧集|看剧|番剧|动画/);
  hit("music", /\b(listen|album|albums|playlist|songs?|music|record to put on)\b|听歌|听音乐|听专辑|听点|音乐|专辑|歌单|唱片/);
  hit("book", /\b(read|reading|books?|novel|novels)\b|看书|读书|读点|读本|小说|一本书|书单/);
  hit("podcast", /\bpodcasts?\b|播客|电台/);
  const kinds = [...new Set(k.sort((a, b) => a[1] - b[1]).map(([x]) => x))];
  const cook = /\b(cook|cooking|bake|baking)\b|做饭|下厨|煮饭|烤蛋糕/.test(s);
  if (home) return { mode: "in", kinds };
  if (out) return { mode: "out", kinds: [] };
  if (kinds.length || cook) return { mode: "in", kinds };
  return { mode: null, kinds: [] };
}
/* end stayin:intent */
function stopRead(s){
  if (LANG !== "zh" || !s) return (s && s.read) || "";
  if (s.read_zh) return s.read_zh;
  const r = String(s.read || ""), kz = function(k){ k = String(k).toLowerCase().trim(); return ZH[k] || k; }, tz = function(v){ return tagZh(v); };
  let m = r.match(/^An? (.+?) with an? (.+?) feel\.$/);
  if (m) return "一家" + kz(m[1]) + "，目录给它的气质标签是" + m[2].split(/,\s*/).map(tz).join("、") + "。";
  m = r.match(/^An? (.+?) (?:Qloo ranks )?close to your taste\.$/);
  if (m) return "一家" + kz(m[1]) + "，目录把它排在很贴近你口味的位置。";
  m = r.match(/^(.+?)(?:, tagged (.+?))?, a fit for your note on (.+)\.$/);
  if (m) return kz(m[1]) + (m[2] ? "，标签是" + m[2].split(/ and /).map(tz).join("、") : "") + "，和你关于 " + m[3] + " 的笔记很搭。";
  return r;
}

/* DOM pass: translate exact UI strings in text nodes and a few attributes. */
const I18N_ATTRS = ["placeholder", "aria-label", "title"];
function i18nSkip(el){ return el && el.closest && el.closest('[translate="no"], .notranslate, script, style, textarea'); }
function translateNode(root){
  if (LANG !== "zh" || !root) return;
  if (root.nodeType === 3) {
    const p = root.parentElement;
    if (p && !i18nSkip(p)) { const v = trZh(root.nodeValue); if (v !== root.nodeValue) root.nodeValue = v; }
    return;
  }
  if (root.nodeType !== 1 || root.closest('[translate="no"], .notranslate, script, style')) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: function(n){
      if (n.nodeType === 1) return i18nSkip(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  texts.forEach(function(n){ const v = trZh(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; });
  const els = [root].concat(Array.prototype.slice.call(root.querySelectorAll("[placeholder],[aria-label],[title]")));
  els.forEach(function(el){
    if (el.closest('[translate="no"], .notranslate')) return;
    I18N_ATTRS.forEach(function(a){
      const v = el.getAttribute && el.getAttribute(a);
      if (v) { const w = trZh(v); if (w !== v) el.setAttribute(a, w); }
    });
  });
}
let i18nBusy = false;
const i18nObserver = new MutationObserver(function(muts){
  if (LANG !== "zh" || i18nBusy) return;
  i18nBusy = true;
  try {
    muts.forEach(function(m){
      if (m.type === "characterData") translateNode(m.target);
      else if (m.type === "attributes") {
        const el = m.target;
        if (!el.closest('[translate="no"], .notranslate')) { const v = el.getAttribute(m.attributeName); if (v) { const w = trZh(v); if (w !== v) el.setAttribute(m.attributeName, w); } }
      }
      else m.addedNodes.forEach(translateNode);
    });
  } finally { i18nBusy = false; }
});
i18nObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: I18N_ATTRS });
const titleObserver = new MutationObserver(function(){ if (LANG === "zh") { const v = document.title.split(" · ").map(trZh).join(" · "); if (v !== document.title) document.title = v; } });
titleObserver.observe(document.querySelector("title") || document.head, { childList: true, characterData: true, subtree: true });

function applyLang(){
  document.documentElement.lang = LANG === "zh" ? "zh-CN" : "en";
  if (LANG === "zh") translateNode(document.body);
}

/* appearance + text size */
const darkMQ = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
function applyAppearance(){
  const a = prefs.appearance;
  const dark = a === "system" && darkMQ && darkMQ.matches;
  document.documentElement.dataset.theme = dark ? "dark" : (a === "light" ? "light" : "paper");
  document.documentElement.style.setProperty("--ts", String([0.92, 1, 1.12][prefs.textSize] || 1));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#1c1b18" : (a === "light" ? "#f7f6f3" : "#f3eee3"));
}
if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener("change", applyAppearance);

let prefsTimer = null;
function savePrefs(){
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (_) {}
  if (prefsTimer) clearTimeout(prefsTimer);
  prefsTimer = setTimeout(function(){
    if (!state.user) return;
    api("/api/prefs", { method: "PUT", body: { prefs: prefs } }).catch(function(){});
  }, 400);
}
async function syncPrefsFromServer(){
  try {
    const data = await api("/api/prefs");
    if (data && data.prefs) {
      const m = mergePrefs(data.prefs);
      const langChanged = m.lang !== prefs.lang;
      Object.assign(prefs, m);
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (_) {}
      applyAppearance();
      if (langChanged) setLang(prefs.lang, true);
    } else if (state.user) {
      api("/api/prefs", { method: "PUT", body: { prefs: prefs } }).catch(function(){});
    }
  } catch (_) {}
}
function setLang(lang, noSave){
  LANG = lang === "zh" ? "zh" : "en";
  prefs.lang = LANG;
  if (!noSave) savePrefs();
  document.documentElement.lang = LANG === "zh" ? "zh-CN" : "en";
  // re-render the static shell text and the current screen
  Array.prototype.forEach.call(tabsEl.querySelectorAll(".tab"), function(tab){
    const span = tab.querySelector("span");
    const en = { notes: "Notes", cards: "Cards", plan: "Plan" }[tab.getAttribute("data-tab")];
    if (span && en) span.textContent = t(en);
  });
  ribbon.textContent = t("Sample notebook · made-up data");
  if (state.booted) route();
}
applyAppearance();
document.documentElement.lang = LANG === "zh" ? "zh-CN" : "en";


let viewToken = 0;
let cleanups = [];
let toastTimer = null;

