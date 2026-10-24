"""Desktop pass: idempotent patches to src/app.html. Run under .lock:  python3 tools/desk_apply.py
1) Plan result side map: tall labelled map whose pins open "Why this stop" (replaces the map + duplicate stop list).
2) parts/desk_i18n.js spliced before function trZh (zh strings for the desktop shell + leftover English on these screens).
tools/desk_shots.py --local imports patch() to preview without writing the file."""
import os, re
R = "/workspace/work/sparkling/"

SIDE_NEW = r'''  function sideHTML(stops, plan){
    if (!stops.length) return "";
    /* desk:side-map — tall labelled route for the desktop inspector; pins open Why this stop */
    const pts = stops.map(function(s){ return s && s.coords && isFinite(s.coords.lat) && isFinite(s.coords.lon) ? s.coords : null; });
    let map = "";
    if (pts.length >= 2 && !pts.some(function(x){ return !x; })) {
      const lat0 = pts.reduce(function(a, p){ return a + p.lat; }, 0) / pts.length, kx = Math.cos(lat0 * Math.PI / 180);
      const xs = pts.map(function(p){ return p.lon * kx; }), ys = pts.map(function(p){ return -p.lat; });
      const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
      const W = 380, H = 620, px = 96, py = 70;
      const sc = Math.min((W - 2 * px) / Math.max(maxX - minX, 1e-6), (H - 2 * py) / Math.max(maxY - minY, 1e-6));
      const ox = (W - sc * (maxX - minX)) / 2, oy = (H - sc * (maxY - minY)) / 2;
      const P = pts.map(function(_, i){ return [ox + sc * (xs[i] - minX), oy + sc * (ys[i] - minY)]; });
      let grid = "";
      for (let g = 1; g < 6; g++) grid += '<line x1="' + (g * W / 6).toFixed(1) + '" y1="0" x2="' + (g * W / 6).toFixed(1) + '" y2="' + H + '"/>';
      for (let g = 1; g < 10; g++) grid += '<line x1="0" y1="' + (g * H / 10).toFixed(1) + '" x2="' + W + '" y2="' + (g * H / 10).toFixed(1) + '"/>';
      const short = function(s){ s = String(s || ""); return s.length > 22 ? s.slice(0, 21) + "\u2026" : s; };
      map = '<figure class="route-map route-map-side" role="img" aria-label="' + attr(t("Route between the stops, schematic")) + '">' +
        '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet"><g class="rm-grid">' + grid + "</g>" +
        '<polyline class="rm-path" points="' + P.map(function(q){ return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join(" ") + '"/>' +
        P.map(function(q, i){
          const right = q[0] < W * 0.55, lx = right ? q[0] + 20 : q[0] - 20, anchor = right ? "start" : "end", st = stops[i] || {};
          return '<g class="rm-pin" data-why-stop="' + i + '"><circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="13"/>' +
            '<text x="' + q[0].toFixed(1) + '" y="' + (q[1] + 4.5).toFixed(1) + '" text-anchor="middle">' + (i + 1) + "</text>" +
            '<text class="rm-label" translate="no" x="' + lx.toFixed(1) + '" y="' + (q[1] - 1).toFixed(1) + '" text-anchor="' + anchor + '">' + esc(short(st.name)) + "</text>" +
            '<text class="rm-sub" x="' + lx.toFixed(1) + '" y="' + (q[1] + 13).toFixed(1) + '" text-anchor="' + anchor + '">' + esc(String(st.arrive || "")) + "</text></g>";
        }).join("") +
        "</svg><figcaption>" + t("Schematic route") + " &middot; " + t("not to scale") + "</figcaption></figure>";
    }
    const legs = stops.map(function(st, i){
      const m = i > 0 && st && st.distance ? String(st.distance).match(/(\d+)\s*min/) : null;
      return m ? "<li>" + i + " \u2192 " + (i + 1) + " \u00b7 " + esc(LANG === "zh" ? m[1] + " 分钟步行" : m[1] + " min walk") + "</li>" : "";
    }).join("");
    return '<aside class="plan-side" aria-label="' + attr(t("Route")) + '"><p class="ps-eyebrow">' + esc(t("Route")) + "</p>" + map +
      (legs ? '<ul class="ps-legs">' + legs + "</ul>" : "") + "</aside>";
  }
'''

def patch(s):
    # 1) side map
    a = s.index("  function sideHTML(stops, plan){")
    b = s.index("  function planSummary(stops){", a)
    s = s[:a] + SIDE_NEW + s[b:]
    # 2) i18n block
    p = R + "parts/desk_i18n.js"
    if os.path.exists(p):
        js = open(p).read(); B, E = "/* desk-i18n:begin */", "/* desk-i18n:end */"; blk = B + "\n" + js + "\n" + E + "\n"
        if B in s: s = s[:s.index(B)] + blk + s[s.index(E) + len(E) + 1:]
        else: i = s.index("function trZh(s){"); s = s[:i] + blk + s[i:]
    return s

if __name__ == "__main__":
    f = R + "src/app.html"; s = open(f).read(); out = patch(s)
    open(f, "w").write(out); print("desk_apply", len(s), "->", len(out))
