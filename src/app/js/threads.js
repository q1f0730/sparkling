/* ---------------------------------------------------------------------------
   Threads
   --------------------------------------------------------------------------- */

/* ---- monthly taste letter ---- */
function renderLetter(){
  const token = beginView();
  setShell({ title: "Letter", tabs: true, active: "cards" });
  view.innerHTML =
    '<div class="cards-head"><div class="segmented" role="group" aria-label="Cards view">' +
      '<button class="seg-btn" type="button" aria-pressed="false" data-nav="#/cards">Wall</button>' +
      '<button class="seg-btn" type="button" aria-pressed="false" data-nav="#/threads">Threads</button>' +
      '<button class="seg-btn" type="button" aria-pressed="true">Letter</button></div></div>' +
    '<div data-letter><div class="skeleton sk-card tall"></div></div>';
  const el = view.querySelector("[data-letter]");
  api("/api/letter" + (/^zh/i.test(document.documentElement.lang||"") ? "?lang=zh" : "")).then(function(d){
    if (!isCurrent(token)) return;
    const L = d && d.letter;
    if (!L) { el.innerHTML = '<div class="empty"><h2>No letter yet</h2><p>' + esc((d && d.reason) || "Your first letter arrives once a few notes have turned into cards.") + "</p></div>"; return; }
    const thumbs = function(list){ return list.map(function(c){ return '<button class="letter-thumb" type="button" data-nav="#/cards/' + encodeURIComponent(c.id) + '">' + (c.image ? '<img alt="" src="' + attr(c.image) + '">' : '<span class="ph"></span>') + '<span translate="no">' + esc(c.name) + "</span></button>"; }).join(""); };
    el.innerHTML =
      '<article class="letter">' +
        '<section class="tcard" aria-label="Taste card"><p class="tcard-k">Q1f730 · Sparkling · ' + esc(L.month) + '</p><div class="tcard-posters">' + ((function(a){var seen={};return a.filter(function(c){var k=c.id,m=c.image||'';if(seen[k]||(m&&seen['i'+m]))return false;seen[k]=1;if(m)seen['i'+m]=1;return true;});})(L.returns.length ? L.returns.concat(L.new) : L.new).slice(0,4).map(function(c){ return c.image ? '<img alt="" src="' + attr(c.image) + '">' : '<span class="ph"></span>'; }).join("")) + '</div><p class="tcard-t">' + (L.themes.length ? L.themes.map(function(t){ return esc(t.name); }).join(" · ") : esc(L.touched + " things touched")) + '</p><p class="tcard-f">' + L.touched + ' cards touched · built on Qloo taste data</p><button class="btn" type="button" data-tshare>Share taste card</button></section>' +
        '<p class="letter-kicker">Your taste letter</p><h1 class="letter-title">' + esc(L.month) + '</h1>' +
        '<p class="letter-stats"><b>' + L.new_cards + '</b> new cards · <b>' + L.touched + '</b> touched</p>' +
        L.paragraphs.map(function(t){ return '<p class="letter-p">' + esc(t) + "</p>"; }).join("") +
        (L.returns.length ? '<h3 class="letter-h">You kept going back to</h3><div class="letter-row">' + thumbs(L.returns) + "</div>" : "") +
        ((L.places||[]).length ? '<h3 class="letter-h">' + (LANG === "zh" ? "你地图上的地点" : "Places on your map") + '</h3><div class="letter-row">' + thumbs(L.places) + "</div>" : "") +
        (L.drift ? '<h3 class="letter-h">' + (LANG === "zh" ? "口味漂移" : "Taste drift") + '</h3><p class="letter-p">' + (LANG === "zh" ? "本月新卡片偏向：" : "This month's new cards lean toward: ") + esc((L.drift.now||[]).join(", ") || "—") + (LANG === "zh" ? "。之前的卡片偏向：" : ". Your earlier cards leaned toward: ") + esc((L.drift.before||[]).join(", ") || "—") + '.</p><p class="letter-receipt">' + (LANG === "zh" ? "以本月初为界（Sparkling 自己的划分），由目录对两组卡片的比较得出。" : "Split at the start of the month (Sparkling's own cut), compared by the taste catalogue.") + '</p>' : "") +
        (L.new.length ? '<h3 class="letter-h">New this month</h3><div class="letter-row">' + thumbs(L.new) + "</div>" : "") +
        (L.your_words.length ? '<h3 class="letter-h">In your own words</h3>' + L.your_words.map(function(w){ return '<blockquote class="letter-q">' + esc(w.text) + '<cite translate="no">' + (LANG === "zh" ? "关于 " : "about ") + esc(w.card) + "</cite></blockquote>"; }).join("") : "") +
        '<p class="letter-receipt">' + esc(L.receipt) + "</p>" +
      "</article>";
    var sb = el.querySelector("[data-tshare]");
    if (sb) sb.addEventListener("click", function(){
      var t = "My taste in " + L.month + ": " + (L.themes.map(function(x){return x.name;}).join(", ") || (L.touched + " things")) + " \u2014 Sparkling";
      var list = (L.returns.length ? L.returns.concat(L.new) : L.new).filter(function(c,i,a){return a.findIndex(function(d){return d.id===c.id;})===i;}).slice(0,4);
      var loadImg = function(u){ return new Promise(function(res){ if(!u) return res(null); var im=new Image(); im.crossOrigin="anonymous"; im.onload=function(){res(im);}; im.onerror=function(){res(null);}; im.src=u; setTimeout(function(){res(null);},4000); }); };
      Promise.all(list.map(function(c){ return loadImg(c.image); })).then(function(imgs){
        var W=1080,H=1350,cv=document.createElement("canvas"); cv.width=W; cv.height=H; var g=cv.getContext("2d");
        g.fillStyle="#efe7d6"; g.fillRect(0,0,W,H);
        g.fillStyle="#3a3126"; g.font="500 34px 'DM Mono', monospace"; g.fillText("Q1f730 \u00b7 Sparkling \u00b7 "+L.month,70,110);
        var pw=222,gap=14,x0=70;
        list.forEach(function(c,i){ var x=x0+i*(pw+gap),y=170,h=333; g.fillStyle="#d9cdb4"; g.fillRect(x,y,pw,h); if(imgs[i]){ try{ g.drawImage(imgs[i],x,y,pw,h);}catch(e){} } else { g.fillStyle="#3a3126"; g.font="600 26px Figtree, sans-serif"; var w=c.name.split(" "),ly=y+60,ln=""; w.forEach(function(wd){ if(g.measureText(ln+wd).width>pw-30){g.fillText(ln,x+16,ly);ly+=32;ln="";} ln+=wd+" "; }); g.fillText(ln,x+16,ly);} });
        var themes=(L.themes.length?L.themes.map(function(x){return x.name;}):[L.touched+" things touched"]).join(" \u00b7 ");
        g.fillStyle="#3a3126"; g.font="600 76px Fraunces, Georgia, serif";
        var words=themes.split(" "),ly=640,ln="";
        words.forEach(function(wd){ if(g.measureText(ln+wd).width>940){g.fillText(ln,70,ly);ly+=92;ln="";} ln+=wd+" "; }); g.fillText(ln,70,ly);
        g.font="400 36px Figtree, sans-serif"; g.fillStyle="#6b5d49";
        g.fillText(L.touched+" cards touched \u00b7 "+L.new_cards+" new",70,ly+90);
        g.fillText(list.map(function(c){return c.name;}).join(" \u00b7 ").slice(0,60),70,ly+150);
        g.font="400 28px 'DM Mono', monospace"; g.fillText("Built on Qloo taste data \u00b7 sparkling",70,H-80);
        cv.toBlob(function(b){
          if(!b){ if(navigator.clipboard) navigator.clipboard.writeText(t); return; }
          var f=new File([b],"sparkling-taste-card.png",{type:"image/png"});
          if(navigator.canShare && navigator.canShare({files:[f]})) navigator.share({files:[f],title:"My taste card",text:t}).catch(function(){});
          else { var a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download="sparkling-taste-card.png"; document.body.appendChild(a); a.click(); a.remove(); toast("Taste card saved as an image"); }
        },"image/png");
      });
    });
  }).catch(function(){ el.innerHTML = '<div class="empty"><p>The letter did not load. Check your connection, then try again.</p></div>'; });
}

