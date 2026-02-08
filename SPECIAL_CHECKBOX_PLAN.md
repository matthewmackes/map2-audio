# Special Checkbox & Plugin Filtering Plan (REVISED)

## Overview
Implement password-protected "Special" settings dialog that controls:
1. Which Native Plugins are visible in the plugin chooser
2. Advanced Menu location preference
3. Advanced Menu visibility (appears only when Special is checked)

**Key Changes from Original:**
- Checking the box requires password authentication ("backdoor")
- After authentication, opens a configuration dialog (not just a simple toggle)
- Dialog dynamically lists all Native Plugins with individual hide/show toggles
- Advanced Menu icon appears in top nav ONLY when Special is checked
- Settings persist between boots

---

## Current Architecture

### About Page (`web/src/app/pages/AboutPage.tsx`)
- Contains the Advanced Settings Menu (labeled "hic sunt dracones") at the bottom
- Implemented as a dropdown menu using Ariakit MenuProvider/MenuButton
- Currently has one checkbox toggle: "🛡️ Rate Limiting"
- Menu appears only at the bottom of the About page

### GridFlowPage Plugin Chooser (`web/src/app/pages/GridFlowPage.tsx`)
- Lines 2070-2200: Plugin Browser Modal renders plugin lists
- **Sections:**
  1. **Native Processors** (Lines 2118-2145): Core Integrated Capabilities
     - Rendered from `nativeProcessors` array (filtered from plugins with `uri.startsWith('map2://')`)
     - Displayed in a grid with "Zero Latency" badge
  2. **LV2 Plugin Library** (Lines 2146+): LV2 plugins grouped by category
     - Rendered from `lv2Plugins` array
     - Collapsible category groups

### Top Navigation Bar (`web/src/app/layout/AppShell.tsx`)
- Left side: Guide, Grid, (Legacy if enabled)
- Right side: About menu
- Mobile hamburger with dropdown menu showing all "under-the-hood" items
- `underTheHoodItems` array contains 15 menu items accessible via dropdown

### Plugin Data Storage
- **Plugin Type Definition** (`web/src/map2/types.ts` lines 72-112):
  ```typescript
  interface Plugin {
    uri: string
    name: string
    author: string
    category: string
    // ... other properties (no IP concern flag currently)
  }
  ```

---

## Plan: Five-Part Implementation (REVISED)

### **PART 1: Backend - User Settings & Password (Cluster-Aware)**

**Objective:** Store Special settings and provide password authentication with cluster replication

**Steps:**

1. **Create User Settings Table/Model**
   - Store in database or config file:
     - `special_mode_enabled: bool` (checkbox state)
     - `hidden_native_plugins: List[str]` (array of plugin URIs to hide)
     - `advanced_menu_location: str` (e.g., "top-nav", "mobile-only", "hidden")
     - `last_updated: datetime` (timestamp for conflict resolution)
     - `updated_by_node: str` (node ID that made the change)
   
2. **Password Authentication Endpoint**
   - Create: `POST /api/auth/special-backdoor`
   - Request body: `{ "password": "..." }`
   - Response: `{ "success": bool, "message": str }`
   - Password: Store as environment variable or in config
   - Default password: "backdoor" or configurable

3. **Special Settings API Endpoints (Cluster-Aware)**
   - `GET /api/settings/special` - Get current Special settings
   - `POST /api/settings/special` - Update Special settings
     - **Cluster mode:** Replicate to all nodes via Raft consensus
     - **Standalone mode:** Update local database only
   - Request body:
     ```json
     {
       "enabled": true,
       "hidden_plugins": ["map2://eventide_h9000", "map2://peavey_5150"],
       "menu_location": "top-nav"
     }
     ```

4. **Dynamic Native Plugin List Endpoint**
   - Enhance existing: `GET /api/plugins`
   - Filter response to return only native plugins: `uri.startsWith('map2://')`
   - Return full list (no hardcoded filtering)

5. **Cluster Replication Integration**
   - Use existing Raft consensus mechanism (`app/services/cluster/raft_consensus.py`)
   - Create log entry for Special settings changes:
     ```python
     LogEntry(
       command="update_special_settings",
       data={
         "enabled": bool,
         "hidden_plugins": List[str],
         "menu_location": str,
         "node_id": str
       }
     )
     ```
   - Leader node distributes settings to all followers
   - All nodes apply the same settings when committed
   
