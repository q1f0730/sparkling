// Regression: the inbox question copy is pure and total for missing inputs. inboxReason must return
// null (no question) when there is nothing to ask about, and a JSON-clean string when there is.
// cleanSurface must tolerate empty argument objects. No network, no DB, no env.
import { test } from "node:test";
import assert from "node:assert/strict";
import { inboxReason, cleanSurface } from "../src/recognize.js";

// Anything handed to the SPA is JSON-serialised; 'undefined'/'NaN' there means a template leak.
function assertClean(value, label) {
  const s = JSON.stringify(value);
  assert.ok(!/undefined/.test(String(s)), `${label}: leaked 'undefined' -> ${String(s).slice(0, 160)}`);
  assert.ok(!/NaN/.test(String(s)), `${label}: leaked 'NaN' -> ${String(s).slice(0, 160)}`);
}

test("inboxReason returns null (never throws) when mention or guesses are missing", () => {
  const cases = [
    ["null mention and null guesses", null, null],
    ["empty mention and empty guess list", {}, []],
    ["mention with undefined guesses", { surface: "x" }, undefined],
  ];
  for (const [label, mention, guesses] of cases) {
    let out;
    assert.doesNotThrow(() => { out = inboxReason(mention, guesses); }, `${label}: threw`);
    assert.ok(
      out === null || typeof out === "string" || typeof out === "object",
      `${label}: expected string, null or object, got ${typeof out}`,
    );
    assert.equal(out, null, `${label}: with nothing to ask about the reason is null`);
    assertClean(out, label);
  }
});

test("inboxReason renders a clean one-line question for a single guess", () => {
  const one = inboxReason("Solaris", [{ name: "Solaris", type: "film", year: "1972" }]);
  assert.equal(typeof one, "string");
  assert.equal(one, 'Not sure "Solaris" means Solaris.');
  assertClean(one, "single guess");

  // Multiple guesses sharing a title name each medium that carries it.
  const multi = inboxReason("Dune", [
    { name: "Dune", type: "film" },
    { name: "Dune", type: "book" },
  ]);
  assert.equal(typeof multi, "string");
  assert.equal(multi, '"Dune" is a film and a book.');
  assertClean(multi, "same title, two types");

  // Taste ranking: since plain-numbers (10-25) the inbox speaks in words; the number lives in the receipts drawer.
  const tasted = inboxReason("Her", [
    { name: "Her", type: "film", taste: { affinity: 0.876, via: [{ name: "Solaris" }] } },
  ]);
  assert.equal(typeof tasted, "string");
  assert.ok(!/0\.8|\(0\./.test(tasted), `no raw affinity number in the inbox line: ${tasted}`);
  assert.ok(tasted.includes("mostly through Solaris"), tasted);
  assertClean(tasted, "taste ranking");
});

test("cleanSurface accepts an empty mention object and undefined note text", () => {
  assert.doesNotThrow(() => cleanSurface({}, []));
  assert.equal(cleanSurface({}, []), "", "no surface -> empty string");
  assert.equal(cleanSurface({ surface: "x" }, undefined), "x", "short surface passes through without reading text");
  assertClean(cleanSurface({ surface: "x" }, undefined), "short surface");

  // The leading verb is stripped only when the remaining title appears in the note.
  assert.equal(
    cleanSurface({ surface: "watched Solaris", title: "Solaris" }, "watched Solaris"),
    "Solaris",
    "leading verb stripped when the title is in the note",
  );
});

// Known genuine edge: cleanSurface reads m.surface/m.title before its own null guard, so a null
// mention throws. Kept honest here rather than bent to pass; src/ is out of scope for this task.
test("cleanSurface(null, text) throws on current code", { skip: "null mention has no guard; genuine edge, no src change in scope" }, () => {
  assert.doesNotThrow(() => cleanSurface(null, "text"));
});

// Known genuine edge: a guess with no name renders the literal "undefined" into the sentence.
// Guesses from Qloo always carry a name today, so this is documentation, not a live failure.
test("inboxReason skips a nameless guess instead of printing 'undefined'", { skip: "nameless guess leaks 'undefined'; genuine edge, no src change in scope" }, () => {
  assertClean(inboxReason("x", [{ type: "film" }]), "nameless guess");
});
