import type { AudioStatus, SnapshotControls, SnapshotDetail } from '../../map2/types'
import {
  SNAPSHOT_IO_USE_DEFAULT_OPTION,
  buildSnapshotIoControlsUpdate,
  buildSnapshotIoDefaultsUpdate,
  buildSnapshotIoModalState,
  buildSnapshotIoUpdateRequest,
  collectMonitoringOutputPairOptions,
  collectSnapshotIoDeviceOptions,
} from './snapshotIoBindings'

function buildSnapshot(overrides: Partial<SnapshotDetail> = {}): SnapshotDetail {
  return {
    id: 12,
    name: 'Studio Lead',
    description: 'Primary snapshot',
    tags: [],
    program_number: 1,
    tempo_bpm: 120,
    active_tempo_bpm: 120,
    input_device: null,
    output_device: null,
    is_active: false,
    is_favorite: false,
    display_order: 0,
    channels: [],
    channel_count: 0,
    chain_count: 0,
    community_shared: false,
    community_download_count: 0,
    community_rating: null,
    community_rating_count: 0,
    chains: [],
    routing: {
      mode: 'parallel_blend',
      active_channel_key: null,
      blend_positions: {},
      morph_position: 0,
      morph_source_channel_key: null,
      morph_target_channel_key: null,
      series_order: [],
    },
    midi_map: [],
    paths: [],
    io_bindings: {
      input_device: null,
      output_device: null,
      monitoring_output_index: null,
      remap_required: false,
    },
    controls: {
      midi_map: [],
      automation_lanes: [],
      expression_mappings: [],
      monitoring_output_index: null,
      maschine_encoder_map: {
        enc1: null,
        enc2: null,
        enc3: null,
        enc4: null,
        enc5: null,
        enc6: null,
        enc7: null,
        enc8: null,
        vol: {},
        tempo: {},
      },
    },
    assets: [],
    live_state: {
      is_live: false,
      activated_at: null,
      paths: [],
      runtime_chains: [],
    },
    lineage: {
      derived_from_snapshot_id: null,
    },
    session_notes: [],
    active_channel_index: 0,
    deployments: [],
    ...overrides,
  }
}

describe('snapshotIoBindings', () => {
  it('builds modal state from per-snapshot bindings and config defaults', () => {
    const modalState = buildSnapshotIoModalState(
      buildSnapshot({
        input_device: 'Stage Input',
        output_device: 'House L/R',
        io_bindings: {
          input_device: 'Tour Rack In',
          output_device: 'Tour Rack Out',
          monitoring_output_index: 2,
          remap_required: false,
        },
        controls: {
          midi_map: [],
          automation_lanes: [],
          expression_mappings: [],
          monitoring_output_index: 2,
          maschine_encoder_map: {
            enc1: null,
            enc2: null,
            enc3: null,
            enc4: null,
            enc5: null,
            enc6: null,
            enc7: null,
            enc8: null,
            vol: {},
            tempo: {},
          },
        },
      }),
      {
        input_device: 'Global Input',
        output_device: 'Global Output',
        monitoring_output_index: 4,
      },
    )

    expect(modalState).toEqual({
      snapshotInputValue: 'Tour Rack In',
      snapshotOutputValue: 'Tour Rack Out',
      snapshotMonitoringOutputValue: '2',
      defaultInputValue: 'Global Input',
      defaultOutputValue: 'Global Output',
      defaultMonitoringOutputValue: '4',
    })
  })

  it('normalizes blank defaults and default-option snapshot bindings before save', () => {
    const state = {
      snapshotInputValue: SNAPSHOT_IO_USE_DEFAULT_OPTION,
      snapshotOutputValue: '  House Out  ',
      snapshotMonitoringOutputValue: SNAPSHOT_IO_USE_DEFAULT_OPTION,
      defaultInputValue: '  ',
      defaultOutputValue: '  Stage Rack  ',
      defaultMonitoringOutputValue: ' 2 ',
    }

    expect(buildSnapshotIoUpdateRequest(state)).toEqual({
      input_device: null,
      output_device: 'House Out',
    })
    expect(buildSnapshotIoDefaultsUpdate(state)).toEqual({
      input_device: null,
      output_device: 'Stage Rack',
      monitoring_output_index: 2,
    })
  })

  it('builds a controls payload that preserves other control state while updating monitoring output', () => {
    const currentControls: Partial<SnapshotControls> = {
      midi_map: [{ action: 'load_snapshot', program_number: 12 }],
      automation_lanes: [{ id: 'lane-1' }],
      expression_mappings: [{ id: 'expr-1' }],
      maschine_encoder_map: {
        enc1: null,
        enc2: null,
        enc3: null,
        enc4: null,
        enc5: null,
        enc6: null,
        enc7: null,
        enc8: null,
        vol: {},
        tempo: {},
      },
    }

    expect(buildSnapshotIoControlsUpdate({
      snapshotInputValue: SNAPSHOT_IO_USE_DEFAULT_OPTION,
      snapshotOutputValue: SNAPSHOT_IO_USE_DEFAULT_OPTION,
      snapshotMonitoringOutputValue: '4',
      defaultInputValue: '',
      defaultOutputValue: '',
      defaultMonitoringOutputValue: SNAPSHOT_IO_USE_DEFAULT_OPTION,
    }, currentControls)).toEqual({
      midi_map: [{ action: 'load_snapshot', program_number: 12 }],
      automation_lanes: [{ id: 'lane-1' }],
      expression_mappings: [{ id: 'expr-1' }],
      maschine_encoder_map: {
        enc1: null,
        enc2: null,
        enc3: null,
        enc4: null,
        enc5: null,
        enc6: null,
        enc7: null,
        enc8: null,
        vol: {},
        tempo: {},
      },
      monitoring_output_index: 4,
    })
  })

  it('collects stable device options from audio status inventory and current runtime device', () => {
    const audioStatus: AudioStatus = {
      running: true,
      sample_rate: 48000,
      buffer_size: 128,
      cpu_load: 0.12,
      engine: 'juce',
      available: true,
      input_device: 'Current Input',
      output_device: 'Current Output',
      available_input_devices: ['Current Input', 'Current Input', 'Backup Input'],
      available_output_devices: ['Backup Output'],
    }

    expect(collectSnapshotIoDeviceOptions(audioStatus)).toEqual({
      inputOptions: ['Current Input', 'Backup Input'],
      outputOptions: ['Backup Output', 'Current Output'],
    })
  })

  it('builds monitoring output-pair options from output ports', () => {
    expect(collectMonitoringOutputPairOptions([
      { index: 0, name: 'Out 1', type: 'output' },
      { index: 1, name: 'Out 2', type: 'output' },
      { index: 2, name: 'Out 3', type: 'output' },
      { index: 3, name: 'Out 4', type: 'output' },
    ])).toEqual([
      { value: '0', label: 'Output 1/2' },
      { value: '2', label: 'Output 3/4' },
    ])
  })
})
