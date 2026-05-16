// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Run-14b cycle 3 — validateMeterWsFrame tests.

import {
  __resetWarnedForTests,
  checkClusterRegistryFrame,
  checkRegistryFrame,
} from './validateMeterWsFrame'
import {
  CLUSTER_REGISTRY_FRAME_TYPE,
  REGISTRY_FRAME_TYPE,
  SCHEMA_VERSION,
} from '../types/meterWsFrame.generated'

beforeEach(() => {
  __resetWarnedForTests()
})

// ---------------------------------------------------------------------------
// checkRegistryFrame — happy path
// ---------------------------------------------------------------------------

describe('checkRegistryFrame', () => {
  test('accepts a valid empty registry frame', () => {
    const result = checkRegistryFrame({
      type: REGISTRY_FRAME_TYPE,
      schema_version: SCHEMA_VERSION,
      data: { devices: [] },
    })
    expect(result.ok).toBe(true)
    expect(result.frame).toBeDefined()
  })

  test('accepts a populated registry frame with snapshot=null', () => {
    const result = checkRegistryFrame({
      type: REGISTRY_FRAME_TYPE,
      schema_version: SCHEMA_VERSION,
      data: {
        devices: [
          {
            device_id: 'tascam-us144mkii',
            input_channels: 4,
            output_channels: 4,
            has_engine_source: false,
            snapshot: null,
          },
        ],
      },
    })
    expect(result.ok).toBe(true)
  })

  test('accepts a populated registry frame with engine snapshot', () => {
    const result = checkRegistryFrame({
      type: REGISTRY_FRAME_TYPE,
      schema_version: SCHEMA_VERSION,
      data: {
        devices: [
          {
            device_id: 'edirol-ua-1000',
            input_channels: 10,
            output_channels: 10,
            has_engine_source: true,
            snapshot: {
              input_peak_db: [-50, -45, -100, -100, -100, -100, -100, -100, -100, -100],
              output_peak_db: [-30, -30, -100, -100, -100, -100, -100, -100, -100, -100],
              source: 'engine',
              captured_at: 1715731200.0,
            },
          },
        ],
      },
    })
    expect(result.ok).toBe(true)
  })

  test('accepts source=engine_unavailable (silence-shaped fallback)', () => {
    const result = checkRegistryFrame({
      type: REGISTRY_FRAME_TYPE,
      schema_version: SCHEMA_VERSION,
      data: {
        devices: [
          {
            device_id: 'd',
            input_channels: 0,
            output_channels: 0,
            has_engine_source: true,
            snapshot: {
              input_peak_db: [],
              output_peak_db: [],
              source: 'engine_unavailable',
              captured_at: null,
            },
          },
        ],
      },
    })
    expect(result.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// checkRegistryFrame — sad paths
// ---------------------------------------------------------------------------

describe('checkRegistryFrame rejects', () => {
  test('null input', () => {
    const result = checkRegistryFrame(null)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('envelope')
  })

  test('wrong topic', () => {
    const result = checkRegistryFrame({
      type: CLUSTER_REGISTRY_FRAME_TYPE,
      schema_version: SCHEMA_VERSION,
      data: { devices: [] },
    })
    expect(result.ok).toBe(false)
  })

  test('wrong schema_version', () => {
    const result = checkRegistryFrame({
      type: REGISTRY_FRAME_TYPE,
      schema_version: 99,
      data: { devices: [] },
    })
    expect(result.ok).toBe(false)
  })

  test('devices is not an array', () => {
    const result = checkRegistryFrame({
      type: REGISTRY_FRAME_TYPE,
      schema_version: SCHEMA_VERSION,
      data: { devices: 'not-an-array' },
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('devices must be an array')
  })

  test('device_id missing', () => {
    const result = checkRegistryFrame({
      type: REGISTRY_FRAME_TYPE,
      schema_version: SCHEMA_VERSION,
      data: {
        devices: [
          {
            input_channels: 0,
            output_channels: 0,
            has_engine_source: false,
          },
        ],
      },
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('device_id')
  })

  test('snapshot.source unknown literal', () => {
    const result = checkRegistryFrame({
      type: REGISTRY_FRAME_TYPE,
      schema_version: SCHEMA_VERSION,
      data: {
        devices: [
          {
            device_id: 'd',
            input_channels: 0,
            output_channels: 0,
            has_engine_source: false,
            snapshot: {
              input_peak_db: [],
              output_peak_db: [],
              source: 'mystery',
              captured_at: null,
            },
          },
        ],
      },
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('source')
  })

  test('snapshot.input_peak_db not an array', () => {
    const result = checkRegistryFrame({
      type: REGISTRY_FRAME_TYPE,
      schema_version: SCHEMA_VERSION,
      data: {
        devices: [
          {
            device_id: 'd',
            input_channels: 0,
            output_channels: 0,
            has_engine_source: false,
            snapshot: {
              input_peak_db: 'not-an-array',
              output_peak_db: [],
              source: 'engine',
              captured_at: null,
            },
          },
        ],
      },
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('input_peak_db')
  })
})

// ---------------------------------------------------------------------------
// checkClusterRegistryFrame
// ---------------------------------------------------------------------------

describe('checkClusterRegistryFrame', () => {
  test('accepts an empty cluster frame', () => {
    const result = checkClusterRegistryFrame({
      type: CLUSTER_REGISTRY_FRAME_TYPE,
      schema_version: SCHEMA_VERSION,
      data: {
        local: { devices: [] },
        peers: [],
        errors: {},
      },
    })
    expect(result.ok).toBe(true)
  })

  test('accepts a populated cluster frame with peer + health', () => {
    const result = checkClusterRegistryFrame({
      type: CLUSTER_REGISTRY_FRAME_TYPE,
      schema_version: SCHEMA_VERSION,
      data: {
        local: { devices: [] },
        peers: [
          {
            node_id: 'peer-A',
            hostname: 'audio-A',
            devices: [],
            health: 'ok',
            fetch_age_seconds: 0.123,
          },
        ],
        errors: { 'peer-B': 'http 504' },
      },
    })
    expect(result.ok).toBe(true)
  })

  test('rejects when peers is not an array', () => {
    const result = checkClusterRegistryFrame({
      type: CLUSTER_REGISTRY_FRAME_TYPE,
      schema_version: SCHEMA_VERSION,
      data: { local: { devices: [] }, peers: 'nope', errors: {} },
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('peers')
  })

  test('rejects when peer.health is missing', () => {
    const result = checkClusterRegistryFrame({
      type: CLUSTER_REGISTRY_FRAME_TYPE,
      schema_version: SCHEMA_VERSION,
      data: {
        local: { devices: [] },
        peers: [{ node_id: 'p', devices: [] }],  // no health
        errors: {},
      },
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('health')
  })

  test('rejects when errors is an array (must be a Record)', () => {
    const result = checkClusterRegistryFrame({
      type: CLUSTER_REGISTRY_FRAME_TYPE,
      schema_version: SCHEMA_VERSION,
      data: { local: { devices: [] }, peers: [], errors: [] },
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('errors')
  })
})
