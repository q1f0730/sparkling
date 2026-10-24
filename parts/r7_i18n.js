/* r7 designer pass strings */
Object.assign(ZH, {
  "The wall": "卡片墙", "Everything": "你留下的", "you kept.": "一切。", "cards": "卡片", "mentions": "提及", "loved": "喜欢",
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
Object.assign(ZH, { "book store": "书店", "bookstore": "书店", "bakery": "面包店", "cafe": "咖啡馆", "coffee shop": "咖啡馆", "record store": "唱片店", "park": "公园", "museum": "博物馆", "art gallery": "美术馆", "gallery": "美术馆", "movie theater": "电影院", "cinema": "电影院", "bar": "酒吧", "restaurant": "餐厅", "pie shop": "派店", "library": "图书馆", "music venue": "演出场地", "vintage store": "古着店", "thrift store": "二手店" });
