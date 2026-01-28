# Plugin Preset System - Complete Implementation Guide

## Overview

The Plugin Preset System is a comprehensive feature for MAP2 Audio Platform that enables users to save, organize, and reuse individual plugin parameter configurations. Unlike chain presets which save entire signal chains, plugin presets focus on individual plugins, allowing quick recall of your favorite parameter settings.

## Features

### 1. Save Plugin Presets
- **Save Button**: "Save Preset" button in the plugin parameter panel
- **Parameter Capture**: Automatically captures all current plugin parameters
- **Metadata**: Add name, description, category, and tags
- **Default Marking**: Set a preset as the default for a plugin
- **Favorites**: Mark presets as favorites for quick access

### 2. Organize Presets
- **Categories**: Organize presets by category (e.g., "Reverbs", "Delays", "Ambience")
- **Tags**: Add multiple tags for flexible filtering
- **Descriptions**: Include descriptions for documentation
- **Search**: Full-text search by name, description, or plugin name

### 3. Load Presets
- **Quick Load**: Click any preset to load its parameters instantly
- **Usage Tracking**: Track how many times each preset has been loaded
- **Default Auto-Load**: Automatically apply default presets to plugins
- **Default Highlighting**: Star icon shows the default preset

### 4. Manage Presets
- **Edit**: Modify preset metadata (name, description, category)
- **Delete**: Remove presets with confirmation
- **Favorite Toggle**: Mark/unmark presets as favorites
- **Set Default**: Set one preset as default per plugin
- **Lifecycle Controls**: Automatic cleanup of unused presets

### 5. Plugin Browser Integration
- **Favorite Indicator**: Heart icon shows plugins with saved presets
- **Preset Manager Modal**: Dedicated dialog for preset management
- **Quick Access**: "Presets" button on each plugin card
- **Shortcut Highlighting**: Plugins with favorites have highlighted Presets button

## Architecture

### Database Schema

#### PluginPreset Table
```python
class PluginPreset(Base):
    id: Integer (Primary Key)
    name: String (Unique per plugin)
    plugin_uri: String (Plugin LV2 URI)
    plugin_name: String (Display name)
    parameters: JSON (Parameter values)
    tags: JSON Array (Search/filter tags)
    category: String (Organization category)
    description: Text (Optional documentation)
    is_favorite: Boolean (Favorite marker)
    is_default: Boolean (Default for this plugin)
    usage_count: Integer (Usage tracking)
    created_at: DateTime
    updated_at: DateTime
```

### API Endpoints

#### CRUD Operations
- `POST /api/plugin-presets/` - Create new preset
- `GET /api/plugin-presets/` - List presets with filtering
- `GET /api/plugin-presets/{preset_id}` - Get specific preset
- `PATCH /api/plugin-presets/{preset_id}` - Update preset metadata
- `DELETE /api/plugin-presets/{preset_id}` - Delete preset

#### Query & Filter
- `GET /api/plugin-presets/plugin/{plugin_uri}` - Get presets for specific plugin
- `GET /api/plugin-presets/categories/all` - List all categories
- `GET /api/plugin-presets/tags/all` - List all tags
- `GET /api/plugin-presets/favorites/plugins` - Get plugins with favorite presets

#### Preset Management
- `POST /api/plugin-presets/{preset_id}/load` - Load preset (increments usage)
- `POST /api/plugin-presets/{preset_id}/favorite` - Toggle favorite status
- `PATCH /api/plugin-presets/{preset_id}` with `is_default` - Set as default

#### Lifecycle Management
- `POST /api/plugin-presets/lifecycle/startup` - Initialize lifecycle manager
- `POST /api/plugin-presets/lifecycle/shutdown` - Shutdown lifecycle manager
- `POST /api/plugin-presets/lifecycle/cleanup` - Clean unused presets
- `GET /api/plugin-presets/lifecycle/stats` - Get usage statistics

### Frontend Components

#### PluginPresetManager.tsx
Standalone React component for managing presets:
- List view with search and filtering
- Save dialog with metadata fields
- Context menu for actions (favorite, default, delete)
- Tab filtering (all, favorites, defaults)

