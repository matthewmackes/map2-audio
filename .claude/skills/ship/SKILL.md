---
name: ship
description: >-
  Autonomously drain the MAP2 worklist: a rescue pass to catch dead/mock code,
  then implement open tasks fully (no stubs), gating each (pytest · jest ·
  typecheck · web build · cmake for engine changes), committing + dual-pushing
  (origin + gitlab) + rebuilding/restarting port 3000 as you go. TRIGGER when
  the user says "ship it", "execute", "continue", "drain the worklist", or "work
  through the backlog". Do NOT use for a single scoped edit (just do it) or a
  release/RPM cut (use /build-installer-rpm).
---

# ship — autonomous worklist drain (MAP2)

Implements `docs/PROJECT_WORKLIST.md` toward empty under the standing autonomy in
`docs/CLAUDE.md`. Heads-down: the commit body is the record, one short note per
phase boundary, no marketing copy. The canonical worklist is the single source of
truth — see `map2-worklist-management` for the schema. As of 2026-06 Claude is the
sole owner of this list (no parallel agents), so claims are for restart-safety, not
collision-avoidance.

## Phase 0 — Rescue pass (always first)

Before new work, catch the recurring failure mode (shipped-but-dead / mockup-only
code). Highest-value step.

1. **Dead-code grep:**
   - Frontend: every `.tsx` page/component has an importer —
     `grep -rn 'import.*<Component>' web/src/`. (CLAUDE.md flags
     `JuceAudioGraphViz.tsx` as the canonical never-imported example.)
   - Backend: every `APIRouter` is `include_router`'d in `app/main.py`; every
     `app/services/` module has an importer.
   - Engine: C++ symbols under `juce-engine/Source/` are referenced.
2. **Stub/mock grep:** `rg 'NotImplementedError|TODO|FIXME|coming soon|placeholder|demo_data|it\.todo|test\.skip'`
   across `app/ web/src/ juce-engine/Source/`. Each hit is real work or a
   mislabelled task.
3. **Reachability:** every backend feature reachable from a registered route;
   every UI feature reachable from a route/tab and *does something* when opened
   (use `/run` or `/verify`, or hit the live stack on the dev box).
4. **Re-cue misleading `[✓]`:** any worklist item marked Done but failing 1–3
   flips back to `[>]` with a one-line note. If ≥3 rescues, write a short
   `/audit` note.

## Phase 1–N — Drain loop

For each open `[ ] Todo` task, highest priority first:

1. Mark `[>] In Progress` in the worklist (restart-safe claim).
2. Implement **fully** per CLAUDE.md `### "Done" Means Clean Build` — no stubs,
   runtime-reachable, Carbon tokens not raw hex (`### Carbon Design System`),
   `@carbon/react` only (no MUI), clean operator surfaces (no wizard/coaching UI).
3. **Gate before commit** (auto-fix in scope; SOFT-ESCAPE if the same fix fails
   3×). Run the gates that match the touched subsystems:
   - Frontend: `cd web && npm run typecheck` · `npm run build` ·
     `npx jest --testPathPattern=<File> --no-coverage` · `npm run lint`
   - Backend: `pytest tests/test_<name>.py -q` (and the broader `pytest tests/`
     for cross-cutting changes)
   - Engine: `cd juce-engine && cmake -B build && cmake --build build`
   - **Visual tasks:** a green test does **not** verify the render. Rebuild +
     `cd web && npm run preview` (port 3000) or `/restart-web`, then confirm in
     the browser — the §0.8 in-browser operator-visual gate. Verify the bundle
     actually shipped: `grep -c '<symbol>' web/dist/assets/<Page>-*.js`.
4. Commit named pathspecs (never `-A`) with a why-not-what message + trailer:
   `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Flip the task
   `[✓] Done` with a completion note (commit hash + verification evidence).
5. Run independent tasks in parallel where they don't touch the same files.

## Push / deploy cadence — the update loop

MAP2 is **dual-remote** and stays in sync on every commit (CLAUDE.md `## Git`):

```bash
git push origin master && git push gitlab master
```

`master` only — never a feature branch unless asked; never `--no-verify`; never
force-push. After a web change, the full loop is: commit → dual-push → rebuild
bundle → restart port 3000 → verify live (the "update" shorthand). Pushing is the
outward-facing step — gated per CLAUDE.md `## Git` unless standing autonomy
covers it. To exercise a change on the live stack, push to the `dev` remote
(`map2-dev` testbed, push-to-deploy).

## Stop conditions

Worklist empty (only gated/blocked items remain) · a push/release/cutover moment
without standing auth · a destructive op · a product-direction change · two
consecutive unexplained gate failures · ≥10 rescues at once. On stop: a short
factual summary + what's left.

## NOT this skill

Single obvious edit → just do it. Release / RPM cut → `/build-installer-rpm`.
Deep integrity sweep with a written report → `/audit`. Design + survey + worklist
scoping before code → `/plan`. (`complete-remaining-work`, `batch`, and
`iteration` are sibling drain/parallelization skills — this skill is the
heads-down single-stream loop; reach for `batch` to bundle a category into one
commit.)
