import { ApiError } from '../../map2/http'
import type { SnapshotDetail } from '../../map2/types'
import {
  SNAPSHOT_ACTIVATION_TOAST_DURATION_MS,
  buildSnapshotActivationFailureToastMessage,
  buildSnapshotActivationToastMessage,
  countActiveSnapshotBlocks,
  countActiveSnapshotChannels,
  extractSnapshotActivationFailureDetail,
  extractSnapshotActivationFailureReason,
} from './snapshotActivationToast'

function buildSnapshotFixture(): SnapshotDetail {
  return {
    name: 'VerseClean',
    channel_count: 3,
    channels: [
      { channel_key: 'ch_a', label: 'A', color: '#2563eb', chain_id: 201 },
      { channel_key: 'ch_b', label: 'B', color: '#22c55e', chain_id: 202 },
      { channel_key: 'ch_c', label: 'C', color: '#f97316', chain_id: 203 },
    ],
    chains: [
      {
        id: 201,
        name: 'VerseClean Path A',
        plugins: [
          { uri: 'map2://fx/drive', position: 0, bypass: false, parameters: {} },
          { uri: 'map2://fx/reverb', position: 1, bypass: true, parameters: {} },
        ],
      },
      {
        id: 202,
        name: 'VerseClean Path B',
        plugins: [
          { uri: 'map2://fx/chorus', position: 0, bypass: false, parameters: {} },
        ],
      },
    ],
    paths: [
      {
        id: 'ch_a',
        name: 'VerseClean Path A',
        label: 'A',
        color: '#2563eb',
        muted: false,
        solo: false,
        dry_wet_mix: 100,
        order_index: 0,
        snapshot_chain_id: 201,
        runtime_chain_id: 301,
        plugins: [],
      },
      {
        id: 'ch_b',
        name: 'VerseClean Path B',
        label: 'B',
        color: '#22c55e',
        muted: false,
        solo: false,
        dry_wet_mix: 100,
        order_index: 1,
        snapshot_chain_id: 202,
        runtime_chain_id: 302,
        plugins: [],
      },
      {
        id: 'ch_c',
        name: 'VerseClean Path C',
        label: 'C',
        color: '#f97316',
        muted: false,
        solo: false,
        dry_wet_mix: 100,
        order_index: 2,
        snapshot_chain_id: 203,
        runtime_chain_id: null,
        plugins: [],
      },
    ],
    live_state: {
      is_live: true,
      paths: [
        { path_id: 'ch_a', snapshot_chain_id: 201, runtime_chain_id: 301, activation_status: 'active' },
        { path_id: 'ch_b', snapshot_chain_id: 202, runtime_chain_id: 302, activation_status: 'live' },
        { path_id: 'ch_c', snapshot_chain_id: 203, runtime_chain_id: null, activation_status: 'offline' },
      ],
      runtime_chains: [
        {
          id: 301,
          name: 'VerseClean Path A (A)',
          is_active: true,
          created_at: '2026-04-01T20:00:00Z',
          updated_at: '2026-04-01T20:00:00Z',
          plugins: [
            { uri: 'map2://fx/drive', name: 'Drive', position: 0, bypassed: false, parameters: {} },
            { uri: 'map2://fx/reverb', name: 'Reverb', position: 1, bypassed: true, parameters: {} },
          ],
        },
        {
          id: 302,
          name: 'VerseClean Path B (B)',
          is_active: true,
          created_at: '2026-04-01T20:00:00Z',
          updated_at: '2026-04-01T20:00:00Z',
          plugins: [
            { uri: 'map2://fx/chorus', name: 'Chorus', position: 0, bypassed: false, parameters: {} },
            { uri: 'map2://fx/delay', name: 'Delay', position: 1, bypassed: false, parameters: {} },
          ],
        },
      ],
    },
  } as unknown as SnapshotDetail
}

describe('snapshotActivationToast', () => {
  it('counts active channels and non-bypassed blocks from live runtime state', () => {
    const snapshot = buildSnapshotFixture()

    expect(countActiveSnapshotChannels(snapshot)).toBe(2)
    expect(countActiveSnapshotBlocks(snapshot)).toBe(3)
    expect(buildSnapshotActivationToastMessage(snapshot)).toBe('Live: VerseClean - 2 channels, 3 blocks')
  })

  it('adds the MIDI program number suffix when activation is triggered by PC', () => {
    const snapshot = buildSnapshotFixture()

    expect(buildSnapshotActivationToastMessage(snapshot, { programNumber: 1 })).toBe(
      'Live: VerseClean - 2 channels, 3 blocks (PC 1)',
    )
    expect(SNAPSHOT_ACTIVATION_TOAST_DURATION_MS).toBe(3000)
  })

  it('formats activation failures from ApiError detail strings', () => {
    const error = new ApiError(422, 'Unprocessable Entity', { detail: 'Channel Lead not loaded.' })

    expect(buildSnapshotActivationFailureToastMessage('VerseClean', error)).toBe(
      'Failed: VerseClean - Channel Lead not loaded.',
    )
  })

  it('joins structured activation failure lists for inline and toast rendering', () => {
    const error = new ApiError(422, 'Unprocessable Entity', {
      detail: [
        'Cannot go live: Channel Lead - plugin Ghost Drive is not installed on this node.',
        'Cannot go live: Input device Tour Rack is not available on this node.',
      ],
    })

    expect(extractSnapshotActivationFailureReason(error, { separator: '\n' })).toBe(
      'Cannot go live: Channel Lead - plugin Ghost Drive is not installed on this node.\nCannot go live: Input device Tour Rack is not available on this node.',
    )
    expect(buildSnapshotActivationFailureToastMessage('VerseClean', error)).toBe(
      'Failed: VerseClean - Cannot go live: Channel Lead - plugin Ghost Drive is not installed on this node. • Cannot go live: Input device Tour Rack is not available on this node.',
    )
  })

  it('extracts structured validation details and repair actions from preflight errors', () => {
    const error = new ApiError(422, 'Unprocessable Entity', {
      detail: {
        message: 'Cannot go live: Input device Tour Rack is not available on this node.',
        phase: 'VALIDATING',
        blocking: true,
        failures: ['Cannot go live: Input device Tour Rack is not available on this node.'],
        issues: [
          {
            code: 'missing_input_device',
            category: 'device',
            device_role: 'input',
            requested_device: 'Tour Rack',
            message: 'Cannot go live: Input device Tour Rack is not available on this node.',
            auto_repair: false,
          },
        ],
        repair_actions: [
          {
            action: 'select_available_device',
            device_role: 'input',
            requested_device: 'Tour Rack',
            message: 'Select an available input device instead of Tour Rack.',
          },
        ],
      },
    })

    expect(extractSnapshotActivationFailureDetail(error)).toEqual({
      message: 'Cannot go live: Input device Tour Rack is not available on this node.',
      phase: 'VALIDATING',
      blocking: true,
      failures: ['Cannot go live: Input device Tour Rack is not available on this node.'],
      issues: [
        {
          code: 'missing_input_device',
          category: 'device',
          message: 'Cannot go live: Input device Tour Rack is not available on this node.',
          autoRepair: false,
          assetType: null,
          deviceRole: 'input',
        },
      ],
      repairActions: [
        {
          action: 'select_available_device',
          message: 'Select an available input device instead of Tour Rack.',
          assetType: null,
          requestedDevice: 'Tour Rack',
          deviceRole: 'input',
          pluginName: null,
        },
      ],
    })
  })
})
