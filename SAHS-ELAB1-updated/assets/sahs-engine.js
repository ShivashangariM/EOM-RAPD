/*!
 * SAHS-E-LAB Teaching & Assessment Engine  (v1 — client-side, no backend)
 * ------------------------------------------------------------------------
 * A small, dependency-free layer shared by every simulator page. It adds:
 *
 *   1. A lightweight student profile prompt (name / roll no / year) so
 *      progress can be attributed to a learner on this device.
 *   2. Item-level MASTERY tracking per simulator. Every gradable thing in
 *      a simulator (a diagnosis scenario, an MCQ, a case question) gets a
 *      stable id. The engine remembers, forever, whether that id has EVER
 *      been answered correctly. Mastery % = (ids ever correct) / (total
 *      ids in that simulator's bank). This is what powers "students can't
 *      finish in one sitting" — the bank only shrinks to 0% remaining
 *      once every single item has been gotten right at least once.
 *   3. A weighted picker that favours items not yet mastered when an
 *      Assess round is built, so wrong answers keep resurfacing until the
 *      student gets them right — "retest the mistake until 100%".
 *   4. Small render helpers (mastery badge, weak-spot summaries) so every
 *      simulator and the hub page can show consistent progress UI.
 *
 * Nothing here talks to a server. All data lives in this browser's
 * localStorage, namespaced under sahselab_*. See ENGINE-README.md for
 * how to wire a new simulator into this engine.
 *
 * Usage:
 *   <script src="../assets/sahs-engine.js"></script>   (from a subfolder)
 *   <script src="./assets/sahs-engine.js"></script>    (from index.html)
 *
 *   SAHSEngine.ensureProfile(profile => { ... });
 *   SAHSEngine.recordItemResult('year2','Refraction','Retinoscopy','mcq:q3', true);
 *   const pct = SAHSEngine.getMasteryPercent('year2','Refraction','Retinoscopy', bankIds);
 */
