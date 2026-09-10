# SAHS-E-LAB — Teaching & Assessment Engine

This note documents the mastery/assessment system added on top of the existing
simulator lab, why it's built the way it is, and exactly how to bring the
remaining simulators onto it. Read this before touching `assets/sahs-engine.js`
or any `SIM_META` block in a simulator page.

## What changed in this pass

1. **Dark theme fixed everywhere.** Two separate bugs were causing dark mode
   to look wrong or not persist:
   - 13 pages (including `index.html`, all 5 Refraction simulators, and
     RAPD) toggled the `dark` class but never saved the choice to
     `localStorage`, so it reset on every navigation/refresh. `RAPD.html`'s
     dark-mode button called a `toggleDarkMode()` that didn't even exist.
     All 18 pages with a dark-mode toggle now save/restore via the
     `sahselab_theme` key, matching the pattern a few pages already used
     correctly.
   - **705 invalid Tailwind color classes** (`slate-850`, `border-slate-755`,
     `bg-sky-855`, `hover:bg-sky-55`, etc.) were scattered across every file.
     Tailwind's palette only has 50/100/200…900/950 — anything else silently
     generates no CSS, so the intended dark-mode override never applied and
     the light-mode fallback (often plain white) showed through. This is
     why headers, buttons, and cards looked "wrong" in dark mode. All of
     these were normalized to the nearest real Tailwind shade project-wide.
   - `index.html`'s `<header>` had no `dark:` classes at all (the only page
     missing them — the 3 department hub pages already had them correctly).
2. **Filenames removed from every visible list.** `index.html` and the three
   department hub pages (`Binocular Vision.html`, `Ocular-Motility.html`,
   `Neuro-Optometry.html`) used to print the literal `.html` filename under
   each simulator's name. That's gone — cards now show the simulator's
   description instead.
3. **A shared mastery/assessment engine** (`assets/sahs-engine.js`) and a
   full reference implementation on `Neuro-Optometry/RAPD.html`, plus a
   restructured `index.html` hub organized by curriculum year with a live
   mastery dashboard. This is the new work described below.
4. **`Refraction/Refraction.html` hub page built.** Matches the other three
   department hubs' layout and lists all 5 existing Refraction simulators.
   `index.html` now sets `hasHub: true` for Refraction and links straight to it.
5. **New "Anatomy" department + Slit Lamp simulator.** A 1st-year
   foundational module (`Anatomy/Anatomy.html` hub + `Anatomy/Slit-Lamp.html`)
   teaching the six standard slit lamp illumination techniques on an
   interactive viewport, fully wired into the mastery engine as a second
   flagship example alongside RAPD. See "Anatomy / Slit Lamp" below.

## Why a mastery engine, and how it thinks

The ask was: a student can't "finish" a simulator in one sitting the way the
old app let them (pass one 80% quiz, done forever). Instead, every gradable
thing in a simulator — a diagnosis scenario, an MCQ, a case question — gets a
permanent id. The engine remembers, per browser, whether that id has *ever*
been answered correctly. A simulator is "Mastered" only once **100%** of its
item bank has been answered correctly at least once, however many attempts
that takes. Items you got wrong are what future Assess rounds serve you
first (a weighted picker), so retesting naturally becomes "keep hitting your
weak spots until every one flips to green" rather than a fresh random draw
each time.

This is intentionally **client-side only, no backend, no login** — matching
the decision to keep the current no-accounts architecture instead of adding
a server. That means: progress lives in one browser on one device
(`localStorage`), a lightweight name/roll-no/year prompt personalizes the UI
but doesn't create real multi-user separation on a shared computer, and nothing
syncs across devices. If SAHS wants real per-student records (for faculty to
see class-wide reports, or students to continue on a different device), that
requires a backend and is a separate, larger project — flag this clearly if
it becomes a requirement.

### Data model (`assets/sahs-engine.js`)

