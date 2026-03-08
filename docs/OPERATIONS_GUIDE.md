# MAP2 Audio Platform — Operations Guide

## Quick Reference: All Major Operations

This guide provides straightforward instructions for all MAP2 operations referenced in the welcome message.

---

## 1. START BACKEND SERVICE

### Option A: Using systemd (Recommended for Production)
```bash
systemctl start map2-backend
```
- **Service location**: `/etc/systemd/system/map2-backend.service`
- **Logs**: `journalctl -u map2-backend -f`
- **Check status**: `systemctl status map2-backend`
- **Stop**: `systemctl stop map2-backend`
- **Restart**: `systemctl restart map2-backend`

### Option B: Manual Start (Development)
```bash
cd /home/mm/map2-audio
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8080
```
- **API endpoint**: http://localhost:8080
- **API documentation**: http://localhost:8080/docs
- **Logs**: Printed to terminal (Ctrl+C to stop)

---

## 2. START WEB DASHBOARD

### Via Script
```bash
/home/mm/map2-audio/scripts/start_web.sh
```

### Manual Start
```bash
cd /home/mm/map2-audio/web
npm run dev -- --host 0.0.0.0 --port 3000
```
- **Web UI**: http://localhost:3000
- **Development mode** with hot-reload
- **Logs**: Printed to terminal (Ctrl+C to stop)

### Production Build
```bash
cd /home/mm/map2-audio/web
npm run build
```
- **Output**: `dist/` directory
- **Serve with**: Any HTTP server pointing to `dist/`

---

## 3. LAUNCH TERMINAL UI (NODE CONSOLE)

### Direct Command
```bash
python3 -m tui.node_console
```

### Via Wrapper Script
```bash
/home/mm/map2-audio/tui.sh
```
- **Auto-starts backend** if not running
- **Uses new professional Textual TUI**
- **6 tabs**: Dashboard, Audio, Cluster, Mode & Actions, Logs, Help

### CLI Options
```bash
# Show version
python3 -m tui.node_console --version

# Show help
python3 -m tui.node_console --help

# Monochrome (no colors)
python3 -m tui.node_console --no-color

# Enable debug logging
python3 -m tui.node_console --debug

# Custom refresh interval (seconds)
python3 -m tui.node_console --refresh 3

# Custom API URL
python3 -m tui.node_console --api-url http://10.0.0.5:8080
```

### Remote SSH Usage
```bash
# Connect and launch
ssh user@audionode "cd /home/mm/map2-audio && python3 -m tui.node_console"

# Via wrapper script
ssh user@audionode "/home/mm/map2-audio/tui.sh"

# With optimized terminal
TERM=xterm-256color ssh user@audionode "./tui.sh"
```

### Keyboard Shortcuts in Node Console
```
F1 or 6        → Help tab
F5 or r        → Refresh all data
1-6            → Jump to specific tab
d              → Dashboard
a              → Audio
c              → Cluster
m              → Mode & Actions
l              → Logs
Tab            → Next widget
Shift+Tab      → Previous widget
Enter          → Activate/confirm
Escape         → Close modal
q              → Quit
```

---

## 4. QUICK SHELL COMMANDS (Available After Welcome)

These commands are defined in the welcome script and available in your current shell session:

### Full Stack Restart
```bash
map2-restart
```
- Stops backend (port 8080) and frontend (port 3000)
- Waits for ports to be released
- Starts backend (FastAPI)
- Starts frontend (Vite dev server)
- Displays progress and connection URLs

**Steps**:
1. Stops Backend
2. Stops Frontend
3. Starts Backend (with health check)
4. Starts Frontend (with health check)

### Tail All Logs
```bash
map2-logs
```
- Shows real-time output from both:
  - `/tmp/map2-backend.log`
  - `/tmp/map2-frontend.log`
- Press Ctrl+C to stop

### Show Service Status
```bash
map2-status
```
Displays:
- Backend status (running/stopped) with PID
- Frontend status (running/stopped) with PID
- Connection URLs if running

### Stop All Services
```bash
map2-stop
```
- Kills backend process (port 8080)
- Kills frontend process (port 3000)
- Confirms both are stopped

---

## 5. HARDWARE STATUS (Shown in Welcome)

