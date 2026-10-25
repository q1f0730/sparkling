"use strict";
/* ---------------------------------------------------------------------------
   Sparkling. One file. Vanilla JS, hash routes, cookie session.
   --------------------------------------------------------------------------- */

const view = document.getElementById("view");
const frame = document.getElementById("frame");
const chromeEl = document.getElementById("chrome");
const topLeft = document.getElementById("topLeft");
const topTitle = document.getElementById("topTitle");
const topRight = document.getElementById("topRight");
const ribbon = document.getElementById("ribbon");
const tabsEl = document.getElementById("tabs");
const modal = document.getElementById("modal");
const toastHost = document.getElementById("toastHost");

const DAY = 86400000;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const WEEK_LONG = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const WEEK_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const COUNT_WORDS = ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve"];
const TYPE_LABELS = { film:"Film", tv:"TV", music:"Music", book:"Book", place:"Place", person:"Person", other:"Other" };
const TYPE_CLASSES = { film:"type-film", tv:"type-tv", music:"type-music", book:"type-book", place:"type-place", person:"type-person", other:"type-other" };
const VALID_TYPES = ["film","tv","music","book","place","person","other"];

const state = {
  user: null,
  inboxCount: 0,
  booted: false,
  bootError: null,
  bootNotice: null,
  lastMain: "#/notes",
  focusComposer: false,
};
const planCache = new Map();

/* ---------------------------------------------------------------------------
   i18n: English (default) and Simplified Chinese.
   t(key) for strings Sparkling builds itself; a DOM pass translates any exact UI
   string that slipped through. Qloo names/tags and the user's own words are never
   translated (they are not dictionary keys, and note text is marked translate="no").
   --------------------------------------------------------------------------- */
const PREFS_KEY = "sparkling.prefs";
const PREF_DEFAULTS = {
  lang: "en", appearance: "system", textSize: 1,
  notif: { master: false, letter: true, plan: true, planTime: "18:00", inbox: true, imported: true, quiet: false, quietFrom: "22:00", quietTo: "08:00" },
};
function loadLocalPrefs(){
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch (_) { p = {}; }
  return mergePrefs(p);
}
function mergePrefs(p){
  const out = JSON.parse(JSON.stringify(PREF_DEFAULTS));
  if (!p || typeof p !== "object") return out;
  if (p.lang === "zh" || p.lang === "en") out.lang = p.lang;
  if (["system", "light", "paper"].includes(p.appearance)) out.appearance = p.appearance;
  if ([0, 1, 2].includes(p.textSize)) out.textSize = p.textSize;
  if (p.notif && typeof p.notif === "object") Object.keys(out.notif).forEach(function(k){ if (k in p.notif && typeof p.notif[k] === typeof out.notif[k]) out.notif[k] = p.notif[k]; });
  return out;
}
const prefs = loadLocalPrefs();
let LANG = prefs.lang;