#### PluginBrowser.tsx Integration
- Import pluginPresetsApi for preset operations
- Display favorite indicator on plugin cards
- "Presets" button opens preset manager modal
- Load plugins with favorite presets on startup

### Lifecycle Management (plugin_preset_lifecycle.py)

#### Features
- **Event System**: Emit events on preset creation, load, delete, etc.
- **Listener Registration**: Register callbacks for lifecycle events
- **Default Tracking**: Cache default presets per plugin
- **Usage Analytics**: Track preset usage statistics
- **Cleanup**: Automatically clean unused presets
- **Cache Management**: LRU-style preset caching

#### Lifecycle Events
- `preset_created`: Emitted when new preset is created
- `preset_loaded`: Emitted when preset is loaded
- `preset_updated`: Emitted when preset metadata changes
- `preset_deleted`: Emitted when preset is deleted
- `preset_favorite_toggled`: Emitted when favorite status changes
- `preset_set_default`: Emitted when set as default

#### Usage Statistics
```python
stats = await lifecycle.get_usage_stats()
# Returns:
{
    "total_presets": 42,
    "favorite_presets": 15,
    "default_presets": 12,
    "total_usage": 1337,
    "avg_usage_per_preset": 31.8,
    "cache_size": 20
}
```

## User Workflow

### Saving a Preset

1. Open Plugin Browser
2. Click "Presets" button on desired plugin card
3. Adjust plugin parameters to your liking
4. Click "Save Preset" button in plugin preset manager
5. Fill in details:
   - **Name**: Required (e.g., "Warm Reverb")
   - **Description**: Optional
   - **Category**: Optional (e.g., "Reverbs")
   - **Tags**: Optional (e.g., "ambient, lush, clean")
   - **Set as Default**: Optional checkbox
6. Click "Save"
7. Preset now appears in the preset list

### Loading a Preset

1. Open Plugin Browser
2. Click "Presets" button on desired plugin
3. Browse the preset list
   - Use search to find by name/description
   - Click tabs to filter (All, Favorites, Defaults)
4. Click any preset to load it
5. Parameters instantly apply to the plugin
6. Usage counter increments

### Managing Presets

1. Open Plugin Browser → "Presets" button
2. Right-click (or click ⋮) on any preset
3. Available actions:
   - **Add to Favorites**: Star icon highlights the preset
   - **Set as Default**: Auto-load this preset for the plugin
   - **Delete**: Permanently remove the preset
4. Changes apply immediately

## Advanced Features

### Default Presets
Each plugin can have one default preset. When set:
- **Auto-Apply**: Default loads when plugin is instantiated
- **Indicator**: Star icon in preset manager shows default
- **Lifecycle Event**: `preset_set_default` emitted on change
- **Storage**: Cached in lifecycle manager for quick access

### Favorite Plugins Indicator
Plugins with saved favorite presets display:
- Heart icon (❤) in plugin browser
- Colored "Presets" button (red when has favorites)
- Shows how many favorite presets exist

### Usage Tracking
Each preset tracks:
- **Load Count**: Number of times preset has been loaded
- **First Created**: Creation timestamp
- **Last Updated**: Last modification time
- **Chip Display**: Usage count shown in preset manager

### Lifecycle Cleanup
Automatic maintenance runs on app startup/shutdown:
- **Target**: Presets not marked as favorite or default
- **Threshold**: Unused for 30+ days (configurable)
- **Action**: Auto-deleted during cleanup phase
- **Goal**: Prevent database bloat from experimental presets

### Event System
Register custom listeners for preset events:

```typescript
// Frontend
const handlePresetCreated = async (data) => {
  console.log(`Preset created: ${data.name}`);
  // Refresh UI, update analytics, etc.
};

// Subscribe to events
presetsApi.on('created', handlePresetCreated);
```