The welcome message displays:

| Item | What It Checks |
|------|---|
| **Real-Time Audio** | Checks if user is in `audio` group |
| **Audio Devices** | Uses `aplay -l` to list cards |
| **MIDI Devices** | Uses `amidi -l` to list devices |
| **CPU Info** | Reads from `/proc/cpuinfo` |

**To enable real-time audio**:
```bash
# Add current user to audio group
sudo usermod -aG audio $USER

# Apply group membership (requires re-login or use newgrp)
newgrp audio
```

---

## 6. API INTEGRATION ENDPOINTS

All accessible at `http://localhost:8080/api/*`:

| Endpoint | Purpose |
|----------|---------|
| `/health` | Overall health, services running, plugins loaded |
| `/version` | API version info |
| `/audio/status` | Audio engine state, sample rate, buffer size |
| `/audio/latency` | Round-trip latency measurements |
| `/audio/levels` | Channel levels and XRun counts |
| `/pipewire/status` | Pipewire daemon state, quantum, latency |
| `/pipewire/devices` | Audio devices and configuration |
| `/pipewire/settings` | Pipewire settings (rate, quantum, etc.) |
| `/deployment/mode` | Current node mode (all-in-one/audio/management) |
| `/deployment/status` | Deployment status and health |
| `/deployment/health` | Health checks for deployment config |
| `/cluster/health` | Cluster overview and status |
| `/cluster/online-nodes` | List of peer nodes in cluster |
| `/plugins/engine-ops/status` | Deferred plugin engine-op queue depth/health |

**Test connectivity**:
```bash
curl http://localhost:8080/api/health | python3 -m json.tool
```

---

## 6.1 PLUGIN ENGINE-OP MODES (LOAD/UNLOAD/PARAM APPLY)

These environment variables control how `/api/plugins/load`, `/api/plugins/unload`,
and `/api/plugins/batch/parameters` interact with the JUCE engine:

| Variable | Default | Effect |
|----------|---------|--------|
| `MAP2_ENABLE_ENGINE_PLUGIN_OPS` | `false` | Enables/disables engine-side plugin operations from HTTP routes |
| `MAP2_ENABLE_SYNC_ENGINE_PLUGIN_OPS` | `false` | When enabled (and plugin ops enabled), route waits for immediate engine apply |
| `MAP2_ENGINE_OP_QUEUE_MAX` | `2048` | Max deferred engine operations buffered in async mode |
| `MAP2_ENGINE_OP_MAX_RETRIES` | `6` | Retry attempts for deferred ops when engine is temporarily unavailable |
| `MAP2_ENGINE_OP_RETRY_BASE_DELAY` | `0.05` | Exponential backoff base delay (seconds) for deferred op retries |

Mode behavior:

1. `MAP2_ENABLE_ENGINE_PLUGIN_OPS=false`:
   API updates metadata only; no engine load/unload/parameter execution.
2. `MAP2_ENABLE_ENGINE_PLUGIN_OPS=true` and `MAP2_ENABLE_SYNC_ENGINE_PLUGIN_OPS=false`:
   Non-blocking mode. Requests return quickly with `engine_deferred=true`, and a bounded worker queue applies operations in the background.
3. `MAP2_ENABLE_ENGINE_PLUGIN_OPS=true` and `MAP2_ENABLE_SYNC_ENGINE_PLUGIN_OPS=true`:
   Synchronous mode. Request path applies engine operations inline before returning.

Recommended production mode for load resilience: `true/false` (enabled + non-blocking queue).

Quick status check:
```bash
curl -s http://localhost:8080/api/plugins/engine-ops/status | python3 -m json.tool
```

---

## 7. FILE LOCATIONS SUMMARY

### Configuration
- **Node mode**: `/etc/guitarfx-mode.conf`
- **Systemd service**: `/etc/systemd/system/map2-backend.service`
- **Project root**: `/home/mm/map2-audio`

### Scripts
- **Backend**: `/home/mm/map2-audio/scripts/` (various)
- **Web UI**: `/home/mm/map2-audio/scripts/start_web.sh`
- **TUI wrapper**: `/home/mm/map2-audio/tui.sh`

