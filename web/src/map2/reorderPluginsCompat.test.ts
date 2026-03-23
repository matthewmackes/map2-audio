import '@testing-library/jest-dom'

import {
  getLegacyUriOnlyPluginOrder,
  isLegacyUriOnlyReorderValidationError,
  normalizeReorderPluginsResponse,
} from './reorderPluginsCompat'

describe('reorderPluginsCompat', () => {
  it('detects the legacy URI-only FastAPI validation failure', () => {
    expect(isLegacyUriOnlyReorderValidationError({
      status: 422,
      body: {
        detail: [
          {
            type: 'string_type',
            loc: ['body', 0],
            msg: 'Input should be a valid string',
          },
        ],
      },
    })).toBe(true)

    expect(isLegacyUriOnlyReorderValidationError({
      status: 400,
      body: {
        detail: [
          {
            type: 'string_type',
            loc: ['body', 0],
          },
        ],
      },
    })).toBe(false)
  })

  it('normalizes both positioned-ref and legacy URI-array reorder responses', () => {
    const requestedOrder = [
      { uri: 'map2://juce/modulation/chorus', position: 1 },
      { uri: 'map2://juce/dynamics/compressor', position: 0 },
    ]

    expect(normalizeReorderPluginsResponse({
      status: 'reordered',
      chain_id: 9,
      plugins: [
        { plugin_uri: 'map2://juce/modulation/chorus', plugin_position: 1 },
        { plugin_uri: 'map2://juce/dynamics/compressor', plugin_position: 0 },
      ],
    }, requestedOrder)).toEqual({
      status: 'reordered',
      chain_id: 9,
      plugins: requestedOrder,
    })

    expect(normalizeReorderPluginsResponse({
      status: 'reordered',
      chain_id: 9,
      plugins: [
        'map2://juce/modulation/chorus',
        'map2://juce/dynamics/compressor',
      ],
    }, requestedOrder)).toEqual({
      status: 'reordered',
      chain_id: 9,
      plugins: requestedOrder,
    })
  })

  it('blocks unsafe legacy fallback when duplicate URIs require positioned refs', () => {
    expect(() => getLegacyUriOnlyPluginOrder([
      { uri: 'map2://juce/modulation/chorus', position: 1 },
      { uri: 'map2://juce/modulation/chorus', position: 0 },
    ])).toThrow(/duplicate plugins cannot be moved safely/i)

    expect(getLegacyUriOnlyPluginOrder([
      { uri: 'map2://juce/modulation/chorus', position: 1 },
      { uri: 'map2://juce/dynamics/compressor', position: 0 },
    ])).toEqual([
      'map2://juce/modulation/chorus',
      'map2://juce/dynamics/compressor',
    ])
  })
})
