# AI Agent Quick Start Guide - TUI Cluster Integration

**MAP2 Audio Platform - TUI Enhancement Implementation**

**For**: AI Agents continuing this project  
**Start Here**: When resuming implementation  
**Duration**: 5-10 minutes to get oriented

---

## 🎯 30-Second Summary

You are implementing **10 terminal user interface features** for a music production platform's cluster management system.

- **What**: Real-time cluster node monitoring, flow assignment, failover, etc. in the TUI
- **Why**: Users need cluster visibility without leaving the terminal
- **How**: Create widgets and screens integrating with existing TUI framework
- **Timeline**: 20 checkpoints across 5 phases (12 weeks)
- **Status**: Currently at Phase 1 (Planning done, implementation starting)

---

## 📍 Where Am I in the Project?

```
Project Status: PHASE 1 - Foundation & Setup (Week 1)

Current Phase: Not Started
Total Checkpoints: 20
Completed: 0
In Progress: 0
Remaining: 20

Estimated Time to Complete: 12 weeks
```

---

## 🚀 What to Do Right Now

### If You're Starting Phase 1.1:
1. Read: `docs/TUI_CLUSTER_IMPLEMENTATION/PHASE_1_SETUP.md`
2. Section: "Checkpoint 1.1: Infrastructure Review"
3. Task: Document existing TUI structure
4. Deliverable: `docs/TUI_CLUSTER_ARCHITECTURE.md`

### If You're Resuming Work:
1. Check: `docs/TUI_CLUSTER_IMPLEMENTATION/IMPLEMENTATION_TRACKING.md`
2. Find: Last completed checkpoint
3. Read: Next checkpoint section in phase doc
4. Continue: From where it stopped

---

## 📚 Essential Files to Read First

### (In Order)
1. **THIS FILE** - You're reading it ✅
2. `docs/TUI_ENHANCEMENT_OPPORTUNITIES.md` - What you're building (10 features)
3. `docs/TUI_CLUSTER_IMPLEMENTATION_PLAN.md` - How you'll build it (master plan)
4. `docs/TUI_CLUSTER_IMPLEMENTATION/PHASE_1_SETUP.md` - Detailed checkpoint for current work

### Total Reading Time: ~45 minutes

---

## 🗂️ Directory Map

```
/home/mm/map2-audio/
├── tui/                          ← WHERE YOU'LL WORK
│   ├── app.py                    (Main TUI app - study this)
│   ├── api_client.py             (API interaction - extend this)
│   ├── screens/                  (Screen implementations)
│   │   ├── dashboard_screen.py   (Study for patterns)
│   │   └── ... 12 other screens
│   ├── widgets/                  (Widget library)
│   │   ├── landing_dashboard_widget.py (Study for patterns)
│   │   └── ... existing widgets
│   └── tests/                    (Test files - add here)
│
├── docs/                          ← DOCUMENTATION
│   ├── TUI_ENHANCEMENT_OPPORTUNITIES.md (Feature list)
│   ├── TUI_CLUSTER_IMPLEMENTATION_PLAN.md (Master plan)
│   └── TUI_CLUSTER_IMPLEMENTATION/
│       ├── IMPLEMENTATION_TRACKING.md (Current status)
│       ├── PHASE_1_SETUP.md (Current phase details)
│       ├── PHASE_2_CRITICAL.md (Next phases - to create)
│       ├── ... (more phase docs)
│       └── API_REFERENCE.md (API docs - to create)
│
└── app/                          (Backend code - reference only)
    ├── routes/
    │   └── cluster_flows.py      (API endpoints - already exists)
    └── services/
        └── flow_orchestrator.py  (Business logic - already exists)
```

---

## 🎯 Current Work: Phase 1.1

### What is Checkpoint 1.1?
Document the existing TUI architecture so all future work follows established patterns.

### What You Need to Do
1. Study `tui/app.py` thoroughly (understand structure)
2. Study `tui/screens/dashboard_screen.py` (understand screen patterns)
3. Study `tui/widgets/landing_dashboard_widget.py` (understand widget patterns)
4. Create `docs/TUI_CLUSTER_ARCHITECTURE.md` with findings