### Audio Models & IRs
- **NAM Models**: `~/.local/share/map2/nam/`
- **Cabinet IRs**: `~/.local/share/map2/ir/cabinets/`
- **Reverb IRs**: `~/.local/share/map2/ir/reverbs/`

### Logs
- **Backend**: `/tmp/map2-backend.log`
- **Frontend**: `/tmp/map2-frontend.log`
- **TUI Debug**: `/tmp/map2_node_console.log`
- **Systemd**: `journalctl -u map2-backend -f`

### Web UI
- **Source**: `/home/mm/map2-audio/web/`
- **Dev build**: `web/` (hot-reload on port 3000)
- **Prod build**: `web/dist/` (optimized static files)

---

## 8. TROUBLESHOOTING

### Backend Won't Start
```bash
# Check if port 8080 is in use
lsof -i :8080

# Kill any existing process on 8080
kill -9 <PID>

# Check for errors
cat /tmp/map2-backend.log

# Or start manually to see errors:
cd /home/mm/map2-audio
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8080
```

### Frontend Won't Start
```bash
# Check if port 3000 is in use
lsof -i :3000

# Kill any existing process on 3000
kill -9 <PID>

# Check for missing dependencies
cd /home/mm/map2-audio/web
npm install

# Start with verbose logging
npm run dev -- --host 0.0.0.0 --port 3000
```

### Node Console Display Issues
```bash
# Set terminal to 256 colors
export TERM=xterm-256color

# Or use monochrome mode
python3 -m tui.node_console --no-color

# Enable debug logging
python3 -m tui.node_console --debug
tail -f /tmp/map2_node_console.log
```

### API Not Responding
```bash
# Check if backend is running
curl -i http://localhost:8080/api/health

# Check service status
systemctl status map2-backend

# View recent errors
journalctl -u map2-backend --no-pager -n 50

# Tail logs
journalctl -u map2-backend -f
```

---

## 9. COMMON WORKFLOWS

### Full Development Setup
```bash
# Terminal 1: Start backend
systemctl start map2-backend

# Terminal 2: Start web dashboard
/home/mm/map2-audio/scripts/start_web.sh

# Terminal 3: Monitor with Node Console
python3 -m tui.node_console

# Terminal 4: Tail logs
map2-logs  # (if defined in current shell)
```

### Quick Restart Everything
```bash
map2-restart
```
(Requires welcome script to have been sourced in current shell)

### Remote Node Monitoring
```bash
# SSH into audio node
ssh user@audionode

# Launch Node Console
python3 -m tui.node_console

# Navigate with: d/a/c/m/l keys + F1 for help
```

### Production Deployment
```bash
# Ensure backend runs via systemd
systemctl enable map2-backend
systemctl start map2-backend

# Access via web dashboard
firefox http://localhost:3000

# Or monitor via TUI
python3 -m tui.node_console
```

---

## 10. SYSTEM REQUIREMENTS

### Installed Components
- ✅ Python 3.10+
- ✅ Node.js & npm (for web UI)
- ✅ Venv with dependencies (textual, httpx, psutil, etc.)
- ✅ systemd (for service management)

### Required Tools
- `curl` — API testing
- `lsof` — Port checking
- `journalctl` — Service logs
- `ps` / `pgrep` — Process management

### Audio Hardware (Optional)
- Audio input/output devices
- MIDI devices
- I2C LCD display (for standalone mode)

---

## 11. REFERENCE: Before Welcome Script Update

**Removed section** (Shell Customization):
- Starship, Oh-My-Bash, Powerline-Shell, Liquid Prompt, Bash-it recommendations
- `map2-shell-setup` command reference
- Optional terminal enhancement tools

**Reason**: Not part of core MAP2 platform. Users can customize their shell independently if desired.

**Updated**:
- Version date from `1-22-25` → `February 2026`
- Removed shell customization detection logic
- Kept all core service management functionality

---

## 12. AVB ROUTING MULTI-SELECT WORKFLOW

Use this workflow when operating multiple nodes at once in the AVB Routing UI (`/avb-routing`):

1. Enter multi-select mode:
```text
Click the top-bar multi-select toggle (checklist icon) in the node strip.
```

