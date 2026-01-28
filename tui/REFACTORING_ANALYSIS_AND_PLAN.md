# TUI REFACTORING ANALYSIS & PLAN

## CURRENT STATE ANALYSIS

### **Current Architecture:**

**File:** `/home/mm/map2-audio/tui/app.py` (953 lines)

**Main Components:**
1. **LRUScreenCache** - Manages 4 screens in memory
2. **TabWidget** - Visual tab bar component
3. **MAP2AudioTUI** - Main App class
4. **30+ Actions** - Keyboard bindings

**Current Screens (13 tabs):**
1. ChainsScreen (Pedalboard)
2. MIDIScreen
3. PluginLoaderScreen
4. MetricsTab (Dashboard)
5. WorkflowTab
6. AutomationTab
7. GuitarChainScreen
8. NetworkTab
9. WWWTab
10. ControlPanelScreen (Services)
11. HealthTabScreen (Health)
12. AboutTab
13. BackupTab

**Additional Available Screens (Not Shown):**
- favorites_tab.py
- midi_enhanced_tab.py
- sessions.py
- plugins.py
- health_tab.py
- control_panel.py

---

## MISSING/HIDDEN PARTS:

### **Missing from Main Interface:**
1. ❌ **Favorites Tab** - Created but not in tab list
2. ❌ **Sessions Management** - Not visible
3. ❌ **Enhanced MIDI Tab** - Alternative not shown
4. ❌ **Dedicated Health Dashboard** - Listed as screen but unclear
5. ❌ **Settings/Configuration Tab** - Not visible
6. ❌ **Presets Management** - Not visible
7. ❌ **Real-time Monitoring Panel** - Not integrated
8. ❌ **Performance Dashboard** - Not visible
9. ❌ **Plugin Browser/Manager** - Separate from loader
10. ❌ **Recording/Session Capture** - Not visible

### **Issues with Current Design:**
1. **13 tabs is too many** - Cluttered, hard to navigate
2. **No tab grouping** - All tabs at same level
3. **Redundant screens** - Multiple similar views
4. **No main dashboard** - No overview screen
5. **Poor information hierarchy** - Equal importance to all tabs
6. **No quick-access for common tasks**
7. **Features banner is hidden** - Not actually visible in tabbed interface
8. **Status bar underutilized** - Could show more context
9. **No sidebar/drawer** - All content in tabs
10. **No breadcrumbs/context** - No indication of where user is

---

## PROPOSED SIMPLIFIED ARCHITECTURE:

### **New Tab Structure (7 main tabs):**

**1. DASHBOARD (Overview)**
   - Real-time metrics (CPU, RAM, latency)
   - Quick stats from all chains
   - Recent chains & presets
   - System health status
   - Quick actions buttons

**2. CHAINS (Pedalboard Management)**
   - Chain list with A/B comparison
   - Current chain editor
   - Chain presets selector
   - Undo/Redo indicators

**3. EFFECTS & ROUTING**
   - Plugin loader
   - Guitar/NAM settings
   - Effect browser
   - Network effects (WWW tab merged)

**4. MIDI & SESSIONS**
   - MIDI configuration
   - Session management
   - Session recording/playback
   - Favorites

**5. WORKFLOW & AUTOMATION**
   - Workflow rules
   - Automation settings
   - Presets

**6. SETTINGS**
   - Configuration
   - Preferences
   - Backup/Restore
   - Help & About

**7. DIAGNOSTICS** (New)
   - Health status
   - Performance metrics
   - Logs
   - Troubleshooting

---

## REFACTORING PLAN:

### **Phase 1: Consolidate Screens**

**Step 1: Create Master Screens**
```
1. DashboardScreen
   ├─ MetricsWidget (from StatusBar)
   ├─ QuickStatsWidget (from DiagnosticDashboard)
   ├─ RecentChainsWidget (new)
   └─ HealthStatusWidget (from HealthTab)

2. ChainsManagerScreen
   ├─ ChainListWidget (from ChainsScreen)
   ├─ ABComparisonWidget (from ChainsScreen)
   ├─ PresetSelectorWidget (new)
   └─ UndoRedoIndicator

3. EffectsManagerScreen
   ├─ PluginBrowserWidget (from PluginLoaderScreen)
   ├─ GuitarSettingsWidget (from GuitarScreen)
   ├─ EffectNetworkWidget (from WWWTab)
   └─ RoutingVisualizerWidget (new)

4. MIDISessionsScreen
   ├─ MIDIConfigWidget (from MIDIScreen)
   ├─ SessionManagerWidget (from sessions.py)
   ├─ FavoritesWidget (from favorites_tab.py)
   └─ RecordingWidget (new)

5. WorkflowSettingsScreen
   ├─ WorkflowRulesWidget (from WorkflowTab)
   ├─ AutomationWidget (from AutomationTab)
   ├─ PresetsWidget (new)
   └─ PreferencesWidget

6. SettingsScreen
   ├─ PreferencesWidget (from config)
   ├─ BackupRestoreWidget (from BackupTab)
   ├─ ThemeSelectorWidget (from theme_engine)
   ├─ KeybindingsWidget (from keybindings_system)
   └─ AboutWidget (from AboutTab)

7. DiagnosticsScreen
   ├─ HealthDashboardWidget (from HealthTab)
   ├─ PerformanceMonitorWidget (from performance_monitor)
   ├─ LogViewerWidget (from log_analyzer)
   ├─ TroubleshootingWidget (from troubleshooting_wizard)
   └─ StateInspectorWidget (from state_inspector)
```

