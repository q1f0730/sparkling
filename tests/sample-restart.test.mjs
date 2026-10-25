// sample-restart: Settings must put the sample notebook (Juno Park) back to its starting state,
// so a demo rehearsal does not leave extra notes, plans and footprints behind.
import test from "node:test";
import assert from "node:assert/strict";
import { runFn, read, esc } from "../tools/orchestra/checks/swarm/lib_front.mjs";

const REL = "src/app/js/settings.js";

function root(u, calls) {
  return runFn(REL, "settingsRootHTML", {
    t: (s) => { if (calls) calls.push(s); return s; },
    esc,
    attr: esc,
    LANG: "en",
    APP_VERSION: "0.4.0",
    prefs: { appearance: 0, textSize: 1, notif: { master: false } },
    STI: {},
    stIcons: { chev: "", check: "" },
    window: {},
  }, [u]);
}

function pressRestart() {
  const calls = [];
  const cleared = [];
  let sheet = null;
  let reloads = 0;
  const location = { hash: "", reload: function(){ reloads++; } };
  const scope = {
    t: (s) => s,
    confirmSheet: (opts) => { sheet = opts; },
    api: async (path, opts) => { calls.push({ path, opts }); return {}; },
    clearPlanStorage: () => cleared.push("plan"),
    clearDidYouGo: () => cleared.push("didYouGo"),
    clearDraft: () => cleared.push("draft"),
    location,
    state: {},
    history: {},
  };
  runFn(REL, "settingsAction", scope, ["restart-sample"]);
  return { sheet, calls, cleared, location, reloads: () => reloads };
}

test("the restart row is offered only for the sample notebook", () => {
  assert.match(root({ sample: true }), /data-st-action="restart-sample"/);
  assert.ok(!/restart-sample/.test(root({ sample: false, area: "Greenpoint" })), "own notebook must not offer it");
});

test("the row label goes through the dictionary", () => {
  const calls = [];
  root({ sample: true }, calls);
  assert.ok(calls.includes("Start the sample over"), "t() called with the row label: " + calls.join(" | "));
});

test("restart asks first, in plain words", () => {
  const { sheet } = pressRestart();
  assert.ok(sheet, "confirmSheet is opened");
  assert.equal(sheet.title, "Start the sample over?");
  assert.equal(sheet.copy, "The sample notebook goes back to how it started. Your own notes are not touched.");
  assert.equal(sheet.confirmLabel, "Start over");
  assert.equal(sheet.cancelLabel, "Cancel");
  assert.equal(sheet.busyLabel, "Working");
});

test("confirming wipes the account, opens a fresh sample, clears local state and reloads into notes", async () => {
  const { sheet, calls, cleared, location, reloads } = pressRestart();
  assert.equal(typeof sheet.onConfirm, "function");
  await sheet.onConfirm();
  assert.deepEqual(calls.map((c) => c.path), ["/api/delete", "/api/session"]);
  assert.equal(calls[0].opts.method, "POST");
  assert.deepEqual(calls[0].opts.body, { confirm: "DELETE" });
  assert.equal(calls[1].opts.method, "POST");
  assert.deepEqual(calls[1].opts.body, { mode: "sample" });
  assert.deepEqual(cleared, ["plan", "didYouGo", "draft"]);
  assert.equal(location.hash, "#/notes");
  assert.equal(reloads(), 1);
});

test("a failed delete never opens a sample session", async () => {
  const calls = [];
  let sheet = null;
  runFn(REL, "settingsAction", {
    t: (s) => s,
    confirmSheet: (opts) => { sheet = opts; },
    api: async (path) => { calls.push(path); throw new Error("server down"); },
    clearPlanStorage: () => {},
    clearDidYouGo: () => {},
    clearDraft: () => {},
    location: { hash: "", reload: () => {} },
    state: {},
    history: {},
  }, ["restart-sample"]);
  await assert.rejects(sheet.onConfirm(), /server down/);
  assert.deepEqual(calls, ["/api/delete"]);
});

test("settings.js carries all four zh strings", () => {
  const m = read(REL).match(/Object\.assign\(ZH, \{[\s\S]*?\}\);/);
  assert.ok(m, "Object.assign(ZH, {...}) in settings.js");
  const ZH = {};
  new Function("ZH", m[0])(ZH);
  assert.equal(ZH["Start the sample over"], "重新开始示例");
  assert.equal(ZH["Start the sample over?"], "重新开始示例？");
  assert.equal(ZH["The sample notebook goes back to how it started. Your own notes are not touched."], "示例笔记本会回到最初的样子。你自己的笔记不受影响。");
  assert.equal(ZH["Start over"], "重新开始");
});
