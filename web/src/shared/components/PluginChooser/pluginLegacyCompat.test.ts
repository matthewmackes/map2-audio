import { normalizeUiPlugin } from './utils/pluginBridge'
import { getPluginGlyph, PluginType, pluginTypeFromCategory, type UiPlugin } from './pluginLegacyCompat'

describe('pluginLegacyCompat', () => {
  it('maps common category strings to stable plugin types', () => {
    expect(pluginTypeFromCategory('Dynamics')).toBe(PluginType.CompressorPlugin)
    expect(pluginTypeFromCategory('Amp Sim')).toBe(PluginType.AmplifierPlugin)
    expect(pluginTypeFromCategory('Unknown')).toBe(PluginType.Plugin)
  })

  it('provides deterministic glyph labels for chooser icons', () => {
    expect(getPluginGlyph(PluginType.DelayPlugin)).toEqual({
      label: 'DLY',
      tone: '#0f62fe',
    })
    expect(getPluginGlyph(PluginType.Plugin).label).toBe('FX')
  })

  it('normalizes legacy ui plugins through the local compatibility surface', () => {
    const plugin: UiPlugin = {
      uri: 'urn:test:plugin',
      name: 'Test Delay',
      minorVersion: 2,
      microVersion: 5,
      plugin_type: PluginType.DelayPlugin,
      plugin_display_type: 'Delay',
      author_name: 'MAP2',
      author_homepage: 'https://example.com',
      audio_inputs: 1,
      audio_outputs: 2,
      has_midi_input: 1,
      has_midi_output: 0,
      description: 'A delay plugin',
      is_vst3: false,
      modGui: {},
      controls: [
        {
          name: 'Time',
          symbol: 'time',
          default_value: 0.5,
          min_value: 0,
          max_value: 1,
          units: 's',
          is_input: true,
        },
        {
          name: 'Meter',
          symbol: 'meter',
          default_value: 0,
          min_value: 0,
          max_value: 1,
          units: 'db',
          is_input: false,
        },
      ],
    }

    expect(normalizeUiPlugin(plugin)).toMatchObject({
      uri: 'urn:test:plugin',
      name: 'Test Delay',
      format: 'lv2',
      pluginType: PluginType.DelayPlugin,
      hasMidiInput: true,
      hasMidiOutput: false,
      hasUi: true,
      parameterCount: 1,
      topParameters: [
        {
          name: 'Time',
          symbol: 'time',
          defaultValue: 0.5,
          minValue: 0,
          maxValue: 1,
          unit: 's',
        },
      ],
    })
  })
})
