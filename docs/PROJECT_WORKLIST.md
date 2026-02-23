## Status Legend

- `[ ]` Todo
- `[>]` In Progress
- `[✓]` Done
- `[✗]` Blocked
- `[~]` Cancelled

## Top Tasks (Show 5-10 First)

ID: T001  
Status: [✓] Done  
Title: Add "Reset to Default, Rejoin" clone reset flow in Cluster Dashboard advanced menu  
Description:  
- Goal / acceptance criteria: Provide a backend API and Cluster Dashboard advanced UI action that resets clone-specific node identity state and re-registers the node into a cluster; return clear success/error payloads.  
- Why it matters: Cloned MAP2 nodes need a deterministic, operator-safe onboarding path to avoid identity collisions and speed cluster expansion.  
- Dependencies: None  
- Estimated effort: Medium  
- Required outputs: New cluster reset/rejoin service, API endpoints, advanced-menu UI tab/action, updated worklist status evidence.  
Subtasks:  
ID: T001-subA  
Status: [✓] Done  
Title: Implement backend clone reset + rejoin service and API routes  
Description:  
- Goal / acceptance criteria: Add reset/rejoin logic with structured response and guardrails in cluster API.  
- Why it matters: Enables one-command operational recovery from cloned identity state.  
- Dependencies: None  
- Estimated effort: Medium  
- Required outputs: Service module + route handlers.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-02-23 00:00 - Codex
ID: T001-subB  
Status: [✓] Done  
Title: Add Cluster Dashboard advanced menu UI for reset/rejoin operation  
Description:  
- Goal / acceptance criteria: Add a clear advanced action panel with confirmation and result rendering.  
- Why it matters: Operators need direct GUI access without shell intervention.  
- Dependencies: T001-subA  
- Estimated effort: Medium  
- Required outputs: New tab/component wired into Cluster Dashboard advanced category.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-02-23 00:00 - Codex
Assigned to: Codex  
Last updated: 2026-02-23 00:00 - Codex
- Completion notes:
  - What was done: Added backend clone reset/rejoin service (`app/services/cluster/clone_reset.py`), exposed preview + execute APIs (`/api/cluster/node/reset-default-rejoin/preview`, `/api/cluster/node/reset-default-rejoin`), and added Cluster Dashboard advanced-menu tab (`advanced-ops`) with guarded execution UI.
  - Key findings: Clone onboarding failures are primarily persisted identity/trust artifacts, not source-code differences; reset can preserve audio content while regenerating identity.
  - Files/links produced: `app/services/cluster/clone_reset.py`, `app/routes/cluster_admin.py`, `web/src/app/components/ClusterDashboard/ClusterAdvancedOperationsTab.tsx`, `web/src/app/pages/ClusterDashboardPage.tsx`.
  - Suggested next tasks: T002, T003, T005

ID: T002  
Status: [ ] Todo  
Title: Add targeted tests for clone reset/rejoin API behavior  
Description:  
- Goal / acceptance criteria: Validate success path and failure payload semantics for reset/rejoin API without hardware dependency.  
- Why it matters: Prevent regressions in cluster onboarding controls.  
- Dependencies: T001  
- Estimated effort: Medium  
- Required outputs: Backend/API test coverage for new endpoints and payload contract.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-02-23 00:00 - Codex

ID: T003  
Status: [ ] Todo  
Title: Document operator runbook for clone reset + cluster rejoin  
Description:  
- Goal / acceptance criteria: Publish GUI/API runbook with pre-checks, expected outcomes, and rollback guidance.  
- Why it matters: Ensures repeatable field operations and lower support burden.  
- Dependencies: T001  
- Estimated effort: Low  
- Required outputs: Documentation update in `docs/`.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-02-23 00:00 - Codex

ID: T004  
Status: [✗] Blocked  
Title: Complete hardware AVB qualification gates Q04-Q06  
Description:  
- Goal / acceptance criteria: Run HIL discovery/churn, PTP timing, and soak tests and record pass/fail evidence.  
- Why it matters: Required for production AVB readiness claims.  
- Dependencies: AVB-capable lab availability  
- Estimated effort: High  
- Required outputs: Updated qualification matrix and archived artifacts.  
Subtasks: None  
Assigned to: Lab + Codex  
Last updated: 2026-02-23 00:00 - Codex

ID: T005  
Status: [ ] Todo  
Title: Wire AVB auto-connect config into runtime behavior  
Description:  
- Goal / acceptance criteria: Ensure `avb.auto_connect` drives connection orchestration on startup, not status-only reporting.  
- Why it matters: Needed for hands-off multi-node AVB startup.  
- Dependencies: T001  
- Estimated effort: Medium  
- Required outputs: Backend integration and regression checks.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-02-23 00:00 - Codex

## Backlog

ID: T900  
Status: [ ] Todo  
Title: Consolidate historical AVB planning docs into canonical worklist references  
Description:  
- Goal / acceptance criteria: Cross-link legacy planning docs and keep this worklist as the execution source of truth.  
- Why it matters: Reduces planning drift and duplicate status reporting.  
- Dependencies: None  
- Estimated effort: Low  
- Required outputs: Cross-reference note set in `docs/PROJECT_WORKLIST.md`.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-02-23 00:00 - Codex