2. Build the active node set:
```text
Click node tabs (top strip) or node rows (left NodeTree) to add/remove nodes.
```
- Selection is fail-safe normalized in UI state:
  - duplicate node IDs are removed
  - ordering is deterministic for stable operator context

3. Validate active context:
```text
Selected nodes are highlighted in both NodeSelector and NodeTree.
Inspector endpoint/route details are shown only when the selected object belongs to the active node set.
```

4. Exit multi-select mode:
```text
Click the multi-select toggle again, or switch to All Nodes / single-node tab focus as needed.
```

Operational note:
- Multi-select filtering affects endpoint visibility and inspector context only; it does not auto-create or auto-remove AVB routes.

Troubleshooting:
- A selected node disappears from node tabs/tree:
  - verify `show_offline` visibility is enabled in the node navigation UI
  - if the node is currently offline, selection state is retained and reappears when visibility/node presence returns
- Inspector appears empty during multi-select:
  - confirm the selected endpoint/route belongs to at least one node in the active multi-select set
- Unexpected multi-select order in diagnostics:
  - selected node IDs are normalized (deduplicated + deterministic lexical order) by reducer design

---

## 13. AVB ROUTING SCENE OPERATIONS (VALIDATION + IMPACT PREVIEW)

Use this workflow for scene save/update/recall/delete operations in the AVB Routing TopBar `Scenes` control:

1. Open scene controls:
```text
Click TopBar -> Scenes.
```

2. Save a scene with validation guardrails:
```text
Enter a New Scene Name, then click Save Current.
```
- Validation limits:
  - scene name: max 64 characters
  - scene description: max 280 characters
  - tags: max 8 entries
  - tag length: max 24 characters per tag
