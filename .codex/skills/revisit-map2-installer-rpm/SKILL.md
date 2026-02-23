---
name: revisit-map2-installer-rpm
description: Reassess and modernize MAP2 installer and packaging on Fedora Server by auditing a current MAP2 host against a documented stock Fedora baseline, computing evidence-backed deltas, and generating an idempotent verbose installer plus RPM/repository scaffolding. Use when revisiting full installer builds, updating Fedora deployment automation, validating AVB/TSN readiness, or preparing MAP2 package and repo release workflows.
---

# Revisit MAP2 Installer and RPM Build

## Objective
Produce evidence-driven modernization artifacts for MAP2 on Fedora Server:
- Delta report in Markdown and JSON.
- Installer plan and initial skeleton with `audit`, `install`, `uninstall`, and `verify` subcommands.
- RPM split and repository-generation workflow with SPEC scaffolding.

## Non-Negotiables
- Follow `references/full-workflow-contract.md` as the normative requirements document.
- Collect evidence first; do not guess when host facts can be measured.
- Prefer Fedora-native mechanisms: `dnf`, `systemd`, `firewalld`, `SELinux`, `sysusers`, `tmpfiles`, `logrotate`, and RPM macros.
- Reuse first: adopt existing valid host configuration and services; avoid replacement unless required.
- Never overwrite configs without backup and rollback notes.
- For each change, include purpose, verification, and rollback/uninstall steps.
- Treat AVB/TSN as first-class and mandatory in discovery, planning, and verification.

## Output Contract
Always produce all deliverables below:
1. Delta Report (Markdown) with summary table and prioritized `must/should/could` actions.
2. Delta Report (JSON) that conforms to `references/delta-json-contract.md`.
3. Installer design and code skeleton showing:
- command parsing
- structured logging
- dry-run behavior
- pre-change audit capture
- install/uninstall/verify flow stubs
- persistent state manifest at `/var/lib/map2/installer/state.json`
4. RPM/repo packaging plan including:
- package split
- one full SPEC skeleton for `map2-core`
- brief SPEC stubs for related subpackages
- local repo generation steps

## Required Phase Order
Execute phases in order; do not skip:
1. Phase 0: Baseline definition for stock Fedora Server.
2. Phase 1: Evidence collection on current MAP2 host.
3. Phase 2: Delta computation versus baseline.
4. Phase 3: MAP2 capability matrix.
5. Phase 4: Reuse-first installer design.
6. Phase 5: RPM packaging and repository workflow.

Use the exact command inventory and checks from `references/full-workflow-contract.md`.

## Resource Map
- `references/full-workflow-contract.md`: full workflow and acceptance criteria.
- `references/delta-json-contract.md`: JSON structure and semantic requirements.
- `scripts/scaffold_outputs.sh`: copies starter scaffolding into a target output path.
- `assets/templates/installer/map2_installer.py`: starter installer skeleton.
- `assets/templates/reports/delta-report.md`: Markdown report template.
- `assets/templates/reports/delta-report.json`: JSON report template.
- `assets/templates/rpm/*.spec*`: `map2-core` full skeleton plus split-package stubs.
- `assets/templates/repo/map2-create-local-repo.sh`: local repo generation helper.

## Execution Guidance
- If host access exists, start by collecting raw evidence under `/var/tmp/map2-audit-<timestamp>`.
- If no baseline host is available, approximate baseline from Fedora Server comps defaults and explicitly label assumptions.
- Keep changes minimal and reversible; prioritize drop-ins over editing base configs.
- Map every installer change to one capability bucket: core runtime, audio subsystem, plugin subsystem, web/UI/API control plane, operations, security posture, or AVB/TSN subsystem.

## Quick Start
1. Read `references/full-workflow-contract.md`.
2. Create output workspace and seed scaffolding:
```bash
bash scripts/scaffold_outputs.sh --output /tmp/map2-installer-refresh
```
3. Run host audit commands and capture evidence.
4. Build Markdown and JSON deltas.
5. Fill in installer and RPM scaffolds with evidence-based decisions.
6. Document verification and rollback for every planned change.
