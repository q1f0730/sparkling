/* r7i18n:begin */
/* r7 designer pass strings */
Object.assign(ZH, {
  "kinds": "类型", "The wall": "卡片墙", "Everything": "你留下的", "you kept.": "一切。", "cards": "卡片", "mentions": "提及", "loved": "喜欢",
  "Most on your mind": "最近最常想起", "mentioned": "提及", "mentioned once": "提到一次",
  "Card": "卡片", "mention": "提及", "first met": "初次相遇", "last seen": "最近一次",
});
Object.assign(ZH, { "Notebook": "笔记本", "note": "条笔记" });
["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].forEach(function(d){ ZH[d + "."] = DAY_ZH[d] + "。"; });
ZH_PATTERNS.unshift(
  [/^(\w+) things came back to you this week\.$/, function(m, n){ return "这周有" + zhNum(n) + "样东西又回到了你身边。"; }],
  [/^One thing came back to you this week\.$/, function(){ return "这周有一样东西又回到了你身边。"; }],
  [/^(\w+) notes joined your notebook this week\.$/, function(m, n){ return "这周笔记本里多了" + zhNum(n) + "条笔记。"; }],
  [/^One note joined your notebook this week\.$/, function(){ return "这周笔记本里多了一条笔记。"; }],
  [/^A few things are here when you want them\.$/, function(){ return "想看的时候，它们都在这里。"; }],
  [/^A quiet page, ready when you are\.$/, function(){ return "安静的一页，等你落笔。"; }],
  [/^Your notebook is here\.$/, function(){ return "你的笔记本在这里。"; }]
);
Object.assign(ZH, { "Unsure": "不确定", "Did I get": "这几个", "this right?": "我认对了吗？", "Up next": "接下来", "Guess": "猜测",
  "Sparkling was not sure about these. Keep the guess, pick another, or set it aside.": "这几条 Sparkling 没有把握。保留猜测、换一个，或者先放一边。" });
ZH_PATTERNS.unshift([/^\+(\d+) more$/, function(m, n){ return "还有 " + n + " 条"; }]);
Object.assign(ZH, { "Go": "出发，", "live it.": "去过一遍。", "stop": "站", "stops": "站", "window": "时段", "walking": "步行" });
ZH_PATTERNS.unshift([/^Stop (\d+)$/, function(m, n){ return "第 " + n + " 站"; }]);
if (!ZH["Letter"]) ZH["Letter"] = "来信";
Object.assign(ZH, { "tea house": "茶馆", "theater": "剧院", "book store": "书店", "bookstore": "书店", "bakery": "面包店", "cafe": "咖啡馆", "coffee shop": "咖啡馆", "record store": "唱片店", "park": "公园", "museum": "博物馆", "art gallery": "画廊", "gallery": "画廊", "movie theater": "电影院", "cinema": "电影院", "bar": "酒吧", "restaurant": "餐厅", "pie shop": "派店", "library": "图书馆", "music venue": "音乐现场", "vintage store": "古着店", "thrift store": "二手店" });
ZH_PATTERNS.unshift([/^(?:Qloo has no hours|No listed hours) for (one stop|\d+ stops); check before you go\.$/, function(m, x){ return (x === "one stop" ? "有 1 站" : "有 " + x.replace(" stops", "") + " 站") + "没有标注营业时间，出发前请先确认。"; }]);

/* r7i18n:end */
Object.assign(ZH, { "No letter yet": "还没有来信", "Your first letter arrives once a few notes have turned into cards.": "等你有几条笔记变成了卡片，第一封来信就会到这里。", "You kept going back to": "你一直回看的", "New this month": "本月新增", "In your own words": "你自己的原话", "Nothing to look at.": "这里暂时没有要看的。" });
Object.assign(ZH, { "Card IDs and your area. No note text.": "只发送卡片 ID 和你的区域，不含笔记文字。" });
/* compare-sheet zh */
Object.assign(ZH, { "Same notes, no Qloo": "同样的笔记，不用 Qloo", "Same cards, same area, same model. The only change: no Qloo.": "同样的卡片、同样的区域、同一个模型，唯一的区别：不用 Qloo。", "The model named these from memory. Afterwards Sparkling looked each one up in Qloo: does it exist, is it still open, is it near your route.": "这些地方是模型凭记忆报的。随后 Sparkling 逐个到 Qloo 里查：是否存在、是否还在营业、离你的路线近不近。", "Every stop came from Qloo in the first place: an ID, coordinates, listed hours and credit to your notes.": "每一站一开始就来自 Qloo：有 ID、坐标、营业时间，并标明出自你的哪条笔记。", "Asking a plain model, no Qloo… usually 5–15 seconds.": "正在问一个不带 Qloo 的纯模型……通常需要 5–15 秒。" });
ZH_PATTERNS.unshift([/^(\d+) of (\d+) pass\.$/, function(m, a, b){ return b + " 个里有 " + a + " 个通过。"; }]);
Object.assign(ZH, { "In Qloo": "Qloo 里有", "In Qloo, but far": "Qloo 里有，但很远", "Closed for good, per Qloo": "Qloo 标注已永久关闭", "Not in Qloo, so unchecked": "Qloo 里没有，无法核对", "Only found in another city": "只在别的城市找到", "Not checked": "未核对", "Open on arrival": "到达时营业", "May be closed when you arrive": "到达时可能已关门", "on the route": "就在路线上", "Plain model": "纯模型", "Sparkling + Qloo": "Sparkling + Qloo" });
ZH_PATTERNS.unshift(
  [/^(\d+) min walk$/, function(m, n){ return "步行 " + n + " 分钟"; }],
  [/^(\d+) min by bike \(([\d.]+) mi\)$/, function(m, n, d){ return "骑车 " + n + " 分钟（" + d + " 英里）"; }],
  [/^([\d.]+) mi from the route$/, function(m, d){ return "离路线 " + d + " 英里"; }]
);
/* plan trace zh */
(function(){
  var RJ = { "of the wrong kind": "类型不符", "that are not places to linger (barbers, grocers…)": "不适合逗留的地方（理发店、杂货店等）", "chains": "连锁店", "closed for good": "已永久关闭", "closed that afternoon": "当天下午不营业", "outside the city": "在城市之外", "across the river": "在河对岸", "without an address": "没有地址", "without an id": "没有 ID" };
  function kz(s){ return trZh(s); }
  function dz(d){ return DAY_ZH[d] || d; }
  function clk(s){ return String(s).replace(/(\d+(?::\d+)?)\s*([ap])m/i, function(m, t, a){ return (a.toLowerCase() === "a" ? "上午 " : "下午 ") + t; }); }
  ZH_PATTERNS.unshift(
    [/^Planning from your (recent|earlier) notes only\.$/, function(m, w){ return "只用你" + (w === "recent" ? "最近" : "更早") + "的笔记来规划。"; }],
    [/^Using (\d+) cards as seeds: (.+)\.$/, function(m, n, l){ return "用 " + n + " 张卡片作种子：" + l + "。"; }],
    [/^Looking for: (.+), around (.+)\.$/, function(m, k, a){ return "寻找：" + k.split(", then ").map(kz).join("，再到 ") + "，范围在" + a + "一带。"; }],
    [/^Asked (?:Qloo|the catalogue) for (.+?) near (.+?) with (.+?): (\d+) came back, (\d+) passed the checks(.*)\.$/, function(m, k, a, sd, n, ok, rest){
      var extra = "";
      var r1 = rest.match(/\((\d+) wrong kind, closed or not a stop\)/); if (r1) extra += "（" + r1[1] + " 个类型不符、已关闭或不是可去的地方）";
      var r2 = rest.match(/, (\d+) you already know/); if (r2) extra += "，" + r2[1] + " 个你已经知道";
      var r3 = rest.match(/, (\d+) over budget/); if (r3) extra += "，" + r3[1] + " 个超预算";
      return "向口味目录询问" + a + "附近的" + kz(k) + "（依据 " + sd + "）：返回 " + n + " 个，" + ok + " 个通过检查" + extra + "。"; }],
    [/^Few (.+) results right in (.+), so I widened to (.+) and found (\d+)\.$/, function(m, k, a, w, n){ return a + "本地的" + kz(k) + "太少，于是扩大到" + w + "，又找到 " + n + " 个。"; }],
    [/^Nothing (.+) I found is open around (.+) on (\w+), so I left that stop out\.$/, function(m, k, t, d){ return "我找到的" + kz(k) + "在" + dz(d) + clk(t) + "前后都没开门，所以这一站先略过。"; }],
    [/^Skipped (\d+) that would be closed when you got there\.$/, function(m, n){ return "略过了 " + n + " 个你到的时候已经关门的地方。"; }],
    [/^Checks left out (.+)\.$/, function(m, l){ return "检查剔除了：" + l.split(/, (?=\d+ )/).map(function(p){ var q = p.match(/^(\d+) (.+)$/); return q ? q[1] + " 个" + (RJ[q[2]] || q[2]) : p; }).join("，") + "。"; }],
    [/^Kept stops close together: (.+)\.$/, function(m, l){ return "让几站彼此靠近：" + l.split(" then ").join(" → ") + "。"; }],
    [/^Checked hours for (\w+) and wrote one line per stop\.$/, function(m, d){ return "核对了" + dz(d) + "的营业时间，并为每一站写了一句话。"; }],
    [/^(\d+) steps(?: · (\d+) Qloo calls)?(?: · (\d+) s)?$/, function(m, s, q, t){ return [s + " 步", q ? q + " 次 Qloo 调用" : "", t ? t + " 秒" : ""].filter(Boolean).join(" · "); }]
  );
})();
/* desk-i18n:begin */
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
  "Open when you arrive, per listed hours": "按标注的营业时间，到达时正在营业", "May be closed when you arrive": "到达时可能已关门",
  "Hours not listed": "未标注营业时间"
});
(function(){
  var DAYS = { Monday: "周一", Tuesday: "周二", Wednesday: "周三", Thursday: "周四", Friday: "周五", Saturday: "周六", Sunday: "周日" };
  var who = function(list){ return String(list).replace(/ \((\d+)% of the match\)( and )?/g, function(m, n, a){ return "（占匹配 " + n + "%）" + (a ? "、" : ""); }); };
  var hood = function(s){ return String(s).split(" and ").join("和"); };
  ZH_PATTERNS.unshift(
    [/^[Mm]entioned (\d+)\u00d7$/, function(m, n){ return "提到 " + n + " 次"; }],
    [/^\+ (\d+) more from your notes$/, function(m, n){ return "还有 " + n + " 条来自你的笔记"; }],
    [/^(?:Qloo matched|Matched) this (.+?) mostly through (.+?)(?:; affinity ([\d.]+))?\.$/, function(m, kind, list, aff){
      return "主要通过 " + who(list) + " 匹配到这家" + trZh(kind) + (aff ? "；契合度 " + aff : "") + "。"; }],
    [/^(?:Qloo ranked|Ranked) this (.+?) near (.+?) in taste(?: \(popularity ([\d.]+)\))?\.$/, function(m, kind, list, pop){
      return "按口味，目录把这家" + trZh(kind) + "排在 " + String(list).split(" and ").join("、") + " 附近" + (pop ? "（热度 " + pop + "）" : "") + "。"; }],
    [/^(?:Qloo lists it closed|Listed as closed) on (\w+)s \u00b7 not live-checked$/, function(m, d){ return "标注" + (DAYS[d] || d) + "不营业 · 未实时核实"; }],
    [/^(?:Qloo lists|Listed) (\w+day) (.+) \u00b7 not live-checked$/, function(m, d, x){ return "标注营业时间 " + (DAYS[d] || d) + " " + x + " · 未实时核实"; }],
    [/^(Not much matched right in (.+?), so I looked a little further\.|(?:Qloo's best|The best) matches near (.+?) spill over the border\.) (.+)$/, function(m, lead, a1, a2, rest){
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
    [/^(.+?\.) (?:Qloo|The catalogue) puts (.+?) closest to your taste \(([\d.]+)\)(?:, mostly through (.+?))?\.$/, function(m, l, top, aff, via){
      return lead(l) + "目录认为 " + top + " 最贴近你的口味（" + aff + "）" + (via ? "，主要因为 " + two(via) : "") + "。"; }],
    [/^((?:“[^”]+”(?: and )?)+) is how Qloo reads the pull of (.+?)(?: — you wrote “(.+)”)?\.$/, function(m, tags, who, q){
      var w = who === "your recent cards" ? "你最近的卡片" : who === "your cards" ? "你的卡片" : two(who);
      return "Qloo 用 " + tags.split(" and ").join("、") + " 来读 " + w + " 对你的吸引" + (q ? "——你写过“" + q + "”" : "") + "。"; }]
  );
})();

/* desk-i18n:end */
/* capture:i18n:begin */
/* capture composer strings (added only where the table has no entry yet) */
(function(add){ for (var k in add) if (!Object.prototype.hasOwnProperty.call(ZH, k)) ZH[k] = add[k]; })({
  "New note": "写笔记",
  "Add a photo": "添加照片",
  "Attach a file": "添加文件",
  "\u2318\u21b5 to save": "\u2318\u21b5 保存",
  "Ctrl \u21b5 to save": "Ctrl \u21b5 保存",
  "A photo over 8 MB stayed out.": "超过 8 MB 的照片没有加进来。",
  "Four photos per note is the limit.": "一条笔记最多四张照片。",
  "Sparkling keeps photos and text files for now.": "目前只能收照片和文本文件。",
  "Saving your note.": "正在保存笔记。",
  "Saving the photo": "正在保存照片",
  "Reading the picture": "正在读这张图",
  "Waiting for a connection": "等待联网",
  "Discard": "丢弃",
  "Too large to save": "太大，存不下",
  "Didn't save": "没存上",
  "Photo": "照片"
});

/* capture:i18n:end */
/* picker:i18n:begin */
/* "/" picker strings (added only where the table has no entry yet) */
(function(add){ for (var k in add) if (!Object.prototype.hasOwnProperty.call(ZH, k)) ZH[k] = add[k]; })({
  "Tag something": "标记",
  "Search the taste catalogue": "在口味目录里搜索",
  "All": "全部", "People": "人物", "Film": "电影", "TV": "剧集", "Music": "音乐", "Books": "书", "Places": "地点",
  "Person": "人物", "Book": "书", "Place": "地点", "Other": "其他",
  "Type a name to search.": "输入名字搜索。",
  "Type a name: a person, film, song, book or place.": "输入名字：人、电影、歌、书或地点。",
  "Searching": "正在搜索",
  "The catalogue did not answer. Keep typing to try again.": "目录没有回应，继续输入会再试一次。",
  "\u2191\u2193 move \u00b7 \u21b5 pick \u00b7 esc close": "\u2191\u2193 移动 \u00b7 \u21b5 选择 \u00b7 esc 关闭",
  "Remove tag": "移除标记",
  "Flip": "翻面", "Front": "正面", "First met": "初次相遇", "Type": "类型",
  "Not this?": "不是这个？",
  "Which one did you mean?": "你指的是哪一个？",
  "Something else": "都不是，搜一下",
  "Keep as my own thing": "存成我自己的卡",
  "Find the right one": "找到对的那个",
  "Switched.": "已换好。",
  "That did not switch. Try again.": "没换成，再试一次。",
  "actress": "演员", "actor": "演员", "singer": "歌手", "singer-songwriter": "创作歌手", "songwriter": "词曲作者", "rapper": "说唱歌手", "musician": "音乐人", "band": "乐队",
  "film director": "电影导演", "director": "导演", "writer": "作家", "novelist": "小说家", "poet": "诗人"
});

/* picker:i18n:end */
