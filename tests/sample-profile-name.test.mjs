// sample-profile-name: the made-up sample notebook must not present the author handle Q1f730 as the
// user. Settings shows "Juno Park" while the session is the sample, everyone else sees "You" (zh 你);
// the taste-card header and the share-canvas first line follow the same rule.
import test from "node:test";
import assert from "node:assert/strict";
import { runFn, read, esc, stripTags, fnSource } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const SETTINGS = "src/app/js/settings.js";
const THREADS = "src/app/js/threads.js";

function root(u, LANG = "en") {
  return runFn(SETTINGS, "settingsRootHTML", {
    t: (s) => s,
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

test("settings: the sample profile is named after the sample notebook, not the author handle", () => {
  const html = root({ sample: true });
  assert.match(html, /class="st-profile-name" translate="no">Juno Park</);
  assert.ok(!html.includes("Q1f730"), html);
  assert.ok(stripTags(html).includes("Sample notebook"), "the sample subtitle is kept");
});

test("settings: a real notebook says You, never the author handle", () => {
  const html = root({ sample: false });
  assert.match(html, /class="st-profile-name" translate="no">You</);
  assert.ok(!html.includes("Q1f730"), html);
  assert.ok(!stripTags(html).includes("Juno Park"), "the sample name is not shown to real users");
});

test("settings: zh says 你 for a real notebook and keeps Juno Park for the sample", () => {
  assert.match(root({ sample: false }, "zh"), /class="st-profile-name" translate="no">你</);
  assert.match(root({ sample: true }, "zh"), /class="st-profile-name" translate="no">Juno Park</);
});

test("settings: no author handle in the profile row, and the License row is kept", () => {
  const html = root({ sample: false });
  assert.ok(!/class="st-profile-name"[^>]*>Q1f730</.test(html), "the author handle is not the user name");
  assert.ok(!stripTags(html).includes("你"), "English settings stay English");
  assert.ok(read(SETTINGS).includes('t("License"), value: "MIT © Q1f730"'), "the License row keeps the copyright line");
});

function taste(scope) {
  return runFn(THREADS, "tasteProfileName", Object.assign({ t: (s) => s, LANG: "en" }, scope), []);
}

test("threads: the taste card header and share canvas use the session's display name", () => {
  assert.ok(!read(THREADS).includes("Q1f730"), "the author handle is gone from threads.js");
  assert.equal(taste({ state: { user: { sample: true } } }), "Juno Park");
  assert.equal(taste({ state: { user: { sample: false } } }), "You");
  assert.equal(taste({ state: null }), "You");
  assert.equal(taste({ LANG: "zh", state: { user: { sample: false } } }), "你");
  assert.equal(taste({ LANG: "zh", state: { user: { sample: true } } }), "Juno Park");

  const letter = fnSource(read(THREADS), "renderLetter");
  assert.ok(letter, "threads.js still defines renderLetter");
  assert.match(letter, /tcard-k">' \+ esc\(tasteProfileName\(\)\)/);
  assert.match(letter, /fillText\(tasteProfileName\(\)\+" \\u00b7 Sparkling/);
});

test("threads: the body is-sample flag is enough when the session object is not loaded yet", () => {
  const doc = { body: { classList: { contains: (c) => c === "is-sample" } } };
  assert.equal(taste({ state: {}, document: doc }), "Juno Park");
  assert.equal(taste({ state: { user: null }, document: { body: { classList: { contains: () => false } } } }), "You");
});
