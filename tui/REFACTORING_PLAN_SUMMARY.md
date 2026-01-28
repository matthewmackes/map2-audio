# TUI REFACTORING PLAN - EXECUTIVE SUMMARY

## CURRENT STATE:
```
13 TABS (Cluttered):
┌─ 1. Chains/Pedalboard
├─ 2. MIDI
├─ 3. Plugin Loader
├─ 4. Dashboard
├─ 5. Workflow
├─ 6. Automation
├─ 7. Guitar/NAM
├─ 8. Network
├─ 9. WWW
├─ 10. Services/Control Panel
├─ 11. Health
├─ 12. About
└─ 13. Backup

MISSING/HIDDEN:
• Favorites (created but not shown)
• Sessions (created but not shown)
• Enhanced MIDI (created but not shown)
• Settings/Config (not visible)
• Real-time monitoring (not integrated)
• Plugin browser (separate from loader)
• Performance dashboard (not visible)
• Presets management (not visible)
```

---

## PROPOSED STATE:
```
7 TABS (Clean & Organized):
┌─ 1. 📊 DASHBOARD
│   ├─ Real-time metrics
│   ├─ Quick stats
│   ├─ Recent chains
│   └─ System health
├─ 2. 🎸 CHAINS
│   ├─ Chain list
│   ├─ A/B comparison
│   ├─ Presets selector
│   └─ Undo/Redo
├─ 3. 🎛️ EFFECTS & ROUTING
│   ├─ Plugin browser
│   ├─ Guitar settings
│   ├─ Network effects
│   └─ Routing visualizer
├─ 4. 🎹 MIDI & SESSIONS
│   ├─ MIDI config
│   ├─ Session manager
│   ├─ Favorites
│   └─ Recording
├─ 5. ⚙️ WORKFLOW & PRESETS
│   ├─ Workflow rules
│   ├─ Automation
│   ├─ Presets
│   └─ Preferences
├─ 6. ⚙️ SETTINGS
│   ├─ Config
│   ├─ Backup/Restore
│   ├─ Themes
│   ├─ Keybindings
│   └─ About
└─ 7. 🔍 DIAGNOSTICS
    ├─ Health status
    ├─ Performance metrics
    ├─ Logs
    └─ Troubleshooting
```

---

## KEY IMPROVEMENTS:

| Aspect | Before | After |
|--------|--------|-------|
| **Tabs** | 13 (cluttered) | 7 (organized) |
| **Navigation** | Hard | Easy |
| **Feature Visibility** | Hidden features | All visible |
| **Learning Curve** | Steep | Gentle |
| **Workflow** | Scattered | Logical |
| **Discoverability** | Low | High |
| **Mobile-Friendly** | No | Yes |
| **Professional** | Basic | Advanced |

---

## CONSOLIDATION MAPPING:

```
NEW: Dashboard Screen
├─ Metrics (from StatusBar)
├─ Stats (from Diagnostics)
├─ Recent (new)
└─ Health (from HealthTab)

NEW: Chains Manager Screen
├─ List (from ChainsScreen)
├─ AB Mode (from ChainsScreen)
├─ Presets (new)
└─ History (from UndoRedo)

NEW: Effects Manager Screen
├─ Plugins (from PluginLoader)
├─ Guitar (from GuitarScreen)
├─ Network (from WWWTab)
└─ Routing (new)

NEW: MIDI Sessions Screen
├─ MIDI (from MIDIScreen)
├─ Sessions (from sessions.py)
├─ Favorites (from favorites_tab.py)
└─ Recording (new)

NEW: Workflow Settings Screen
├─ Workflow (from WorkflowTab)
├─ Automation (from AutomationTab)
├─ Presets (new)
└─ Prefs (new)

NEW: Settings Screen
├─ Config (from config)
├─ Backup (from BackupTab)
├─ Themes (from theme_engine)
├─ Keys (from keybindings)
└─ About (from AboutTab)

NEW: Diagnostics Screen
├─ Health (from HealthTab)
├─ Perf (from performance_monitor)
├─ Logs (from log_analyzer)
├─ Troubleshoot (from troubleshooting)
└─ State (from state_inspector)
```

---

## WHAT STAYS THE SAME:

✅ All API connections  
✅ All existing hooks  
✅ All data models  
✅ All business logic  
✅ All keyboard shortcuts (reimapped to 7 tabs)  
✅ Error handling  
✅ Caching system  
✅ Theme system  
✅ Performance optimization  

---

## NEW FEATURES GAINED:

✅ **Sidebar** - Quick access to favorites, recent, bookmarks  
✅ **Dashboard** - Unified overview of everything  
✅ **Context Panel** - Shows current state, history, actions  
✅ **Breadcrumbs** - Know where you are  
✅ **Quick Search** - Find anything fast  
✅ **Presets Panel** - Quick access to saved configs  
✅ **Status Indicator** - Always know system state  
✅ **Quick Actions** - One-click common tasks  

---

## IMPLEMENTATION PHASES:

**Phase 1:** Consolidate Screens (4-6 hours)
- Create 7 new master screens
- Move content from 13 tabs to 7

**Phase 2:** Update App Structure (2-3 hours)
- Update app.py
- Update SCREEN_FACTORIES
- Update BINDINGS
- Update compose()

**Phase 3:** Add New Components (2-3 hours)
- Sidebar/Drawer
- Context panel
- Breadcrumbs
- Quick access

**Phase 4:** Integration & Testing (1-2 hours)
- Wire everything together
- Test all 7 tabs
- Update docs

---

## TOTAL EFFORT:

**9-14 hours** → Professional, clean, easy-to-use TUI

---

## READY TO PROCEED?

**This plan:**
✅ Keeps all connections, hooks, APIs  
✅ Simplifies navigation by 46%  
✅ Makes all features visible  
✅ Improves user experience  
✅ Maintains performance  
✅ Adds missing features  

**Proceed with Phase 1 (Consolidate Screens)?** 👍