const ZH = {
  "kinds": "类型",
  "Recognizing": "识别中", "Slide to delete everything": "滑动以删除全部", "Keep": "保留", "Swipe right to keep · left if it is not a thing": "右滑保留 · 不是就左滑",
  // shell, tabs, common
  "Notes": "笔记", "Cards": "卡片", "Plan": "计划", "Inbox": "待确认", "Settings": "设置", "Threads": "线索",
  "Sample notebook · made-up data": "示例笔记本 · 虚构数据", "Open settings": "打开设置", "Go back": "返回", "Close": "关闭",
  "Cancel": "取消", "Continue": "继续", "Are you sure?": "确定吗？", "Save": "保存", "Saved": "已保存", "Saving": "正在保存",
  "Retry": "重试", "Try again": "再试一次", "Trying again": "正在重试", "Undo": "撤销", "Dismiss": "关闭", "More": "更多",
  "Working": "处理中", "Deleting": "正在删除", "Removing": "正在移除", "Leaving": "正在离开", "Sample": "示例", "Or": "或",
  "Sparkling needs JavaScript to keep your notebook.": "Sparkling 需要开启 JavaScript 才能保存你的笔记本。",
  "Something did not load.": "有内容没加载出来。", "Check your connection, then try again.": "检查一下网络，然后再试一次。",
  "That did not work. Try again.": "没成功，再试一次。", "That did not go through. Try again.": "没发送成功，再试一次。",
  "That did not save. Try again.": "没保存成功，再试一次。", "That did not work. Trying again in a moment may help.": "没成功，稍等一下再试也许就好了。",
  "Your notebook could not be reached just now. Try again in a moment.": "暂时连不上你的笔记本，稍后再试。",
  "Your session ended. Start a fresh notebook when you are ready.": "会话已结束。准备好了就开一本新的笔记本。",
  "Your session ended. Open the notebook again to save this photo.": "会话已结束。重新打开笔记本后再保存这张照片。",
  "Film": "电影", "TV": "剧集", "Music": "音乐", "Book": "书", "Place": "地点", "Other": "其他", "Books": "书", "Places": "地点",
  "Film & TV": "影视", "All": "全部", "Today": "今天", "Earlier": "更早", "Untitled": "未命名", "Unnamed": "未命名",
  "Note": "笔记", "Card": "卡片", "Photo": "照片", "Photos": "照片", "Link": "链接", "Quote": "引用", "Screenshot": "截图",
  "Plain notes": "纯笔记", "With cards": "有卡片", "plain note": "纯笔记", "In inbox": "在收件箱", "photos": "照片",
  // onboarding
  "Keep the things that stay with you.": "留住那些让你念念不忘的东西。",
  "Write a thought, paste a link, or add a screenshot. Sparkling connects the cultural things you return to.": "写一句想法、贴一个链接，或加一张截图。Sparkling 会把你反复回到的那些作品和地方串起来。",
  "Start with whatever is on your mind.": "从你此刻想到的开始。", "Write a note": "写一条笔记",
  "Try a sample notebook": "看看示例笔记本", "Look around a made-up notebook first.": "先逛逛一本虚构的笔记本。",
  "Start from Letterboxd": "从 Letterboxd 开始", "Start from your Letterboxd export.": "用你的 Letterboxd 导出文件开始。",
  "Your notes stay yours. Export or delete anytime.": "笔记永远属于你，随时可以导出或删除。",
  "Opening a notebook.": "正在打开笔记本。", "Opening your notebook.": "正在打开你的笔记本。", "Opening the sample notebook.": "正在打开示例笔记本。",
  "Back to choices": "返回选择", "Bring some history": "带上你的过往记录", "Bring some history · Sparkling": "带上你的过往记录 · Sparkling",
  // import
  "How to get your export": "如何拿到导出文件", "Open Letterboxd on the web and sign in.": "在网页上打开 Letterboxd 并登录。",
  "Go to Settings, then Import and export.": "进入 Settings，再点 Import & Export。", "Choose Export your data and download the zip.": "选择 Export Your Data，下载 zip 文件。",
  "Unzip it, then choose diary.csv here.": "解压后，在这里选择 diary.csv。", "Choose your export file": "选择导出文件", "Import file": "导入文件", "Import": "导入",
  "No file chosen": "未选择文件", "Choose the diary file from your export. It stays on your server and is discarded after the import.": "从导出文件里选 diary 文件。它只在你的服务器上处理，导入完就删除。",
  "Start from your Letterboxd export. Titles with dates become footprints; anything less certain waits in the inbox.": "用 Letterboxd 导出文件开始。带日期的片名会变成足迹，拿不准的会放进待确认。",
  "Titles with dates become footprints. Anything less certain waits for you in the inbox.": "带日期的片名会变成足迹，拿不准的会在待确认里等你。",
  "We read titles, dates, rewatches and your review text. The file is discarded after import. We do not read your password, profile or social graph.": "我们只读取片名、日期、重看记录和你的短评。导入后文件即删除，不会读取你的密码、个人资料或关注关系。",
  "We read titles, dates, rewatches and your review text. Nothing is posted anywhere. Unmatched rows are kept as plain notes, never silently dropped.": "我们只读取片名、日期、重看记录和你的短评，不会发布到任何地方。没匹配上的条目会保留为纯笔记，绝不会悄悄丢掉。",
  "Reading your file. You can leave this screen while it works.": "正在读取文件，你可以先离开这个页面。", "Your history is in.": "过往记录已导入。",
  "entries read": "条已读取", "became cards": "变成了卡片", "kept as notes": "保留为笔记", "Imported": "已导入",
  "Nothing was read from that file.": "这个文件里没读到内容。", "That file is too large to read here.": "文件太大，这里读不了。",
  "That file did not go through. Try the diary.csv file from your export.": "文件没传上去。试试导出包里的 diary.csv。",
  "Try the diary.csv file from your export. Nothing was added.": "试试导出包里的 diary.csv。这次什么都没添加。",
  "The import is not available right now. Try again in a little while.": "导入暂时不可用，过一会儿再试。",
  "About 30 seconds": "大约 30 秒", "See your cards": "查看你的卡片", "Look at the inbox": "去待确认看看", "Go to your notes": "去笔记",
  // notes
  "What stayed with you today?": "今天有什么让你念念不忘？", "Something you watched, heard, read or found?": "看了、听了、读了或发现了什么？",
  "Add a few words, or just save": "写几个字，或者直接保存", "Save note": "保存笔记", "Add a link": "添加链接", "Add link": "添加链接",
  "Remove link": "移除链接", "A link starts with http:// or https://.": "链接要以 http:// 或 https:// 开头。", "A note needs a line.": "笔记至少要写一句。",
  "A line or a link is all it needs.": "一句话或一个链接就够了。", "Paste a link or drop a screenshot.": "粘贴链接，或拖入一张截图。",
  "Saved to your notes.": "已存入笔记。", "Noted. A line when you are ready.": "记下了。想写的时候再补一句。",
  "That did not save. Your draft is still here.": "没保存成功，草稿还在。", "Search notes": "搜索笔记", "Search your notes": "搜索你的笔记",
  "Close search": "关闭搜索", "Clear search": "清除搜索", "No notes mention that yet.": "还没有笔记提到这个。",
  "No notes under this filter yet.": "这个筛选下还没有笔记。", "Show all notes": "显示全部笔记", "Add your first note": "写下第一条笔记",
  "Nothing here yet. Write one line about something you watched, heard, read or visited. Sparkling will take it from there.": "这里还空着。写一句你看过、听过、读过或去过的东西，剩下的交给 Sparkling。",
  "Edit note": "编辑笔记", "Delete note": "删除笔记", "Note options": "笔记选项", "Delete this note?": "删除这条笔记？",
  "The note and what it added will be removed. This cannot be undone.": "这条笔记和它带来的内容都会被删除，无法撤销。",
  "Note deleted.": "笔记已删除。", "This cannot be undone.": "此操作无法撤销。", "That could not be undone.": "撤销失败。",
  "Your notes did not load. Check your connection, then try again.": "笔记没加载出来。检查网络后再试一次。", "Your notes did not refresh.": "笔记没刷新成功。",
  "The note did not come back.": "笔记没能恢复。", "did you go": "去了吗", "Went to": "去了", "Didn't go": "没去", "Didn\u2019t go": "没去", "What got in the way?": "是什么拦住了你？", "Too far": "太远", "Not my taste": "不对口味", "Closed": "没开门", "No time": "没时间",
  "Yes, add a line": "去了，写一句", "Not a thing": "都不是", "Waiting for a look": "等你看一眼", "waiting for a look": "等你看一眼",
  "reading the text...": "正在识别文字…", "Mention it again sometime and it will remember.": "下次再提到它，Sparkling 会记住。",
  // camera
  "Add a photo of a page, a poster, a screen or a place.": "拍一页书、一张海报、一块屏幕或一个地方。",
  "A photo joins your notes. Sparkling reads any text in it, then looks for something it recognises.": "照片会存进笔记。Sparkling 会读出里面的文字，再找它认得的东西。",
  "Save photo": "保存照片", "No photo chosen": "未选择照片", "Photo ready to save": "照片待保存", "Remove photo": "移除照片", "Remove this photo": "移除这张照片",
  "Saving the photo.": "正在保存照片。", "Photo saved to your notes": "照片已存入笔记", "It will join your notes in a moment.": "马上就会出现在笔记里。",
  "A card was made from this photo.": "这张照片生成了一张卡片。", "No card this time. The photo and your words are safe in Notes.": "这次没生成卡片。照片和文字都好好地存在笔记里。",
  "Recognition did not finish this time. The photo and your words are safe in Notes.": "这次识别没完成。照片和文字都好好地存在笔记里。",
  "Sparkling is still reading in the background. The card will appear when it is ready.": "Sparkling 还在后台识别，卡片好了会出现。",
  "That photo did not go through.": "照片没传上去。", "That photo is too large. Keep it under 8 MB.": "照片太大了，请控制在 8 MB 以内。",
  "One photo was larger than 8 MB, so it stayed out.": "有一张照片超过 8 MB，没有加进来。", "Only image files can be added.": "只能添加图片文件。",
  "Camera access is off for this site. You can still choose a photo from your library.": "此网站的相机权限已关闭，你仍可以从相册选择照片。",
  "If your camera does not open, choose a photo from your library instead.": "如果相机打不开，可以改从相册选择照片。",
  "Photo attached to this note": "这条笔记附带的照片", "Photo from this footprint": "这条足迹的照片", "Photo from your notes": "笔记里的照片",
  "See notes": "查看笔记", "Go to Cards": "去卡片", "Saved. This looks like": "已保存。看起来像是",
  // cards
  "Everything you have kept.": "你留下的一切。", "Wall": "卡片墙", "Cards view": "卡片视图", "No cards yet.": "还没有卡片。",
  "No cards under this filter yet.": "这个筛选下还没有卡片。", "The only card under this filter so far.": "这个筛选下目前只有这一张。",
  "Show all cards": "显示全部卡片", "Look at your cards": "看看你的卡片", "Back to your cards": "回到卡片", "Back to your notes": "回到笔记",
  "Cards appear when your notes mention something Sparkling can recognise. Your notes are all still here.": "当笔记提到 Sparkling 认得的东西，卡片就会出现。你的笔记都还在。",
  "Your cards did not load. Check your connection, then try again.": "卡片没加载出来。检查网络后再试一次。",
  // card detail
  "Love this": "喜欢", "Loved": "已喜欢", "Not for me": "不是我的菜", "Use in a plan": "用来做计划", "Remove card": "移除卡片",
  "Remove this card?": "移除这张卡片？", "The card and its footprints will be removed. Your notes and photos stay in your notebook.": "卡片和它的足迹会被移除，笔记和照片仍留在笔记本里。",
  "Card removed. Your notes are still here.": "卡片已移除，笔记都还在。", "Footprints": "足迹", "No footprints yet.": "还没有足迹。",
  "No footprints yet. Write about this again and it will gather here.": "还没有足迹。再写到它时，会汇集到这里。",
  "Remove footprint": "移除足迹", "Footprint removed.": "足迹已移除。", "Not about this?": "说的不是这个？", "Not about this": "说的不是这个",
  "Not about this footprint": "这条足迹说的不是这个", "This footprint will be removed from the card. Your note stays in your notebook.": "这条足迹会从卡片上移除，笔记仍留在笔记本里。",
  "From Qloo": "来自 Qloo", "From the catalogue": "来自口味目录", "Catalogue data": "目录数据", "From your notes": "来自你的笔记", "From the sample notebook": "来自示例笔记本",
  "From your Letterboxd export": "来自你的 Letterboxd 导出", "First met": "初次相遇", "mentioned once": "提到过一次", "First watch": "初看", "Rewatch": "重看",
  "open on arrival":"到达时营业","genre":"类型","hood via":"街区来源","fit":"匹配度","Schematic route":"示意路线","Route":"路线","Why":"为什么","not to scale":"非比例尺","familiar":"熟悉","Listen": "听", "Read": "读", "Visit": "去过", "Your view changed": "你的看法变了", "A little different": "有点不一样", "Familiar": "熟悉",
  "This card did not load. Check your connection, then try again.": "卡片没加载出来。检查网络后再试一次。",
  "This card is gone.": "这张卡片不在了。", "This card is no longer here.": "这张卡片已经不在了。",
  "It may have been removed. Your notes are still here.": "它可能已被移除，你的笔记都还在。", "It may have been deleted, or the link is old.": "它可能已被删除，或者链接已过期。",
  "The card did not come back.": "卡片没能恢复。", "The card did not refresh.": "卡片没刷新成功。", "Open card": "打开卡片", "last seen": "最近一次", "Many": "很多",
  "Mark a couple of cards with a heart, then try again.": "先给几张卡片点个喜欢，再试一次。", "I need a few more things you love to plan from.": "还需要多几样你喜欢的东西，才能做计划。",
  // threads
  "Patterns across your cards.": "你卡片之间的规律。",
  "All of you": "全部的你", "Recent you": "最近的你", "Earlier you": "以前的你", "Which you": "哪个你",
  "New in recent notes": "最近新出现", "Fading from recent notes": "最近渐少", "Why this thread?": "为什么是这条线索？", "Why this stop?": "为什么是这一站？", "Your notes": "你的笔记", "Qloo evidence": "Qloo 的依据", "Per-input attribution unavailable for this stop. Qloo returned it for your cards taken together.": "这一站没有逐项归因。Qloo 是根据你的卡片整体返回的。", "Three layers, kept apart: what you wrote, what Qloo says, and what Sparkling adds.": "三层分开呈现：你写的、Qloo 说的、Sparkling 补充的。",
  "What this thread rests on. Qloo\u2019s data and your notes are shown as they are; Sparkling\u2019s own read is marked.": "这条线索的依据。Qloo 的数据和你的笔记按原样展示；Sparkling 自己的解读会单独标出。",
  "Qloo says": "Qloo 的数据", "Your words": "你的原话", "Cards that feed it": "支撑它的卡片", "Sparkling\u2019s read": "Sparkling 的解读", "Sparkling's read": "Sparkling 的解读",
  "Receipt": "调用凭据", "Seeds sent to Qloo": "发给 Qloo 的种子", "Also returned for the same cards": "同一组卡片还返回了",
  "No note quotes yet for these cards.": "这些卡片还没有可引用的笔记。", "carries the tag": "带有该标签", "in the input set": "在输入集合中",
  "None of these sit on a single card of yours. Qloo returned them for these cards taken together.": "这些标签不在你任何一张卡片上，是 Qloo 根据这组卡片整体返回的。",
  "Threads show up once a few things keep coming back.": "当有几样东西反复出现，线索就会浮现。", "Threads take a little time.": "线索需要一点时间。",
  "Your threads did not load. Check your connection, then try again.": "线索没加载出来。检查网络后再试一次。",
  // inbox
  "Did you mean": "你说的是", "Keep all guesses": "全部采纳", "All guesses kept.": "已全部采纳。", "Set aside.": "已搁置。", "Back in the pile.": "已放回。",
  "That\u2019s everything.": "都处理完了。", "No close match this time.": "这次没找到接近的匹配。", "Yes, that": "对，就是它",
  "Anything less certain will wait here when it needs you.": "拿不准的内容会在这里等你确认。",
  "Sparkling was sure about everything lately. Anything less certain will wait here.": "最近 Sparkling 都很有把握。拿不准的会在这里等你。",
  "That item is no longer here. It may have been handled already.": "这一项已经不在了，可能已经处理过。",
  "The inbox did not load. Check your connection, then try again.": "待确认没加载出来。检查网络后再试一次。", "The inbox did not refresh.": "待确认没刷新成功。",
  // plan
  "Plan an afternoon": "规划一个下午", "An afternoon, built from what you keep.": "用你留下的东西，拼出一个下午。",
  "Where would you like to spend an afternoon?": "想在哪里度过一个下午？", "Make a plan": "生成计划", "Making a plan": "正在生成计划",
  "Looking through your cards": "正在翻看你的卡片", "Try one of these": "试试这些", "Surprise me": "给我惊喜",
  "Something a little off my usual track": "稍微偏离我平时的路线", "A quiet bookstore, then somewhere to sit": "一家安静的书店，再找个地方坐坐",
  "A record shop and a slow coffee": "一家唱片店，一杯慢慢喝的咖啡", "An old cinema, then a late bite": "一家老电影院，再吃点夜宵",
  "Anything else?": "还有别的吗？", "Area": "区域", "Budget": "预算", "When": "时间", "Mood": "心情", "Somewhere": "某处",
  "Saturday afternoon": "周六下午", "Show less": "收起", "Go out": "出门", "Stay in": "在家", "Go out or stay in": "出门还是在家",
  "Picked from what you wrote": "按你写的自动选了", "Meditators": "冥想者", "Hikers": "徒步爱好者", "Musicians": "音乐人", "Arts & crafts": "手作爱好者", "Photographers": "摄影爱好者", "Lens, optional": "视角（可选）", "Could not load.": "没加载出来。", "Sparkling + Qloo": "Sparkling + 口味目录", "The catalogue returned it for your cards taken together.": "口味目录根据你的卡片整体给出。", "Stay in.": "在家，", "Why this pick?": "为什么推荐这个？", "Plan something else": "换个计划",
  "A film for tonight, from my notes": "今晚看部电影，按我的记录推荐", "An album to put on while I cook": "做饭时放一张专辑", "A book for a slow Sunday": "慢悠悠的周日读本书",
  "Press play.": "按下播放。", "One more episode.": "再看一集。", "Put it on.": "放起来。", "Turn the page.": "翻开第一页。", "Take your time.": "慢慢来。",
  "kind": "类型", "film": "电影", "tv": "剧集", "music": "音乐", "book": "书", "podcast": "播客", "mixed": "混搭",
  "Already in your cards? Left out.": "你已经有卡片的不会再推荐。", "Where to watch is not shown: the catalogue does not list it.": "不显示在哪看：口味目录里没有这项数据。", "Saved plans": "已保存的计划", "Your saved plans did not load.": "已保存的计划没加载出来。",
  "A neighbourhood is enough. GPS is optional.": "填一个街区就够了，不需要 GPS。", "Neighbourhood": "街区",
  "That plan did not come together.": "这个计划没能拼出来。", "The plan stream ended before a plan arrived.": "计划还没生成完，连接就断了。",
  "A few more things would help.": "再多几样会更好。", "A number above zero is all it needs.": "填一个大于零的数字就行。",
  "Weighing both notebooks…": "正在权衡两本笔记本…", "Could not plan for two just now.": "暂时没能为你们俩做计划。",
  // plan result
  "Your plan": "你的计划", "your plan": "你的计划", "Untitled plan": "未命名计划", "Swap": "换一个", "Shorten": "缩短", "Swapped stop": "已换掉这一站",
  "Lower budget": "降低预算", "Lower the budget": "降低预算", "New budget cap": "新的预算上限", "Plan saved.": "计划已保存。",
  "Open map": "打开地图", "How this was made": "这个计划是怎么来的", "Re-rank stops": "重新排序", "Hours not checked": "营业时间未核实",
  "That plan did not load. Check your connection, then try again.": "计划没加载出来。检查网络后再试一次。", "This plan is not there.": "这个计划不存在。",
  // settings (legacy planning form)
  "Planning": "规划", "Prefills the plan form.": "预先填入计划表单。", "Planning area": "规划区域", "Default budget": "默认预算", "Default time": "默认时间",
  "Save changes": "保存更改", "Budget needs a number above zero.": "预算需要是大于零的数字。", "Saved.": "已保存。",
  "What Sparkling sends to Qloo": "Sparkling 会发给 Qloo 什么",
  "Your notes and photos never go to Qloo. When Sparkling recognises a mention it sends only those few words to Qloo search. When you plan, it sends the IDs of a few cards and your area.": "你的笔记和照片永远不会发给 Qloo。识别提及时，只把那几个词发给 Qloo 搜索；做计划时，只发送几张卡片的 ID 和你的区域。",
  "Export everything": "导出全部", "Your notes, your photos, your cards. One file, yours to keep.": "你的笔记、照片和卡片，打包成一个文件，由你保存。",
  "Delete everything": "删除全部", "Delete everything?": "删除全部？", "Type DELETE to continue": "输入 DELETE 以继续", "Type DELETE to continue.": "输入 DELETE 以继续。",
  "This removes every note, photo, card and plan from Sparkling. It cannot be undone.": "这会从 Sparkling 删除所有笔记、照片、卡片和计划，无法撤销。",
  "Every note, photo, card and plan will be removed from Sparkling. It cannot be undone.": "所有笔记、照片、卡片和计划都会从 Sparkling 删除，无法撤销。",
  "Sample notebook": "示例笔记本", "Leave the sample": "离开示例", "Leave the sample?": "离开示例？",
  "You are looking around a made-up notebook. Leaving removes it from this device.": "你正在浏览一本虚构的笔记本。离开后它会从这台设备上移除。",
  "The made-up notebook will be removed from this device. You can start your own whenever you like.": "这本虚构的笔记本会从这台设备上移除。随时可以开始你自己的。",
  // new settings
  "Account": "账户", "Demo profile": "演示账户", "Sign out": "退出登录", "Sign out?": "退出登录？",
  "You can open this notebook again from this browser while the session lasts.": "退出后，这个浏览器将不再保持登录。笔记仍保存在服务器上。",
  "Notifications": "通知", "Language": "语言", "Appearance": "外观", "Text size": "文字大小", "Planning defaults": "规划默认值",
  "Data": "数据", "Import from Letterboxd": "从 Letterboxd 导入", "Export notes": "导出笔记", "Export as JSON": "导出为 JSON",
  "Export as Markdown": "导出为 Markdown", "Delete all data": "删除所有数据", "Delete all data?": "删除所有数据？",
  "Every note, photo, card and plan will be deleted from Sparkling. This cannot be undone.": "所有笔记、照片、卡片和计划都将从 Sparkling 删除，此操作无法撤销。",
  "Delete All Data": "删除所有数据", "About": "关于", "Version": "版本", "License": "许可证", "Source code": "源代码",
  "How Sparkling uses Qloo": "Sparkling 如何使用 Qloo", "System": "跟随系统", "Light": "浅色", "Paper": "纸张",
  "Small": "小", "Default": "默认", "Large": "大", "English": "English", "简体中文": "简体中文",
  "Qloo names, tags and your own notes are never translated.": "Qloo 的作品名、标签和你自己的笔记不会被翻译。",
  "System follows your device: Paper by day, dark at night if your device is set to dark.": "跟随系统：设备为浅色时使用纸张色，设为深色时切换为深色。",
  "Applies to notes, cards and sheets.": "作用于笔记、卡片和弹出面板。",
  "Allow Notifications": "允许通知", "Your letter is ready": "你的月度信已写好", "Plan reminder": "计划提醒", "Inbox needs you": "待确认需要你",
  "Import finished": "导入完成", "Quiet hours": "勿扰时段", "From": "开始", "To": "结束", "Remind at": "提醒时间",
  "Once a month, when your taste letter is written.": "每月一次，你的品味月信写好时通知你。",
  "The day before a saved outing.": "已保存的出行前一天提醒你。",
  "A weekly digest of items Sparkling was unsure about.": "每周汇总一次 Sparkling 拿不准的条目。",
  "When a Letterboxd import is done reading.": "Letterboxd 导入读取完成时通知你。",
  "Notifications wait until quiet hours end.": "勿扰时段内的通知会推迟到结束后再发。",
  "Sparkling never sends recommendation pushes. You only hear from it about things you started.": "Sparkling 不推送任何推荐。只有你自己开始的事情，它才会通知你。",
  "Notifications are off for this site": "此网站的通知已关闭",
  "Your browser blocked notifications for Sparkling. To turn them on, open your browser's site settings for this page and allow Notifications, then come back.": "浏览器已阻止 Sparkling 的通知。要开启，请在浏览器的网站设置中允许此页面的通知，然后回到这里。",
  "This browser cannot show notifications": "此浏览器无法显示通知",
  "On iPhone, add Sparkling to your Home Screen first, then open it from there.": "在 iPhone 上，请先把 Sparkling 添加到主屏幕，再从主屏幕打开。",
  "Notifications are on": "通知已开启", "Sparkling will only tell you about things you started.": "Sparkling 只会告诉你你自己开始的事情。",
  "Not now": "暂不", "On": "", "around": "在", "under $": "预算 $",
  "again": "再次提到", "new card": "新卡片", "Take a look": "看一眼", "Inbox": "收件箱", "Take a photo": "拍照", "Choose from library": "从相册选择",
  "· Qloo reads these across the cards you return to most, not from any single one.": "· 这是 Qloo 从你最常回到的那几张卡片整体读出的，不来自任何单独一张。",
  "Exports include every note and card. Deleting removes your notebook from the server.": "导出包含所有笔记和卡片。删除会把你的笔记本从服务器上移除。",
  "Open-source hackathon build for the Qloo Taste AI challenge.": "为 Qloo Taste AI 挑战赛打造的开源黑客松版本。",
  "What goes to Qloo": "会发给 Qloo 的内容", "What never goes to Qloo": "绝不会发给 Qloo 的内容", "What comes back": "Qloo 返回什么",
  "The few words that name a film, book, album or place, so Qloo search can match them to a catalogue entity.": "指代某部电影、书、专辑或地点的那几个词，用来在 Qloo 目录中匹配对应条目。",
  "When you plan: the IDs of a few cards and the area you typed.": "做计划时：几张卡片的 ID 和你填写的区域。",
  "Your notes, your photos, your name and your location history.": "你的笔记、照片、名字和位置历史。",
  "Catalogue entities with their tags, Insights for Threads (tags shared across your cards) and venues near your area for Plan. Sparkling shows Qloo data as it is and marks its own read.": "带标签的目录条目；线索用的 Insights（你卡片之间共有的标签）；以及计划所需的你附近的场所。Sparkling 按原样展示 Qloo 数据，并单独标出自己的解读。",
  "Every thread and plan has a receipt with the exact Qloo calls behind it.": "每条线索和每个计划都附有调用凭据，列出背后具体的 Qloo 请求。",
  "vibe": "氛围", "trait": "特质", "theme": "主题", "genre": "类型", "keyword": "关键词", "category": "类别", "audience": "受众", "style": "风格", "award": "奖项", "platform": "平台",
  "Catalogue noticed": "口味目录注意到", "for your cards together": "针对你的整组卡片", "on your cards": "在你的卡片上", "Close behind": "紧随其后", "In your words": "你的原话",
  "Cards it grew from": "它从这些卡片长出来", "Also": "还有", "No tags came back.": "没有返回标签。",
  "What it rests on: Qloo\u2019s data and your own notes, shown as they are. Sparkling\u2019s own read sits apart.": "它的依据：Qloo 的数据和你自己的笔记，原样呈现。Sparkling 自己的解读单独放在一边。",
  "Qloo tags": "Qloo 标签", "Listed on": "标注在",
  "Saved on this device only.": "仅保存在本设备。",
  "Sparkling was sure about everything lately.": "最近 Sparkling 都很有把握。",
  "Sparkling never guesses silently.": "Sparkling 从不悄悄替你猜。",
  "When a name could mean two things, like Margaret (a singer and a 2011 film), it waits here for you to pick.": "当一个名字可能指两样东西时，比如 Margaret（一位歌手和一部 2011 年的电影），它会在这里等你来选。",
};

