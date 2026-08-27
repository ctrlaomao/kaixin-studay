const test = require("node:test");
const assert = require("node:assert/strict");
const { applyMasteryEvent } = require("../cloudfunctions/_common/masteryStars.js");

const DAY = 24 * 60 * 60 * 1000;

function at(iso) {
  return new Date(iso);
}

test("new error with no prior mastery is 1 star", () => {
  const next = applyMasteryEvent(null, { type: "wrong" }, at("2026-03-01T10:00:00.000Z"));
  assert.equal(next.stars, 1);
  assert.equal(next.countsTowardFullStar, false);
});

test("correct at 1 star promotes to 2", () => {
  const next = applyMasteryEvent(
    { stars: 1 },
    { type: "correct" },
    at("2026-03-01T10:00:00.000Z")
  );
  assert.equal(next.stars, 2);
});

test("2 star correct within 2 days stays 2", () => {
  const s1 = applyMasteryEvent({ stars: 1 }, { type: "correct" }, at("2026-03-01T10:00:00.000Z"));
  const s2 = applyMasteryEvent(s1, { type: "correct" }, at("2026-03-02T09:00:00.000Z"));
  assert.equal(s2.stars, 2);
});

test("2 star correct after >=2 days promotes to 3", () => {
  const s1 = applyMasteryEvent({ stars: 1 }, { type: "correct" }, at("2026-03-01T10:00:00.000Z"));
  const s2 = applyMasteryEvent(
    s1,
    { type: "correct" },
    new Date(at("2026-03-01T10:00:00.000Z").getTime() + 2 * DAY)
  );
  assert.equal(s2.stars, 3);
});

test("3 star correct after >=7 days promotes to 4", () => {
  let s = applyMasteryEvent({ stars: 1 }, { type: "correct" }, at("2026-03-01T00:00:00.000Z"));
  s = applyMasteryEvent(s, { type: "correct" }, new Date(at("2026-03-01T00:00:00.000Z").getTime() + 2 * DAY));
  assert.equal(s.stars, 3);
  s = applyMasteryEvent(s, { type: "correct" }, new Date(new Date(s.lastCorrectAt).getTime() + 7 * DAY));
  assert.equal(s.stars, 4);
});

test("4 star second spaced review with no new error promotes to 5", () => {
  let t = at("2026-03-01T00:00:00.000Z");
  let s = applyMasteryEvent({ stars: 1 }, { type: "correct" }, t);
  t = new Date(t.getTime() + 2 * DAY);
  s = applyMasteryEvent(s, { type: "correct" }, t);
  t = new Date(t.getTime() + 7 * DAY);
  s = applyMasteryEvent(s, { type: "correct" }, t);
  t = new Date(t.getTime() + 7 * DAY);
  s = applyMasteryEvent(s, { type: "correct" }, t);
  assert.equal(s.stars, 5);
  assert.equal(s.countsTowardFullStar, true);
  assert.equal(s.countsTowardWish, true);
});

test("4 star does not reach 5 if there was a wrong after last correct", () => {
  let t = at("2026-03-01T00:00:00.000Z");
  let s = applyMasteryEvent({ stars: 1 }, { type: "correct" }, t);
  t = new Date(t.getTime() + 2 * DAY);
  s = applyMasteryEvent(s, { type: "correct" }, t);
  t = new Date(t.getTime() + 7 * DAY);
  s = applyMasteryEvent(s, { type: "correct" }, t);
  assert.equal(s.stars, 4);
  t = new Date(t.getTime() + 1 * DAY);
  s = applyMasteryEvent(s, { type: "wrong" }, t);
  assert.equal(s.stars, 3);
  t = new Date(t.getTime() + 7 * DAY);
  s = applyMasteryEvent(s, { type: "correct" }, t);
  assert.ok(s.stars < 5);
});

test("wrong decreases one star, floor 1", () => {
  const next = applyMasteryEvent({ stars: 3 }, { type: "wrong" }, at("2026-03-01T10:00:00.000Z"));
  assert.equal(next.stars, 2);
  const floor = applyMasteryEvent({ stars: 1 }, { type: "wrong" }, at("2026-03-01T11:00:00.000Z"));
  assert.equal(floor.stars, 1);
});

test("short-interval consecutive wrongs mark stubborn", () => {
  const t0 = at("2026-03-01T10:00:00.000Z");
  const s1 = applyMasteryEvent({ stars: 3 }, { type: "wrong" }, t0);
  const s2 = applyMasteryEvent(s1, { type: "wrong" }, new Date(t0.getTime() + 2 * 60 * 60 * 1000));
  assert.equal(s2.stubborn, true);
});

test("manual set marks override and does not count toward exam or wish", () => {
  const next = applyMasteryEvent({ stars: 2 }, { type: "manualSet", stars: 5 }, at("2026-03-01T10:00:00.000Z"));
  assert.equal(next.stars, 5);
  assert.equal(next.manualOverride, true);
  assert.equal(next.countsTowardFullStar, false);
  assert.equal(next.countsTowardWish, false);
});