6. **Cluster Configuration Distribution**
   - Use existing config distributor (`app/services/cluster/config_distributor.py`)
   - Push Special settings to all nodes when changed
   - Ensure atomic updates across cluster
   - Handle network partitions gracefully (last-write-wins or timestamp-based resolution)

---

### **PART 2: Frontend - Password Dialog Component**

**Objective:** Create password authentication UI

**Steps:**

1. **Create PasswordDialog Component** (`web/src/app/components/PasswordDialog.tsx`)
   - Modal dialog with password input field
   - "Enter Password" title
   - Password input type (masked)
   - Submit/Cancel buttons
   - Error message display for wrong password
   
   ```tsx
   interface PasswordDialogProps {
     isOpen: boolean
     onClose: () => void
     onSuccess: () => void
   }
   
   export function PasswordDialog({ isOpen, onClose, onSuccess }: PasswordDialogProps) {
     const [password, setPassword] = useState('')
     const [error, setError] = useState('')
     
     const handleSubmit = async () => {
       const response = await fetch('/api/auth/special-backdoor', {
         method: 'POST',
         body: JSON.stringify({ password })
       })
       if (response.ok) {
         onSuccess()
       } else {
         setError('Incorrect password')
       }
     }
     
     return (
       <Dialog open={isOpen} onClose={onClose}>
         {/* Password input UI */}
       </Dialog>
     )
   }
   ```

---

### **PART 3: Frontend - Special Settings Dialog**

**Objective:** Create configuration dialog for managing Native Plugin visibility and menu location

**Steps:**

1. **Create SpecialSettingsDialog Component** (`web/src/app/components/SpecialSettingsDialog.tsx`)
   - Modal dialog that opens after successful password authentication
   - Two main sections:
     1. **Native Plugin Visibility**
        - Dynamically fetch all native plugins from API
        - Display as checkable list with plugin names
        - Toggle each plugin's visibility
     2. **Advanced Menu Location**
        - Radio buttons or dropdown:
          - "Show in Top Navigation"
          - "Show in Mobile Menu Only"
          - "Hide Completely"
   
   ```tsx
   interface SpecialSettingsDialogProps {
     isOpen: boolean
     onClose: () => void
     onSave: (settings: SpecialSettings) => void
   }
   
   interface SpecialSettings {
     enabled: boolean
     hiddenPlugins: string[] // URIs
     menuLocation: 'top-nav' | 'mobile-only' | 'hidden'
   }
   
   export function SpecialSettingsDialog({ isOpen, onClose, onSave }: SpecialSettingsDialogProps) {
     const [nativePlugins, setNativePlugins] = useState<Plugin[]>([])
     const [hiddenPlugins, setHiddenPlugins] = useState<Set<string>>(new Set())
     const [menuLocation, setMenuLocation] = useState<string>('top-nav')
     
     useEffect(() => {
       // Fetch native plugins dynamically
       fetchNativePlugins()
       // Load current settings
       loadCurrentSettings()
     }, [isOpen])
     
     const fetchNativePlugins = async () => {
       const response = await fetch('/api/plugins')
       const data = await response.json()
       const native = data.plugins.filter(p => p.uri.startsWith('map2://'))
       setNativePlugins(native)
     }
     
     const handleSave = () => {
       const settings = {
         enabled: true,
         hiddenPlugins: Array.from(hiddenPlugins),
         menuLocation
       }
       onSave(settings)
     }
     
     return (
       <Dialog open={isOpen} onClose={onClose}>
         <h2>Special Settings</h2>
         
         {/* Plugin Visibility Section */}
         <div>
           <h3>Native Plugin Visibility</h3>
           <div>
             {nativePlugins.map(plugin => (
               <label key={plugin.uri}>
                 <input
                   type="checkbox"
                   checked={!hiddenPlugins.has(plugin.uri)}
                   onChange={() => togglePluginVisibility(plugin.uri)}
                 />
                 {plugin.name}
               </label>
             ))}
           </div>
         </div>
         
         {/* Menu Location Section */}
         <div>
           <h3>Advanced Menu Location</h3>
           <select value={menuLocation} onChange={e => setMenuLocation(e.target.value)}>
             <option value="top-nav">Show in Top Navigation</option>
             <option value="mobile-only">Mobile Menu Only</option>
             <option value="hidden">Hide Completely</option>
           </select>
         </div>
         
         <button onClick={handleSave}>Save</button>
         <button onClick={onClose}>Cancel</button>
       </Dialog>
     )
   }
   ```

---

