import { act, renderHook, waitFor } from '@testing-library/react'

import { resetParameterSchema } from '../data/parameterSchema'
import { useParameterSchema } from './useParameterSchema'
import {
  PLUGIN_INVENTORY_CHANGED_EVENT,
  pluginsApi,
} from '../../map2/api'

jest.mock('../../map2/api', () => ({
  PLUGIN_INVENTORY_CHANGED_EVENT: 'map2:plugins-changed',
  pluginsApi: {
    getParameterSchema: jest.fn(),
  },
}))

const mockedPluginsApi = pluginsApi as jest.Mocked<typeof pluginsApi>

describe('useParameterSchema', () => {
  beforeEach(() => {
    resetParameterSchema()
    mockedPluginsApi.getParameterSchema.mockReset()
  })

  afterEach(() => {
    resetParameterSchema()
  })

  it('hydrates the shared registry on mount', async () => {
    mockedPluginsApi.getParameterSchema.mockResolvedValue({
      schema: {
        'lv2://plate:mix': {
          min: 0,
          max: 100,
          step: 1,
          unit: '%',
          defaultValue: 50,
          profile: 'default',
        },
      },
      plugins: [
        {
          pluginId: 'lv2://plate',
          name: 'Plate Verb',
          format: 'LV2',
          source: 'lv2',
          parameterCount: 1,
          parameters: [],
        },
      ],
      count: 1,
    })

    const { result } = renderHook(() => useParameterSchema())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(mockedPluginsApi.getParameterSchema).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
    expect(result.current.registry['lv2://plate:mix']?.defaultValue).toBe(50)
    expect(result.current.plugins[0]?.pluginId).toBe('lv2://plate')
    expect(result.current.lastUpdated).toBeTruthy()
  })

  it('refreshes when the plugin inventory changed event fires', async () => {
    mockedPluginsApi.getParameterSchema
      .mockResolvedValueOnce({
        schema: {
          'native://synth:cutoff': {
            min: 20,
            max: 20_000,
            step: 1,
            unit: 'Hz',
            defaultValue: 1000,
            profile: 'frequency',
          },
        },
        plugins: [],
        count: 1,
      })
      .mockResolvedValueOnce({
        schema: {
          'native://synth:cutoff': {
            min: 20,
            max: 20_000,
            step: 1,
            unit: 'Hz',
            defaultValue: 1500,
            profile: 'frequency',
          },
        },
        plugins: [],
        count: 1,
      })

    const { result } = renderHook(() => useParameterSchema())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.registry['native://synth:cutoff']?.defaultValue).toBe(1000)

    act(() => {
      window.dispatchEvent(new Event(PLUGIN_INVENTORY_CHANGED_EVENT))
    })

    await waitFor(() => expect(mockedPluginsApi.getParameterSchema).toHaveBeenCalledTimes(2))
    await waitFor(() => {
      expect(result.current.registry['native://synth:cutoff']?.defaultValue).toBe(1500)
    })
  })
})
