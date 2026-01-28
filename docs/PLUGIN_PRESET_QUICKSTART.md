# Plugin Preset System - Quick Start Guide

## 🎯 5-Minute Overview

### What It Does
Save your favorite plugin parameter settings and reuse them instantly. Never lose a great reverb or delay configuration again!

### Key Benefits
- ⭐ **Save Favorites** - Mark presets you love
- 🏷️ **Organize** - Use categories and tags
- ⚡ **Quick Load** - One-click parameter application
- 📊 **Track Usage** - See your most-used presets
- 🔧 **Set Defaults** - Auto-apply to new plugins

---

## 👤 User Guide

### Saving a Preset

1. **Open Plugin Browser** (main UI)
   ```
   Click on any plugin's "Presets" button
   ```

2. **Configure Plugin Parameters**
   ```
   Adjust knobs, sliders, dropdowns to your liking
   ```

3. **Click "Save Preset" Button**
   ```
   Top-right of preset manager panel
   ```

4. **Fill in Details** (in dialog)
   ```
   Name:         "Warm Hall Reverb" (required)
   Description:  "Great for vocals" (optional)
   Category:     "Reverbs" (optional)
   Tags:         "ambient, lush, classic" (optional)
   Default:      ☑ Set as default for this plugin (optional)
   ```

5. **Click "Save"**
   ```
   Preset saved! ✅
   ```

### Loading a Preset

1. **Open Plugin Browser**
   ```
   Click plugin's "Presets" button
   ```

2. **Browse Preset List**
   ```
   Search by name
   Filter by tabs: All / Favorites / Defaults
   ```

3. **Click Any Preset**
   ```
   Parameters instantly apply ⚡
   Usage counter increments 📈
   ```

### Managing Presets

1. **Open Plugin Browser → "Presets"**

2. **Right-Click (or ⋮) on Preset**
   ```
   Options appear
   ```

3. **Choose Action**
   ```
   ❤ Add to Favorites    - Quick access in Favorites tab
   ⭐ Set as Default      - Auto-load for new plugins
   🗑️ Delete              - Remove permanently
   ```

---

## 🔌 Developer Guide

### Backend Integration

#### Create Preset (API)
```bash
curl -X POST http://localhost:8080/api/plugin-presets/ \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Preset",
    "plugin_uri": "http://...",
    "plugin_name": "Plugin Name",
    "parameters": {"param1": 0.5, "param2": 1.0},
    "is_favorite": true
  }'
```

#### List Presets (API)
```bash
# All presets
curl http://localhost:8080/api/plugin-presets/

# Favorites only
curl http://localhost:8080/api/plugin-presets/?favorites_only=true

# Search
curl http://localhost:8080/api/plugin-presets/?search=reverb

# By plugin
curl http://localhost:8080/api/plugin-presets/plugin/http%3A%2F%2F...
```

#### Lifecycle Events (Backend)
```python
from app.services.plugin_preset_lifecycle import get_preset_lifecycle

lifecycle = get_preset_lifecycle()

# Register listener
async def my_listener(data):
    print(f"Preset event: {data}")

lifecycle.register_listener("preset_created", my_listener)

# Get stats
stats = await lifecycle.get_usage_stats()
print(f"Total presets: {stats['total_presets']}")
```

### Frontend Integration

#### Save Preset (React)
```typescript
import { pluginPresetsApi } from '../api';

await pluginPresetsApi.create({
  name: "My Preset",
  plugin_uri: "http://...",
  plugin_name: "Plugin Name",
  parameters: { param1: 0.5 },
  is_favorite: true
});
```

#### Load Preset (React)
```typescript
await pluginPresetsApi.load(presetId);
```

#### Get Plugins with Presets (React)
```typescript
const { plugins } = await pluginPresetsApi.getPluginsWithFavorites();
// Use to show favorite indicator on plugins
```

#### Use Component (React)
```typescript
import PluginPresetManager from './components/PluginPresetManager';

<PluginPresetManager
  pluginUri="http://..."
  pluginName="Reverb"
  currentParameters={{ time: 0.5 }}
  onLoadPreset={(preset) => console.log("Loaded:", preset)}
/>
```

---

## 📚 File Locations

### Frontend
```
/web/src/map2/components/PluginPresetManager.tsx    (UI Component)
/web/src/map2/components/PluginBrowser.tsx           (Integration)
/web/src/map2/api.ts                                 (API Client)
```

### Backend
```
/app/routes/plugin_presets.py                        (API Endpoints)
/app/services/plugin_preset_lifecycle.py             (Lifecycle Manager)
/app/database.py                                      (PluginPreset Model)
/app/main.py                                         (App Integration)
```

### Documentation
```
/docs/PLUGIN_PRESET_SYSTEM.md                        (Full Documentation)
/docs/PLUGIN_PRESET_IMPLEMENTATION.md                (Implementation Details)
/docs/PLUGIN_PRESET_QUICKSTART.md                    (This file)
```