### Expected Output
A 2000+ word document explaining:
- TUI directory structure and purpose of each file
- How screens work (class structure, lifecycle, data binding)
- How widgets work (composition, CSS, state management)
- Existing patterns to follow for new code
- Async patterns used in the codebase
- Current 13 tabs and their purpose

### Success Criteria
- [ ] Document is comprehensive and clear
- [ ] Code examples are correct
- [ ] Any developer could understand TUI structure from this doc
- [ ] No unanswered questions remain

---

## 🛠️ Common Commands

### View Current Status
```bash
cat docs/TUI_CLUSTER_IMPLEMENTATION/IMPLEMENTATION_TRACKING.md
```

### Read Current Checkpoint
```bash
cat docs/TUI_CLUSTER_IMPLEMENTATION/PHASE_1_SETUP.md | grep -A 100 "Checkpoint 1.1"
```

### Start the TUI (when ready)
```bash
cd /home/mm/map2-audio
./tui.sh
```

### Run Tests
```bash
cd /home/mm/map2-audio
python3 -m pytest tui/tests/ -v
```

### Check Backend API
```bash
# Is backend running?
curl http://localhost:8080/api/health

# Check cluster endpoints
curl http://localhost:8080/api/cluster/nodes
curl http://localhost:8080/api/cluster/flows/assignments
```

---

## 📋 5-Phase Overview

```
Phase 1: Foundation (Week 1)
├─ 1.1: Document TUI architecture
├─ 1.2: Extend API client with cluster endpoints
├─ 1.3: Create base widgets (6 widgets)
└─ 1.4: Set up testing framework

Phase 2: Critical Features (Weeks 2-4)
├─ 2.1: Cluster Node Dashboard screen
├─ 2.2: Flow Assignment Matrix widget
├─ 2.3: Wire up to main navigation
└─ 2.4: Integration tests

Phase 3: High-Priority (Weeks 5-7)
├─ 3.1: Node Recommendation UI
├─ 3.2: Failover Controller
├─ 3.3: Diagnostics Panel
└─ 3.4: Integration tests

Phase 4: Medium-Priority (Weeks 8-10)
├─ 4.1: Maintenance Mode Manager
├─ 4.2: Event Log Viewer
├─ 4.3: Deployment Wizard
└─ 4.4: Integration tests

Phase 5: Polish (Weeks 11-12)
├─ 5.1: Performance Monitor
├─ 5.2: Status Badge
├─ 5.3: Complete documentation
└─ 5.4: Final validation & release
```

---

## 🔗 10 Features Being Built

1. 🛰️ **Cluster Node Dashboard** - Real-time node status display
2. 📊 **Flow Assignment Matrix** - Interactive 2D grid of assignments
3. 🎯 **Node Recommendations** - Intelligent node suggestions
4. 🔄 **Failover Controller** - Manual failover interface
5. 🔧 **Maintenance Manager** - Safe node maintenance UI
6. 📈 **Performance Monitor** - Aggregate metrics display
7. 🔍 **Diagnostics Panel** - Troubleshooting tools
8. 📜 **Event Log Viewer** - Event filtering and search
9. 🎛️ **Deployment Wizard** - Bulk assignment tool
10. 📱 **Status Badge** - Quick cluster health indicator

---

## ⚙️ Technical Details

### Tech Stack
- **Framework**: Textual (TUI framework)
- **Backend**: FastAPI
- **Database**: SQLite/PostgreSQL (managed by backend)
- **Communication**: HTTP/REST + WebSocket
- **Testing**: pytest + pytest-asyncio

### Key Patterns
```python
# Screen Pattern
class MyScreen(Static):
    async def on_mount(self):
        # Initialize
        
    def compose(self) -> ComposeResult:
        # Build UI with yield
        
    async def action_do_something(self):
        # Handle user action

# Widget Pattern
class MyWidget(Static):
    BINDINGS = [
        Binding("q", "quit", "Quit"),
    ]
    
    DEFAULT_CSS = """
    MyWidget {
        width: 100%;
        height: 100%;
    }
    """
    
    def compose(self) -> ComposeResult:
        yield Label("My Content")
        
    def watch_reactive_var(self, old, new):
        # React to state changes
```

---

## 🎓 Learning Resources

