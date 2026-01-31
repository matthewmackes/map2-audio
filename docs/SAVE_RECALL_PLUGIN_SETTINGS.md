# Design Document: Save and Recall Plugin Parameter Settings

## Overview
This document outlines the design for a new feature that allows saving and recalling all parameter settings for plugins (VST, LV2, Native). The feature will leverage the existing `PresetManager` class to ensure seamless integration with the current preset management system.

## Goals
1. Enable users to save all parameter settings for a plugin.
2. Allow users to recall saved settings on demand.
3. Ensure compatibility with VST, LV2, and Native plugins.
4. Integrate with the existing `PresetManager` class.

## Design Details

### Data Model
The `Preset` interface already supports the following fields:
- `id`: Unique identifier for the preset.
- `name`: Name of the preset.
- `pluginUri`: URI of the plugin.
- `parameters`: Key-value pairs representing parameter settings.
- `createdAt`: Timestamp of creation.
- `updatedAt`: Timestamp of last update.
- `tags`: Optional tags for categorization.

No changes are required to the data model.

### API Changes

#### New Methods in `PresetManager`
1. **`savePluginState(pluginUri: string, parameters: Record<string, number>, presetName: string, tags?: string[]): Preset`**
   - Saves the current state of a plugin as a preset.
   - Returns the saved `Preset` object.

2. **`recallPluginState(pluginUri: string, presetId: string): Record<string, number> | undefined`**
   - Retrieves the parameter settings for a given preset ID.
   - Returns the parameters as a key-value object.

### Workflow

#### Saving Plugin State
1. User selects a plugin and adjusts its parameters.
2. User invokes the "Save State" action.
3. The application collects the current parameter settings and calls `savePluginState`.
4. The `PresetManager` saves the state and persists it to localStorage.

#### Recalling Plugin State
1. User selects a plugin and a saved preset.
2. User invokes the "Recall State" action.
3. The application calls `recallPluginState` to retrieve the saved parameters.
4. The application applies the parameters to the plugin.

### Integration with Existing Code
- The `PresetManager` class will be extended to include the new methods.
- The UI will be updated to provide options for saving and recalling plugin states.
- Existing methods like `getPresetsForPlugin` and `getPresetById` will be reused.

### Error Handling
- If a preset ID does not exist, `recallPluginState` will return `undefined`.
- If saving to localStorage fails, an error message will be logged.

### Testing
- Unit tests will be added for the new methods.
- Integration tests will verify end-to-end functionality.

## Timeline
1. Design: 1 day
2. Implementation: 2 days
3. Testing: 1 day
4. Refactoring: 1 day

## Conclusion
This design leverages the existing `PresetManager` class to implement a feature for saving and recalling plugin parameter settings. The approach ensures minimal changes to the codebase while providing a robust solution.