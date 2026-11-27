/*
 * Visual acuity engine.
 *
 * Method (standard clinical design, no invented numbers):
 *  - Optotype: Tumbling E on a 5x5 grid (stroke = 1/5 of height), the same
 *    construction as ISO 8596 / ETDRS-equivalent charts.
 *  - Size: an optotype of logMAR L subtends 5 * 10^L arc-minutes at the eye,
 *    computed from the real viewing distance and the calibrated screen scale.
 *  - Chart: logMAR progression in 0.1 steps (Bailey & Lovie design),
 *    from 1.0 (6/60, 20/200) to -0.3 (6/3, 20/10), 5 optotypes per line.
 *  - Scoring: ETDRS letter-by-letter scoring, 0.02 logMAR per optotype.
 *  - Fast start: single optotypes skip down 0.2 logMAR at a time until the
 *    first miss, then full lines are tested. The largest line tested must
 *    have >= 4/5 correct (otherwise a larger line is tested) so that lines
 *    above it can be credited, and testing stops at the first line with
 *    <= 2/5 correct.
 *
 * Works in the browser (window.Acuity) and in Node (module.exports) so the
 * algorithm can be checked with simulated observers (see tools/simulate.js).
 */
(function (root) {
  'use strict';

  var LINES = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.0, -0.1, -0.2, -0.3];
  var DIRS = ['right', 'down', 'left', 'up'];
  var LAST = LINES.length - 1;

  function round1(x) { return Math.round(x * 10) / 10; }

  /** Physical size (mm) subtended by `arcmin` arc-minutes at `distanceM` metres. */
  function arcminToMm(arcmin, distanceM) {
    return distanceM * 1000 * Math.tan((arcmin / 60) * Math.PI / 180);
  }

  /** Full optotype height in mm for a logMAR value at a distance. */
  function optotypeMm(logMAR, distanceM) {
    return arcminToMm(5 * Math.pow(10, logMAR), distanceM);
  }

  /** Stroke / gap width (the "minimum angle of resolution") in mm. */
  function detailMm(logMAR, distanceM) {
    return arcminToMm(Math.pow(10, logMAR), distanceM);
  }

  /**
   * Create a test run.
   * @param {number} topIdx    index into LINES of the largest line that fits the screen
   * @param {number} bottomIdx index of the smallest line the screen can render sharply
   * @param {function} rng     random number generator (0..1)
   */
  function createRun(topIdx, bottomIdx, rng, opts) {
    rng = rng || Math.random;
    opts = opts || {};
    // Symbols: the 4 E directions by default, or letters / words. With larger
    // sets no symbol repeats among the last few shown (like a printed chart line).
    var symbols = opts.symbols || DIRS;
    var noRepeat = symbols.length >= 8 ? 4 : 1;
    // Keep testing smaller lines while at least this many of 5 are correct.
    // With 4 choices, 1-2 correct can be pure guessing, so stop below 3; with
    // 10 letters guessing is rare, so 2 correct still counts as partial reading.
    var guessChoices = opts.choices || symbols.length;
    var continueAt = guessChoices >= 8 ? 2 : 3;
    topIdx = Math.max(0, topIdx | 0);
    bottomIdx = Math.min(LAST, bottomIdx == null ? LAST : bottomIdx | 0);
    if (bottomIdx < topIdx) bottomIdx = topIdx;

    var st = {
      phase: 'screen',
      idx: Math.min(Math.max(topIdx, 3), bottomIdx), // start screening at 0.7 (6/30) or the largest that fits
      lines: {},
      inLine: 0,
      correctInLine: 0,
      recent: [],
      done: false,
      trials: []
    };
    var cur = null;

    function pickDir() {
      var d;
      do { d = symbols[Math.floor(rng() * symbols.length)]; } while (st.recent.indexOf(d) >= 0);
      st.recent.push(d);
      if (st.recent.length > noRepeat) st.recent.shift();
      return d;
    }

    function current() {
      if (st.done) return null;
      if (!cur) {
        cur = {
          idx: st.idx,
          logMAR: LINES[st.idx],
          dir: pickDir(),
          phase: st.phase,
          trialInLine: st.phase === 'full' ? st.inLine + 1 : 0
        };
      }
      return cur;
    }

    function testedIdx() {
      return Object.keys(st.lines).map(Number).sort(function (a, b) { return a - b; });
    }

    /** Record a response: a direction string, or null for "can't see". */
    function answer(resp) {
      var c = current();
      if (!c) return;
      var ok = resp === c.dir;
      st.trials.push({ idx: c.idx, logMAR: c.logMAR, dir: c.dir, resp: resp, ok: ok, phase: c.phase });
      cur = null;

      if (st.phase === 'screen') {
        if (ok && st.idx + 2 <= bottomIdx) { st.idx += 2; return; }
        st.phase = 'full';
        st.idx = ok ? Math.max(topIdx, st.idx - 1) : Math.max(topIdx, st.idx - 2);
        st.inLine = 0; st.correctInLine = 0;
        return;
      }

      st.inLine++;
      if (ok) st.correctInLine++;
      if (st.inLine < 5) return;

      st.lines[st.idx] = st.correctInLine;
      st.inLine = 0; st.correctInLine = 0;

      var t = testedIdx();
      var minT = t[0], maxT = t[t.length - 1];
      if (st.lines[minT] < 4 && minT > topIdx) { st.idx = minT - 1; return; }          // need a solid anchor line
      if (st.lines[maxT] >= continueAt && maxT < bottomIdx) { st.idx = maxT + 1; return; } // keep going smaller
      st.done = true;
    }

    function result() {
      var t = testedIdx();
      if (!t.length) return null;
      var minT = t[0], maxT = t[t.length - 1];
      var total = 0;
      t.forEach(function (i) { total += st.lines[i]; });
      var logMAR = LINES[minT] + 0.1 - 0.02 * total;
      logMAR = Math.round(logMAR * 100) / 100;
      var perLine = t.map(function (i) { return { logMAR: LINES[i], correct: st.lines[i] }; });
      return {
        logMAR: logMAR,
        worseThanChart: minT === topIdx && st.lines[minT] <= 2,   // could not read the largest line
        topLogMAR: LINES[topIdx],
        hitFloor: maxT === bottomIdx && st.lines[maxT] >= 3,       // read the smallest line available
        floorLogMAR: LINES[bottomIdx],
        lettersCorrect: total,
        lines: perLine,
        trials: st.trials.length
      };
    }

    return {
      current: current,
      answer: answer,
      result: result,
      get done() { return st.done; },
      get state() { return st; }
    };
  }

  /* ---------- Notation helpers ---------- */

  var SN6 = { '1.0': '6/60', '0.9': '6/48', '0.8': '6/38', '0.7': '6/30', '0.6': '6/24', '0.5': '6/19', '0.4': '6/15', '0.3': '6/12', '0.2': '6/9.5', '0.1': '6/7.5', '0.0': '6/6', '-0.1': '6/4.8', '-0.2': '6/3.8', '-0.3': '6/3' };
  var SN20 = { '1.0': '20/200', '0.9': '20/160', '0.8': '20/125', '0.7': '20/100', '0.6': '20/80', '0.5': '20/63', '0.4': '20/50', '0.3': '20/40', '0.2': '20/32', '0.1': '20/25', '0.0': '20/20', '-0.1': '20/16', '-0.2': '20/12.5', '-0.3': '20/10' };

  function lineKey(logMAR) {
    var r = round1(logMAR);
    if (Object.is(r, -0)) r = 0;
    return r.toFixed(1);
  }

  function snellen(logMAR) {
    var r = round1(logMAR);
    if (r > 1.0) {
      return { metric: '6/' + Math.round(6 * Math.pow(10, logMAR)), imperial: '20/' + Math.round(20 * Math.pow(10, logMAR)) };
    }
    if (r < -0.3) r = -0.3;
    var k = lineKey(r);
    return { metric: SN6[k], imperial: SN20[k] };
  }

  function decimal(logMAR) {
    return Math.round(Math.pow(10, -logMAR) * 100) / 100;
  }

  /* ---------- Near (reading) notation, M-units ----------
   * 1 M print has an x-height of 1.454 mm and subtends 5 arc-min at 1 m.
   * Size needed at distance d (m) for logMAR L:  M = d * 10^L.
   * N-point notation: N8 is approximately 1 M.
   */
  var M_XHEIGHT_MM = 1.454;
  function nearM(logMAR, distanceM) { return distanceM * Math.pow(10, logMAR); }
  function nearXHeightMm(logMAR, distanceM) { return M_XHEIGHT_MM * nearM(logMAR, distanceM); }
  var N_SIZES = [5, 6, 8, 10, 12, 14, 18, 24, 36, 48];
  function nPoint(M) {
    var n = 8 * M, best = N_SIZES[0];
    N_SIZES.forEach(function (s) { if (Math.abs(Math.log(s / n)) < Math.abs(Math.log(best / n))) best = s; });
    return best;
  }

  var LETTERS = ['C', 'D', 'H', 'K', 'N', 'O', 'R', 'S', 'V', 'Z']; // Sloan letters (ETDRS charts)

  var api = {
    LINES: LINES,
    DIRS: DIRS,
    LETTERS: LETTERS,
    nearM: nearM,
    nearXHeightMm: nearXHeightMm,
    nPoint: nPoint,
    optotypeMm: optotypeMm,
    detailMm: detailMm,
    arcminToMm: arcminToMm,
    createRun: createRun,
    snellen: snellen,
    decimal: decimal,
    lineKey: lineKey
  };

  root.Acuity = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
