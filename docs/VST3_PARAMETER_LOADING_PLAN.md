"""
VST3 Parameter Loading Implementation Plan

ISSUE: VST3 plugins discovered by the system show empty parameters arrays because
the discovery service only scans plugin metadata, not instantiate them.

ROOT CAUSE:
- VST3PluginDiscovery._parse_vst3_bundle() returns empty parameters: []
- VST3PluginDiscovery._parse_vst3_flat() returns empty parameters: []
- Parameters can only be read by instantiating the plugin through JUCE

SOLUTION APPROACH:
1. Keep lightweight discovery as-is for fast plugin listing
2. Add separate parameter loading endpoint that uses JUCE engine
3. Load parameters on-demand when user opens plugin editor

IMPLEMENTATION STEPS:

1. Add endpoint: GET /api/vst3/plugin/{uri}/parameters
   - Instantiates plugin via JUCE
   - Enumerates all parameters
   - Returns parameter metadata (name, min, max, default, type, etc.)

2. Update VST3PluginParameterEditor to:
   - Check if parameters are empty
   - Call new endpoint to load parameters
   - Show loading state while fetching
   - Cache parameters once loaded

3. JUCE Integration Requirements:
   - Use JucePluginHost to load VST3
   - Call plugin->getParameters()
   - For each parameter, get:
     * index
     * name
     * symbol/ID
     * min/max values
     * default value
     * current value
     * value type (float, int, bool)
     * display label/units

4. Example JUCE Code:
   ```cpp
   auto plugin = formatManager.createPluginInstance(uri);
   if (plugin) {
       auto parameters = plugin->getParameters();
       for (auto* param : parameters) {
           json paramData;
           paramData["index"] = param->getParameterIndex();
           paramData["name"] = param->getName();
           paramData["min"] = param->getMinValue();
           paramData["max"] = param->getMaxValue();
           paramData["default"] = param->getDefaultValue();
           paramData["value"] = param->getValue();
           // ...
       }
   }
   ```

WORKAROUND FOR NOW:
- LSP Plugins installed at: ~/.vst3/lsp-plugins.vst3
- These are native Linux VST3s with full parameter support
- OrilRiver and TAL-U-No-LX are Windows VST3s (won't work on Linux)

TESTING:
Once JUCE integration is complete:
1. Restart backend
2. Clear VST3 cache
3. Rediscover plugins
4. Open LSP plugin in editor
5. Verify parameters load correctly
