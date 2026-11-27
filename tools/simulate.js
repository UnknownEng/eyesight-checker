// Checks the acuity engine against simulated observers whose true acuity is known.
// Run: node tools/simulate.js
//
// Observer model: 4-alternative forced choice, psychometric function
//   p(correct | L) = 0.25 + 0.75 / (1 + exp(-(L - T) / s))
// where T is the observer's true threshold (logMAR) and s the slope.
// Per-run test-retest variability on real ETDRS charts is about +/-0.1 logMAR,
// so a good engine should show small bias and SD of roughly 0.05-0.08.
// Note: with 10 letters (little guessing) ETDRS letter scoring sits ~0.03 logMAR above the
// observer's 50% point. That is the scoring convention, not an error: a line read fully counts
// as that line, and a half-read line counts half. With 4 choices, lucky guesses hide this offset.
const A = require('../www/js/acuity.js');

function observer(T, s, g) {
  return (L) => Math.random() < g + (1 - g) / (1 + Math.exp(-(L - T) / s));
}

function simulate(T, s, n, symbols) {
  symbols = symbols || A.DIRS;
  const guess = 1 / symbols.length;
  const errs = [];
  let trials = 0;
  for (let k = 0; k < n; k++) {
    const sees = observer(T, s, guess);
    const run = A.createRun(0, A.LINES.length - 1, Math.random, { symbols });
    while (!run.done) {
      const t = run.current();
      const others = symbols.filter((d) => d !== t.dir);
      run.answer(sees(t.logMAR) ? t.dir : others[Math.floor(Math.random() * others.length)]);
    }
    const r = run.result();
    errs.push(r.logMAR - T);
    trials += r.trials;
  }
  const mean = errs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(errs.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const within1 = errs.filter((e) => Math.abs(e) <= 0.1).length / n;
  return { mean, sd, within1, trials: trials / n };
}

// The word test shows 4 choices per word, so its guess rate equals the Tumbling E case.
for (const [name, set] of [["Tumbling E / words (4 choices)", A.DIRS], ["Letters (10 choices)", A.LETTERS]]) {
  console.log("\n" + name);
  console.log("true logMAR | bias   | SD    | within ±0.1 | avg trials");
  for (const T of [-0.2, -0.1, 0.0, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9]) {
    const r = simulate(T, 0.05, 4000, set);
    console.log(
      `${T.toFixed(1).padStart(11)} | ${(r.mean >= 0 ? "+" : "") + r.mean.toFixed(3)} | ${r.sd.toFixed(3)} | ${(r.within1 * 100).toFixed(1).padStart(10)}% | ${r.trials.toFixed(1)}`
    );
  }
}
