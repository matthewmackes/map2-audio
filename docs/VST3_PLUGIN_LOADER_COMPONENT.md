# VST3 Plugin Loader Component

## Overview

The VST3PluginLoader component provides a complete UI for loading VST3 plugins into the effects chain and displaying their parameters once loaded.

## Features

✅ **Plugin Browser** - Lists all available VST3 plugins  
✅ **One-Click Loading** - Add plugin to effects chain with a single button  
✅ **Parameter Display** - Shows parameters after plugin instantiation  
✅ **Parameter Controls** - Sliders, toggles, and numeric inputs  
✅ **Error Handling** - Clear messages for all error states  
✅ **Loading States** - Progress indicators during operations

## Usage

### Basic Implementation

```tsx
import { VST3PluginLoader } from '@/map2';

function MyApp() {
  const handlePluginAdded = (instanceId: string) => {
    console.log('Plugin loaded:', instanceId);
    // Update your effects chain state here
  };

  return (
    <VST3PluginLoader onPluginAdded={handlePluginAdded} />
  );
}
```

### With Demo Page

```tsx
import { VST3Demo } from '@/map2';

function App() {
  return <VST3Demo />;
}
```

## Component Flow

1. **Click "Add VST3 Plugin" button**
   - Opens dialog with plugin list
   - Shows all discovered VST3 plugins

2. **Select a plugin**
   - Click on plugin from list
   - View plugin details (author, category, description)

3. **Click "Add to Effects Chain"**
   - Plugin is loaded into the audio engine
   - Instance ID is returned
   - Dialog updates to show "Plugin Loaded"

4. **View Parameters**
   - If available: Parameters display with controls
   - If not: Info message explaining instantiation requirement
   - Parameters can be adjusted via sliders/toggles

5. **Close Dialog**
   - Plugin remains in effects chain
   - Parameters are saved

## API Integration

The component uses the following API endpoints:

```typescript
// List available VST3 plugins
GET /api/vst3/plugins

// Load plugin into effects chain
POST /api/vst3/load?uri={plugin_uri}

// Get plugin parameters
GET /api/vst3/parameters?uri={plugin_uri}
```

## Parameter Types

### Slider Control
For continuous parameters (most common):
- Visual slider with numeric input
- Automatic range scaling (min to max)
- Live value display

### Toggle Control
For boolean parameters:
- Material-UI Switch component
- On/Off states

### Future: Dropdown Control
For enumerated parameters (planned):
- Selection list for discrete values

## Props

### VST3PluginLoader

```typescript
interface VST3LoaderProps {
  onPluginAdded?: (instanceId: string) => void;
}
```

- `onPluginAdded`: Callback fired when plugin is successfully loaded
  - Receives the instance ID of the loaded plugin
  - Use this to update your effects chain state

## Styling

The component uses Material-UI (MUI) v5 components and follows the system theme:

- Dialog for modal interaction
- List for plugin selection
- Paper for parameter container
- Chips for status badges
- Alert for info/error messages

## Error Handling

The component handles several error scenarios:

1. **No plugins found**
   - Shows helpful message about where to install plugins

2. **Plugin load failure**
   - Displays error alert with details
   - Plugin list remains available

3. **Parameter load failure**
   - Non-fatal - plugin is still loaded
   - Shows info message about instantiation

4. **Network errors**
   - Caught and displayed to user
   - Retry by reopening dialog

## VST3 Parameter Loading Behavior

### Important: VST3 Instantiation Requirement

VST3 plugins **cannot** expose their parameters without being instantiated in the audio engine. This is a VST3 architecture limitation.

**Workflow:**

1. Select plugin → "Add to Effects Chain"
2. Plugin loads into audio engine
3. Parameters become available (if supported)
4. If no parameters shown: They're available in the running chain

**Why empty parameters?**

Unlike LV2 plugins (which have `.ttl` metadata files), VST3 plugins require:
- Loading the binary
- Instantiating with audio settings
- Querying the running instance

This is handled automatically when you add the plugin to the chain.

## Development Notes

### Backend Requirements

Ensure the backend is running with VST3 support:

```bash
# Backend should be running on port 8000
curl http://localhost:8000/api/vst3/plugins
```

### VST3 Plugin Installation

Place VST3 plugins in standard locations:
- Linux: `~/.vst3` or `/usr/lib/vst3`
- macOS: `~/Library/Audio/Plug-Ins/VST3`
- Windows: `C:\Program Files\Common Files\VST3`

### Testing

Test with LSP Plugins (Linux):
```bash
# Install LSP Linux native VST3
# Check: ~/.vst3/lsp-plugins.vst3
```

## Example Integrations

### In Effects Chain Manager

```tsx
import { VST3PluginLoader } from '@/map2';

function EffectsChain() {
  const [plugins, setPlugins] = useState([]);

  const handlePluginAdded = (instanceId: string) => {
    // Add to chain state
    setPlugins(prev => [...prev, { id: instanceId, type: 'vst3' }]);
  };

  return (
    <div>
      <h2>Effects Chain</h2>
      {plugins.map(p => (
        <div key={p.id}>Plugin: {p.id}</div>
      ))}
      <VST3PluginLoader onPluginAdded={handlePluginAdded} />
    </div>
  );
}
```

### In Plugin Browser Tab

```tsx
import { VST3PluginLoader } from '@/map2';
import { Tabs, Tab } from '@mui/material';

function PluginBrowser() {
  const [tab, setTab] = useState(0);

  return (
    <>
      <Tabs value={tab} onChange={(e, v) => setTab(v)}>
        <Tab label="LV2" />
        <Tab label="VST3" />
      </Tabs>
      
      {tab === 1 && <VST3PluginLoader />}
    </>
  );
}
```

## Future Enhancements

- [ ] Real-time parameter updates via WebSocket
- [ ] Parameter automation recording
- [ ] Preset save/load for plugin states
- [ ] MIDI CC mapping to parameters
- [ ] Parameter grouping/categorization
- [ ] A/B parameter comparison
- [ ] Undo/redo parameter changes
- [ ] Keyboard shortcuts for parameter adjustment

## Related Documentation

- [VST3_IMPLEMENTATION_COMPLETE.md](../VST3_IMPLEMENTATION_COMPLETE.md) - Backend implementation details
- [VST3_PARAMETER_LOADING_PLAN.md](../docs/VST3_PARAMETER_LOADING_PLAN.md) - JUCE integration roadmap
- [api.ts](./api.ts) - API client implementation

---

**Status:** ✅ Fully Implemented and Ready to Use  
**Date:** January 30, 2026