(function (global) {
  'use strict';

  const LS_STUDENT = 'sahselab_student_v1';
  const LS_MASTERY = 'sahselab_mastery_v1';

  // ---------------------------------------------------------------------
  // low-level storage helpers (all defensive — never throw into caller)
  // ---------------------------------------------------------------------
  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (e) { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage unavailable */ }
  }

  // ---------------------------------------------------------------------
  // Student profile
  // ---------------------------------------------------------------------
  function getStudent() { return read(LS_STUDENT, null); }
  function saveStudent(profile) { write(LS_STUDENT, profile); }

  function ensureProfile(cb) {
    const existing = getStudent();
    if (existing && existing.name) { cb(existing); return; }
    injectProfileModal(cb);
  }

  // Re-opens the profile prompt even if one is already saved — used by an
  // explicit "switch student / edit profile" control in the page header.
  function editProfile(cb) { injectProfileModal(cb || function () {}); }

  function injectProfileModal(cb) {
    if (document.getElementById('sahsProfileModal')) return;
    const wrap = document.createElement('div');
    wrap.id = 'sahsProfileModal';
    wrap.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[100000] flex items-center justify-center p-4';
    wrap.innerHTML =
      '<div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl text-slate-800 dark:text-slate-200">' +
        '<div class="text-center space-y-1.5">' +
          '<div class="w-11 h-11 mx-auto rounded-xl bg-sky-50 dark:bg-sky-950 flex items-center justify-center text-sky-600 dark:text-sky-400 text-lg"><i class="fa-solid fa-user-graduate"></i></div>' +
          '<h3 class="text-sm font-extrabold">Welcome to SAHS-E-LAB</h3>' +
          '<p class="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">Tell us who is practicing so this device can track your mastery of every simulator until you reach 100%.</p>' +
        '</div>' +
        '<div class="space-y-2.5">' +
          '<input id="sahsProfileName" type="text" placeholder="Full Name" class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-sky-500">' +
          '<input id="sahsProfileRoll" type="text" placeholder="Roll / Register No. (optional)" class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:border-sky-500">' +
          '<select id="sahsProfileYear" class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-bold focus:outline-none focus:border-sky-500">' +
            '<option value="year1">1st Year Optometry</option>' +
            '<option value="year2">2nd Year Optometry</option>' +
            '<option value="year3">3rd Year Optometry</option>' +
          '</select>' +
        '</div>' +
        '<button id="sahsProfileSaveBtn" class="w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-extrabold rounded-xl text-xs transition shadow-sm cursor-pointer">Start Learning</button>' +
        '<button id="sahsProfileSkipBtn" class="w-full text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-semibold cursor-pointer">Continue as Guest</button>' +
      '</div>';
    document.body.appendChild(wrap);

    function finish(profile) {
      saveStudent(profile);
      wrap.remove();
      cb(profile);
    }
    document.getElementById('sahsProfileSaveBtn').onclick = function () {
      const name = document.getElementById('sahsProfileName').value.trim() || 'Guest Student';
      const roll = document.getElementById('sahsProfileRoll').value.trim();
      const year = document.getElementById('sahsProfileYear').value;
      finish({ name: name, roll: roll, year: year, createdAt: Date.now() });
    };
    document.getElementById('sahsProfileSkipBtn').onclick = function () {
      finish({ name: 'Guest Student', roll: '', year: '', createdAt: Date.now(), guest: true });
    };
  }

  // ---------------------------------------------------------------------
  // Mastery data model
  //
  //  sahselab_mastery_v1 = {
  //    "year2/Refraction/Retinoscopy": {
  //      items: { "mcq:q3": { seen: 4, correctEver: true }, ... },
  //      attempts: 6,
  //      lastAttempt: 1735000000000
  //    }, ...
  //  }
  // ---------------------------------------------------------------------
  function loadAll() { return read(LS_MASTERY, {}); }
  function saveAll(data) { write(LS_MASTERY, data); }
  function simKeyOf(year, dept, sim) { return year + '/' + dept + '/' + sim; }

  function getSimBucket(year, dept, sim) {
    const all = loadAll();
    const key = simKeyOf(year, dept, sim);
    if (!all[key]) all[key] = { items: {}, attempts: 0, lastAttempt: null };
    return { all: all, key: key, bucket: all[key] };
  }

  function recordItemResult(year, dept, sim, itemId, correct) {
    const found = getSimBucket(year, dept, sim);
    const bucket = found.bucket;
    if (!bucket.items[itemId]) bucket.items[itemId] = { seen: 0, correctEver: false };
    bucket.items[itemId].seen++;
    if (correct) bucket.items[itemId].correctEver = true;
    bucket.attempts++;
    bucket.lastAttempt = Date.now();
    found.all[found.key] = bucket;
    saveAll(found.all);
    return bucket;
  }

  function getMasteryPercent(year, dept, sim, bankIds) {
    if (!bankIds || !bankIds.length) return 0;
    const bucket = getSimBucket(year, dept, sim).bucket;
    const correct = bankIds.filter(function (id) { return bucket.items[id] && bucket.items[id].correctEver; }).length;
    return Math.round((correct / bankIds.length) * 100);
  }

  function getWeakIds(year, dept, sim, bankIds) {
    const bucket = getSimBucket(year, dept, sim).bucket;
    return bankIds.filter(function (id) { return !(bucket.items[id] && bucket.items[id].correctEver); });
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // Builds the next round's item set, biased toward whatever the student
  // has not yet gotten right — this IS the "retest the wrong ones" rule.
  function pickWeighted(year, dept, sim, bankIds, count) {
    const weak = getWeakIds(year, dept, sim, bankIds);
    const mastered = bankIds.filter(function (id) { return weak.indexOf(id) === -1; });
    shuffle(weak);
    shuffle(mastered);
    const picked = weak.concat(mastered).slice(0, Math.min(count, bankIds.length));
    return shuffle(picked);
  }

  // Cross-simulator weak-spot summary, used by the hub dashboard.
  function getAllProgressSummary() {
    const all = loadAll();
    return Object.keys(all).map(function (key) {
      const parts = key.split('/');
      const bucket = all[key];
      const ids = Object.keys(bucket.items);
      const correct = ids.filter(function (id) { return bucket.items[id].correctEver; }).length;
      return {
        year: parts[0], dept: parts[1], sim: parts[2],
        seenCount: ids.length, correctCount: correct,
        attempts: bucket.attempts, lastAttempt: bucket.lastAttempt
      };
    });
  }

  // ---------------------------------------------------------------------
  // UI helpers
  // ---------------------------------------------------------------------
  function renderMasteryBadge(el, percent) {
    if (!el) return;
    let cls = 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700';
    let icon = 'fa-circle-dot';
    if (percent >= 100) {
      cls = 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900';
      icon = 'fa-trophy';
    } else if (percent > 0) {
      cls = 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900';
      icon = 'fa-circle-half-stroke';
    }
    el.className = 'px-3 py-1 rounded-full border font-bold flex items-center gap-1 shadow-sm text-xs ' + cls;
    el.innerHTML = '<i class="fa-solid ' + icon + '"></i> Mastery: ' + percent + '%';
  }

  global.SAHSEngine = {
    ensureProfile: ensureProfile,
    editProfile: editProfile,
    getStudent: getStudent,
    saveStudent: saveStudent,
    recordItemResult: recordItemResult,
    getMasteryPercent: getMasteryPercent,
    getWeakIds: getWeakIds,
    pickWeighted: pickWeighted,
    getAllProgressSummary: getAllProgressSummary,
    renderMasteryBadge: renderMasteryBadge,
    shuffle: shuffle
  };
})(window);
