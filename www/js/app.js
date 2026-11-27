(function () {
  'use strict';

  var A = window.Acuity;
  var $app = document.getElementById('app');
  var CARD_W = 85.6, CARD_H = 53.98, CARD_R = 3.18; // ISO/IEC 7810 ID-1 card (bank, ID, loyalty cards)
  var IS_NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  /** Native Capacitor plugin by name (only inside the Android app). */
  function nativePlugin(name) {
    if (!IS_NATIVE) return null;
    var C = window.Capacitor;
    try { return (C.Plugins && C.Plugins[name]) || (C.registerPlugin ? C.registerPlugin(name) : null); } catch (e) { return null; }
  }

  /* ---------------- storage ---------------- */
  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem('eyecheck.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; }
    },
    set: function (k, v) { try { localStorage.setItem('eyecheck.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };
  function screenSig() {
    return Math.min(screen.width, screen.height) + 'x' + Math.max(screen.width, screen.height) + '@' + (window.devicePixelRatio || 1).toFixed(2);
  }

  /* ---------------- utils ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(sel) { return $app.querySelector(sel); }
  function on(sel, ev, fn) { $app.querySelectorAll(sel).forEach(function (el) { el.addEventListener(ev, fn); }); }
  var keyHandler = null;
  document.addEventListener('keydown', function (e) { if (keyHandler) keyHandler(e); });
  var resizeHandler = null;
  window.addEventListener('resize', function () { if (resizeHandler) resizeHandler(); });
  var moveHandler = null;
  document.addEventListener('pointermove', function (e) { if (moveHandler) moveHandler(e); });

  /** Short vibration: native haptics in the APK, Vibration API in browsers. */
  function buzz(kind) {
    try {
      var H = nativePlugin('Haptics');
      if (H) { H.impact({ style: kind === 'heavy' ? 'HEAVY' : 'LIGHT' }).catch(function () {}); return; }
      var ua = navigator.userActivation;
      if (navigator.vibrate && (!ua || ua.hasBeenActive)) navigator.vibrate(kind === 'heavy' ? 40 : 12);
    } catch (e) { /* no haptics */ }
  }

  function confetti() {
    var colors = ['#0f766e', '#22c55e', '#f59e0b', '#3b82f6', '#ec4899', '#a855f7'];
    for (var i = 0; i < 70; i++) {
      var c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      document.body.appendChild(c);
      var dx = (Math.random() - 0.5) * 200, rot = Math.random() * 720;
      var anim = c.animate([
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: 'translate(' + dx + 'px,' + (window.innerHeight + 40) + 'px) rotate(' + rot + 'deg)', opacity: 0.9 }
      ], { duration: 1800 + Math.random() * 1400, delay: Math.random() * 400, easing: 'cubic-bezier(.25,.6,.4,1)' });
      anim.onfinish = (function (el) { return function () { el.remove(); }; })(c);
    }
  }

  function render(html, testmode) {
    keyHandler = null;
    resizeHandler = null;
    moveHandler = null;
    document.body.className = testmode ? 'testmode' : '';
    $app.innerHTML = html;
    window.scrollTo(0, 0);
  }
  function nav(title, backFn, step) {
    setTimeout(function () { var b = $('#navback'); if (b) b.addEventListener('click', backFn); }, 0);
    return '<div class="topnav noprint"><button class="back" id="navback">&#8249; Back</button>' +
      (step ? '<span class="steps">' + step + '</span>' : '') + '</div>' + (title ? '<h2>' + title + '</h2>' : '');
  }
  function eyeName(eye) { return eye === 'right' ? 'Right' : 'Left'; }
  function otherEye(eye) { return eye === 'right' ? 'left' : 'right'; }
  function fmtLogMAR(x) { return (x > 0 ? '+' : '') + x.toFixed(2); }

  var LOGO = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#0f766e"/><path d="M8 32c6-10 14-16 24-16s18 6 24 16c-6 10-14 16-24 16S14 42 8 32z" fill="#fff"/><circle cx="32" cy="32" r="10" fill="#0f766e"/><circle cx="32" cy="32" r="4.5" fill="#062e2b"/><circle cx="35" cy="29" r="2" fill="#fff"/></svg>';

  var EYE_PATH = 'M8 32c6-10 14-16 24-16s18 6 24 16c-6 10-14 16-24 16S14 42 8 32z';
  var LOGO_LIVE = '<svg class="logo" id="logo" viewBox="0 0 64 64" role="img" aria-label="Eyesight Checker"><defs><clipPath id="eyeclip"><path d="' + EYE_PATH + '"/></clipPath></defs>' +
    '<rect width="64" height="64" rx="14" fill="#0f766e"/><g class="lid"><path d="' + EYE_PATH + '" fill="#fff"/>' +
    '<g clip-path="url(#eyeclip)"><g class="pupil" id="pupil"><circle cx="32" cy="32" r="10" fill="#0f766e"/><circle cx="32" cy="32" r="4.5" fill="#062e2b"/><circle cx="35" cy="29" r="2" fill="#fff"/></g></g></g></svg>';

  /* ---------------- screen helpers ---------------- */
  var wakeLock = null;
  function keepAwake() {
    try {
      if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }).catch(function () {});
      }
    } catch (e) { /* not supported */ }
  }
  function releaseAwake() { try { if (wakeLock) wakeLock.release(); } catch (e) {} wakeLock = null; }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && S && S.active) keepAwake();
  });
  function goFull() {
    var el = document.documentElement;
    try { if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(function () {}); } catch (e) {}
  }
  function exitFull() { try { if (document.fullscreenElement) document.exitFullscreen().catch(function () {}); } catch (e) {} }

  function guessPxPerMm() { return (window.devicePixelRatio || 1) >= 1.5 && Math.min(screen.width, screen.height) < 600 ? 6.3 : 3.78; }

  /** Space available for an optotype on the test screen (CSS px). */
  function stageBox() {
    return { w: window.innerWidth - 16, h: window.innerHeight - 250 };
  }
  /** Largest line that fits, and smallest line the display can draw sharply. */
  function lineRange(distanceM, pxPerMm) {
    var box = stageBox();
    var maxPx = Math.min(box.w, box.h) * 0.95;
    var dpr = window.devicePixelRatio || 1;
    var top = -1, bottom = -1;
    A.LINES.forEach(function (L, i) {
      var px = A.optotypeMm(L, distanceM) * pxPerMm;
      if (top < 0 && px <= maxPx) top = i;
      if (px * dpr >= 10) bottom = i; // stroke at least 2 device pixels
    });
    return { top: top, bottom: bottom };
  }

  function eSVG(px, dir, cls) {
    var rot = { right: 0, down: 90, left: 180, up: 270 }[dir];
    return '<svg class="' + (cls || 'optotype') + '" width="' + px.toFixed(2) + '" height="' + px.toFixed(2) +
      '" viewBox="0 0 5 5" style="transform:rotate(' + rot + 'deg)"><path d="M0 0H5V1H1V2H5V3H1V4H5V5H0Z" fill="#000"/></svg>';
  }

  /* ---------------- session ---------------- */
  var S = null;
  function newSession() {
    S = {
      profile: Object.assign({ name: '', age: '', glasses: 'none', mode: 'helper', chart: 'e' }, store.get('profile', {})),
      pxPerMm: null,
      distanceM: null,
      top: 0,
      bottom: A.LINES.length - 1,
      order: ['right', 'left'],
      eyes: { right: {}, left: {} },
      active: false
    };
  }

  /* ================= HOME ================= */
  function home() {
    S = null; releaseAwake(); exitFull();
    var hist = store.get('history', []);
    render(
      '<div class="page">' +
      '<div class="hero">' + LOGO_LIVE + '<h1>Eyesight Checker</h1>' +
      '<p class="lead">Measure the sharpness of vision (visual acuity) of each eye using a calibrated, clinically designed chart.</p></div>' +
      '<div class="stats"><div><b>14</b><span>chart lines</span></div><div><b>±1</b><span>line accuracy</span></div><div><b>100%</b><span>offline &amp; private</span></div></div>' +
      '<button class="btn primary big pulse" id="start">Distance eye test<small class="btn-sub">Each eye · E symbols or letters · ~6 min</small></button>' +
      '<button class="btn big" id="near">Reading test<small class="btn-sub">Words at 40 cm · near vision · ~2 min</small></button>' +
      (hist.length ? '<button class="btn" id="hist">Past results (' + hist.length + ')</button>' : '') +
      '<button class="btn ghost" id="how">How it works &amp; accuracy</button>' +
      '<div class="card"><h3>You will need</h3><ul class="check">' +
      '<li>About 5–8 minutes</li>' +
      '<li>Any bank, ID or loyalty card <em>or</em> a ruler (to calibrate your screen)</li>' +
      '<li>A tape measure and 3 metres (10 ft) of space</li>' +
      '<li>A helper to hold the phone — or a laptop/PC with a keyboard</li>' +
      '<li>A well-lit room</li></ul></div>' +
      '<p class="fine">This is a vision screening test, not a medical diagnosis or a glasses prescription. All results stay on this device.</p>' +
      '</div>'
    );
    // the eye follows your finger / mouse, and blinks when tapped
    var logo = $('#logo'), pupil = $('#pupil');
    moveHandler = function (e) {
      var r = logo.getBoundingClientRect();
      var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      var dist = Math.sqrt(dx * dx + dy * dy) || 1, m = Math.min(1, dist / 220);
      pupil.style.transform = 'translate(' + (dx / dist * 7 * m) + 'px,' + (dy / dist * 4.5 * m) + 'px)';
    };
    logo.addEventListener('click', function () {
      var lid = logo.querySelector('.lid');
      buzz();
      lid.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(.08)' }, { transform: 'scaleY(1)' }], { duration: 260 });
    });
    on('#start', 'click', function () { buzz(); newSession(); profile(); });
    on('#near', 'click', function () { buzz(); newSession(); nearProfile(); });
    on('#hist', 'click', history);
    on('#how', 'click', howItWorks);
  }

  /* ================= HOW IT WORKS ================= */
  function howItWorks() {
    render(
      '<div class="page">' + nav('How it works', home) +
      '<div class="card"><h3>What is measured</h3>' +
      '<p>Your <b>distance visual acuity</b> for each eye — the same quantity an eye clinic records as 6/6 (20/20), 6/12 (20/40) and so on. Results are given in Snellen (metres and feet), decimal and logMAR notation.</p></div>' +
      '<div class="card"><h3>Why the result is real, not a guess</h3><ul class="check">' +
      '<li><b>Screen calibration:</b> you match a real ID-1 card (85.60 × 53.98 mm, ISO/IEC 7810) or a ruler, so the app knows the true size of a pixel on your screen.</li>' +
      '<li><b>True angular size:</b> each symbol is drawn so it subtends exactly 5 × MAR arc-minutes at your measured distance — the standard optotype definition used for clinical charts (ISO 8596).</li>' +
      '<li><b>Tumbling E</b> on a 5×5 grid (works for any language or literacy level) <b>or letters</b>: the 10 Sloan letters C D H K N O R S V Z used on ETDRS clinic charts, drawn on the same 5×5 grid.</li>' +
      '<li><b>logMAR chart design</b> (Bailey &amp; Lovie): 0.1 logMAR steps, 5 symbols per line, from 6/60 down to 6/3.</li>' +
      '<li><b>ETDRS letter-by-letter scoring:</b> every symbol counts 0.02 logMAR, the scoring used in clinical research.</li>' +
      '<li><b>Tested by simulation:</b> against simulated patients with known acuity, the procedure measures within ±0.1 logMAR (one chart line) in about 95% of runs, with almost no bias.</li></ul></div>' +
      '<div class="card"><h3>Reading test (words)</h3>' +
      '<p>Near vision is measured at 40 cm with real words. Text size is set by its <b>x-height</b> (the height of a lower-case x), measured from the font on your own device, using the standard <b>M-unit</b> (1 M = 1.454 mm x-height). Results are given in M-units and N-point print size, as on clinic reading cards. You pick the word you saw from four choices, so every answer is checked — not just “I think I can read it”.</p></div>' +
      '<div class="card"><h3>Extra checks</h3>' +
      '<p><b>Red–green (duochrome) test:</b> the eye focuses red and green light at slightly different depths. If the black rings look sharper on red, the eye tends to focus in front of the retina (typical of near-sightedness). It works even for colour-blind people.</p>' +
      '<p><b>Clock-dial test:</b> if some lines look darker than others, it can indicate astigmatism.</p></div>' +
      '<div class="card"><h3>Limitations — please read</h3><ul class="check">' +
      '<li>It does <b>not</b> give a glasses/lens power (e.g. −1.50). That needs a refraction by an optometrist.</li>' +
      '<li>Accuracy depends on you: calibrate carefully and measure the distance with a tape. A 10% distance error changes the result by about 2 letters.</li>' +
      '<li>Use full screen brightness, avoid glare, and don\'t squint.</li>' +
      '<li>A good score does not rule out eye disease. See an eye doctor for regular check-ups, and immediately for pain, flashes, sudden blur or loss of vision.</li></ul></div>' +
      '</div>'
    );
  }

  /* ================= PROFILE ================= */
  function profile() {
    var p = S.profile;
    render(
      '<div class="page">' + nav('About you', home, 'Step 1 of 4') +
      '<label class="field">Name (optional)<input id="name" maxlength="40" value="' + esc(p.name) + '" placeholder="For your saved results"></label>' +
      '<label class="field">Age (optional)<input id="age" type="number" min="3" max="110" inputmode="numeric" value="' + esc(p.age) + '"></label>' +
      '<h3 style="margin-top:18px">Are you wearing glasses or contact lenses for this test?</h3>' +
      '<div class="choice">' +
      '<label><input type="radio" name="gl" value="none"' + (p.glasses === 'none' ? ' checked' : '') + '><span><b>No — testing my natural eyesight</b><small>Remove distance glasses / contacts.</small></span></label>' +
      '<label><input type="radio" name="gl" value="glasses"' + (p.glasses === 'glasses' ? ' checked' : '') + '><span><b>Yes — wearing my glasses / contacts</b><small>Checks how well your current prescription works.</small></span></label>' +
      '</div>' +
      '<h3>Chart type</h3>' +
      '<div class="choice">' +
      '<label><input type="radio" name="ch" value="e"' + (p.chart !== 'letters' ? ' checked' : '') + '><span><b>Tumbling E</b><small>Point which way the E faces. No reading needed — good for children.</small></span></label>' +
      '<label><input type="radio" name="ch" value="letters"' + (p.chart === 'letters' ? ' checked' : '') + '><span><b>Letters  C D H K N O R S V Z</b><small>Read each letter aloud, like a clinic chart.</small></span></label>' +
      '</div>' +
      '<h3>How will answers be entered?</h3>' +
      '<div class="choice">' +
      '<label><input type="radio" name="md" value="helper"' + (p.mode === 'helper' ? ' checked' : '') + '><span><b>A helper holds this phone</b><small>You point or say what you see; your helper swipes or taps it in.</small></span></label>' +
      '<label><input type="radio" name="md" value="keyboard"' + (p.mode === 'keyboard' ? ' checked' : '') + '><span><b>Laptop / PC with keyboard</b><small>Arrow keys or letter keys (a helper or a wireless keyboard works best).</small></span></label>' +
      '</div>' +
      '<button class="btn primary" id="next">Continue</button></div>'
    );
    on('#next', 'click', function () {
      S.profile = {
        name: $('#name').value.trim(),
        age: $('#age').value.trim(),
        glasses: ($app.querySelector('input[name=gl]:checked') || {}).value || 'none',
        mode: ($app.querySelector('input[name=md]:checked') || {}).value || 'helper',
        chart: ($app.querySelector('input[name=ch]:checked') || {}).value || 'e'
      };
      store.set('profile', S.profile);
      calibrate();
    });
  }

  /* ================= CALIBRATION ================= */
  function calibrate(next, back) {
    next = typeof next === 'function' ? next : distance;
    back = typeof back === 'function' ? back : profile;
    var k = store.get('pxPerMm', null);
    var saved = !!k && store.get('sig', null) === screenSig();
    if (!saved) k = guessPxPerMm();
    var mode = 'card';

    render(
      '<div class="page">' + nav('Calibrate your screen', back, back === profile ? 'Step 2 of 4' : 'Step 2 of 3') +
      '<p class="muted" style="margin:0 0 4px">Hold a real card (or ruler) flat on the screen and use the slider until the sizes match <b>exactly</b>.</p>' +
      '<div class="seg"><button data-m="card" class="on">Use a card</button><button data-m="ruler">Use a ruler</button></div>' +
      '<div class="slider-row"><button class="btn sq" id="minus" aria-label="Smaller">−</button>' +
      '<input type="range" id="rng" min="2" max="16" step="0.01" aria-label="Size"><button class="btn sq" id="plus" aria-label="Bigger">+</button></div>' +
      '<p class="scale-note" id="note"></p>' +
      '<div class="cal-stage" id="stage"></div>' +
      '<p class="muted" id="tip"></p>' +
      (saved ? '<p class="muted center" style="font-size:.85rem">Your previous calibration has been loaded — just check it still matches.</p>' : '') +
      '<button class="btn primary" id="ok">The sizes match — continue</button></div>'
    );

    var rng = $('#rng');
    rng.value = k;

    function draw() {
      var stage = $('#stage');
      var avail = stage.clientWidth - 24;
      if (mode === 'card') {
        stage.innerHTML = '<div class="cardshape" id="cardshape"><div class="chip" id="chip"></div>' +
          '<span>Place your card here</span><div class="handle" id="handle" title="Drag to resize">⤡</div></div>';
        sizeCard();
        bindHandle();
        $('#tip').innerHTML = 'Line up the top-left corner, then <b>drag the round handle</b> (or use the slider) until the card matches. Any standard bank, ID, metro or loyalty card is the same size. <b>Only the size matters — never enter card details.</b>';
      } else {
        var lens = [150, 100, 80, 50, 40, 30];
        var len = lens.find(function (l) { return l * k <= avail; }) || 30;
        var html = '<div class="ruler" style="width:' + (len * k) + 'px">';
        for (var mm = 0; mm <= len; mm++) {
          var hgt = mm % 10 === 0 ? 30 : mm % 5 === 0 ? 20 : 11;
          html += '<i style="left:' + (mm * k) + 'px;height:' + hgt + 'px"></i>';
          if (mm % 10 === 0) html += '<b style="left:' + (mm * k) + 'px">' + (mm / 10) + '</b>';
        }
        stage.innerHTML = html + '</div>';
        $('#tip').innerHTML = 'Hold a ruler against the screen. Match the <b>0</b> and <b>' + (len / 10) + ' cm</b> marks to your ruler.';
      }
      $('#note').textContent = 'Scale: ' + k.toFixed(2) + ' px per mm';
    }
    function sizeCard() {
      var card = $('#cardshape');
      if (!card) return;
      var avail = $('#stage').clientWidth - 24;
      var landscape = CARD_W * k <= avail;
      var chipW = 11 * k, chipH = 8.5 * k;
      card.style.width = (landscape ? CARD_W : CARD_H) * k + 'px';
      card.style.height = (landscape ? CARD_H : CARD_W) * k + 'px';
      card.style.borderRadius = CARD_R * k + 'px';
      var chip = $('#chip');
      chip.style.width = (landscape ? chipW : chipH) + 'px';
      chip.style.height = (landscape ? chipH : chipW) + 'px';
      chip.style.left = 9 * k + 'px';
      chip.style.top = (landscape ? 18 : 9) * k + 'px';
      $('#note').textContent = 'Scale: ' + k.toFixed(2) + ' px per mm';
    }
    function bindHandle() {
      var h = $('#handle'), card = $('#cardshape'), start = null;
      h.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        h.setPointerCapture(e.pointerId);
        var r = card.getBoundingClientRect();
        start = { x: e.clientX, y: e.clientY, w: r.width, h: r.height, k: k };
        buzz();
      });
      h.addEventListener('pointermove', function (e) {
        if (!start) return;
        var sx = (start.w + e.clientX - start.x) / start.w, sy = (start.h + e.clientY - start.y) / start.h;
        k = Math.min(16, Math.max(2, start.k * (sx + sy) / 2));
        rng.value = k;
        sizeCard();
      });
      var end = function () { if (start) { start = null; draw(); } };
      h.addEventListener('pointerup', end);
      h.addEventListener('pointercancel', end);
    }
    function setK(v) { k = Math.min(16, Math.max(2, v)); rng.value = k; if (mode === 'card' && $('#cardshape')) sizeCard(); else draw(); }

    rng.addEventListener('input', function () { setK(parseFloat(rng.value)); });
    on('#minus', 'click', function () { setK(k - 0.02); });
    on('#plus', 'click', function () { setK(k + 0.02); });
    on('.seg button', 'click', function (e) {
      mode = e.currentTarget.getAttribute('data-m');
      $app.querySelectorAll('.seg button').forEach(function (b) { b.classList.toggle('on', b === e.currentTarget); });
      draw();
    });
    on('#ok', 'click', function () {
      S.pxPerMm = k;
      store.set('pxPerMm', k);
      store.set('sig', screenSig());
      next();
    });
    resizeHandler = draw;
    draw();
  }

  /* ================= DISTANCE ================= */
  function distance() {
    var prefer = S.profile.mode === 'keyboard' ? [3, 4, 6, 2] : [3, 2, 4, 6];
    var options = [2, 3, 4, 6].map(function (d) {
      var r = lineRange(d, S.pxPerMm);
      return { d: d, top: r.top, bottom: r.bottom, ok: r.top >= 0 && r.top <= 3 && r.bottom >= 10 };
    });
    var best = prefer.map(function (d) { return options.find(function (o) { return o.d === d; }); })
      .find(function (o) { return o.ok && o.top === 0; }) || options.find(function (o) { return o.ok; });
    var chosen = S.distanceM && options.some(function (o) { return o.d === S.distanceM && o.ok; }) ? S.distanceM : (best ? best.d : null);

    var html = options.map(function (o) {
      var desc;
      if (!o.ok) {
        desc = o.top < 0 || o.top > 3 ? 'Screen too small for this distance' : 'Screen too low-resolution for this distance';
      } else {
        desc = 'Chart range ' + A.snellen(A.LINES[o.top]).metric + ' to ' + A.snellen(A.LINES[o.bottom]).metric +
          ' (' + A.snellen(A.LINES[o.top]).imperial + ' to ' + A.snellen(A.LINES[o.bottom]).imperial + ')';
      }
      var ft = (o.d * 3.2808).toFixed(1);
      return '<label class="' + (o.ok ? '' : 'disabled') + '"><input type="radio" name="dist" value="' + o.d + '"' +
        (o.d === chosen ? ' checked' : '') + (o.ok ? '' : ' disabled') + '><span><b>' + o.d + ' metres (' + ft + ' ft)' +
        (best && o.d === best.d ? ' — recommended' : '') + '</b><small>' + desc + '</small></span></label>';
    }).join('');

    render(
      '<div class="page">' + nav('Viewing distance', calibrate, 'Step 3 of 4') +
      '<p class="muted">The person being tested will sit or stand this far from the screen. The letter sizes are calculated for this exact distance.</p>' +
      '<div class="dist-illus"><svg viewBox="0 0 360 112" aria-hidden="true">' +
      '<line x1="10" y1="96" x2="350" y2="96" stroke="#dbe3e8" stroke-width="2"/>' +
      '<rect x="18" y="38" width="20" height="36" rx="4" fill="#0f172a"/><rect x="21" y="42" width="14" height="27" rx="2" fill="#fff"/>' +
      '<path d="M24.5 51h7v1.6h-5.4v1.6h5.4v1.6h-5.4v1.6h5.4v1.6h-7z" fill="#0f172a"/>' +
      '<line x1="28" y1="74" x2="28" y2="96" stroke="#0f172a" stroke-width="2"/>' +
      '<g id="arrow"><line id="aline" x1="46" y1="20" x2="200" y2="20" stroke="#0f766e" stroke-width="2" marker-end="url(#ah)" marker-start="url(#ah2)"/>' +
      '<text id="alabel" x="120" y="14" text-anchor="middle" font-size="13" font-weight="700" fill="#0f766e" font-family="system-ui,sans-serif"></text></g>' +
      '<defs><marker id="ah" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8z" fill="#0f766e"/></marker>' +
      '<marker id="ah2" markerWidth="8" markerHeight="8" refX="1" refY="4" orient="auto"><path d="M8 0L0 4L8 8z" fill="#0f766e"/></marker></defs>' +
      '<g class="person" id="person"><circle cx="0" cy="40" r="9" fill="#0f766e"/><path d="M0 49v26M0 75l-9 21M0 75l9 21M0 56l-12 10M-1 57l-12-12" stroke="#0f766e" stroke-width="4" stroke-linecap="round" fill="none"/>' +
      '<rect x="-12" y="34" width="11" height="9" rx="3" fill="#f2c9a0"/></g>' +
      '</svg></div>' +
      '<div class="choice">' + html + '</div>' +
      '<div class="card tint"><b>Measure it with a tape measure</b> from the screen to the eyes. Don\'t estimate by steps — a 10% error shifts the result by about two letters.</div>' +
      '<button class="btn primary" id="next"' + (chosen ? '' : ' disabled') + '>Continue</button></div>'
    );
    function illus(d) {
      var x = d ? 70 + (d / 6) * 260 : 200;
      $('#person').style.transform = 'translateX(' + x + 'px)';
      $('#aline').setAttribute('x2', x - 18);
      $('#alabel').setAttribute('x', (46 + x - 18) / 2);
      $('#alabel').textContent = d ? d + ' m  (' + (d * 3.2808).toFixed(1) + ' ft)' : '';
    }
    illus(chosen);
    on('input[name=dist]', 'change', function (e) { $('#next').disabled = false; buzz(); illus(parseFloat(e.currentTarget.value)); });
    on('#next', 'click', function () {
      var v = $app.querySelector('input[name=dist]:checked');
      if (!v) return;
      S.distanceM = parseFloat(v.value);
      var o = options.find(function (x) { return x.d === S.distanceM; });
      S.top = o.top; S.bottom = o.bottom;
      ready();
    });
  }

  /* ================= READY ================= */
  function ready() {
    var helper = S.profile.mode === 'helper';
    render(
      '<div class="page">' + nav('Get ready', distance, 'Step 4 of 4') +
      '<div class="card"><h3>Set up</h3><ul class="check">' +
      '<li>Turn screen brightness <b>to maximum</b> and switch off night mode / blue-light filter.</li>' +
      '<li>Room well lit, no lamp or window reflecting on the screen.</li>' +
      '<li>Screen at the eye level of the person being tested, held upright and still.</li>' +
      '<li>Person being tested sits or stands exactly <b>' + S.distanceM + ' m</b> away.</li>' +
      (S.profile.glasses === 'glasses' ? '<li>Keep distance glasses / contacts <b>on</b>.</li>' : '<li>Remove distance glasses / contacts.</li>') +
      '</ul></div>' +
      '<div class="card"><h3>How to answer</h3>' +
      (S.profile.chart === 'letters'
        ? '<p>One letter appears at a time — always one of <b>C D H K N O R S V Z</b>. The person being tested reads it aloud.</p>' +
          (helper
            ? '<p><b>Helper:</b> hold the phone facing the patient and tap the letter they say. If they can\'t see it, tap <b>Can\'t see</b>. Don\'t tell them if they were right.</p>'
            : '<p>Type the letter on the keyboard. If it can\'t be seen, press <b>Space</b>. Guess if you are not sure.</p>')
        : '<p>A letter <b>E</b> appears, turned in one of four directions. The person being tested points (or says) which way the <b>legs of the E</b> point: up, down, left or right.</p>' +
          (helper
            ? '<p><b>Helper:</b> hold the phone facing the patient. <b>Swipe</b> anywhere on the screen in the direction they point (or tap the arrow buttons). If they can\'t see it, tap <b>Can\'t see</b>. Don\'t tell them if they were right.</p>'
            : '<p>Press the <b>arrow key</b> for the direction. If the E can\'t be seen, press <b>Space</b>. Guess if you are not sure — a guess is better than skipping.</p>')) +
      '<p class="muted">If unsure, encourage a best guess. Don\'t squint or lean forward.</p></div>' +
      '<button class="btn primary big" id="go">Start practice (3 big letters)</button></div>'
    );
    on('#go', 'click', function () {
      S.active = true;
      goFull();
      keepAwake();
      practice();
    });
  }

  /* ================= ACUITY TEST SCREEN (shared) ================= */
  /* overall step dots: practice, then acuity / red-green / dial for each eye */
  function stepDots(step) {
    if (step == null) return '';
    var h = '<div class="stepdots" title="Progress">';
    for (var i = 0; i < 7; i++) h += '<i class="' + (i < step ? 'done' : i === step ? 'now' : '') + '"></i>';
    return h + '</div>';
  }

  /* ---------- Sloan-style letters on the standard 5x5 grid (stroke = 1/5 of height) ---------- */
  var LETTER_PATHS = {
    C: 'M4.232 1.5A2 2 0 1 0 4.232 3.5',
    D: 'M0.5 0V5M0.5 0.5H2.5A2 2 0 0 1 2.5 4.5H0.5',
    H: 'M0.5 0V5M4.5 0V5M0.5 2.5H4.5',
    K: 'M0.5 0V5M4.6 0L0.9 3.3M2.2 2.1L4.7 5',
    O: 'M2.5 0.5A2 2 0 1 0 2.5001 0.5',
    R: 'M0.5 0V5M0.5 0.5H3A1.25 1.25 0 0 1 3 3H0.5M2.6 3L4.6 5',
    S: 'M4.35 1.25C3.95 0.75 3.3 0.5 2.5 0.5C1.4 0.5 0.65 1 0.65 1.75C0.65 3.1 4.35 2 4.35 3.3C4.35 4.05 3.6 4.5 2.5 4.5C1.6 4.5 0.95 4.25 0.55 3.7',
    V: 'M0.45 0L2.5 4.5L4.55 0',
    Z: 'M0 0.5H5M0 4.5H5M4.3 0.95L0.7 4.05'
  };
  // N as one filled outline (stroke width 1 throughout) so the diagonal joins without seams
  var LETTER_FILLS = { N: 'M0 5V0H1.2L4 3.6V0H5V5H3.8L1 1.4V5Z' };
  function letterSVG(px, ch) {
    var shape = LETTER_FILLS[ch]
      ? '<path d="' + LETTER_FILLS[ch] + '" fill="#000"/>'
      : '<path d="' + LETTER_PATHS[ch] + '" fill="none" stroke="#000" stroke-width="1" stroke-linejoin="round"/>';
    return '<svg class="optotype letter" width="' + px.toFixed(2) + '" height="' + px.toFixed(2) + '" viewBox="0 0 5 5" data-l="' + ch +
      '">' + shape + '</svg>';
  }

  /* ---------- words for the reading test ---------- */
  var WORDS = ['apple', 'beach', 'chair', 'dream', 'earth', 'flame', 'grape', 'house', 'juice', 'knife', 'lemon', 'music',
    'night', 'ocean', 'piano', 'queen', 'river', 'smile', 'table', 'uncle', 'voice', 'water', 'zebra', 'bread', 'cloud',
    'dance', 'field', 'glass', 'heart', 'light', 'money', 'paper', 'plant', 'radio', 'sheep', 'stone', 'sugar', 'tiger',
    'train', 'watch', 'world', 'honey', 'horse', 'mouse', 'peace', 'green', 'black', 'white', 'south', 'north', 'sweet',
    'storm', 'shirt', 'clock', 'brush', 'candy', 'crown', 'eagle', 'fruit', 'ghost', 'happy', 'laugh', 'magic', 'nurse',
    'onion', 'pearl', 'quiet', 'robot', 'salad', 'snake', 'toast', 'lucky', 'mango', 'tower'];
  var NEAR_FONT = 'Arial, Helvetica, "Liberation Sans", Roboto, sans-serif';
  var NEAR_M = 0.4; // reading distance in metres (40 cm)
  var xRatio = null, wordRatio = null;
  /** x-height and widest-word width of the reading font, as fractions of font-size (measured, not assumed). */
  function measureFont() {
    if (xRatio) return;
    try {
      var c = document.createElement('canvas').getContext('2d');
      c.font = '200px ' + NEAR_FONT;
      var m = c.measureText('x');
      xRatio = (m.actualBoundingBoxAscent || 0) / 200;
      wordRatio = 0;
      WORDS.forEach(function (w) { wordRatio = Math.max(wordRatio, c.measureText(w).width / 200); });
    } catch (e) { /* fall back below */ }
    if (!xRatio || xRatio < 0.3 || xRatio > 0.7) xRatio = 0.519; // Arial
    if (!wordRatio) wordRatio = 3.2;
  }
  function nearFontPx(logMAR) {
    measureFont();
    return A.nearXHeightMm(logMAR, NEAR_M) * S.pxPerMm / xRatio;
  }
  function nearRange() {
    measureFont();
    var dpr = window.devicePixelRatio || 1;
    var top = -1, bottom = -1;
    A.LINES.forEach(function (L, i) {
      var f = nearFontPx(L);
      if (top < 0 && f * wordRatio <= window.innerWidth - 24 && f <= window.innerHeight - 330) top = i;
      if (f * xRatio * dpr >= 4.5) bottom = i; // x-height at least 4.5 device pixels
    });
    return { top: top, bottom: bottom };
  }
  function wordOptions(target) {
    var opts = [target];
    while (opts.length < 4) {
      var w = WORDS[Math.floor(Math.random() * WORDS.length)];
      if (opts.indexOf(w) < 0) opts.push(w);
    }
    for (var i = opts.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = opts[i]; opts[i] = opts[j]; opts[j] = t; }
    return opts;
  }

  function testScreen(opts) {
    // opts: { kind: 'e'|'letters'|'words', title, step, getTrial(), onAnswer(sym|null) -> bool done, practice, progress() }
    var kind = opts.kind || 'e';
    var helper = S.profile.mode === 'helper';
    var pad, hint;
    if (kind === 'letters') {
      pad = '<div class="lpad">' + A.LETTERS.map(function (l) { return '<button data-d="' + l + '">' + l + '</button>'; }).join('') +
        '<button class="wide" data-d="none">Can\'t see</button></div>';
      hint = helper ? 'Tap the letter the patient reads out' : 'Type the letter · Space = can\'t see';
    } else if (kind === 'words') {
      pad = '<div class="wpad" id="wpad"></div>';
      hint = 'Tap the word you see · keys 1–4';
    } else {
      pad = '<div class="pad">' +
        '<button class="u" data-d="up" aria-label="Up">↑</button>' +
        '<button class="l" data-d="left" aria-label="Left">←</button>' +
        '<button class="c" data-d="none">Can\'t<br>see</button>' +
        '<button class="r" data-d="right" aria-label="Right">→</button>' +
        '<button class="d" data-d="down" aria-label="Down">↓</button></div>';
      hint = helper ? 'Swipe the direction the patient points' : 'Arrow keys · Space = can\'t see';
    }
    render(
      '<div class="test" id="t">' +
      '<div class="tbar"><button class="x" id="quit" aria-label="Quit">✕</button><span class="grow">' + esc(opts.title) +
      stepDots(opts.step) + '</span><span id="prog" style="min-width:34px;text-align:right"></span></div>' +
      '<div class="tprog"><i id="bar"></i></div>' +
      '<div class="stage" id="stage"></div>' +
      '<div class="hint">' + hint + '</div>' + pad + '</div>', true
    );

    var stage = $('#stage');
    var busy = false;
    var n = 0;

    function symbolHTML(t) {
      if (kind === 'words') {
        return '<div class="word" style="font-family:' + NEAR_FONT.replace(/"/g, '&quot;') + ';font-size:' + nearFontPx(t.logMAR).toFixed(2) + 'px">' + t.dir + '</div>';
      }
      var px = A.optotypeMm(t.logMAR, S.distanceM) * S.pxPerMm;
      return kind === 'letters' ? letterSVG(px, t.dir) : eSVG(px, t.dir);
    }

    function show(animate) {
      var t = opts.getTrial();
      stage.innerHTML = '<div class="fly' + (animate ? ' enter' : '') + '">' + symbolHTML(t) + '</div>';
      if (kind === 'words') {
        if (!t.options) t.options = wordOptions(t.dir);
        $('#wpad').innerHTML = t.options.map(function (w, j) { return '<button data-d="' + w + '"><small>' + (j + 1) + '</small>' + w + '</button>'; }).join('') +
          '<button class="wide" data-d="none">Can\'t read it</button>';
        bindPad();
      }
      if (!opts.practice) $('#prog').textContent = String(++n);
      if (opts.progress) $('#bar').style.width = Math.round(opts.progress() * 100) + '%';
    }

    function respond(d) {
      if (busy) return;
      busy = true;
      buzz();
      var btn = $app.querySelector('[data-d="' + (d || 'none') + '"]');
      if (btn) { btn.classList.add('hit'); setTimeout(function () { btn.classList.remove('hit'); }, 180); }
      var trial = opts.getTrial();
      var done = opts.onAnswer(d);
      var fly = stage.querySelector('.fly');
      var flyDir = kind === 'e' ? (d || 'none') : 'none';
      if (fly) { fly.classList.remove('enter'); void fly.offsetWidth; fly.classList.add('go-' + flyDir); }
      if (opts.progress) $('#bar').style.width = Math.round(opts.progress() * 100) + '%';

      if (opts.practice) {
        var ok = d === trial.dir;
        var names = { up: 'up ↑', down: 'down ↓', left: 'left ←', right: 'right →' };
        var answerText = kind === 'e' ? 'The E pointed ' + names[trial.dir] : (kind === 'letters' ? 'It was the letter ' : 'The word was "') + trial.dir + (kind === 'words' ? '"' : '');
        setTimeout(function () {
          stage.innerHTML = '<div class="feedback ' + (ok ? 'ok' : 'no') + '"><div class="mark">' + (ok ? '✓' : '✕') + '</div>' +
            '<p>' + (ok ? 'Correct!' : esc(answerText)) + '</p></div>';
          if (!ok) buzz('heavy');
        }, 200);
      }
      setTimeout(function () {
        busy = false;
        if (!done) show(true);
      }, opts.practice ? 1200 : 360); // brief blank between symbols
    }

    function bindPad() {
      $app.querySelectorAll('[data-d]').forEach(function (b) {
        if (b._bound) return;
        b._bound = true;
        b.addEventListener('click', function (e) {
          var d = e.currentTarget.getAttribute('data-d');
          respond(d === 'none' ? null : d);
        });
      });
    }
    bindPad();

    // swipe (Tumbling E only), with a glowing trail under the finger
    var t0 = null, trail = null;
    var root = $('#t');
    if (kind === 'e') {
      root.addEventListener('pointerdown', function (e) {
        if (e.target.closest('button')) return;
        t0 = { x: e.clientX, y: e.clientY };
        trail = document.createElement('div');
        trail.className = 'swipe-trail';
        trail.style.left = e.clientX + 'px'; trail.style.top = e.clientY + 'px';
        root.appendChild(trail);
      });
      root.addEventListener('pointermove', function (e) {
        if (t0 && trail) { trail.style.left = e.clientX + 'px'; trail.style.top = e.clientY + 'px'; }
      });
      var endTrail = function () {
        if (trail) { var tr = trail; tr.style.opacity = '0'; setTimeout(function () { tr.remove(); }, 300); trail = null; }
      };
      root.addEventListener('pointerup', function (e) {
        endTrail();
        if (!t0) return;
        var dx = e.clientX - t0.x, dy = e.clientY - t0.y;
        t0 = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 40) return;
        respond(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      });
      root.addEventListener('pointercancel', function () { t0 = null; endTrail(); });
    }

    keyHandler = function (e) {
      if (e.key === 'Escape') { confirmQuit(); return; }
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); respond(null); return; }
      if (kind === 'e') {
        var map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
        if (map[e.key]) { e.preventDefault(); respond(map[e.key]); }
      } else if (kind === 'letters') {
        var L = (e.key || '').toUpperCase();
        if (A.LETTERS.indexOf(L) >= 0) { e.preventDefault(); respond(L); }
      } else {
        var t = opts.getTrial();
        var j = parseInt(e.key, 10);
        if (j >= 1 && j <= 4 && t.options) { e.preventDefault(); respond(t.options[j - 1]); }
      }
    };
    on('#quit', 'click', confirmQuit);
    resizeHandler = function () { if (!busy) { n = Math.max(0, n - 1); show(false); } };
    show(true);
  }

  function confirmQuit() {
    if (window.confirm('Stop the test? Progress will be lost.')) home();
  }

  /* ================= PRACTICE ================= */
  function practice() {
    var kind = S.profile.chart === 'letters' ? 'letters' : 'e';
    var set = kind === 'letters' ? A.LETTERS : A.DIRS;
    var count = 0, cur = null, last = null;
    function trial() {
      if (!cur) {
        var d;
        do { d = set[Math.floor(Math.random() * set.length)]; } while (d === last);
        last = d;
        cur = { logMAR: A.LINES[S.top], dir: d };
      }
      return cur;
    }
    testScreen({
      kind: kind,
      title: 'Practice — both eyes open',
      practice: true,
      step: 0,
      progress: function () { return count / 3; },
      getTrial: trial,
      onAnswer: function () {
        cur = null;
        if (++count >= 3) { setTimeout(function () { eyeIntro(0); }, 1300); return true; }
        return false;
      }
    });
  }

  /* ================= EYE INTRO ================= */
  function eyeIcon(covered) {
    return covered
      ? '<svg viewBox="0 0 96 60" style="overflow:hidden"><path d="M6 30c10-14 24-22 42-22s32 8 42 22c-10 14-24 22-42 22S16 44 6 30z" fill="#fff" stroke="#94a3b8" stroke-width="3"/><circle cx="48" cy="30" r="13" fill="#94a3b8"/>' +
        '<g class="hand"><rect x="2" y="4" width="92" height="52" rx="24" fill="#f2c9a0" stroke="#d9a77a" stroke-width="2"/><path d="M22 10v40M40 8v44M58 8v44M76 10v40" stroke="#d9a77a" stroke-width="2"/></g></svg>'
      : '<svg viewBox="0 0 96 60"><path d="M6 30c10-14 24-22 42-22s32 8 42 22c-10 14-24 22-42 22S16 44 6 30z" fill="#fff" stroke="#0f766e" stroke-width="3"/><circle cx="48" cy="30" r="13" fill="#0f766e"/><circle cx="48" cy="30" r="6" fill="#062e2b"/><circle cx="52" cy="26" r="2.5" fill="#fff"/></svg>';
  }
  function eyeIntro(i) {
    var eye = S.order[i];
    var other = otherEye(eye);
    // The patient's right eye appears on the viewer's left, as when facing them.
    render(
      '<div class="page">' +
      '<p class="center muted" style="margin-top:10px">Eye ' + (i + 1) + ' of 2</p>' +
      '<p class="big-instr">Cover the ' + eyeName(other).toUpperCase() + ' eye</p>' +
      '<p class="center" style="font-size:1.1rem">Testing the <b>' + eyeName(eye).toLowerCase() + ' eye</b></p>' +
      '<div class="eyes-illus">' +
      '<div class="eye">' + eyeIcon(eye !== 'right') + 'Right eye</div>' +
      '<div class="eye">' + eyeIcon(eye !== 'left') + 'Left eye</div>' +
      '</div>' +
      '<div class="card"><ul class="check">' +
      '<li>Cover the ' + eyeName(other).toLowerCase() + ' eye with the palm of your hand. Don\'t press on the eye.</li>' +
      '<li>Keep both eyes open behind your hand — don\'t squeeze it shut.</li>' +
      '<li>Stay at ' + S.distanceM + ' m. The letters will get smaller.</li></ul></div>' +
      '<button class="btn primary big" id="go">Start ' + eyeName(eye).toLowerCase() + ' eye</button>' +
      '<button class="btn ghost" id="quit">Cancel test</button></div>'
    );
    on('#go', 'click', function () { goFull(); acuity(eye, i); });
    on('#quit', 'click', confirmQuit);
  }

  /* ================= ACUITY ================= */
  function acuity(eye, i) {
    var letters = S.profile.chart === 'letters';
    var run = A.createRun(S.top, S.bottom, Math.random, { symbols: letters ? A.LETTERS : A.DIRS });
    testScreen({
      kind: letters ? 'letters' : 'e',
      title: eyeName(eye) + ' eye',
      step: 1 + i * 3,
      progress: function () { return run.done ? 1 : Math.min(0.95, run.state.trials.length / 22); },
      getTrial: function () { return run.current(); },
      onAnswer: function (d) {
        run.answer(d);
        if (run.done) {
          S.eyes[eye].acuity = run.result();
          setTimeout(function () { duochrome(eye, i); }, 320);
          return true;
        }
        return false;
      }
    });
  }

  /* ================= DUOCHROME ================= */
  function duochrome(eye, i) {
    var ac = S.eyes[eye].acuity;
    var L = Math.min(Math.max(ac.logMAR + 0.3, 0.3), 1.0);
    render(
      '<div class="test">' +
      '<div class="tbar"><button class="x" id="quit">✕</button><span class="grow">' + eyeName(eye) + ' eye · red / green' + stepDots(2 + i * 3) + '</span><span style="min-width:34px"></span></div>' +
      '<div class="stage" id="stage"></div>' +
      '<div class="qpanel"><p class="q">Ask: <b>"Are the black rings sharper and blacker on the RED side, the GREEN side, or the same?"</b></p>' +
      '<div class="row"><button class="btn red" data-a="red">Red sharper</button><button class="btn" data-a="equal">Same</button><button class="btn green" data-a="green">Green sharper</button></div>' +
      '</div></div>', true
    );
    function draw() {
      var stage = $('#stage');
      var W = stage.clientWidth - 16, H = stage.clientHeight - 8;
      var u = A.detailMm(L, S.distanceM) * S.pxPerMm * 1.5;
      var need = 15; // each half is 15 units wide/high
      u = Math.max(2, Math.min(u, (W / 2) / need, H / need));
      var s = need * u, c = s / 2;
      var rings = function (cx) {
        return [2.2, 4.2, 6.2].map(function (r) {
          return '<circle cx="' + cx + '" cy="' + c + '" r="' + (r * u) + '" fill="none" stroke="#000" stroke-width="' + u + '"/>';
        }).join('') + '<circle cx="' + cx + '" cy="' + c + '" r="' + (0.7 * u) + '" fill="#000"/>';
      };
      stage.innerHTML = '<svg width="' + 2 * s + '" height="' + s + '" viewBox="0 0 ' + 2 * s + ' ' + s + '">' +
        '<rect width="' + s + '" height="' + s + '" fill="#e00000"/><rect x="' + s + '" width="' + s + '" height="' + s + '" fill="#009a3e"/>' +
        rings(c) + rings(s + c) + '</svg>';
    }
    on('[data-a]', 'click', function (e) {
      buzz();
      S.eyes[eye].duochrome = e.currentTarget.getAttribute('data-a');
      astig(eye, i);
    });
    on('#quit', 'click', confirmQuit);
    resizeHandler = draw;
    draw();
  }

  /* ================= ASTIGMATISM DIAL ================= */
  var AXES = [
    { label: '12 – 6', clock: 12, axis: 180 },
    { label: '1 – 7', clock: 1, axis: 30 },
    { label: '2 – 8', clock: 2, axis: 60 },
    { label: '3 – 9', clock: 3, axis: 90 },
    { label: '4 – 10', clock: 4, axis: 120 },
    { label: '5 – 11', clock: 5, axis: 150 }
  ];
  function astig(eye, i) {
    var ac = S.eyes[eye].acuity;
    var L = Math.min(Math.max(ac.logMAR + 0.4, 0.4), 1.0);
    var picked = {};
    render(
      '<div class="test">' +
      '<div class="tbar"><button class="x" id="quit">✕</button><span class="grow">' + eyeName(eye) + ' eye · clock dial' + stepDots(3 + i * 3) + '</span><span style="min-width:34px"></span></div>' +
      '<div class="stage" id="stage"></div>' +
      '<div class="qpanel" id="qp"><p class="q">Ask: <b>"Do all the lines look equally black and sharp?"</b></p>' +
      '<div class="row"><button class="btn green" id="same">Yes, all the same</button><button class="btn" id="diff">No, some are darker</button></div></div>' +
      '</div>', true
    );
    function draw() {
      var stage = $('#stage');
      var D = Math.max(120, Math.min(stage.clientWidth - 16, stage.clientHeight - 8));
      var c = D / 2;
      // keep each 3-line spoke narrower than the gap between neighbouring spokes at the inner radius
      var sw = Math.max(1.5, Math.min(A.detailMm(L, S.distanceM) * S.pxPerMm, D / 62));
      var r0 = D * 0.2, r1 = D * 0.41;
      var g = '';
      for (var k = 0; k < 6; k++) {
        var a = k * 30 * Math.PI / 180; // 0 = vertical (12–6)
        var dx = Math.sin(a), dy = -Math.cos(a), px = Math.cos(a), py = Math.sin(a);
        [-2, 0, 2].forEach(function (o) {
          var ox = px * o * sw, oy = py * o * sw;
          [1, -1].forEach(function (sg) {
            g += '<line x1="' + (c + sg * dx * r0 + ox) + '" y1="' + (c + sg * dy * r0 + oy) + '" x2="' + (c + sg * dx * r1 + ox) + '" y2="' + (c + sg * dy * r1 + oy) + '" stroke="#000" stroke-width="' + sw + '"/>';
          });
        });
      }
      for (var h = 1; h <= 12; h++) {
        var b = h * 30 * Math.PI / 180;
        g += '<text x="' + (c + Math.sin(b) * D * 0.46) + '" y="' + (c - Math.cos(b) * D * 0.46) + '" font-size="' + (D * 0.055) + '" text-anchor="middle" dominant-baseline="central" fill="#334155" font-weight="700" font-family="system-ui,sans-serif">' + h + '</text>';
      }
      stage.innerHTML = '<svg width="' + D + '" height="' + D + '" viewBox="0 0 ' + D + ' ' + D + '">' + g + '</svg>';
    }
    function finish(result) {
      buzz();
      S.eyes[eye].astig = result;
      if (i === 0) eyeIntro(1); else results();
    }
    on('#same', 'click', function () { finish({ uneven: false, axes: [] }); });
    on('#diff', 'click', function () {
      $('#qp').innerHTML = '<p class="q">Ask: <b>"Which line looks darkest?"</b> (tap one or more, by the clock numbers)</p>' +
        '<div class="axes">' + AXES.map(function (x, j) { return '<button data-j="' + j + '">' + x.label + '</button>'; }).join('') + '</div>' +
        '<div class="row"><button class="btn" id="unsure">Not sure</button><button class="btn primary" id="done">Done</button></div>';
      on('.axes button', 'click', function (e) {
        var j = e.currentTarget.getAttribute('data-j');
        picked[j] = !picked[j];
        buzz();
        e.currentTarget.classList.toggle('on', !!picked[j]);
      });
      on('#unsure', 'click', function () { finish({ uneven: true, axes: [] }); });
      on('#done', 'click', function () {
        var axes = Object.keys(picked).filter(function (j) { return picked[j]; }).map(function (j) { return AXES[j]; });
        finish({ uneven: true, axes: axes });
      });
    });
    on('#quit', 'click', confirmQuit);
    resizeHandler = draw;
    draw();
  }

  /* ================= RESULTS ================= */
  function category(ac) {
    var L = ac.logMAR;
    if (ac.worseThanChart || L > 1.0) return { t: 'Severely reduced', who: 'Severe visual impairment or worse (WHO)', cls: 'bad' };
    if (L <= 0.0) return { t: 'Normal', who: 'No visual impairment (WHO)', cls: 'good' };
    if (L <= 0.2) return { t: 'Slightly below normal', who: 'No visual impairment (WHO)', cls: 'ok' };
    if (L <= 0.3) return { t: 'Mildly reduced', who: 'No visual impairment — at the WHO 6/12 limit', cls: 'warn' };
    if (L <= 0.48) return { t: 'Reduced', who: 'Mild visual impairment (WHO)', cls: 'warn' };
    return { t: 'Considerably reduced', who: 'Moderate visual impairment (WHO)', cls: 'bad' };
  }
  /** Position on the 6/60 (0) .. 6/3 (1) scale. */
  function scaleFrac(logMAR) { return Math.min(1, Math.max(0, (1.0 - logMAR) / 1.3)); }
  function acuityText(ac) {
    var sn = A.snellen(ac.logMAR);
    if (ac.worseThanChart) {
      var top = A.snellen(ac.topLogMAR);
      return { metric: '<' + top.metric, imperial: '<' + top.imperial, note: 'Could not read the largest letters' };
    }
    if (ac.hitFloor && ac.lettersCorrect && ac.logMAR <= ac.floorLogMAR + 0.02) {
      return { metric: sn.metric + '+', imperial: sn.imperial + '+', note: 'Read the smallest letters this screen can show' };
    }
    return { metric: sn.metric, imperial: sn.imperial, note: '' };
  }
  function duoText(d, glasses) {
    if (!d) return '—';
    if (d === 'red') return glasses ? 'Red sharper — glasses may be slightly under-powered for distance' : 'Red sharper — pattern seen with near-sightedness (myopia)';
    if (d === 'green') return glasses ? 'Green sharper — glasses may be slightly over-powered' : 'Green sharper — pattern seen with far-sightedness (hyperopia) or strong focusing effort';
    return 'Balanced — no clear focusing bias';
  }
  function astigText(a) {
    if (!a) return '—';
    if (!a.uneven) return 'All lines equal — no sign of astigmatism';
    if (!a.axes.length) return 'Some lines darker — possible astigmatism';
    return 'Darker at ' + a.axes.map(function (x) { return x.label; }).join(', ') + ' o\'clock — possible astigmatism (approx. axis ' +
      a.axes.map(function (x) { return x.axis + '°'; }).join(' / ') + ')';
  }

  function buildAdvice(r) {
    var adv = [];
    var R = r.right.acuity, Lf = r.left.acuity;
    var worst = Math.max(R.logMAR, Lf.logMAR);
    var glasses = r.glasses === 'glasses';
    if (R.worseThanChart || Lf.worseThanChart || worst > 0.48) {
      adv.push('<b>Please see an optometrist or eye doctor soon.</b> Vision in at least one eye is well below normal.');
    } else if (worst > 0.2) {
      adv.push('<b>Book an eye examination.</b> Vision in at least one eye is below the normal range' + (glasses ? ' — your glasses may need updating.' : ' — glasses may help.'));
    } else if (worst > 0.0) {
      adv.push('Vision is close to normal. A routine eye examination is still worthwhile' + (glasses ? ', and may sharpen your prescription.' : '.'));
    } else {
      adv.push('Distance vision is in the normal range' + (glasses ? ' with your current glasses / contacts.' : '.') + ' Keep up regular eye check-ups (every 1–2 years).');
    }
    if (Math.abs(R.logMAR - Lf.logMAR) >= 0.2) {
      adv.push('There is a difference of about ' + Math.round(Math.abs(R.logMAR - Lf.logMAR) / 0.1) + ' chart lines between your eyes. This should be checked by an eye professional' + (r.age && +r.age < 12 ? ' — especially important in children (risk of lazy eye).' : '.'));
    }
    if (!glasses && (r.right.duochrome === 'red' || r.left.duochrome === 'red') && worst > 0.1) {
      adv.push('The red–green test and reduced distance vision together suggest <b>near-sightedness</b>. An optometrist can measure the exact lens power you need.');
    }
    if ((r.right.astig && r.right.astig.uneven) || (r.left.astig && r.left.astig.uneven)) {
      adv.push('The clock-dial result suggests possible <b>astigmatism</b>, which is easily corrected with glasses or contact lenses.');
    }
    adv.push('Seek urgent care for sudden vision loss, flashes of light, a curtain over your vision, eye pain or a red painful eye — whatever this test shows.');
    return adv;
  }

  function results(entry) {
    var fresh = !entry;
    if (fresh) {
      entry = {
        id: Date.now(),
        date: new Date().toISOString(),
        name: S.profile.name,
        age: S.profile.age,
        glasses: S.profile.glasses,
        distanceM: S.distanceM,
        pxPerMm: Math.round(S.pxPerMm * 100) / 100,
        right: S.eyes.right,
        left: S.eyes.left
      };
      var hist = store.get('history', []);
      hist.unshift(entry);
      store.set('history', hist.slice(0, 50));
      S.active = false;
      releaseAwake();
      exitFull();
    }

    var when = new Date(entry.date);
    var glasses = entry.glasses === 'glasses';
    function eyeCard(eye) {
      var ac = entry[eye].acuity;
      var t = acuityText(ac), cat = category(ac);
      var color = { good: '#15803d', ok: '#65a30d', warn: '#d97706', bad: '#dc2626' }[cat.cls];
      var C = 2 * Math.PI * 46;
      return '<div class="res-eye"><div class="lbl">' + eyeName(eye) + ' eye</div>' +
        '<div class="ring"><svg viewBox="0 0 112 112"><circle class="bg" cx="56" cy="56" r="46"/>' +
        '<circle class="fg" cx="56" cy="56" r="46" stroke="' + color + '" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '" data-frac="' + scaleFrac(ac.logMAR) + '"/></svg>' +
        '<div class="val"><b>' + t.metric + '</b><small>' + t.imperial + '</small></div></div>' +
        '<div class="tiny">logMAR ' + fmtLogMAR(ac.logMAR) + ' · decimal ' + A.decimal(ac.logMAR).toFixed(2) + '</div>' +
        '<span class="pill ' + cat.cls + '">' + cat.t + '</span>' +
        (t.note ? '<div class="tiny" style="margin-top:6px">' + t.note + '</div>' : '') + '</div>';
    }
    function detailRows(eye) {
      var e = entry[eye];
      var cat = category(e.acuity);
      return '<tr><th>' + eyeName(eye) + ' eye</th><td>' +
        '<div><b>Acuity:</b> ' + acuityText(e.acuity).metric + ' (' + acuityText(e.acuity).imperial + '), ' + e.acuity.lettersCorrect + ' symbols correct. ' + cat.who + '.</div>' +
        '<div><b>Red–green:</b> ' + duoText(e.duochrome, glasses) + '</div>' +
        '<div><b>Clock dial:</b> ' + astigText(e.astig) + '</div></td></tr>';
    }
    var adv = buildAdvice(entry);
    var fr = scaleFrac(entry.right.acuity.logMAR), fl = scaleFrac(entry.left.acuity.logMAR);
    var nudge = Math.abs(fr - fl) < 0.07 ? (fr <= fl ? { r: "nl", l: "nr" } : { r: "nr", l: "nl" }) : { r: "", l: "" };

    render(
      '<div class="page">' +
      (fresh ? '' : nav('', history)) +
      '<div class="center"><h1 style="margin-top:6px">Your results</h1>' +
      '<p class="muted" style="margin:0">' + (entry.name ? esc(entry.name) + ' · ' : '') + when.toLocaleDateString() + ' ' + when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</p>' +
      '<p class="muted" style="margin:0;font-size:.88rem">' + (glasses ? 'With glasses / contacts' : 'Without glasses (natural vision)') + ' · tested at ' + entry.distanceM + ' m</p></div>' +
      '<div class="res-eyes">' + eyeCard('right') + eyeCard('left') + '</div>' +
      '<div class="card"><h3>Where you are on the vision scale</h3>' +
      '<div class="scale"><div class="mk r ' + nudge.r + '" data-frac="' + scaleFrac(entry.right.acuity.logMAR) + '" style="left:0%"><b>R</b></div>' +
      '<div class="mk l ' + nudge.l + '" data-frac="' + scaleFrac(entry.left.acuity.logMAR) + '" style="left:0%"><b>L</b></div></div>' +
      '<div style="position:relative;height:18px;margin:6px 6px 0;font-size:.72rem;color:var(--muted)">' +
      [1.0, 0.6, 0.3, 0.0, -0.3].map(function (L) {
        return '<span style="position:absolute;left:' + (scaleFrac(L) * 100) + '%;transform:translateX(-50%)">' + A.snellen(L).metric + '</span>';
      }).join('') + '</div>' +
      '<p class="muted" style="font-size:.8rem;margin:8px 0 0">Left = poor, right = sharp. 6/6 (20/20) is normal; anything right of it is better than average.</p></div>' +
      '<div class="card"><h3>What this means</h3><ul class="advice">' + adv.map(function (a) { return '<li>' + a + '</li>'; }).join('') + '</ul></div>' +
      '<div class="card"><h3>Details</h3><table class="detail">' + detailRows('right') + detailRows('left') + '</table>' +
      '<p class="muted" style="font-size:.82rem;margin-top:10px">6/6 (20/20) is normal adult vision: at 6 m you see what a typical eye sees at 6 m. 6/12 means you need to be at 6 m to see what a typical eye sees from 12 m. Lower logMAR is better (0.00 = 6/6).</p></div>' +
      '<div class="card tint" style="font-size:.88rem"><b>Important:</b> this is a screening result for visual acuity. It is not a glasses prescription (lens power such as −1.50 can only be measured by an optometrist) and does not detect every eye condition.</div>' +
      '<div class="noprint">' +
      '<button class="btn primary" id="share">Share / copy result</button>' +
      (!IS_NATIVE ? '<button class="btn" id="print">Print / save as PDF</button>' : '') +
      (fresh ? '<button class="btn" id="again">Test again</button>' : '<button class="btn" id="del">Delete this result</button>') +
      '<button class="btn ghost" id="home">Home</button></div></div>'
    );

    // animate rings and scale markers in
    requestAnimationFrame(function () {
      setTimeout(function () {
        $app.querySelectorAll('.ring .fg').forEach(function (c) {
          var C = parseFloat(c.getAttribute('stroke-dasharray'));
          c.style.strokeDashoffset = C * (1 - Math.max(0.03, parseFloat(c.getAttribute('data-frac'))));
        });
        $app.querySelectorAll('.scale .mk').forEach(function (m) { m.style.left = parseFloat(m.getAttribute('data-frac')) * 100 + '%'; });
      }, 150);
    });
    if (fresh) {
      buzz('heavy');
      if (entry.right.acuity.logMAR <= 0.0 && entry.left.acuity.logMAR <= 0.0) setTimeout(confetti, 700);
    }

    on('#share', 'click', function () {
      var r = acuityText(entry.right.acuity), l = acuityText(entry.left.acuity);
      var text = 'Eyesight Checker result (' + when.toLocaleDateString() + ', ' + (glasses ? 'with glasses' : 'without glasses') + ')\n' +
        'Right eye: ' + r.metric + ' (' + r.imperial + '), logMAR ' + fmtLogMAR(entry.right.acuity.logMAR) + '\n' +
        'Left eye: ' + l.metric + ' (' + l.imperial + '), logMAR ' + fmtLogMAR(entry.left.acuity.logMAR) + '\n' +
        'Screening only — not a prescription.';
      if (navigator.share) {
        navigator.share({ title: 'Eyesight result', text: text }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () { $('#share').textContent = 'Copied to clipboard ✓'; }, function () { window.prompt('Copy your result:', text); });
      } else {
        window.prompt('Copy your result:', text);
      }
    });
    on('#print', 'click', function () { window.print(); });
    on('#again', 'click', function () {
      var p = S.profile; newSession(); S.profile = p; calibrate();
    });
    on('#home', 'click', home);
    on('#del', 'click', function () {
      if (!window.confirm('Delete this result?')) return;
      store.set('history', store.get('history', []).filter(function (h) { return h.id !== entry.id; }));
      history();
    });
  }

  /* ================= READING TEST (near vision, words) ================= */
  function nearProfile() {
    var p = S.profile;
    var g = p.nearGlasses || 'none';
    render(
      '<div class="page">' + nav('Reading test', home, 'Step 1 of 3') +
      '<p class="muted">Checks how small you can read at normal reading distance (40 cm / 16 in). Both eyes open. You only need this phone and a ruler or tape.</p>' +
      '<label class="field">Age (optional — helps explain the result)<input id="age" type="number" min="3" max="110" inputmode="numeric" value="' + esc(p.age) + '"></label>' +
      '<h3 style="margin-top:18px">What are you wearing for this test?</h3>' +
      '<div class="choice">' +
      '<label><input type="radio" name="ng" value="none"' + (g === 'none' ? ' checked' : '') + '><span><b>No glasses</b><small>Natural near vision.</small></span></label>' +
      '<label><input type="radio" name="ng" value="reading"' + (g === 'reading' ? ' checked' : '') + '><span><b>Reading glasses / varifocals</b><small>Checks your current reading prescription.</small></span></label>' +
      '<label><input type="radio" name="ng" value="distance"' + (g === 'distance' ? ' checked' : '') + '><span><b>Distance glasses / contacts</b><small>The glasses you normally wear for everything.</small></span></label>' +
      '</div>' +
      '<button class="btn primary" id="next">Continue</button></div>'
    );
    on('#next', 'click', function () {
      S.profile.age = $('#age').value.trim();
      S.profile.nearGlasses = ($app.querySelector('input[name=ng]:checked') || {}).value || 'none';
      store.set('profile', S.profile);
      S.kind = 'near';
      calibrate(nearSetup, nearProfile);
    });
  }

  function nearSetup() {
    var r = nearRange();
    var ok = r.top >= 0 && r.top <= 4 && r.bottom >= 8;
    S.top = r.top; S.bottom = r.bottom; S.distanceM = NEAR_M;
    render(
      '<div class="page">' + nav('Hold the phone at 40 cm', function () { calibrate(nearSetup, nearProfile); }, 'Step 3 of 3') +
      '<div class="dist-illus"><svg viewBox="0 0 360 120" aria-hidden="true">' +
      '<circle cx="62" cy="58" r="30" fill="#f2c9a0"/><path d="M40 40c4-16 40-20 48-2" stroke="#4b3621" stroke-width="10" fill="none" stroke-linecap="round"/>' +
      '<circle cx="74" cy="56" r="3.5" fill="#0f172a"/><path d="M84 66c-3 4-7 5-10 4" stroke="#0f172a" stroke-width="2" fill="none"/>' +
      '<rect x="268" y="26" width="34" height="64" rx="6" fill="#0f172a"/><rect x="272" y="32" width="26" height="50" rx="2" fill="#fff"/>' +
      '<text x="285" y="62" text-anchor="middle" font-size="9" font-family="Arial">word</text>' +
      '<line x1="98" y1="104" x2="258" y2="104" stroke="#0f766e" stroke-width="2" marker-end="url(#nh)" marker-start="url(#nh2)"/>' +
      '<defs><marker id="nh" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8z" fill="#0f766e"/></marker>' +
      '<marker id="nh2" markerWidth="8" markerHeight="8" refX="1" refY="4" orient="auto"><path d="M8 0L0 4L8 8z" fill="#0f766e"/></marker></defs>' +
      '<text x="178" y="96" text-anchor="middle" font-size="14" font-weight="700" fill="#0f766e" font-family="system-ui,sans-serif">40 cm (16 in)</text>' +
      '</svg></div>' +
      (ok
        ? '<div class="card"><ul class="check">' +
          '<li>Measure 40 cm from your eyes to the screen once with a ruler or tape, and keep the phone there. <b>Don\'t bring it closer</b> when words get small.</li>' +
          '<li>Both eyes open, normal room light, screen brightness up.</li>' +
          '<li>A word appears in the middle. Tap the <b>same word</b> from the four choices below it. If you can\'t make it out, tap <b>Can\'t read it</b> — or take your best guess.</li>' +
          '<li>Words get smaller as you go. About 2 minutes.</li></ul>' +
          '<p class="muted" style="font-size:.85rem;margin-bottom:0">This screen can show print from ' + nearLabel(A.LINES[r.top]) + ' down to ' + nearLabel(A.LINES[r.bottom]) + '.</p></div>' +
          '<button class="btn primary big" id="go">Start practice (2 words)</button>'
        : '<div class="card tint"><b>This screen can\'t show small enough print accurately.</b> The reading test needs a sharp, high-resolution screen — please use it on a phone.</div>' +
          '<button class="btn" id="home2">Back to home</button>') +
      '</div>'
    );
    on('#go', 'click', function () { S.active = true; goFull(); keepAwake(); nearPractice(); });
    on('#home2', 'click', home);
  }
  function nearLabel(L) {
    var M = A.nearM(L, NEAR_M);
    return 'N' + A.nPoint(M) + ' (' + M.toFixed(M < 1 ? 2 : 1) + ' M)';
  }

  function nearPractice() {
    var count = 0, cur = null;
    testScreen({
      kind: 'words',
      title: 'Practice — reading',
      practice: true,
      progress: function () { return count / 2; },
      getTrial: function () {
        if (!cur) cur = { logMAR: A.LINES[S.top], dir: WORDS[Math.floor(Math.random() * WORDS.length)] };
        return cur;
      },
      onAnswer: function () {
        cur = null;
        if (++count >= 2) { setTimeout(nearTest, 1300); return true; }
        return false;
      }
    });
  }

  function nearTest() {
    var run = A.createRun(S.top, S.bottom, Math.random, { symbols: WORDS, choices: 4 });
    testScreen({
      kind: 'words',
      title: 'Reading test · 40 cm',
      progress: function () { return run.done ? 1 : Math.min(0.95, run.state.trials.length / 22); },
      getTrial: function () { return run.current(); },
      onAnswer: function (d) {
        run.answer(d);
        if (run.done) {
          S.near = run.result();
          setTimeout(function () { nearResults(); }, 320);
          return true;
        }
        return false;
      }
    });
  }

  function nearCategory(ac) {
    var L = ac.logMAR;
    if (ac.worseThanChart || L > 0.7) return { t: 'Poor', cls: 'bad' };
    if (L <= 0.2) return { t: 'Good', cls: 'good' };
    if (L <= 0.4) return { t: 'Fair', cls: 'ok' };
    return { t: 'Reduced', cls: 'warn' };
  }
  function nearText(ac) {
    var M = A.nearM(ac.logMAR, NEAR_M);
    var t = { n: 'N' + A.nPoint(M), m: M.toFixed(M < 1 ? 2 : 1) + ' M', snellen: A.snellen(ac.logMAR).imperial, note: '' };
    if (ac.worseThanChart) { t.n = '>' + 'N' + A.nPoint(A.nearM(ac.topLogMAR, NEAR_M)); t.note = 'Could not read the largest words'; }
    else if (ac.hitFloor && ac.logMAR <= ac.floorLogMAR + 0.02) { t.n += '+'; t.note = 'Read the smallest words this screen can show'; }
    return t;
  }

  function nearResults(entry) {
    var fresh = !entry;
    if (fresh) {
      entry = {
        id: Date.now(), type: 'near', date: new Date().toISOString(),
        age: S.profile.age, glasses: S.profile.nearGlasses || 'none', distanceM: NEAR_M,
        pxPerMm: Math.round(S.pxPerMm * 100) / 100, near: S.near
      };
      var hist = store.get('history', []);
      hist.unshift(entry);
      store.set('history', hist.slice(0, 50));
      S.active = false; releaseAwake(); exitFull();
    }
    var ac = entry.near, t = nearText(ac), cat = nearCategory(ac);
    var when = new Date(entry.date);
    var age = parseInt(entry.age, 10);
    var color = { good: '#15803d', ok: '#65a30d', warn: '#d97706', bad: '#dc2626' }[cat.cls];
    var C = 2 * Math.PI * 46;
    var frac = Math.min(1, Math.max(0.03, (1.0 - ac.logMAR) / 1.3));
    var adv = [];
    if (ac.logMAR <= 0.2 && !ac.worseThanChart) adv.push('You can read small print (about N5–N6) at 40 cm — this is normal near vision.');
    else if (ac.logMAR <= 0.4 && !ac.worseThanChart) adv.push('You can read normal book and newspaper print (about N8), but very small print such as medicine labels is harder.');
    else adv.push('Normal-sized print (N8, like a newspaper) is difficult for you at 40 cm.');
    if (ac.logMAR > 0.2 || ac.worseThanChart) {
      if (entry.glasses === 'reading') adv.push('Your reading glasses may need updating — book an eye examination.');
      else if (age >= 40) adv.push('After about age 40, the eye gradually loses its ability to focus up close (<b>presbyopia</b>). It is very common and is corrected with reading glasses. An optometrist can check your eyes and tell you the exact strength you need.');
      else adv.push('Reduced near vision should be checked by an optometrist, especially under age 40.');
    }
    adv.push('Seek urgent care for sudden vision loss, flashes of light, a curtain over your vision, eye pain or a red painful eye — whatever this test shows.');
    var gl = { none: 'No glasses', reading: 'With reading glasses', distance: 'With distance glasses / contacts' }[entry.glasses] || '';

    render(
      '<div class="page">' + (fresh ? '' : nav('', history)) +
      '<div class="center"><h1 style="margin-top:6px">Reading test result</h1>' +
      '<p class="muted" style="margin:0">' + when.toLocaleDateString() + ' ' + when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</p>' +
      '<p class="muted" style="margin:0;font-size:.88rem">' + gl + ' · both eyes · 40 cm</p></div>' +
      '<div class="res-eye" style="margin:14px auto;max-width:260px"><div class="lbl">Near vision</div>' +
      '<div class="ring"><svg viewBox="0 0 112 112"><circle class="bg" cx="56" cy="56" r="46"/>' +
      '<circle class="fg" cx="56" cy="56" r="46" stroke="' + color + '" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '" data-frac="' + frac + '"/></svg>' +
      '<div class="val"><b>' + t.n + '</b><small>' + t.m + '</small></div></div>' +
      '<div class="tiny">logMAR ' + fmtLogMAR(ac.logMAR) + ' · ' + t.snellen + ' near equivalent</div>' +
      '<span class="pill ' + cat.cls + '">' + cat.t + '</span>' +
      (t.note ? '<div class="tiny" style="margin-top:6px">' + t.note + '</div>' : '') + '</div>' +
      '<div class="card"><h3>Print sizes you can read</h3><div class="samples">' +
      [[5, 'medicine labels, small print'], [6, 'phone messages, phone book'], [8, 'newspaper, most books'], [12, 'large-print books'], [18, 'headlines']].map(function (row) {
        var L = Math.log10((row[0] / 8) / NEAR_M); // N8 is about 1 M
        var can = !ac.worseThanChart && L >= ac.logMAR - 0.02;
        return '<div class="sample ' + (can ? 'yes' : 'no') + '"><span class="tag">' + (can ? '✓' : '✕') + ' N' + row[0] + '</span>' +
          '<span class="ex">' + row[1] + '</span></div>';
      }).join('') + '</div></div>' +
      '<div class="card"><h3>What this means</h3><ul class="advice">' + adv.map(function (a) { return '<li>' + a + '</li>'; }).join('') + '</ul></div>' +
      '<div class="card tint" style="font-size:.88rem"><b>Important:</b> this measures how small you can read. It is not a prescription for reading glasses — an optometrist measures the exact lens strength.</div>' +
      '<div class="noprint">' +
      '<button class="btn primary" id="share">Share / copy result</button>' +
      (fresh ? '<button class="btn" id="again">Test again</button>' : '<button class="btn" id="del">Delete this result</button>') +
      '<button class="btn ghost" id="home">Home</button></div></div>'
    );
    setTimeout(function () {
      $app.querySelectorAll('.ring .fg').forEach(function (c) { c.style.strokeDashoffset = C * (1 - frac); });
    }, 150);
    if (fresh) { buzz('heavy'); if (cat.cls === 'good') setTimeout(confetti, 700); }

    on('#share', 'click', function () {
      var text = 'Eyesight Checker — reading test (' + when.toLocaleDateString() + ', ' + gl.toLowerCase() + ')\n' +
        'Near vision at 40 cm: ' + t.n + ' (' + t.m + '), logMAR ' + fmtLogMAR(ac.logMAR) + '\nScreening only — not a prescription.';
      if (navigator.share) navigator.share({ title: 'Reading test result', text: text }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { $('#share').textContent = 'Copied to clipboard ✓'; }, function () { window.prompt('Copy your result:', text); });
      else window.prompt('Copy your result:', text);
    });
    on('#again', 'click', function () { var p = S.profile; newSession(); S.profile = p; calibrate(nearSetup, nearProfile); });
    on('#home', 'click', home);
    on('#del', 'click', function () {
      if (!window.confirm('Delete this result?')) return;
      store.set('history', store.get('history', []).filter(function (h) { return h.id !== entry.id; }));
      history();
    });
  }

  /* ================= HISTORY ================= */
  function history() {
    var hist = store.get('history', []);
    var items = hist.map(function (h) {
      var d = new Date(h.date);
      if (h.type === 'near') {
        return '<button class="hist-item" data-id="' + h.id + '"><span><b>Reading test</b><br><span class="muted" style="font-size:.85rem">' +
          d.toLocaleDateString() + ' · 40 cm</span></span><span style="text-align:right">' + nearText(h.near).n + '<br>' + nearText(h.near).m + '</span></button>';
      }
      return '<button class="hist-item" data-id="' + h.id + '"><span><b>' + (h.name ? esc(h.name) : 'Distance test') + '</b><br><span class="muted" style="font-size:.85rem">' +
        d.toLocaleDateString() + ' · ' + (h.glasses === 'glasses' ? 'with glasses' : 'no glasses') + '</span></span>' +
        '<span style="text-align:right">R ' + acuityText(h.right.acuity).metric + '<br>L ' + acuityText(h.left.acuity).metric + '</span></button>';
    }).join('');
    render(
      '<div class="page">' + nav('Past results', home) +
      (items || '<p class="muted">No saved results yet.</p>') +
      (hist.length ? '<button class="btn ghost" id="clear">Delete all results</button>' : '') + '</div>'
    );
    on('.hist-item', 'click', function (e) {
      var id = +e.currentTarget.getAttribute('data-id');
      var h = hist.find(function (x) { return x.id === id; });
      if (h) { if (h.type === 'near') nearResults(h); else results(h); }
    });
    on('#clear', 'click', function () {
      if (window.confirm('Delete all saved results? This cannot be undone.')) { store.set('history', []); history(); }
    });
  }

  /* ================= Android back button ================= */
  try {
    var CapApp = nativePlugin('App');
    if (CapApp) {
      CapApp.addListener('backButton', function () {
        if (S && S.active) { confirmQuit(); }
        else if ($('#navback')) { $('#navback').click(); }
        else if ($('.hero')) { CapApp.exitApp(); }
        else { home(); }
      });
    }
  } catch (e) { /* not native */ }

  home();
})();