### **PART 4: Frontend - AboutPage Integration**
Create Special settings storage (database table or config)
   - Add password authentication endpoint
   - Add Special settings GET/POST endpoints
   - Ensure plugins API returns native plugins dynamically

2. **Phase 2:** Frontend - Dialog components
   - Create PasswordDialog component
   - Create SpecialSettingsDialog component
   - Test password flow and settings UI

3. **Phase 3:** Frontend - State management
   - Create `useSpecialSettings()` hook/context
   - Load settings from API on app startup
   - Persist settings to backend on save

4. **Phase 4:** Frontend - AboutPage integration
   - Replace Rate Limiting with Special checkbox
   - Wire checkbox to password dialog
   - Wire password success to settings dialog
   - Test password → settings → save flow

5. **Phase 5:** Frontend - Navigation & filtering
   - Move Advanced Menu to AppShell top nav
   - Make Advanced Menu conditional (only if Special enabled)
   - Respect menu location setting
   - ImplemeCreate/Modify

### Backend (New/Modified)
- **NEW:** `app/routes/auth.py` - Password authentication endpoint
- **NEW:** `app/routes/special_settings.py` - Special settings GET/POST endpoints
- **MODIFY:** `app/models.py` or `app/database.py` - Add SpecialSettings table/model
- **MODIFY:** `app/main.py` - Register new routes
- **MODIFY:** `app/services/cluster/raft_consensus.py` - Add Special settings replication logic
- **MODIFY:** `app/services/cluster/config_distributor.py` - Add Special settings distribution (optional, for persistence)

### Frontend (New Components)
- **NEW:** `web/src/app/components/PasswordDialog.tsx` - Password authentication UI
- **NEW:** `web/src/app/components/SpecialSettingsDialog.tsx` - Settings configuration UI
- **NEW:** `web/src/app/hooks/useSpecialSettings.tsx` - State management hook
- **NEW:** `web/src/app/context/SpecialSettingsContext.tsx` - Global settings context (optional)