const NUM_ZH = { zero:"零", one:"一", two:"两", three:"三", four:"四", five:"五", six:"六", seven:"七", eight:"八", nine:"九", ten:"十", eleven:"十一", twelve:"十二", many:"很多" };
const DAY_ZH = { Sunday:"周日", Monday:"周一", Tuesday:"周二", Wednesday:"周三", Thursday:"周四", Friday:"周五", Saturday:"周六", Sun:"周日", Mon:"周一", Tue:"周二", Wed:"周三", Thu:"周四", Fri:"周五", Sat:"周六" };
const MON_IDX = { Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6, Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12 };
function zhNum(w){ const k = String(w).toLowerCase(); return NUM_ZH[k] || w; }
const ZH_PATTERNS = [
  [/^(.+?) with a (.+?) feel, per Qloo\.$/, function(m, k, v){ return "Qloo 说这是一家" + v + "气质的" + k + "。"; }],
  [/^(.+?), tagged (.+?), a fit for your note on (.+)\.$/, function(m, k, v, n){ return k + "，Qloo 标签：" + v.replace(" and ", "、") + "；和你写" + n + "的那条笔记相合。"; }],
  [/^(.+?), a fit for your note on (.+)\.$/, function(m, k, n){ return k + "，和你写" + n + "的那条笔记相合。"; }],
  [/^(.+?), tagged (.+?) by Qloo\.$/, function(m, k, v){ return k + "，Qloo 标签：" + v.replace(" and ", "、") + "。"; }],
  [/^(.+?) that Qloo ranked close to your taste\.$/, function(m, k){ return "Qloo 认为和你品味相近的" + k + "。"; }],
  [/^(.+?) picked by Qloo for your taste\.$/, function(m, k){ return "Qloo 按你的品味挑的" + k + "。"; }],
  [/^(.+?) with a (.+?) feel$/, function(m, k, v){ return v + "气质的" + k; }],
  [/^(\w+day)\. (\w+) things came back to you this week\.$/, function(m, d, n){ return (DAY_ZH[d] || d) + "。这周有" + zhNum(n) + "样东西又回到了你身边。"; }],
  [/^(\w+day)\. One thing came back to you this week\.$/, function(m, d){ return (DAY_ZH[d] || d) + "。这周有一样东西又回到了你身边。"; }],
  [/^(\w+day)\. (\w+) notes joined your notebook this week\.$/, function(m, d, n){ return (DAY_ZH[d] || d) + "。这周笔记本里多了" + zhNum(n) + "条笔记。"; }],
  [/^(\w+day)\. One note joined your notebook this week\.$/, function(m, d){ return (DAY_ZH[d] || d) + "。这周笔记本里多了一条笔记。"; }],
  [/^(\w+day)\. A few things are here when you want them\.$/, function(m, d){ return (DAY_ZH[d] || d) + "。有几样东西在这里，等你想看的时候。"; }],
  [/^(\w+day)\. A quiet page, ready when you are\.$/, function(m, d){ return (DAY_ZH[d] || d) + "。安静的一页，等你落笔。"; }],
  [/^(\w+day)\. Your notebook is here\.$/, function(m, d){ return (DAY_ZH[d] || d) + "。你的笔记本在这里。"; }],
  [/^Inbox, (\d+) waiting$/, function(m, n){ return "待确认，" + n + " 项"; }],
  [/^(\d+) cards?$/, function(m, n){ return n + " 张卡片"; }],
  [/^(\d+) footprints?$/, function(m, n){ return n + " 条足迹"; }],
  [/^(\d+) photos?$/, function(m, n){ return n + " 张照片"; }],
  [/^Save (\d+) photos$/, function(m, n){ return "保存 " + n + " 张照片"; }],
  [/^(\d+) notes?$/, function(m, n){ return n + " 条笔记"; }],
  [/^(\d+) stops?$/, function(m, n){ return n + " 站"; }],
  [/^(\d+) stops? · Saved$/, function(m, n){ return n + " 站 · 已保存"; }],
  [/^(\d+) times? since$/, function(m, n){ return "此后 " + n + " 次"; }],
  [/^(\d+) photos? did not go through\. Try again below\.$/, function(m, n){ return n + " 张照片没传上去，在下方重试。"; }],
  [/^(\d+) waiting$/, function(m, n){ return n + " 项待确认"; }],
  [/^carries the tag · (\d+) notes?$/, function(m, n){ return "带有该标签 · " + n + " 条笔记"; }],
  [/^in the input set · (\d+) notes?$/, function(m, n){ return "在输入集合中 · " + n + " 条笔记"; }],
  [/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/, function(m, d){ return DAY_ZH[d]; }],
  [/^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)( \d{4})?$/, function(m, d, mo, y){ return (y ? y.trim() + "年" : "") + MON_IDX[mo] + "月" + d + "日"; }],
  [/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})$/, function(m, mo, y){ return y + "年" + MON_IDX[mo] + "月"; }],
  [/^(\u00b7 )?Shows up in (.+) you keep returning to\.$/, function(m, dot, list){
    const kw = { "a film": "电影", "a show": "剧集", "an artist": "音乐人", "a book": "书", "a place": "地点", "something": "作品" };
    const parts = list.split(/, | and /).map(function(x){ return kw[x] || x; });
    return (dot || "") + "出现在你反复回到的" + parts.join("、") + "里。"; }],
  [/^(\u00b7 )?(?:Qloo reads this across|Read across) the cards you return to most\.$/, function(m, dot){ return (dot || "") + "这是从你最常回到的那些卡片整体读出的。"; }],
  [/^(.+)\. (Film|TV|Music|Book|Place|Other)( \u00b7 \d{4})?\. (\d+) footprints?$/, function(m, name, ty, yr, n){ return name + "。" + ZH[ty] + (yr || "") + "。" + n + " 条足迹"; }],
  [/^(.+), (\d+) footprints?$/, function(m, name, n){ return name + "，" + n + " 条足迹"; }],
  [/^(\d+) of (\d+)$/, function(m, a, b){ return "第 " + a + " 项，共 " + b + " 项"; }],
  [/^mentioned (\d+) times$/, function(m){ return "提到过 " + m[1] + " 次"; }],
  [/^First met (.+)$/, function(m, w){ return "初次相遇 " + trZh(w); }],
  [/^last (\d{1,2} \w{3}( \d{4})?|today|yesterday|\w{3})$/, function(m, w){ return "最近 " + trZh(w); }],
  [/^by (.+)$/, function(m, w){ return w; }],
  [/^last seen (.+)$/, function(m, w){ return "最近一次 " + trZh(w); }],
  [/^today$/, function(){ return "今天"; }], [/^yesterday$/, function(){ return "昨天"; }],
  [/^An afternoon around (.+)$/, function(m, a){ return a + "的一个下午"; }],
  [/^Why \u201c(.+)\u201d\?$/, function(m, x){ return "为什么是\u201c" + x + "\u201d？"; }],
  [/^(?:Qloo lists|Listed) (.+) \u00b7 not live-checked$/, function(m, x){ return "标注营业时间 " + x + " · 未实时核实"; }],
  [/^Photo (\d+)$/, function(m, n){ return "照片 " + n; }], [/^Show photo (\d+)$/, function(m, n){ return "显示照片 " + n; }],
  [/^under \$(\d+)$/, function(m, n){ return n + " 美元以内"; }],
  [/^\+ (\d+) more from your notes$/, function(m, n){ return "还有 " + n + " 条来自你的笔记"; }],
];
