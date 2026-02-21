---
name: complete-remaining-work
description: Execute remaining project tasks from the canonical worklist with aggressive parallelization, completeness-first implementation, and explicit tech-debt capture. Use when the user asks to continue work, complete remaining steps, move quickly, bundle tasks, or proceed without repeated confirmation.
---

# Complete Remaining Work

## Core Execution Rule

Treat the canonical project worklist as the only source of truth. Do not maintain side plans.

## Workflow

1. Read the canonical worklist and identify the highest-priority unfinished tasks.
2. Split the next slice into independent bundles that can be executed in parallel.
3. Mark selected tasks/subtasks as `[>] In Progress` before substantive edits.
4. Implement fully. Do not leave stubs or placeholder logic.
5. Run focused validation for each bundle (typecheck/tests/build checks relevant to touched code).
6. Update task/subtask statuses to `[✓] Done` or `[✗] Blocked` with concrete notes.
7. If implementation introduces debt, risk, or deferred follow-up, add a new worklist task immediately with dependencies and acceptance criteria.
8. Continue to the next bundle without asking for confirmation unless blocked by missing inputs, permissions, or destructive actions.

## Parallelization Standard

- Prefer running independent file reads, searches, and validations in parallel.
- Prefer batching related edits that share context and test surfaces.
- Keep dependency chains sequential only where required by correctness.

## Completeness Standard

- Finish backend, API contract, frontend type/UI, and test updates together when a change crosses boundaries.
- Add or update tests for new logic paths and edge cases.
- Keep behavior deterministic and rollback-safe.

## Decision Policy

- Assume yes for reasonable implementation choices that preserve safety and project conventions.
- Escalate only when blocked by missing facts, required approvals, or contradictory requirements.