### Frontend (Modified)
- **MODIFY:** `web/src/app/pages/AboutPage.tsx` - Replace Rate Limiting with Special checkbox
- **MODIFY:** `web/src/app/layout/AppShell.tsx` - Add conditional Advanced Menu dropdown
- **MODIFY:** `web/src/app/pages/GridFlowPage.tsx` - Add plugin filtering based on hidden list
- **MODIFY:** `web/src/map2/types.ts` - Add SpecialSettings interface
   
   const handlePasswordSuccess = () => {
     setShowPasswordDialog(false)
     setShowSpecialSettings(true)
   }
   
   const handleSettingsSave = async (settings: SpecialSettings) => {
     await saveSpecialSettings(settings)
     setSpecialEnabled(true)
     setShowSpecialSettings(false)
   }
   ```

2. **Remove Rate Limiting Checkbox**
   - Delete existing Rate Limiting code from Advanced Menu
   - Keep only Special checkbox (outside the menu, or in a dedicated section)

---

### **PART 5: Frontend - Navigation & Plugin Filtering**

**Objective:** Show/hide Advanced Menu based on Special state, and filter plugins

**Steps:**

#### 5A: Conditional Advanced Menu Rendering

**File:** `web/src/app/layout/AppShell.tsx`

1. **Add Special State Context**
   - Create context or hook: `useSpecialSettings()`
   - Provides: `{ enabled, hiddenPlugins, menuLocation }`
   - Load from API on app startup

2. **Conditionally Render Advanced Menu**
   - Only render Advanced Menu button if `specialEnabled === true`
   - Respect `menuLocation` setting:
     - `"top-nav"`: Show in top navigation bar
     - `"mobile-only"`: Show only in mobile hamburger menu
     - `"hidden"`: Don't show at all
   
   ```tsx
   const { specialEnabled, menuLocation } = useSpecialSettings()
   
   // In render:
   {specialEnabled && menuLocation === 'top-nav' && (
     <AdvancedMenuButton />
   )}
   ```

3. **Move Advanced Menu from About Page**
   - Extract menu items from AboutPage
   - Create reusable component or move to AppShell
   - Include DragonIcon in shared location

#### 5B: Plugin Filtering in GridFlowPage

**File:** `web/src/app/pages/GridFlowPage.tsx`

1. **Filter Native Plugins Based on Hidden List** (Lines 788-822)
   - Get `hiddenPlugins` from Special settings
   - Filter out hidden plugins from `nativeProcessors`
   
   ```tsx
   const { hiddenPlugins } = useSpecialSettings()
   
   const { nativeProcessors, lv2Plugins } = useMemo(() => {
     const native: Plugin[] = []
     const lv2: Plugin[] = []
     
     pluginsQuery.data?.plugins?.forEach(p => {
       if (p.uri.startsWith('map2://')) {
         // Skip if plugin is in hidden list
         if (hiddenPlugins.includes(p.uri)) {
           return
         }
         native.push(p)
       } else {
         lv2.push(p)
       }
     })
     return { nativeProcessors: native, lv2Plugins: lv2 }
   }, [pluginsQuery.data?.plugins, hiddenPlugins])
   ```

2. **Persistence**
   - Load settings from backend on app mount
   - Save to backend whenever settings change
   - Use localStorage as cache for faster initial render

---

## Implementation Order (Recommended)

1. **Phase 1:** Backend setup
   - Add `ip_concern` flag to plugin models and API
   - Add `special_mode` user setting

2. **Phase 2:** Frontend state management
   - Create `useSpecialSetting()` hook
   - Wire checkbox to state and API

3. **Phase 3:** Navigation restructuring
   - Move Advanced Menu to top nav in AppShell
   - Remove from About page
   - Test menu functionality

4. **Phase 4:** Plugin filtering
   - Implement filtering logic in GridFlowPage
   - Test hiding/showing of IP-concern plugins
   - Verify all UI updates correctly

5. **Testing & Refinement**
   - Test Special toggle on/off
   - Verify plugins appear/disappear correctly
   - Verify Advanced Menu accessible from top nav
   - Verify plugins always visible when accessing Advanced Menu from About page (if still accessible)

---

## Files to Modify
all native plugins hidden, Advanced Menu not visible)
2. **Password Security:** Password stored as environment variable or in backend config
3. **Persistence:** Save settings to database/backend (not just localStorage) for true persistence across boots
4. **Dynamic Plugin List:** Fetch native plugins from API each time - never hardcode the list
5. **Advanced Menu Visibility:** 
   - Only visible when Special is checked
   - Disappears completely when unchecked
   - Location controlled by menu location setting
6. **Mobile Experience:** Respect menu location setting for mobile (show in hamburger or hide)
7. **Settings Isolation:** Hidden plugins list only affects plugin chooser, not loaded chains
8. **UX Flow:** Click checkbox → Password dialog → Settings dialog → Save → Menu appears
### Frontend
- `web/src/app/pages/AboutPagon About page (replacing Rate Limiting)
✅ Clicking checkbox when unchecked triggers password dialog
✅ Correct password opens Special Settings dialog
✅ Settings dialog shows dynamically fetched list of all native plugins
✅ Can toggle visibility of individual plugins
✅ Can select Advanced Menu location (top nav, mobile only, hidden)
✅ Save button persists settings to backend
✅ Advanced Menu icon appears in top nav ONLY when Special is checked
✅ Advanced Menu disappears when Special is unchecked
✅ Hidden plugins do not appear in Grid plugin chooser
✅ Settings persist across browser reloads and system reboots
✅ Menu location  (REVISED)

### Flow Diagram
```
1. User on About Page
   ↓
2. Clicks Special checkbox [☐] → [☑]
   ↓
3. Password Dialog appears
   ┌─────────────────────────┐
   │  Enter Password         │
   │  [password input]       │
   │  [Cancel] [Submit]      │
   └─────────────────────────┘
   ↓ (if correct password)
4. Special Settings Dialog appears
   ┌─────────────────────────────────────┐
   │  Special Settings                   │
   │                                     │
   │  Native Plugin Visibility:          │
   │  ☑ EQ                               │
   │  ☑ Dynamics                         │
   │  ☐ Eventide H9000     (HIDDEN)     │
   │  ☐ Peavey 5150        (HIDDEN)     │
   │  ☑ Tweed Bassman                    │
   │  ☑ PassionFX ...                    │
   │                                     │
   │  Advanced Menu Location:            │
   │  ● Show in Top Navigation           │
   │  ○ Mobile Menu Only                 │
   │  ○ Hide Completely                  │
   │                                     │
   │  [Cancel] [Save]                    │
   └─────────────────────────────────────┘
   ↓
5. Save clicked → Settings saved to backend
   ↓
6. Advanced Menu appears in top nav (if location = "top-nav")
```

### Top Nav (When Special UNCHECKED)
```
┌─────────────────────────────────────────────────────────────────┐
│ [Guide] [Grid]          Active Page Title              [About] [≡] │
└─────────────────────────────────────────────────────────────────┘
                                           ^ No Advanced Menu visible
```