### Already Implemented (Study These)
- `tui/app.py` - Main app with 13 tabs
- `tui/screens/dashboard_screen.py` - Screen example
- `tui/widgets/landing_dashboard_widget.py` - Widget example
- `tui/api_client.py` - API client example

### Backend You'll Integrate With
- `app/services/flow_orchestrator.py` - Flow management logic
- `app/routes/cluster_flows.py` - Existing cluster API routes
- API docs in `docs/CLUSTER_ADMIN_GUIDE.md`

### Documentation You'll Reference
- `docs/TUI_CLUSTER_IMPLEMENTATION_PLAN.md` - Master plan
- `docs/TUI_ENHANCEMENT_OPPORTUNITIES.md` - Feature details
- Phase-specific docs in `docs/TUI_CLUSTER_IMPLEMENTATION/`

---

## ⚠️ Important Notes

### What's Already Done
✅ Backend cluster management system (Phase 0-5 complete)  
✅ All cluster API endpoints implemented  
✅ Database schema for cluster  
✅ Feature analysis and planning  
✅ Detailed implementation plan  

### What You're Doing
🔄 Implementing TUI features  
🔄 Creating widgets and screens  
🔄 Writing tests  
🔄 Documentation  

### What You're NOT Doing
❌ Backend implementation (already done)  
❌ Database schema (already done)  
❌ API endpoints (already done)  

---

## 🚨 Potential Issues

### Common Blockers
- Backend not running → Start with: `sudo systemctl start map2`
- WebSocket issues → Check backend logs
- Import errors → Install missing dependencies
- Test failures → Check mocking setup

### Where to Get Help
1. Read: `docs/TUI_CLUSTER_IMPLEMENTATION/TROUBLESHOOTING.md` (to create)
2. Check: Backend logs at `/tmp/backend.log`
3. Review: Existing tests in `tui/tests/`
4. Study: Similar components already in codebase

---

## 📞 For Next AI Session

When an AI resumes this work:

### Minimal Handoff
1. Read this file (5 min)
2. Check IMPLEMENTATION_TRACKING.md (2 min)
3. Read current phase checkpoint (10 min)
4. Continue from marked spot

### What to Update When Done
```bash
# Edit this file:
docs/TUI_CLUSTER_IMPLEMENTATION/IMPLEMENTATION_TRACKING.md

# Update:
- Checkpoint status (⬜ → 🟨 → ✅)
- Start/end dates
- Notes and blockers
- Files created count
```

---

## ✅ Pre-Flight Checklist

Before starting implementation:

- [ ] Read TUI_ENHANCEMENT_OPPORTUNITIES.md
- [ ] Read TUI_CLUSTER_IMPLEMENTATION_PLAN.md
- [ ] Read current phase checkpoint doc
- [ ] Backend is running (`curl http://localhost:8080/api/health`)
- [ ] Python environment is configured
- [ ] Can run `./tui.sh` without errors
- [ ] Understand existing TUI structure
- [ ] Understand existing widget patterns
- [ ] Know how to run tests

---

## 🎯 Next Steps (In Order)

1. **Read** (If not done): TUI_ENHANCEMENT_OPPORTUNITIES.md (15 min)
2. **Read** (If not done): TUI_CLUSTER_IMPLEMENTATION_PLAN.md (20 min)
3. **Read** (Required): PHASE_1_SETUP.md section 1.1 (10 min)
4. **Study**: `tui/app.py` and patterns (60 min)
5. **Study**: `tui/screens/dashboard_screen.py` (30 min)
6. **Study**: `tui/widgets/landing_dashboard_widget.py` (30 min)
7. **Create**: `docs/TUI_CLUSTER_ARCHITECTURE.md` (120 min)
8. **Review**: Get feedback on architecture doc
9. **Proceed**: To Phase 1.2

**Total**: ~5 hours to complete Phase 1.1

---

## 🎉 You're Ready!

You now understand:
- ✅ What you're building (10 features)
- ✅ How you'll build it (5 phases, 20 checkpoints)
- ✅ Where things are in the project
- ✅ How to continue work
- ✅ How to get unstuck

**Next**: Start Phase 1.1 by studying the TUI architecture!

---

**Document Version**: 1.0  
**Created**: February 5, 2026  
**Target Audience**: AI Agents & New Developers