function renderThreads(){
  const token = beginView();
  setShell({ title: "Threads", tabs: true, active: "cards" });
  const ac = abortable();
  let period = "all";
  let current = [];
  let lastData = null;

  view.innerHTML =
    '<div class="cards-head">' +
      '<div class="segmented" role="group" aria-label="Cards view">' +
        '<button class="seg-btn" type="button" aria-pressed="false" data-nav="#/cards">Wall</button>' +
        '<button class="seg-btn" type="button" aria-pressed="true">Threads</button>' +
        '<button class="seg-btn" type="button" aria-pressed="false" data-nav="#/letter">Letter</button>' +
      "</div>" +
      '<p class="sub">Patterns across your cards.</p>' +
      '<div class="mood-row period-row" role="group" aria-label="Which you">' +
        [["all","All of you"],["now","Recent you"],["then","Earlier you"]].map(function(x){return '<button class="mood" type="button" data-tperiod="'+x[0]+'" aria-pressed="'+(x[0]===period?"true":"false")+'">'+x[1]+'</button>';}).join("") +
      "</div>" +
      '<p class="period-note" data-period-note></p>' +
    "</div>" +
    '<div data-threads>' +
      '<div class="skeleton sk-card tall"></div>' +
      '<div class="skeleton sk-card"></div>' +
    "</div>";

  const threadsEl = view.querySelector("[data-threads]");
  const noteEl = view.querySelector("[data-period-note]");
  let loadSeq = 0;

  function shiftPill(shift){
    if (!shift) return "";
    const cls = shift === "New in recent notes" ? "new" : shift === "Fading from recent notes" ? "fading" : "steady";
    return '<span class="shift-pill ' + cls + '">' + esc(shift) + "</span>";
  }
  function threadNames(thread){
    const q = Array.isArray(thread.qloo_tags) ? thread.qloo_tags.map(function(x){ return x && x.name; }).filter(Boolean) : [];
    const parts = String(thread.tag || "").split(" · ").filter(Boolean);
    return (parts.length > 1 ? parts : (q.length ? q.slice(0, 1) : parts)).slice(0, 3).map(tagPretty);
  }
  /* "Sensitive, vulnerability and intimacy" (B): middle word italic clay; zh keeps names joined by · */
  function threadTitleHTML(thread){
    const n = threadNames(thread);
    if (n.length < 2) return esc(tagZh(n[0] || thread.tag || ""));
    if (LANG === "zh") return n.map(function(x, i){ x = tagZh(x); return i === 1 ? "<em>" + esc(x) + "</em>" : esc(x); }).join(" · ");
    const low = function(x){ return /^[A-Z][a-z]/.test(x) ? x.charAt(0).toLowerCase() + x.slice(1) : x; };
    if (n.length === 2) return esc(n[0]) + " and <em>" + esc(low(n[1])) + "</em>";
    return esc(n[0]) + ", <em>" + esc(low(n[1])) + "</em> and " + esc(low(n[2]));
  }
  function threadHTML(thread, i){
    const cards = Array.isArray(thread.cards) ? thread.cards : [];
    cards.forEach(function(c){ if (c && c.name) (window.SP_NAMES = window.SP_NAMES || {})[c.name] = 1; });
    const chips = cards.map(function(card){
      const count = Number(card.footprints) || 0;
      const label = card.name + (count ? ", " + count + " " + plural(count, "footprint", "footprints") : "");
      return '<button class="thread-chip type-' + attr(card.type || "other") + '" type="button" data-nav="#/cards/' + encodeURIComponent(card.id) + '" aria-label="' + attr(label) + '">' +
        '<span translate="no">' + esc(card.name) + "</span>" + (count ? '<span class="count">' + count + "</span>" : "") +
      "</button>";
    }).join("");
    return '<article class="thread">' +
      '<div class="thread-top"><span class="from-qloo">From the catalogue</span>' + shiftPill(thread.shift) + "</div>" +
      '<h2 class="thread-title" translate="no">' + threadTitleHTML(thread) + "</h2>" +
      '<span class="thread-evidence-label">From your notes</span>' +
      '<div class="thread-chips">' + chips + "</div>" +
      (thread.read ? '<p class="thread-read"><span class="label">Sparkling’s read</span>' + esc(thread.read) + "</p>" : "") +
      '<button class="why-btn" type="button" data-why="' + i + '">Why this thread?</button>' +
    "</article>";
  }
  function whyHTML(t){
    const tags = Array.isArray(t.qloo_tags) ? t.qloo_tags : [];
    const cards = Array.isArray(t.cards) ? t.cards : [];
    cards.forEach(function(c){ if (c && c.name) (window.SP_NAMES = window.SP_NAMES || {})[c.name] = 1; });
    const words = Array.isArray(t.your_words) ? t.your_words : (t.your_words ? [t.your_words] : []);
    const rc = t.receipt || {};
    const typeOf = {}; cards.forEach(function(c){ typeOf[c.name] = c.type || "other"; });
    const listedAll = [];
    tags.forEach(function(q){ (Array.isArray(q.listed_on) ? q.listed_on : []).forEach(function(n){ if (listedAll.indexOf(n) < 0) listedAll.push(n); }); });
    const top = tags.slice(0, 3), rest = tags.slice(3);
    const qlooCard = '<section class="bcard"><div class="blabel"><i></i><span>Catalogue noticed</span><small>' + (listedAll.length ? "on your cards" : "for your cards together") + "</small></div>" +
      (top.length ? '<div class="seeds">' + top.map(function(q, i){ var sat = function(x){ return x && (Number(x.affinity) >= 0.995 || (x.affinity == null && Number(x.score) >= 0.995)); }; return seedHTML(sat(q) ? Object.assign({}, q, { affinity: null, score: null }) : q, "s" + (i + 1)); }).join("") + "</div>" : '<p class="why-line">No tags came back.</p>') +
      (rest.length ? '<div class="seeds-h">Close behind</div><div class="seeds">' + rest.map(function(q){ return seedHTML(q, "sm"); }).join("") + "</div>" : "") +
      (listedAll.length ? '<p class="why-line">Listed on <span translate="no">' + esc(listedAll.join(", ")) + "</span></p>" : '<p class="why-line">None of these sit on a single card of yours. Qloo returned them for these cards taken together.</p>') +
    "</section>";
    const wordRows = words.length ? words.map(function(w){
      return '<div class="why-q"><p translate="no">“' + esc(w.text) + '”</p><div class="m">' +
        (w.card ? '<span class="ent type-' + attr(typeOf[w.card] || "other") + '" translate="no">' + esc(w.card) + "</span>" : "") +
        "<span>" + esc(formatDate(w.at)) + "</span></div></div>";
    }).join("") : '<p class="why-line">No note quotes yet for these cards.</p>';
    const wordsCard = '<section class="bcard"><div class="blabel"><i class="clay"></i><span>In your words</span><small>' + esc(words.length + " " + plural(words.length, "note", "notes")) + "</small></div>" + wordRows + "</section>";
    const shown = cards.slice(0, 4), more = cards.slice(4);
    const feed = shown.map(function(c){
      const n = Number(c.footprints) || 0;
      return '<button type="button" class="why-f type-' + attr(c.type || "other") + '" data-close-nav="#/cards/' + encodeURIComponent(c.id) + '">' +
        '<b translate="no">' + esc(c.name) + "</b><span>" + esc(n + " " + plural(n, "note", "notes")) + "</span></button>";
    }).join("");
    const cardsCard = '<section class="bcard"><div class="blabel"><i class="butter"></i><span>Cards it grew from</span><small>' + esc(cards.length + " " + plural(cards.length, "card", "cards")) + "</small></div>" +
      '<div class="why-feed">' + feed + "</div>" +
      (more.length ? '<p class="why-line"><span>Also</span> <span translate="no">' + esc(more.map(function(c){ return c.name; }).join(", ")) + "</span></p>" : "") +
    "</section>";
    const basedOn = String((lastData && lastData.shift && lastData.shift.based_on) || "");
    const readCard = '<section class="bcard bread"><div class="blabel"><span>Sparkling’s read</span></div>' +
      (t.read ? "<p>" + esc(t.read) + "</p>" : "") +
      (t.shift && basedOn ? "<p>" + esc(t.shift) + ": comparing the catalogue tags on your " + esc(basedOn) + " most recent cards against the " + esc(basedOn) + " before them.</p>" : "") +
    "</section>";
    const ents = Array.isArray(rc["signal.interests.entities"]) ? rc["signal.interests.entities"] : [];
    const receipt =
      '<div class="why-receipt" translate="no">' +
        "<div>GET " + esc(rc.endpoint || "/v2/insights") + " · filter.type=" + esc(rc["filter.type"] || "urn:tag") + "</div>" +
        "<div>signal.interests.entities = " + ents.length + "</div>" +
        ents.map(function(e){ return '<div class="ind">' + esc(String(e.qloo_id || e).slice(0, 8)) + "…" + (e.name ? ' <span class="why-faint">' + esc(e.name) + "</span>" : "") + "</div>"; }).join("") +
        (Array.isArray(rc.tag_ids) && rc.tag_ids.length ? rc.tag_ids.map(function(id, i){ return '<div class="' + (i ? "ind" : "") + '">' + (i ? "" : "→ ") + esc(id) + "</div>"; }).join("") : "") +
      "</div>";
    return '<span tabindex="-1" data-autofocus class="why-focus"></span>' +
      '<h3 class="why-h1" translate="no">' + threadTitleHTML(t) + "</h3>" +
      '<p class="why-intro">What it rests on: Qloo’s data and your own notes, shown as they are. Sparkling’s own read sits apart.</p>' +
      qlooCard + wordsCard + cardsCard + readCard +
      '<details class="why-details"><summary>Receipt</summary>' + receipt + "</details>";
  }
  function openWhy(i){
    const t = current[i];
    if (!t) return;
    openSheet({ title: "Why this thread?", cls: "why-sheet", body: whyHTML(t), onMount: function(m){
      m.querySelectorAll("[data-close-nav]").forEach(function(btn){
        btn.addEventListener("click", function(){ const h = btn.getAttribute("data-close-nav"); closeModal(); location.hash = h; });
      });
    }});
  }
  function emptyHTML(reason){
    return emptyBlock(
      "Threads take a little time.",
      reason || "Threads show up once a few things keep coming back.",
      '<button class="btn btn-sm" type="button" data-nav="#/cards">Look at your cards</button>'
    );
  }
  function setNote(data){
    if (!noteEl) return;
    const sh = data && data.shift;
    if (period === "all" || !sh || !sh.based_on) { noteEl.textContent = period === "all" ? t("Everything you have kept.") : ""; return; }
    const names = period === "now" ? sh.now_cards : sh.then_cards;
    noteEl.textContent = (period === "now" ? "Your " + sh.based_on + " most recent cards: " : "The " + sh.based_on + " cards before your recent ones: ") + (names || []).join(", ") + ".";
  }
  async function load(){
    const seq = ++loadSeq;
    if (threadsEl) threadsEl.innerHTML = '<div class="skeleton sk-card tall"></div><div class="skeleton sk-card"></div>';
    try {
      const data = await api("/api/threads" + (period === "all" ? "" : "?period=" + period), { signal: ac.signal });
      if (!isCurrent(token) || seq !== loadSeq) return;
      lastData = data;
      setNote(data);
      const threads = Array.isArray(data && data.threads) ? data.threads : [];
      current = threads;
      if (!threads.length) {
        threadsEl.innerHTML = emptyHTML(data && data.reason);
        return;
      }
      threadsEl.innerHTML = threads.map(threadHTML).join("");
    } catch (e) {
      if (!isCurrent(token) || seq !== loadSeq || isAbort(e)) return;
      threadsEl.innerHTML = errorBlock("Your threads did not load. Check your connection, then try again.", "threads");
    }
  }
  on(view, "click", function(e){
    const pb = e.target.closest("[data-tperiod]");
    if (pb) {
      period = pb.getAttribute("data-tperiod");
      view.querySelectorAll("[data-tperiod]").forEach(function(b){ b.setAttribute("aria-pressed", b === pb ? "true" : "false"); });
      load();
      return;
    }
    const wb = e.target.closest("[data-why]");
    if (wb) openWhy(Number(wb.getAttribute("data-why")));
  });

  bindRetries({ threads: load });
  load();
}