```python
# Backend
from app.services.plugin_preset_lifecycle import get_preset_lifecycle

lifecycle = get_preset_lifecycle()

async def on_preset_created(data):
    print(f"New preset: {data['name']}")
    # Update UI, emit WebSocket event, etc.

lifecycle.register_listener("preset_created", on_preset_created)
```

## Integration Points

### API Client (`web/src/map2/api.ts`)
```typescript
// List presets for a plugin
const presets = await pluginPresetsApi.getByPluginUri(pluginUri);

// Create preset
await pluginPresetsApi.create({
  name: "My Preset",
  plugin_uri: pluginUri,
  plugin_name: "Plugin Name",
  parameters: { param1: 0.5, param2: 1.0 },
  is_favorite: true
});

// Load preset (increments usage)
await pluginPresetsApi.load(presetId);

// Toggle favorite
await pluginPresetsApi.toggleFavorite(presetId);

// Lifecycle operations
await pluginPresetsApi.cleanup(30);
const stats = await pluginPresetsApi.getStats();
```

### Routes Integration
Plugin preset routes are automatically registered in `app/main.py`:
```python
route_modules = [
    # ... other routes ...
    'plugin_presets',  # Registered here
    # ... other routes ...
]
```

### Lifecycle Integration
Lifecycle manager is initialized on app startup:
```python
# In app/main.py lifespan()
preset_lifecycle = get_preset_lifecycle()
await preset_lifecycle.startup()  # Load defaults, initialize cache
# ... app runs ...
await preset_lifecycle.shutdown()  # Cleanup, flush cache
```

## Best Practices

### For Users
1. **Use Descriptive Names**: "Warm Hall Reverb" vs "Reverb"
2. **Add Descriptions**: Document your preset choices
3. **Organize with Tags**: Use consistent tag naming
4. **Set Defaults**: Configure defaults for frequently-used plugins
5. **Regular Cleanup**: Delete unused experimental presets

### For Developers
1. **Emit Events**: Always call lifecycle methods on preset changes
2. **Cache Results**: Use preset caching for performance
3. **Error Handling**: Wrap lifecycle calls in try/catch
4. **Logging**: Log important preset operations
5. **Validation**: Validate parameters before saving

## Troubleshooting

### Presets Not Appearing
1. Verify plugin URI is correct
2. Check database for preset records
3. Clear browser cache if frontend issue
4. Restart application to reload defaults

### Lifecycle Events Not Firing
1. Verify listener is registered before event
2. Check async/await handling
3. Check server logs for errors
4. Verify plugin_preset_lifecycle.py is imported

### Performance Issues
1. Run `POST /api/plugin-presets/lifecycle/cleanup` to remove old presets
2. Check `GET /api/plugin-presets/lifecycle/stats` for usage patterns
3. Consider archiving old presets vs deleting
4. Monitor database size

## Future Enhancements

### Planned Features
- [ ] Preset import/export (JSON format)
- [ ] Preset sharing between users
- [ ] Preset versioning system
- [ ] A/B comparison of presets
- [ ] Preset randomization/morphing
- [ ] Plugin preset banks
- [ ] Automatic preset suggestions
- [ ] Machine learning-based preset discovery

### API Additions
- [ ] Batch operations (import multiple presets)
- [ ] Preset comparison endpoint
- [ ] Smart recommendation engine
- [ ] Analytics dashboard

## Support & Resources

### Endpoints Reference
See [API Endpoints](#api-endpoints) section above

### Database Schema
See [Database Schema](#database-schema) section above

### Component Documentation
- **PluginPresetManager.tsx**: `/web/src/map2/components/PluginPresetManager.tsx`
- **PluginBrowser.tsx**: `/web/src/map2/components/PluginBrowser.tsx`
- **api.ts**: `/web/src/map2/api.ts`

### Backend Services
- **Routes**: `/app/routes/plugin_presets.py`
- **Lifecycle**: `/app/services/plugin_preset_lifecycle.py`
- **Models**: `/app/database.py` (PluginPreset class)

---

**Version**: 1.0.0  
**Last Updated**: January 22, 2026  
**Status**: Production Ready ✅
