import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockLv2Editor = jest.fn()

jest.mock('../../../map2/api', () => ({
  pluginsApi: {
    setParameterBatched: jest.fn(),
    flushParameterBatch: jest.fn(),
  },
  chainsApi: {
    togglePluginBypass: jest.fn(),
  },
}))

jest.mock('../../hooks/usePluginOutputs', () => ({
  usePluginOutput: () => ({
    outputPorts: {},
    peaks: {},
    connected: false,
  }),
}))

jest.mock('./registry', () => ({
  getPluginCardComponent: () => null,
  getTemplateCardComponent: () => null,
}))

jest.mock('./types', () => ({
  getCategoryConfig: () => ({ color: '#999999' }),
}))

jest.mock('../LV2PluginParameterEditor', () => ({
  __esModule: true,
  default: (props: unknown) => {
    mockLv2Editor(props)
    return <div data-testid="lv2-editor">LV2 fallback editor</div>
  },
}))

import { PluginCardRouter } from './PluginCardRouter'

function renderRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <PluginCardRouter
        plugin={{
          uri: 'urn:test:lv2',
          name: 'Fallback LV2',
          author: 'MAP2',
          category: 'Utility',
          class_label: 'Utility',
          version: '1.0',
          license: 'AGPL-3.0-only',
          has_ui: false,
          in_ports: 2,
          out_ports: 2,
          instance_id: 44,
          parameters: [],
          ui_info: { output_ports: [] },
        }}
        pluginPosition={6}
        chainId={1}
      />
    </QueryClientProvider>,
  )
}

describe('PluginCardRouter', () => {
  beforeEach(() => {
    mockLv2Editor.mockReset()
  })

  it('passes runtime identity props to the LV2 fallback editor', () => {
    renderRouter()

    expect(screen.getByTestId('lv2-editor')).toBeInTheDocument()
    expect(mockLv2Editor).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceId: 44,
        pluginPosition: 6,
      }),
    )
  })
})
