import type { Chain, Plugin } from '../../../map2/types'
import { buildSnapshotEditorSelectedPluginCard } from './snapshotEditorSelectedPluginCard'

function makePluginMeta(): Plugin {
  return {
    uri: 'map2://juce/nam',
    name: 'Neural Amp Modeler',
    author: 'MAP2',
    category: 'Amplifier',
    class_label: 'Amplifier',
    version: '1.0',
    license: 'AGPL-3.0-only',
    has_ui: false,
    in_ports: 2,
    out_ports: 2,
    parameters: [
      {
        index: 0,
        symbol: 'input_gain',
        name: 'Input Gain',
        min: -12,
        max: 12,
        default: 0,
        value: 0,
        is_toggled: false,
        is_log: false,
      },
      {
        index: 1,
        symbol: 'output_gain',
        name: 'Output Gain',
        min: -12,
        max: 12,
        default: 0,
        value: 0,
        is_toggled: false,
        is_log: false,
      },
    ],
  }
}

function makeSelectedPlugin(): Chain['plugins'][number] {
  return {
    uri: 'map2://juce/nam',
    name: 'NAM Runtime',
    position: 4,
    bypassed: false,
    parameters: {
      input_gain: 2.5,
      output_gain: -1.5,
    },
    loader_state: {
      selected_model: 'George B',
      selected_asset_name: 'George B',
      selected_asset_path: '/models/george-b.nam',
    },
    instance_id: 91,
    latency_samples: 64,
  }
}

describe('buildSnapshotEditorSelectedPluginCard', () => {
  it('returns null when either source is missing', () => {
    expect(buildSnapshotEditorSelectedPluginCard(null, makePluginMeta())).toBeNull()
    expect(buildSnapshotEditorSelectedPluginCard(makeSelectedPlugin(), null)).toBeNull()
  })

  it('preserves draft loader state and overlays selected parameter values', () => {
    const card = buildSnapshotEditorSelectedPluginCard(makeSelectedPlugin(), makePluginMeta())

    expect(card).toEqual(expect.objectContaining({
      uri: 'map2://juce/nam',
      name: 'Neural Amp Modeler',
      bypassed: false,
      instance_id: 91,
      latency_samples: 64,
      loader_state: {
        selected_model: 'George B',
        selected_asset_name: 'George B',
        selected_asset_path: '/models/george-b.nam',
      },
    }))
    expect(card?.parameters).toEqual([
      expect.objectContaining({ symbol: 'input_gain', value: 2.5 }),
      expect.objectContaining({ symbol: 'output_gain', value: -1.5 }),
    ])
  })
})