- Normalization behavior:
  - trims/collapses whitespace
  - strips control characters
  - replaces reserved characters (`<`, `>`, `` ` ``, `|`, `\`) with spaces
  - normalizes tags to lowercase kebab-case and deduplicates

3. Handle duplicate names deterministically:
```text
Keep "Auto-suffix duplicate names" enabled (default) for deterministic disambiguation.
```
- When enabled:
  - duplicate names auto-resolve to `Name (2)`, `Name (3)`, etc.
  - a duplicate hint appears before save/update
- When disabled:
  - duplicate names are allowed as-is
  - warning guidance is shown before save/update

4. Review impact before recall:
```text
Select a saved scene and review Impact summary (+ add / - remove / = unchanged).
```
- Use `Show Impact Details` for route-level entries.
- Large diffs are truncated by default; use `Show More` then `Reset` to page details.
- Route labels are rendered as `Talker -> Listener` using endpoint names when available.

5. Use scene-diff presets and swap controls for faster compare workflows:
```text
Open TopBar -> Scene Diff, select baseline/compare, then Save Preset.
```
- Preset workflow:
  - save named baseline/compare pairs for repeatable compare runs
  - add optional preset notes and version metadata for operator context and compatibility tracking
  - apply presets from Scene Diff controls or directly from the Scene Diff Preview strip
  - delete obsolete presets from Scene Diff controls
  - export preset sets as JSON for deterministic team sharing
  - preview preset JSON before import to see accepted/conflict/skipped row outcomes
  - large preview payloads are paged (`Prev`/`Next`) to keep row rendering deterministic
  - import preset JSON from either raw array form or `{ "presets": [...] }` wrapper form after preview
  - wrapped import payloads must provide `schema_version: 1`; incompatible schema versions are rejected during preview
  - wrapped payloads may include advisory `preferred_conflict_action` (`upsert`, `rename`, or `skip`) to pre-seed conflict defaults across teams
  - mixed-hint example (wrapper default + row override):
  ```json
  {
    "schema_version": 1,
    "preferred_conflict_action": "skip",
    "presets": [
      {
        "name": "Preset Explicit Rename",
        "baseline_scene_id": "scene-a",
        "compare_scene_id": "scene-b",
        "preferred_conflict_action": "rename"
      },
      {
        "name": "Preset Wrapper Only",
        "baseline_scene_id": "scene-a",
        "compare_scene_id": "scene-b"
      }
    ]
  }
  ```
  - in this example, `Preset Explicit Rename` retains `Rename`, while `Preset Wrapper Only` imports with default persisted policy `Upsert`
  - wrapper-level `preferred_conflict_action` is advisory preview metadata; persisted per-preset policy is only set when the row explicitly carries `preferred_conflict_action`
  - saved presets show conflict-policy summary chips (`Preset Name: Upsert/Rename/Skip`) directly in scene-diff controls
  - selected preset policy status is shown explicitly (`Selected preset policy: ...`) to avoid hidden metadata during operator handoffs
  - a helper line indicates whether draft conflict policy edits are unsaved (`Save Preset to persist`) versus already matched to persisted preset metadata
  - use `Use Default Upsert` to reset draft conflict policy before saving/updating a preset
  - review conflict rows to compare incoming metadata against existing preset metadata before upsert-by-name import
  - conflict rows support per-row actions before import dispatch: `Upsert`, `Rename`, or `Skip`
  - preview rows are grouped in triage order (`Conflict`, `Accepted`, `Skipped`) for faster operator review
  - use group toggles (`Hide/Show Conflict`, `Hide/Show Accepted`, `Hide/Show Skipped`) to collapse noisy sections in large previews
  - page summary shows `visible` rows and `total` rows so collapsed-group context remains explicit
  - planned conflict resolution chips (`Planned upsert/rename/skip`) update live as you choose row actions
  - use bulk helpers (`All Conflicts -> Upsert/Rename/Skip`) for deterministic one-click policy application across all conflict rows
  - rename mode surfaces inline validation feedback immediately (invalid/duplicate target names are shown before import click)
  - keyboard activation is supported on group toggles and bulk conflict actions (`Enter` / `Space`)
- Swap workflow:
  - `Swap Baseline/Compare` in Scene Diff controls inverts selection and regenerates preview
  - `Swap` in Scene Diff Preview performs the same quick inversion path

6. Confirm destructive actions:
```text
Recall and Delete require two clicks (confirm pattern) on the selected scene.
```
- First click arms confirmation and shows warning context.
- Second click executes the action.

Troubleshooting:
- Save/update blocked:
  - check name/description/tag length limits
  - remove unsupported characters from scene metadata
- Unexpected duplicate suffix:
  - disable `Auto-suffix duplicate names` if duplicate naming is intentionally required
- Missing impact details:
  - select a scene first, then expand `Show Impact Details`
- Preset apply/swap fails:
  - verify baseline and compare scenes still exist
  - if scenes were deleted/renamed, reselect scenes and resave the preset
- Import blocked before dispatch:
  - use `Preview JSON` first, then `Import JSON` (import is intentionally gated on explicit preview)
- Import skips entries:
  - run `Preview JSON` and inspect skipped-row reasons before import
  - use preview pagination controls (`Prev`/`Next`) when the row list is longer than one page
  - use per-row conflict actions (`Skip`/`Rename`) to control exactly which conflicting presets are imported
  - use bulk conflict action buttons when many conflict rows need the same policy
  - ensure each entry includes `name`, `baseline_scene_id`, and `compare_scene_id`
  - ensure referenced scene IDs currently exist in the node state
  - fix malformed JSON before re-importing
- Conflict rename is blocked:
  - switch row action to `Rename` and inspect inline error text under `Rename Conflict Preset`
  - invalid names must satisfy normal scene metadata limits
  - rename targets cannot match any existing preset name
- Expected rows are missing from preview table:
  - check group toggle state (`Show Conflict/Accepted/Skipped`) because collapsed groups hide rows by status
  - confirm visible/total counts in the preview page summary
- Unsupported schema_version:
  - wrapped payloads must use `schema_version: 1`
  - re-export presets from a compatible MAP2 build, then retry preview/import
- Unsupported preferred_conflict_action:
  - supported values are `upsert`, `rename`, or `skip`
  - remove or correct the field, then re-run `Preview JSON`
- Preview cancelled audit entry appears:
  - `transfer_draft_changed`: preview was open and JSON draft content changed; rerun `Preview JSON`
  - `popover_closed`: scene-diff popover closed while preview was active; reopen Scene Diff and preview again
  - `exported_payload_reset`: export action reset active preview context; rerun `Preview JSON` before importing
- Stale preset is removed on apply:
  - if a preset references deleted/missing scenes, it is auto-removed during apply and logged with warning outcome
  - export/import fresh presets after large scene inventory churn windows
- Remote scene sync invalidates active baseline/compare or preset references:
  - symptoms:
    - status strip changes to `Baseline: None` or `Compare: Missing`
    - readiness changes from `Diff selection ready` to `Diff selection incomplete` or `Diff selection stale`
    - previously selected scene-diff preset disappears (`Active preset: none`) after remote scene delete/update churn
  - troubleshooting flow:
    1. open `Scenes` and verify status-strip labels (`Baseline`, `Compare`, `Diff selection ...`) before changing filters
    2. activate `Deletes` from the status strip to confirm whether a remote delete event landed (`Search Operations = delete`)
    3. if compare-scene metadata changed, reopen `Scene Diff` and reselect baseline/compare using current scene names
    4. run `Generate Diff` again to rebuild preview state after the sync window
    5. if presets were remediated (removed), save a fresh preset pair and export the refreshed preset set
- Remote scene sync occurs while `Preview JSON` is already open:
  - quick playbook:
    1. keep the popover open and rerun `Preview JSON` once remote churn settles (do not import from a stale preview table)
    2. confirm preview counters and rows are recalculated (accepted/conflict/skipped may change after scene inventory updates)
    3. if conflict actions or rename drafts were edited before the sync event, re-apply those choices after refresh (refresh resets preview planning state)
    4. review scene status strip for `Baseline: None` / `Compare: Missing`; reselect baseline/compare scenes if needed
    5. only then run `Import JSON`, and immediately save/export refreshed presets for handoff consistency
  - expected audit behavior:
    - preview lifecycle entries remain ordered (`opened`/`refreshed`/`cancelled`) even when remote scene delete/update events occur in the same window
    - scene delete/update audit entries stay visible via quick chips (`Deletes`, `Warnings`) without needing to close the popover
- Too many scene audit rows:
  - use status-strip counters (`Errors`, `Warnings`, `Deletes`, `Diff Preview Warnings`) to open scene controls with pre-filtered audit views
  - counters support keyboard activation (`Enter` / `Space`) for keyboard-only triage flows
  - use the `Search Operations` field and `Outcome` filter in the scene popover to narrow to matching save/recall/delete/update events
  - enable `Remember Audit Filters` to persist current search/outcome filters across scene popover close/reopen cycles
  - use quick chips (`All`, `Errors`, `Warnings`, `Deletes`) for one-click filter presets during live operations
- Counter result does not match remembered filters:
  - expected precedence: status-strip counter presets override stale remembered filters when opening scene controls
  - `Errors`: clears search, forces `Outcome=error`, disables diff-preview-only mode
  - `Warnings`: clears search, forces `Outcome=warning`, disables diff-preview-only mode
  - `Deletes`: sets search to `delete`, forces `Outcome=all`, disables diff-preview-only mode
  - `Diff Preview Warnings`: clears search, enables diff-preview-only mode, forces `Outcome=warning`
  - troubleshooting flow:
    1. activate the intended counter from the status strip (pointer click or `Enter` / `Space`)
    2. verify `Search Operations`, `Outcome`, and summary text (`x of y matching (z total)`) reflect the counter preset
    3. if stale filters remain, toggle off `Remember Audit Filters`, close the scene popover, and reopen via the same counter
    4. confirm the preset is reapplied before re-enabling `Remember Audit Filters`

---

## Quick Start Checklist

- [ ] Backend running: `systemctl status map2-backend`
- [ ] Frontend running: Check http://localhost:3000
- [ ] API responding: `curl http://localhost:8080/api/health`
- [ ] Node Console available: `python3 -m tui.node_console`
- [ ] Commands defined: Try `map2-status` in current shell
- [ ] Documentation available: See README.md and API docs

---

## Support Resources

- **API Documentation**: http://localhost:8080/docs
- **Node Console Help**: Press `F1` in the TUI
- **System Logs**: `journalctl -u map2-backend -f`
- **Project README**: `/home/mm/map2-audio/README.md`
- **Deployment Guide**: `/home/mm/map2-audio/NODE_CONSOLE_DEPLOYMENT.md`

---

**Last Updated**: February 19, 2026  
**Version**: 2.0  
**Status**: All operations current and validated