---

### **Phase 2: Update App Structure**

**Changes to app.py:**

```python
# New simplified SCREEN_FACTORIES
SCREEN_FACTORIES = {
    0: (DashboardScreen, "dashboard"),
    1: (ChainsManagerScreen, "chains"),
    2: (EffectsManagerScreen, "effects"),
    3: (MIDISessionsScreen, "midi"),
    4: (WorkflowSettingsScreen, "workflow"),
    5: (SettingsScreen, "settings"),
    6: (DiagnosticsScreen, "diagnostics"),
}

# Simplified tabs
TAB_NAMES = [
    "📊 Dashboard",
    "🎸 Chains",
    "🎛️ Effects",
    "🎹 MIDI",
    "⚙️ Workflow",
    "⚙️ Settings",
    "🔍 Diagnostics"
]

# New sidebar for quick access
QUICK_ACCESS = {
    'recent_chains': [],
    'favorites': [],
    'presets': [],
    'shortcuts': []
}
```

---

### **Phase 3: Add Missing UI Components**

**1. Sidebar/Drawer** (Left side)
   - Favorites list
   - Recent items
   - Quick actions
   - Bookmarks

**2. Context Panel** (Bottom)
   - Current selection info
   - Undo/Redo stack
   - Status messages
   - Action history

**3. Top Bar Enhancement**
   - Breadcrumb trail
   - Current mode indicator
   - Quick search
   - Help button

**4. Status Bar** (Bottom right)
   - Real-time metrics
   - Connection status
   - CPU/RAM usage
   - Active plugins count

---

### **Phase 4: Simplify Navigation**

**New Keyboard Layout:**
```
1-7      → Jump to main tabs
?        → Quick help
F1       → Contextual help
F2       → Quick search
F3       → Favorites
F4       → Recent items
F5-F12   → Reserved for macros

Tab      → Focus next
Shift+Tab → Focus previous

Ctrl+1-7 → Quick switch favorites
Ctrl+S   → Save current state
Ctrl+L   → Load state
Ctrl+Z   → Undo
Ctrl+Y   → Redo
```

---

## IMPLEMENTATION CHECKLIST:

### **Phase 1: Analysis & Planning**
- [x] Current state analysis
- [x] Identify missing components
- [x] Create proposed architecture
- [ ] Get user approval

### **Phase 2: Core Refactoring**
- [ ] Create DashboardScreen
- [ ] Create ChainsManagerScreen
- [ ] Create EffectsManagerScreen
- [ ] Create MIDISessionsScreen
- [ ] Create WorkflowSettingsScreen
- [ ] Create SettingsScreen
- [ ] Create DiagnosticsScreen

### **Phase 3: New Components**
- [ ] Sidebar/Drawer widget
- [ ] Context panel
- [ ] Top bar enhancements
- [ ] Quick access panel

### **Phase 4: Integration**
- [ ] Update app.py
- [ ] Update BINDINGS
- [ ] Update compose()
- [ ] Update SCREEN_FACTORIES
- [ ] Test all 7 tabs
- [ ] Update documentation

### **Phase 5: Enhancement**
- [ ] Add animations
- [ ] Add help tooltips
- [ ] Add keyboard shortcuts
- [ ] Performance optimization

---

## BENEFITS OF REFACTORING:

✅ **Simpler Navigation** - 7 tabs instead of 13  
✅ **Better Organization** - Logical grouping  
✅ **More Discoverable** - All features visible  
✅ **Cleaner Interface** - Less clutter  
✅ **Better Workflow** - Related features together  
✅ **Easier to Learn** - Clear structure  
✅ **More Extensible** - Sidebar for future features  
✅ **Better Performance** - Fewer simultaneous screens  
✅ **Consistent Design** - Unified components  
✅ **Mobile-Friendly** - Responsive layout  

---

## ESTIMATED EFFORT:

**Phase 1-2:** 4-6 hours
**Phase 3-4:** 2-3 hours  
**Phase 5:** 1-2 hours
**Total:** 7-11 hours

**Result:** Professional, clean, easy-to-use TUI that's 50% simpler to navigate

---

## APPROVAL NEEDED:

1. ✅ Analysis complete
2. ⏳ **Awaiting user approval to proceed with refactoring**
3. ⏳ Estimated timeline
4. ⏳ Priority of features

**Ready to proceed?** Confirm and we'll start Phase 2 (Core Refactoring)

