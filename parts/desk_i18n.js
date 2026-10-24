/* desktop shell (sidebar + inspector) strings; leftover English on Notes / Cards / Plan in zh */
Object.assign(ZH, {
  "Needs you": "等你确认", "One guess to check": "有 1 个猜测待确认", "Nothing waiting": "没有待确认的",
  "Every mention in your notes has a card or was set aside.": "笔记里提到的每样东西，都已经有了卡片或被搁置。",
  "Review the inbox": "去确认", "Came back lately": "最近又想起的", "Select a note to see the cards it grew.": "选中一条笔记，看看它长出了哪些卡片。",
  "Selected note": "选中的笔记", "No cards from this note": "这条笔记没有长出卡片",
  "Plain notes stay plain. Mention a film, book, album or place and it grows a card.": "普通笔记就让它普通。提到一部电影、一本书、一张专辑或一个地方，它就会长出卡片。",
  "Back to what needs you": "回到待确认", "1 card from this note": "这条笔记长出 1 张卡片", "This card did not load.": "这张卡片没加载出来。",
  "Open full card": "打开完整卡片", "mention": "提及", "Route between the stops, schematic": "各站之间的示意路线",
  "Back": "返回", "Settings": "设置", "Notes": "笔记", "Cards": "卡片", "Threads": "线索", "Letter": "来信", "Plan": "计划"
});
Object.assign(ZH, {
  "Mentioned once": "提到一次", "again": "又提到了", "Show less": "收起", "Compare →": "对比 →", "Compare": "对比",
  "Open when you arrive, per Qloo's listed hours": "按 Qloo 标注的营业时间，到达时正在营业", "May be closed when you arrive": "到达时可能已关门",
  "Hours not listed": "未标注营业时间"
});
(function(){
  var DAYS = { Monday: "周一", Tuesday: "周二", Wednesday: "周三", Thursday: "周四", Friday: "周五", Saturday: "周六", Sunday: "周日" };
  var who = function(list){ return String(list).replace(/ \((\d+)% of the match\)( and )?/g, function(m, n, a){ return "（占匹配 " + n + "%）" + (a ? "、" : ""); }); };
  var hood = function(s){ return String(s).split(" and ").join("和"); };
  ZH_PATTERNS.unshift(
    [/^[Mm]entioned (\d+)\u00d7$/, function(m, n){ return "提到 " + n + " 次"; }],
    [/^\+ (\d+) more from your notes$/, function(m, n){ return "还有 " + n + " 条来自你的笔记"; }],
    [/^Qloo matched this (.+?) mostly through (.+?)(?:; affinity ([\d.]+))?\.$/, function(m, kind, list, aff){
      return "Qloo 主要通过 " + who(list) + " 匹配到这家" + trZh(kind) + (aff ? "；契合度 " + aff : "") + "。"; }],
    [/^Qloo ranked this (.+?) near (.+?) in taste(?: \(popularity ([\d.]+)\))?\.$/, function(m, kind, list, pop){
      return "按口味，Qloo 把这家" + trZh(kind) + "排在 " + String(list).split(" and ").join("、") + " 附近" + (pop ? "（热度 " + pop + "）" : "") + "。"; }],
    [/^Qloo lists it closed on (\w+)s \u00b7 not live-checked$/, function(m, d){ return "Qloo 标注" + (DAYS[d] || d) + "不营业 · 未实时核实"; }],
    [/^Qloo lists (\w+day) (.+) \u00b7 not live-checked$/, function(m, d, x){ return "Qloo 标注营业时间 " + (DAYS[d] || d) + " " + x + " · 未实时核实"; }],
    [/^(Not much matched right in (.+?), so I looked a little further\.|Qloo's best matches near (.+?) spill over the border\.) (.+)$/, function(m, lead, a1, a2, rest){
      var l = a1 ? a1 + "附近匹配的不多，所以我往外多找了一点。" : "Qloo 在" + a2 + "附近最匹配的地方，有的在边界外。";
      var r = rest, x;
      if ((x = rest.match(/^The stop is in (.+)\.$/))) r = "这一站在" + hood(x[1]) + "。";
      else if ((x = rest.match(/^Both stops are in (.+)\.$/))) r = "两站都在" + hood(x[1]) + "。";
      else if ((x = rest.match(/^All stops are in (.+)\.$/))) r = "所有站都在" + hood(x[1]) + "。";
      else if ((x = rest.match(/^The stops are in (.+)\.$/))) r = "这几站在" + hood(x[1]) + "。";
      else if ((x = rest.match(/^One stop is in (.+)\.$/))) r = "有一站在" + hood(x[1]) + "。";
      else if ((x = rest.match(/^(\d+) stops are in (.+)\.$/))) r = "有 " + x[1] + " 站在" + hood(x[2]) + "。";
      return l + r; }]
  );
})();
Object.assign(ZH, { "Steady": "一直都在", "Share taste card": "分享口味卡片", "Your taste letter": "你的口味来信" });
(function(){
  var two = function(s){ s = String(s); var N = window.SP_NAMES || {}, out = [], rest = s, guard = 0;
    while (rest && guard++ < 8) { var hit = null; Object.keys(N).forEach(function(k){ if ((rest === k || rest.indexOf(k + " and ") === 0) && (!hit || k.length > hit.length)) hit = k; });
      if (hit) { out.push(hit); rest = rest.slice(hit.length + 5); continue; }
      var i = rest.indexOf(" and "); while (i >= 0 && /^(the|a|an) /.test(rest.slice(i + 5))) i = rest.indexOf(" and ", i + 5);
      if (i < 0) { out.push(rest); rest = ""; } else { out.push(rest.slice(0, i)); rest = rest.slice(i + 5); } }
    return out.length === 2 ? out.join(" 和 ") : out.length > 2 ? out.slice(0, -1).join("、") + " 和 " + out[out.length - 1] : s; };
  var MW = { films: "部电影", shows: "部剧", artists: "位艺人", books: "本书", places: "个地方", things: "样东西" };
  var lead = function(s){
    var x;
    if ((x = s.match(/^(\d+) (films|shows|artists|books|places|things) are called (.+)\.$/))) return "有 " + x[1] + " " + MW[x[2]] + "都叫 " + x[3] + "。";
    return trZh(s);
  };
  ZH_PATTERNS.unshift(
    [/^(.+?\.) Qloo puts (.+?) closest to your taste \(([\d.]+)\)(?:, mostly through (.+?))?\.$/, function(m, l, top, aff, via){
      return lead(l) + "Qloo 认为 " + top + " 最贴近你的口味（" + aff + "）" + (via ? "，主要因为 " + two(via) : "") + "。"; }],
    [/^((?:“[^”]+”(?: and )?)+) is how Qloo reads the pull of (.+?)(?: — you wrote “(.+)”)?\.$/, function(m, tags, who, q){
      var w = who === "your recent cards" ? "你最近的卡片" : who === "your cards" ? "你的卡片" : two(who);
      return "Qloo 用 " + tags.split(" and ").join("、") + " 来读 " + w + " 对你的吸引" + (q ? "——你写过“" + q + "”" : "") + "。"; }]
  );
})();