### Top Nav (When Special CHECKED)
```
┌─────────────────────────────────────────────────────────────────┐
│ [Guide] [Grid]          Active Page Title       [🐉 Advanced] [About] [≡] │
└─────────────────────────────────────────────────────────────────┘
                                           ^ Advanced Menu NOW visible
```

### Grid Page Plugin Chooser
```
Core Integrated          <- Only shows VISIBLE native plugins
├─ EQ                    (based on settings)
├─ Dynamics
├─ Tweed Bassman
├─ PassionFX ...
(Eventide, Peavey hidden because unchecked in settings)

LV2 Plugin Library       <- LV2 plugins unaffected
│ ... rest of about page ...
└──Additional Notes

### Password Implementation
- Default password: `"backdoor"` (configurable)
- Store in environment variable: `SPECIAL_MODE_PASSWORD`
- Hashed on backend for security
- Failed attempts logged (optional rate limiting)

### Settings Storage Schema
```python
class SpecialSettings(BaseModel):
    enabled: bool = False
    hidden_plugins: List[str] = []  # Plugin URIs
    menu_location: str = "top-nav"  # "top-nav" | "mobile-only" | "hidden"
    last_updated: datetime = None  # For conflict resolution
    updated_by_node: str = None  # Node ID that made the change
    version: int = 1  # Incremented on each update
```

### Cluster Replication Flow
```
User on Node A                Leader (Raft)              Follower Nodes
     │                              │                          │
     ├─ Click Special checkbox      │                          │
     ├─ Enter password              │                          │
     ├─ Change settings             │                          │
     ├─ Save                        │                          │
     │                              │                          │
     └─► POST /api/settings/special │                          │
            │                       │                          │
            └──────────────────────►│                          │
                                    │ Create LogEntry          │
                                    │ (update_special_settings)│
                                    │                          │
                                    ├─────────────────────────►│
                                    │   AppendEntries RPC      │
                                    │                          │
                                    │◄─────────────────────────┤
                                    │   Success (majority)     │
                                    │                          │
                                    ├─ Commit log entry        │
                                    ├─ Apply to local DB       │
                                    │                          │
                                    ├─────────────────────────►│
                                    │   Commit notification    │
                                    │                          ├─ Apply to local DB
                                    │                          │
            ┌──────────────────────◄┤                          │
            │   Success response    │                          │
     ┌─────◄┘                       │                          │
     │                              │                          │
     └─ Settings replicated!        │                          │
        All nodes synchronized      │                          │
```

### Native Plugin Identification
- All plugins with `uri.startsWith('map2://')` are considered native
- Examples:
  - `map2://eq`
  - `map2://dynamics`
  - `map2://eventide_h9000`
  - `map2://peavey_5150`
  - `map2://tweedbassman`
  - `map2://passionfx_*`
  - Any other JUCE-based processors

### Frontend Types
```typescript
interface SpecialSettings {
  enabled: boolean
  hiddenPlugins: string[]  // Plugin URIs
  menuLocation: 'top-nav' | 'mobile-only' | 'hidden'
}

interface SpecialSettingsContextValue {
  settings: SpecialSettings
  isLoading: boolean
  updateSettings: (settings: Partial<SpecialSettings>) => Promise<void>
  reload: () => Promise<void>
}
```
├─ ...

LV2 Plugin Library       <- LV2 plugins (excluding IP-concern)
├─ Category
│  ├─ Plugin
│  └─ Plugin
└─ Category

(Peavey, Eventide, TweedBassman, PassionFX hidden)


Grid Page Plugin Chooser (when Special checked):
Core Integrated          <- All native plugins including IP-concern
├─ EQ
├─ Dynamics
├─ Eventide H9000       <- NOW VISIBLE
├─ Peavey 5150          <- NOW VISIBLE
├─ ...

LV2 Plugin Library       <- All LV2 plugins including IP-concern
├─ Category
│  ├─ Plugin
│  └─ Plugin
└─ Category
```

---

## Questions for Clarification

1. Should IP plugins also be hidden from other pages (LV2 Plugins page, etc.)?
2. Should Special setting apply everywhere or just Grid page plugin chooser?
3. Should Advanced Menu always show all plugins, or respect the Special setting?
4. Should Rate Limiting stay in Advanced Menu or move elsewhere?
5. Any other IP-concern plugins besides Eventide, Peavey, TweedBassman, PassionFX?
