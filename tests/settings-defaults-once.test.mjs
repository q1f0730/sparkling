// settings-defaults-once: the Settings root must not repeat "Planning defaults" twice in a row.
// The summary card keeps the "Planning defaults" kicker; the push row right under it must read
// "Edit planning defaults" (zh: 修改规划默认值), while the sub-page title stays "Planning defaults".
import test from "node:test";
import assert from "node:assert/strict";
import { runFn, read, esc } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const REL = "src/app/js/settings.js";

function tStub(s) {
  if (typeof s === "string") return s;
  if (Array.isArray(s)) return s[0];
  if (s && typeof s === "object") return Object.values(s)[0];
  return "";
}

function root(u, LANG = "en") {
  return runFn(REL, "settingsRootHTML", {
    t: tStub,
    esc,
    attr: esc,
    LANG,
    APP_VERSION: "0.4.0",
    prefs: { appearance: 0, textSize: 1, notif: { master: false } },
    STI: {},
    stIcons: { chev: "", check: "" },
    window: {},
  }, [u]);
}

/** The `Object.assign(ZH, {...})` block at the bottom of settings.js, evaluated. */
function settingsZh() {
  const s = read(REL);
  const at = s.indexOf("Object.assign(ZH, {");
  assert.ok(at >= 0, "settings.js carries its own Object.assign(ZH, {...})");
  const start = s.indexOf("{", at);
  let depth = 0, quote = null, end = -1;
  for (let j = start; j < s.length; j++) {
    const c = s[j];
    if (quote) {
      if (c === "\\") { j++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) { end = j; break; }
  }
  assert.ok(end > start, "zh block closes");
  const obj = s.slice(start, end + 1);
  return new Function("ZH", "Object.assign(ZH, " + obj + "); return ZH;")({});
}

const U = { area: "Greenpoint, Brooklyn", when: "Saturday afternoon", budget: 40, sample: false };

test("summary kicker keeps 'Planning defaults', the row below it says 'Edit planning defaults'", () => {
  const html = root(U);
  const kicker = /<span class="r7-kicker">([^<]*)<\/span>/.exec(html);
  assert.ok(kicker, "summary block kicker renders");
  assert.equal(kicker[1], "Planning defaults", "summary block still labels the defaults");

  const list = html.slice(html.indexOf('<section class="st-group">'));
  const row = /<button class="st-row"[^>]*data-st-nav="#\/settings\/planning"[^>]*>([\s\S]*?)<\/button>/.exec(list);
  assert.ok(row, "planning push row renders");
  assert.ok(row[1].includes('<span class="st-label">Edit planning defaults</span>'),
    "row label must not repeat the summary label: " + row[1]);
});

test("the push row keeps its navigation target", () => {
  const html = root(U);
  const list = html.slice(html.indexOf('<section class="st-group">'));
  const row = /<button class="st-row"[^>]*data-st-nav="#\/settings\/planning"[^>]*>[\s\S]*?<\/button>/.exec(list);
  assert.ok(row, "planning push row still navigates to #/settings/planning");
  assert.ok(row[0].includes('data-st-nav="#/settings/planning"'));
});

test("zh dictionary maps the new label and leaves the sub-page title alone", () => {
  const zh = settingsZh();
  assert.equal(zh["Edit planning defaults"], "修改规划默认值");
  assert.equal(zh["Planning defaults"], undefined, "the kicker/sub-page title key must stay untouched here");
  assert.ok(read(REL).includes('planning: "Planning defaults"'),
    "settingsPageTitle still calls the sub-page 'Planning defaults'");
});

test("settings root renders the new label without doubling it in zh mode", () => {
  const zh = settingsZh();
  const html = runFn(REL, "settingsRootHTML", {
    t: (s) => (typeof s === "string" ? (zh[s] || s) : tStub(s)),
    esc,
    attr: esc,
    LANG: "zh",
    APP_VERSION: "0.4.0",
    prefs: { appearance: 0, textSize: 1, notif: { master: false } },
    STI: {},
    stIcons: { chev: "", check: "" },
    window: {},
  }, [U]);
  const list = html.slice(html.indexOf('<section class="st-group">'));
  const row = /<button class="st-row"[^>]*data-st-nav="#\/settings\/planning"[^>]*>([\s\S]*?)<\/button>/.exec(list);
  assert.ok(row, "zh planning row renders");
  assert.ok(row[1].includes("修改规划默认值"), "zh row label: " + row[1]);
});
