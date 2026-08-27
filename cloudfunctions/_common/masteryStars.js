/**
 * 课时掌握度打星纯函数（F10 / US-03）。
 * 不读写库；云函数只应传入当前 mastery 快照与事件。
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const GAP_TO_3_MS = 2 * DAY_MS;
const GAP_TO_4_MS = 7 * DAY_MS;
const GAP_TO_5_MS = 7 * DAY_MS;
const STUBBORN_WINDOW_MS = 2 * DAY_MS;

function toDate(now) {
  if (now instanceof Date) return now;
  if (now == null) return new Date();
  return new Date(now);
}

function clampStars(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 1;
  return Math.max(1, Math.min(5, Math.round(x)));
}

function decorate(state) {
  const counts = state.stars === 5 && !state.manualOverride;
  return {
    stars: state.stars,
    lastCorrectAt: state.lastCorrectAt,
    lastWrongAt: state.lastWrongAt,
    consecutiveWrong: state.consecutiveWrong,
    stubborn: Boolean(state.stubborn),
    manualOverride: Boolean(state.manualOverride),
    countsTowardFullStar: counts,
    countsTowardWish: counts,
  };
}

function snapshot(prev) {
  if (!prev) {
    return {
      stars: null,
      lastCorrectAt: null,
      lastWrongAt: null,
      consecutiveWrong: 0,
      stubborn: false,
      manualOverride: false,
    };
  }
  return {
    stars: prev.stars == null ? null : clampStars(prev.stars),
    lastCorrectAt: prev.lastCorrectAt || null,
    lastWrongAt: prev.lastWrongAt || null,
    consecutiveWrong: Number(prev.consecutiveWrong) || 0,
    stubborn: Boolean(prev.stubborn),
    manualOverride: Boolean(prev.manualOverride),
  };
}

function gapMs(fromIso, now) {
  if (!fromIso) return Infinity;
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return Infinity;
  return now.getTime() - from.getTime();
}

function applyWrong(state, now) {
  const lastWrong = state.lastWrongAt;
  const gap = gapMs(lastWrong, now);
  const consecutiveWrong = state.consecutiveWrong + 1;
  const shortRepeat = lastWrong && gap >= 0 && gap < STUBBORN_WINDOW_MS;
  const stubborn = consecutiveWrong >= 2 && (shortRepeat || !lastWrong);
  const current = state.stars == null ? 0 : state.stars;
  const stars = current <= 1 ? 1 : current - 1;
  return decorate({
    stars,
    lastCorrectAt: state.lastCorrectAt,
    lastWrongAt: now.toISOString(),
    consecutiveWrong,
    stubborn: stubborn || state.stubborn,
    manualOverride: false,
  });
}

function applyCorrect(state, now) {
  const gap = gapMs(state.lastCorrectAt, now);
  let stars = state.stars == null ? 1 : state.stars;
  if (stars <= 1) {
    stars = 2;
  } else if (stars === 2 && gap >= GAP_TO_3_MS) {
    stars = 3;
  } else if (stars === 3 && gap >= GAP_TO_4_MS) {
    stars = 4;
  } else if (stars === 4 && gap >= GAP_TO_5_MS) {
    const wrongAfterLastCorrect =
      state.lastWrongAt &&
      (!state.lastCorrectAt || new Date(state.lastWrongAt) > new Date(state.lastCorrectAt));
    if (!wrongAfterLastCorrect) stars = 5;
  }
  return decorate({
    stars,
    lastCorrectAt: now.toISOString(),
    lastWrongAt: state.lastWrongAt,
    consecutiveWrong: 0,
    stubborn: false,
    manualOverride: false,
  });
}

function applyManual(state, event, now) {
  return decorate({
    stars: clampStars(event.stars),
    lastCorrectAt: state.lastCorrectAt,
    lastWrongAt: state.lastWrongAt,
    consecutiveWrong: state.consecutiveWrong,
    stubborn: state.stubborn,
    manualOverride: true,
  });
}

/**
 * @param {object|null} prev 当前 mastery 快照
 * @param {{ type: 'correct'|'wrong'|'newError'|'manualSet', stars?: number }} event
 * @param {Date|string|number} [now]
 */
function applyMasteryEvent(prev, event, now) {
  const t = toDate(now);
  const state = snapshot(prev);
  const type = event && event.type;
  if (type === "manualSet") return applyManual(state, event, t);
  if (type === "wrong" || type === "newError") return applyWrong(state, t);
  if (type === "correct") return applyCorrect(state, t);
  throw new Error(`unknown_mastery_event:${type}`);
}

module.exports = {
  applyMasteryEvent,
  DAY_MS,
};
