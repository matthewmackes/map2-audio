---
name: audit
description: >-
  Integrity sweep of the MAP2 Audio Platform (Python FastAPI backend, JUCE/C++
  engine, React/Carbon frontend, device-packs): find dead/unreachable code,
  stubs, mockups passing as features ("Coming Soon" cards, placeholder tabs),
  convention violations (raw hex vs Carbon tokens, unregistered routes, stale
  OpenAPI pins, untracked migrations), and doc/worklist drift — each finding
  gets a FINISH-or-REMOVE verdict. TRIGGER when the user asks to "audit",
  "evaluate compliance", "check for dead code/stubs", or "find what's not really
  done". Produces a findings table; it does NOT fix things unless asked.
---

# audit — compliance & integrity sweep (MAP2)

Catches the gap between "marked done" and "actually reachable + correct", and
checks compliance with `docs/CLAUDE.md` (the operational rulebook). Output is a
findings **table** (`Location | Category | Evidence | Confidence | Verdict`) plus
a short summary; verdict is binary **FINISH** (wire it up / make it real) or
**REMOVE** (delete the dead surface). Don't fix unless asked — report first.

## Passes (run in parallel where possible)

1. **Unreachable code**
   - *Frontend:* a `.tsx` component never imported (the canonical example is
     `web/src/.../JuceAudioGraphViz.tsx` — flagged dead in CLAUDE.md). Confirm
     with `grep -rn 'import.*<Component>' web/src/`. A page/panel with no route
     into it, or a tab that mounts nothing.
   - *Backend:* an `APIRouter` defined but never `include_router`'d in
     `app/main.py`; a `pub` service/function under `app/services/` with no
     importer; dead branches.
   - *Engine:* a C++ class/method under `juce-engine/Source/` with no reference.
2. **Stubs** — `raise NotImplementedError`, `pass  # TODO`, `TODO`/`FIXME`,
   bare `...` bodies, `it.todo(`/`test.skip(`, C++ empty/`// TODO` bodies,
   "wired in a follow-up" commit bodies. Per `### "Done" Means Clean Build`:
   code existing is never "done".
3. **Mockups** — placeholder constants, `demo_data`, "Coming Soon"/"placeholder"
   strings, `*-placeholder` test-ids (history here: T2499 "Coming Soon" cards,
   T2522 placeholder Maschine tabs). A surface that renders but whose backing
   state never updates.
4. **Convention violations** (`docs/CLAUDE.md`):
   - **Carbon** (`### Carbon Design System (Mandatory)`): raw hex / RGB literals
     in UI instead of Carbon tokens (`var(--cds-*)`) — `rg -n '#[0-9a-fA-F]{6}'
     web/src` minus annotated `// carbon-allow:<reason>` exceptions; any
     `@mui/*` import (MUI retired T2475 — must not reappear); expanded Phosphor
     icon usage (legacy-only). Source of truth: `docs/design/CARBON_CONFORMANCE_STANDARD.md`.
   - **Page standards:** coaching/wizard/tutorial copy, `InlineNotification` used
     for explanatory text (only allowed for real operational warnings),
     multi-sentence panel summaries, manual refresh buttons where a
     `refetchInterval` belongs.
   - **Contract drift:** an OpenAPI pin test out of sync with registered routes
     (history: T2531); a `SNAPSHOT_GRAPH_VERSION` / schema bump without the
     adjacent test + migration updates; a tracked migration in `SCHEMA_MIGRATIONS`
     not reflected in the migrations test (history: T2532).
5. **Doc / worklist drift** — prose claiming facts the code contradicts; stale
   `MEMORY.md` / `docs/CLAUDE.md` notes (e.g. retired `python-rtmidi`,
   `Map2MidiController` raw-ALSA path); and **worklist placement drift** — items
   physically parked under the wrong `## In Progress` / `## Todo` header whose
   `Status:` line says otherwise, or a `[✓]` that fails passes 1–3. Each is a
   FINISH (fix the doc / re-file the task).
6. **Packaging & boot reachability** — assets the RPM (`/build-installer-rpm`)
   ships that nothing uses; a systemd unit referencing a path/user that doesn't
   resolve; a service that crash-loops on a config it can't self-heal (history:
   the `/etc/map2` perms / `node.conf` regression). Flag gaps; a deferred RPM is
   not itself a defect.

## Safeguards (avoid false positives)

Declaratively-wired handlers are **reachable** even with no direct textual
caller: FastAPI route functions (decorated `@router.get/post`), pydantic
validators, React lifecycle (`useEffect`/`useMemo`/render), JUCE callbacks
(`processBlock`, `paint`, `timerCallback`), pytest fixtures, WebSocket/event-bus
subscribers (PlatformEvent control plane). Confirm a "dead" symbol with `rg`
across `app/`, `juce-engine/Source/`, and `web/src/` before the verdict.

## Output

A markdown findings table + counts by category, written to `docs/COMPLIANCE.md`
(or returned inline for a quick check). Lift every FINISH into
`docs/PROJECT_WORKLIST.md` as a `T<n>` task (schema per `/plan` +
`map2-worklist-management`) so the sweep produces actionable work, not just a
report. Sister skills: `/ship` (drains the queue), `/plan` (scopes + surveys),
`/build-installer-rpm` (the RPM cut).