```
localStorage['sahselab_mastery_v1'] = {
  "year2/Neuro-Optometry/RAPD": {
    items: { "diag:right_rapd_grade1": { seen: 2, correctEver: true }, "mcq:q3": {...} },
    attempts: 14,
    lastAttempt: 1735000000000
  },
  ...
}
localStorage['sahselab_student_v1'] = { name, roll, year, createdAt }
```

Key engine calls (see the file's doc-comment for the full list):

- `SAHSEngine.ensureProfile(cb)` — prompts once for name/roll/year, then
  calls `cb(profile)`. Injects its own modal HTML, no markup needed on the page.
- `SAHSEngine.recordItemResult(year, dept, sim, itemId, correct)` — call this
  every time a gradable item is scored.
- `SAHSEngine.getMasteryPercent(year, dept, sim, fullBankIds)` — 0–100.
- `SAHSEngine.pickWeighted(year, dept, sim, bankIds, count)` — returns
  `count` ids, biased toward ones not yet mastered. Use this to build every
  Assess round instead of `Math.random()`.
- `SAHSEngine.getAllProgressSummary()` — cross-simulator list, used by
  `index.html`'s dashboard and weak-spot panel.
- `SAHSEngine.renderMasteryBadge(el, percent)` — consistent pill styling.

### Teach → Practice → Assess

Three modes, one simulator page, matching how the user described it:

- **Teach** — a guided reference deck (in RAPD: the Grade 0–5 syllabus
  cards), no scoring, free simulator exploration.
- **Practice** — low-stakes repetition (in RAPD: the "guess the hidden
  grade" board), immediate feedback, still not fed into mastery.
- **Assess** — the only mode that calls `recordItemResult`. Diagnosis +
  MCQs, picked via `pickWeighted`, scored, and rolled into the cumulative
  mastery bar. Passing a single round (≥80%) is encouraging but **not** the
  goal — the mastery bar only fills as individual items get answered
  correctly, and it never resets on a bad round.

RAPD's mode buttons live in the "MODE TOGGLE CONTROLLER" card; `changeMode()`
handles layout + which side panel shows; `setCategory()` decides between the
Teach deck and the Practice board within non-Assess modes.

## Curriculum year mapping

`index.html`'s Year 1/2/3 tabs are a **suggested** mapping based on the
public NCAHP Bachelor of Optometry curriculum structure (semester-wise
subject list), not SAHS's internal semester plan — I don't have that
document. Cross-check with the actual SAHS syllabus and adjust the `year`
field on each simulator entry in `index.html`'s `localDatabase` as needed;
it's a one-line change per simulator.

| Year | NCAHP subjects it corresponds to | Simulators currently placed there |
|---|---|---|
| 1st Year | Intro to Optometry, general anatomy/physiology, basic optics (Sem 1–2) | Slit Lamp Examination Simulator (Anatomy) |
| 2nd Year | Optometric Instruments, Clinical Examination of Visual System, Visual Optics, Ocular Disease I/II (Sem 3–4) | Refraction (all 5), RAPD, EOM, H-Pattern |
| 3rd Year | Binocular Vision-I, Contact Lens-I, anterior/posterior segment diagnostics (Sem 5–6) | Cover Test, Worth 4-Dot, BSV, Park 3-Steps, Nystagmus, Color Vision, Diplopia |

Source: NCAHP Bachelor of Optometry curriculum PDF (Sri Guru Ram Das
University of Health Sciences), cross-referenced against a summary of the
new 5-year NCAHP optometry curriculum. Year 1 previously had no simulators
because the pre-existing lab content (refraction/motility/binocular/neuro
instruments) was inherently 2nd/3rd-year clinical-skill material. The new
Anatomy department's Slit Lamp simulator fills the first piece of that gap;
a full ocular-anatomy explorer and basic-optics calculator are still
suggested next steps (see "Known gaps" below).

## Anatomy / Slit Lamp — a second flagship engine example

`Anatomy/Slit-Lamp.html` follows the exact same recipe as RAPD (below), and
is a good second reference if RAPD's pupil-specific logic is confusing to
adapt. Its item bank is a mix of technique-identification items (`tech:*`,
6 total — analogous to RAPD's `diag:*` diagnosis items) and MCQs (`mcq:*`,
8 total) = 14 items in `FULL_BANK_IDS`. Its viewport is a single reusable
SVG (`#viewportSvg`) with one hidden `<g>`/overlay per illumination
technique, toggled by `renderViewport()` based on `simState.technique` —
Practice mode lets students pick the technique directly and explore it
freely (ungraded); Assess mode picks one technique via
`SAHSEngine.pickWeighted` (biased toward unmastered ones), renders it
*without* naming it, and asks the student to identify it, alongside 5
weighted MCQs — same "diagnosis + MCQ suite" shape as RAPD's Assess round,
same cumulative mastery bar and Retest/Review buttons on the result screen.

## How to bring another simulator onto the engine

Using RAPD as the template, for a simulator with a Practice/Assess-style
quiz already in it:

1. Add `<script src="../assets/sahs-engine.js"></script>` in `<head>`,
   right after the Tailwind CDN script.
2. Define `const SIM_META = { year: 'yearN', dept: '<folder name>', sim: '<short id>' };`
   near the simulator's other constants.
3. Build `FULL_BANK_IDS` from whatever the simulator already has as gradable
   content (an MCQ pool, a set of clinical scenarios/pathologies) — one
   stable string id per item, e.g. `mcq:q1`, `diag:normal`.
4. Wherever the simulator currently does `Math.random()` to pick the next
   question/scenario, replace it with `SAHSEngine.pickWeighted(...)`.
5. Wherever it currently scores an answer, add a
   `SAHSEngine.recordItemResult(...)` call right next to the existing
   correct/incorrect check.
6. Replace the pass/fail-only result screen with a cumulative mastery bar
   (`SAHSEngine.getMasteryPercent`) plus a "Retest Weak Areas" button that
   re-enters Assess mode.
7. If the simulator only has two modes today (Practice/Test), add a third
   "Teach" button and move any static reference/syllabus content behind it
   (see RAPD's `mode-tutor-container` vs `mode-training-container` split).
8. Register the simulator in `index.html`'s `localDatabase` entry with
   `engineKey` (matching `SIM_META.sim`) and `bankSize` (the length of
   `FULL_BANK_IDS`) so the hub's mastery pill and dashboard pick it up
   automatically — nothing else on the hub side needs to change.

Simulators not yet converted keep working exactly as before (still
launchable, still have their existing Practice/Test logic) — they just show
a neutral "Practice Only" pill on the hub instead of a live mastery %.

## Known gaps / suggested next steps

- **Year 1 has only one module (Slit Lamp).** A full ocular-anatomy
  explorer (cornea/lens/retina cross-sections) and a basic optics
  calculator are still planned — there's a placeholder card for these on
  `Anatomy/Anatomy.html` already.
- The three original department hub pages (`Neuro-Optometry.html`,
  `Ocular-Motility.html`, `Binocular Vision.html`) still link to several
  simulator files that don't exist in this build yet (e.g.
  `Pupillary-Reflex.html`, `Anisocoria.html`, `NPC.html`, `Vergence.html`,
  `Fusion.html`, `Suppression.html`, `Stereoacuity.html`,
  `Cranial-Nerve-Palsy.html`, `Visual-Field.html`, `Saccades.html`). These
  were already broken before this pass; only `index.html` was cleaned up to
  never link to a missing file.
- Question formats requested — MCQ, case/image-based, and simulator
  performance — are all represented in RAPD's Assess mode (diagnosis =
  simulator performance, the 5-question quiz = MCQ). True image/case
  vignettes (a clinical photo + "what's your diagnosis") aren't built yet;
  the engine's item-id model supports them identically to MCQs
  (`case:<id>`) whenever there's imagery to attach.
- Mobile: RAPD's mode-switcher labels collapse to icon-only below the `sm`
  breakpoint; the rest of the responsive behavior (grid collapsing, mobile
  header dropdown) was already in place and untouched.