---

## 🔧 API Reference (Essential Endpoints)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/plugin-presets/` | Create preset |
| GET | `/api/plugin-presets/` | List presets |
| GET | `/api/plugin-presets/{id}` | Get specific preset |
| PATCH | `/api/plugin-presets/{id}` | Update preset |
| DELETE | `/api/plugin-presets/{id}` | Delete preset |
| POST | `/api/plugin-presets/{id}/load` | Load preset |
| POST | `/api/plugin-presets/{id}/favorite` | Toggle favorite |
| GET | `/api/plugin-presets/plugin/{uri}` | Presets for plugin |
| GET | `/api/plugin-presets/favorites/plugins` | Plugins with favorites |
| GET | `/api/plugin-presets/lifecycle/stats` | Usage statistics |
| POST | `/api/plugin-presets/lifecycle/cleanup` | Clean unused presets |

---

## 🚀 Common Workflows

### Workflow 1: Save Your Favorite Reverb
```
1. Open Plugin Browser
2. Select Reverb plugin → "Presets"
3. Tweak knobs until you like it
4. "Save Preset"
5. Name: "Church Hall"
6. Category: "Reverbs"
7. ☑ Set as Default
8. Save
✓ Now auto-loads this reverb!
```

### Workflow 2: Switch Between Presets
```
1. Plugin Browser → "Presets"
2. Scroll through preset list
3. Click to load each one
4. Compare by listening
5. Keep best one loaded
✓ Quick A/B testing!
```

### Workflow 3: Build a Collection
```
1. Find great presets by tweaking
2. Save each with descriptive name
3. Tag with style (ambient, aggressive, etc)
4. Add descriptions
5. Mark best ones as Favorite
✓ Personal preset library!
```

---

## ⚙️ Configuration

### Default Cleanup Threshold
```python
# In api call:
POST /api/plugin-presets/lifecycle/cleanup?days_threshold=30
# Deletes unused presets older than 30 days
```

### Event Listeners
```python
lifecycle.register_listener("preset_created", my_callback)
lifecycle.register_listener("preset_loaded", my_callback)
lifecycle.register_listener("preset_deleted", my_callback)
```

---

## 🐛 Troubleshooting

### Presets Not Saving?
- ✓ Check network connection
- ✓ Verify preset name entered
- ✓ Check browser console for errors
- ✓ Restart app and try again

### Presets Not Loading?
- ✓ Make sure plugin is loaded in chain
- ✓ Check database for preset records
- ✓ Try refreshing plugin list
- ✓ Check server logs

### Can't See Favorite Indicator?
- ✓ Clear browser cache
- ✓ Refresh page
- ✓ Check if presets exist for plugin
- ✓ Verify `is_favorite` set to true

---

## 📊 Monitoring

### Check Usage Statistics
```bash
curl http://localhost:8080/api/plugin-presets/lifecycle/stats
```

Response shows:
- Total presets saved
- Favorite presets count
- Default presets count
- Total usage across all presets
- Average usage per preset
- Cache size

### Monitor Event Logs
```
# Check app logs for:
"Created plugin preset: My Preset"
"Loaded plugin preset: 42 (usage: 5)"
"Preset 42 favorite toggled: True"
"Deleted plugin preset: 42"
```

---

## 💡 Tips & Tricks

### Organize Your Presets
- Use consistent category names
- Tag presets with mood/style
- Write helpful descriptions
- Mark your top 3-5 as Favorites

### Performance
- Presets are cached for speed
- Usage count auto-increments
- Cleanup runs automatically
- No manual maintenance needed

### Integration
- Plugin favorite indicator shows saved presets
- Default presets auto-load on plugin creation
- Events can trigger UI updates
- Lifecycle management is automatic

---

## 📞 Getting Help

### Documentation
- Full guide: `/docs/PLUGIN_PRESET_SYSTEM.md`
- Implementation: `/docs/PLUGIN_PRESET_IMPLEMENTATION.md`
- API Reference: See endpoint table above

### Code Examples
- React Component: `/web/src/map2/components/PluginPresetManager.tsx`
- API Client: `/web/src/map2/api.ts`
- Backend Routes: `/app/routes/plugin_presets.py`

### Logs
- Check application logs for errors
- Browser console for frontend issues
- Server logs for backend issues

---

## ✅ Checklist: Getting Started

- [ ] Read this Quick Start guide
- [ ] Open Plugin Browser in UI
- [ ] Find a plugin with parameters
- [ ] Click "Presets" button
- [ ] Save a test preset
- [ ] Load it back
- [ ] Mark as favorite
- [ ] Check favorite indicator appears
- [ ] Delete test preset
- [ ] Read full documentation if needed

**Status**: ✨ Ready to use!

---

**Version**: 1.0.0  
**Last Updated**: January 22, 2026  
**Status**: Production Ready 🚀
