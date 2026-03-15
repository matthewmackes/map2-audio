---
name: licencing
description: Track and enforce MAP2 licensing posture as full-project AGPLv3 for MAP2-owned code, with third-party license overrides preserved, including compliance audits, documentation checks, and required remediation task creation in docs/PROJECT_WORKLIST.md. Use when changing code, preparing releases, updating README/legal docs, or answering licensing-status/compliance questions.
---

# Licencing

Apply a repeatable compliance workflow for this repository's declared policy:

- All MAP2-owned code and project artifacts are AGPLv3 (`AGPL-3.0-only`) unless a file/package explicitly declares a different license.
- Third-party dependencies and vendored components keep their original licenses.
- Educational statements in docs are intent statements and must not add restrictions beyond AGPLv3.

Treat this skill as an engineering compliance workflow, not legal advice.

## Compliance Workflow

1. Identify scope of changed or audited code.
2. Classify each area as MAP2-owned AGPL, third-party license override, or ambiguous ownership.
3. Run checklist in `references/licensing-compliance-checklist.md`.
4. Record concrete gaps with file paths and evidence.
5. Add or update tasks in `docs/PROJECT_WORKLIST.md` for every unresolved gap.
6. Re-run checks after edits and mark tasks accordingly.

## Scope Classification

Use fast repository scans:

```bash
rg -n "license|LICENSE|AGPL|GNU Affero|THIRD_PARTY_NOTICES|SPDX" README.md LICENSE docs .codex/skills/licencing
rg --files -g "LICENSE*" -g "*COPYING*" -g "*NOTICE*"
```

Classify with these rules:

- MAP2-owned AGPL scope:
  - Repository code/docs/configuration authored for MAP2 unless explicitly overridden.
- Third-party override scope:
  - vendored modules/packages with their own license files.
- Ambiguous scope:
  - unknown ownership/provenance that cannot be verified from file history and notices.

If classification is ambiguous, mark as a compliance question and create a worklist task.

## Required Outputs

Produce:

- Brief compliance status summary:
  - pass/fail per checklist section
  - unresolved gaps with file references
- Worklist updates in `docs/PROJECT_WORKLIST.md` for unresolved items.
- Exact commands and evidence used for the audit.

## Worklist Rules

When a gap exists, add a task immediately:

- Use canonical file: `docs/PROJECT_WORKLIST.md`.
- Follow repository task schema exactly (ID, Status, Title, Description, Dependencies, Effort, Required outputs, Last updated).
- Use the next available top-level `T###` ID.
- Add subtasks when the remediation has multiple independent deliverables.
- Update the worklist header timestamp whenever tasks are added/changed.

Use the templates and gap-to-task mapping in `references/licensing-compliance-checklist.md`.
