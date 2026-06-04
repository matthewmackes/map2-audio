---
name: plan
description: >-
  Design-thinking + survey + worklist-scoping skill for the MAP2 Audio Platform.
  Use when the user asks to scope an epic, run an N-question AskUserQuestion
  survey, lock a non-trivial design decision, audit the worklist for drift,
  rescue dead modules, lift design-doc actions into worklist tasks, or draft a
  design document — i.e. PLAN before any code lands (CLAUDE.md Plan-First Meta
  Rule). Defers to map2-worklist-management for the canonical task schema.
  Sister skills: ship (drains the queue), audit (integrity sweep),
  build-installer-rpm (the RPM cut).
---

# plan — design + worklist scoping (MAP2)

The design + worklist-scoping skill. **Everything before code lands runs through
plan** (CLAUDE.md `## Plan-First Meta Rule`). Surveys design forks via
`AskUserQuestion`, lifts design-doc actions into `docs/PROJECT_WORKLIST.md` tasks,
audits the worklist for drift, drafts design documents under `docs/design/`.

## Triggers

- "Design [X]" / "Survey [X]" / "Lock [X]"
- "Audit the worklist" / "Rescue the worklist" / "Find dead modules"
- "Lift the design doc actions into the worklist"
- "Run an N-Q survey on [X]" / "Fire 25 questions about [X]"
- "Plan the next [epic]"

## Method

### Clarify first (CLAUDE.md 5-Question Clarification Protocol)

For an underspecified ask, run the 5-Question Clarification Protocol before
designing. For a non-trivial decision with ≥3 plausible options, fire an
`AskUserQuestion` survey **one logical group at a time** (MAP2 epics have used
25- and 50-question lock protocols — batch into rounds, recap the locks after
each round before proceeding).

After the survey:

1. Write `docs/design/<epic>.md` capturing every lock in a table + the resulting
   architecture + acceptance criteria + risks + out-of-scope items.
2. Lift every actionable item into `docs/PROJECT_WORKLIST.md` as new `T<n>` task
   blocks (schema below), each with runtime-observable acceptance bullets per the
   no-stubs rule (CLAUDE.md `### "Done" Means Clean Build`).
3. Note platform-wide direction in `docs/CLAUDE.md` / `docs/AGENTS.md` only if the
   survey locks something cross-cutting (not just per-epic).
4. Commit + dual-push per CLAUDE.md `## Git`:
   `git push origin master && git push gitlab master`.

### Worklist rescue pass

Before any large `/ship` effort, scan for:

- **Dead modules** — a `.tsx` component with no importer (verify
  `grep -rn 'import.*<Component>' web/src/`), an `APIRouter` never
  `include_router`'d in `app/main.py`, an `app/services/` module no one imports.
- **Misleading `[✓]` marks** — tasks marked Done where the runtime-reachability
  gate doesn't hold: no registered route, no rendered path, no event-bus/WS
  subscriber actually invoking the code.
- **Mockup-only features** — UI that renders but whose state never updates;
  `demo_data`/placeholder constants or "Coming Soon" strings standing in for real
  behavior.
- **Deferred markers** — "lands in a follow-up", "wired in Phase N", "stub for
  now", `NotImplementedError`, `TODO`/`FIXME`.
- **Placement drift** — items parked under the wrong `## In Progress` / `## Todo`
  header relative to their `Status:` line.
- **Design-doc actions never lifted** — items in `docs/design/*.md` with no
  matching worklist task.

Each finding becomes a new worklist task BEFORE new code lands. CLAUDE.md
`### "Done" Means Clean Build` is the upstream prevention; the rescue pass is the
downstream catch. For a written report, hand off to `/audit`.

### Authority (newest wins on contradiction)

1. **Memory** (`/home/mm/.claude/projects/-home-mm-Desktop-MAP2/memory/*.md`) —
   operator live preferences, highest.
2. **`docs/CLAUDE.md`** — the operational rulebook.
3. **`docs/AGENTS.md`** + governance / platform-identity docs.
4. **`docs/design/*.md`** — per-epic locks.
5. **`docs/PROJECT_WORKLIST.md`** body — actionable state.

## Worklist schema (canonical: map2-worklist-management)

Each task is an `ID:` block, not a bare checkbox:

```
ID: T<n>            (or T<n>-<sub>, e.g. T2522-A)
Status: [ ] Todo    (one of the legend below)
Title: one-line outcome
Description:
- Goal / acceptance criteria (each runtime-observable)
- Why it matters (brief context)
- Dependencies (task IDs or None)
- Estimated effort (Low / Medium / High or a range)
- Required outputs / deliverables
Last updated: YYYY-MM-DD HH:MM - actor
```

Status legend: `[ ] Todo`, `[>] In Progress`, `[✓] Done`, `[✗] Blocked`,
`[~] Cancelled`. Keep one canonical list (`docs/PROJECT_WORKLIST.md`) — no side
trackers. Move a task to `[>]` before substantive edits; after completion update
status, add a completion note (commit hash + verification), and propose the next
1–3 tasks.

## Companion skills

- `ship` — when planning is done, switch to ship to drain the queue.
- `audit` — integrity sweep (dead/unreachable code, stubs, convention
  violations) with FINISH-or-REMOVE verdicts + a written report.
- `build-installer-rpm` — the RPM cut; never auto-trigger it from a ship run.
- `map2-worklist-management` — the canonical worklist schema + operating contract
  this skill defers to.
- `/restart`, `/run`, `/verify`, `/restart-web` — render / live-stack verification.
