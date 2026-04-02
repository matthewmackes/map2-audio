import type { AudioStatus, SnapshotDetail } from '../../map2/types'
import {
  SNAPSHOT_IO_USE_DEFAULT_OPTION,
  buildSnapshotIoDefaultsUpdate,
  buildSnapshotIoModalState,
  buildSnapshotIoUpdateRequest,
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
      remap_required: false,
    },
    controls: {
      midi_map: [],
      automation_lanes: [],
      expression_mappings: [],
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
          remap_required: false,
        },
      }),
      {
        input_device: 'Global Input',
        output_device: 'Global Output',
      },
    )

    expect(modalState).toEqual({
      snapshotInputValue: 'Tour Rack In',
      snapshotOutputValue: 'Tour Rack Out',
      defaultInputValue: 'Global Input',
      defaultOutputValue: 'Global Output',
    })
  })

  it('normalizes blank defaults and default-option snapshot bindings before save', () => {
    const state = {
      snapshotInputValue: SNAPSHOT_IO_USE_DEFAULT_OPTION,
      snapshotOutputValue: '  House Out  ',
      defaultInputValue: '  ',
      defaultOutputValue: '  Stage Rack  ',
    }

    expect(buildSnapshotIoUpdateRequest(state)).toEqual({
      input_device: null,
      output_device: 'House Out',
    })
    expect(buildSnapshotIoDefaultsUpdate(state)).toEqual({
      input_device: null,
      output_device: 'Stage Rack',
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
})
