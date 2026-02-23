# Licensing Compliance Checklist (MAP2)

Use this checklist when running `$licencing`.

## 1) Policy Assumptions

- All MAP2-owned repository code and project artifacts are AGPLv3 (`AGPL-3.0-only`) unless explicit file/package license overrides.
- Third-party code keeps original upstream license terms.
- Educational intent statements in docs do not impose extra restrictions beyond AGPLv3.

If repository artifacts conflict with these assumptions, flag it as a gap and create a worklist task.

## 2) Repository Checks

Run:

```bash
rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs .codex/skills/licencing
rg --files -g "LICENSE*" -g "*COPYING*" -g "*NOTICE*"
```

Validate:

- README legal section:
  - explicitly states full-project MAP2 AGPLv3 posture
  - includes educational intent language without adding extra legal restrictions
  - points to existing license artifacts
- License artifacts:
  - files referenced from README must exist
  - AGPLv3 project license location is explicit and current
- Third-party notices:
  - any referenced `THIRD_PARTY_NOTICES*` artifact exists
  - third-party license overrides are not mislabeled as AGPL-owned MAP2 code

## 3) AGPLv3 Engineering Checklist

- Source availability path is documented for distributed/running versions.
- Modifications to AGPL-covered code are traceable in repository history.
- License notices for AGPL-covered areas are retained in distributions/docs.
- Network-use scenario obligations (where applicable) are called out in docs.

## 4) Third-Party Override Checklist

- Third-party notices and embedded license files are preserved where required.
- Vendored/included third-party code is not relicensed as MAP2-owned AGPL code.
- Documentation and packaging correctly distinguish MAP2 AGPL scope vs third-party scope.

## 5) Gap Recording Format

For each gap, record:

- `scope`: `agpl` | `third-party` | `ownership-unknown`
- `severity`: `high` | `medium` | `low`
- `evidence`: exact file paths/commands
- `required_fix`: concrete remediation

## 6) Worklist Task Template

Add unresolved items to `docs/AVB_MASTER_WORK_PLAN.md`:

```text
ID: T###
Status: [ ] Todo
Title: <concise licensing outcome statement>
Description:
- Goal / acceptance criteria: <explicit compliance end-state>
- Why it matters: <risk/legal/operational impact>
- Dependencies: <task IDs or None>
- Estimated effort: <Low/Medium/High or time range>
- Required outputs: <files, docs, tests, evidence>
Subtasks: <optional>
Assigned to: <role/team>
Last updated: YYYY-MM-DD HH:MM - Codex
```

## 7) Gap-to-Task Mapping

- Missing/incorrect README legal statements:
  - Add/update task for `README.md` legal section revision.
- Referenced license file missing:
  - Add task to create/fix artifact path and README links.
- Scope ambiguity (ownership/license origin):
  - Add investigation task with explicit classification outputs.
- Third-party notice mismatch:
  - Add task to reconcile notice file and dependency license attribution.
