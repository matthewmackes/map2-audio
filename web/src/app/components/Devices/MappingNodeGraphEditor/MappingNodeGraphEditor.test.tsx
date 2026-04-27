// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// MappingNodeGraphEditor Jest coverage — T2459-C4.

import '@testing-library/jest-dom'
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// jsdom doesn't ship ResizeObserver; Carbon's TextArea uses it.
class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverPolyfill

import { MappingNodeGraphEditor } from './MappingNodeGraphEditor'

// Mock ReactFlow because jsdom doesn't measure layout. We render a
// stub that at least surfaces node + edge counts, enough to verify
// the editor passes the right graph in.
jest.mock('reactflow', () => {
  const FakeFlow = (props) => {
    return (
      <div data-testid="reactflow-stub">
        <div data-testid="reactflow-node-count">{(props.nodes ?? []).length}</div>
        <div data-testid="reactflow-edge-count">{(props.edges ?? []).length}</div>
        <div data-testid="reactflow-animated-edge-count">
          {(props.edges ?? []).filter((e) => e.animated).length}
        </div>
      </div>
    )
  }
  return {
    __esModule: true,
    default: FakeFlow,
    Background: () => <div data-testid="reactflow-bg" />,
    Controls: () => <div data-testid="reactflow-controls" />,
  }
})

// Mock the API client.
const mockImport = jest.fn()
const mockExport = jest.fn()
jest.mock('../../../../map2/clients/devices', () => ({
  importMixxxXml: (...args) => mockImport(...args),
  exportMixxxXml: (...args) => mockExport(...args),
}))

const SAMPLE_DESCRIPTOR = {
  pack_id: 'edirol-ua',
  model: 'ua-1000',
  kind: 'midi',
  controls: [
    {
      status: 0xB0, midino: 64, channel: null,
      target: 'audio.chain.1.bypass', action: 'toggle',
      script: null, fast_path: true, description: 'Pedal',
    },
    {
      status: 0xB0, midino: 7, channel: null,
      target: null, action: null,
      script: 'UA1000Mapping.masterVolume', fast_path: false,
      description: 'CC 7 master volume',
    },
  ],
  outputs: [],
  scripts: ['scripts/ua-1000-scripts.js'],
  mixxx_alias_table: {},
  stats: { total_controls: 2, resolved_controls: 2, skipped_controls: 0, skip_reasons: [] },
}

beforeEach(() => {
  mockImport.mockReset()
  mockExport.mockReset()
})

describe('MappingNodeGraphEditor — T2459-C4', () => {
  it('renders empty when no descriptor is supplied', () => {
    render(<MappingNodeGraphEditor />)
    expect(screen.getByText(/No mapping loaded/)).toBeInTheDocument()
  })

  it('builds the right node + edge count from a descriptor', () => {
    render(<MappingNodeGraphEditor descriptor={SAMPLE_DESCRIPTOR} />)
    // 2 controls → 2 input nodes + 2 target nodes = 4, with 2 edges.
    expect(screen.getByTestId('reactflow-node-count')).toHaveTextContent('4')
    expect(screen.getByTestId('reactflow-edge-count')).toHaveTextContent('2')
    // Of the 2 edges, the fast-path one is animated.
    expect(screen.getByTestId('reactflow-animated-edge-count')).toHaveTextContent('1')
  })

  it('shows the Export to Mixxx XML button when pack+model are provided', () => {
    render(<MappingNodeGraphEditor packId="edirol-ua" model="ua-1000" />)
    const btn = screen.getByText('Export to Mixxx XML')
    expect(btn).toBeInTheDocument()
    expect(btn.closest('button')).not.toBeDisabled()
  })

  it('disables Export when pack+model are missing', () => {
    render(<MappingNodeGraphEditor />)
    const btn = screen.getByText('Export to Mixxx XML').closest('button')
    expect(btn).toBeDisabled()
  })

  it('Import button is disabled when XML body is empty', () => {
    render(<MappingNodeGraphEditor />)
    const btn = screen.getByText('Import').closest('button')
    expect(btn).toBeDisabled()
  })

  it('importing valid XML calls the import client + renders the imported graph', async () => {
    mockImport.mockResolvedValue(SAMPLE_DESCRIPTOR)
    render(<MappingNodeGraphEditor />)
    const textarea = screen.getByLabelText('Mixxx XML body')
    fireEvent.change(textarea, { target: { value: '<MixxxControllerPreset/>' } })
    fireEvent.click(screen.getByText('Import').closest('button'))
    await waitFor(() => {
      expect(mockImport).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(screen.getByText(/2 of 2 bindings resolved/)).toBeInTheDocument()
    })
  })

  it('export click calls the export client', async () => {
    mockExport.mockResolvedValue({ xml_body: '<xml/>' })
    render(<MappingNodeGraphEditor packId="edirol-ua" model="ua-1000" />)
    fireEvent.click(screen.getByText('Export to Mixxx XML'))
    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledWith({ pack_id: 'edirol-ua', model: 'ua-1000' })
    })
    await waitFor(() => {
      expect(screen.getByText('Download XML')).toBeInTheDocument()
    })
  })

  it('shows skip-reasons summary when import returns skipped bindings', async () => {
    mockImport.mockResolvedValue({
      ...SAMPLE_DESCRIPTOR,
      stats: {
        total_controls: 5,
        resolved_controls: 3,
        skipped_controls: 2,
        skip_reasons: ['[Sampler1].play not supported', '[AutoDJ].shuffle_playlist not supported'],
      },
    })
    render(<MappingNodeGraphEditor />)
    const textarea = screen.getByLabelText('Mixxx XML body')
    fireEvent.change(textarea, { target: { value: 'x' } })
    fireEvent.click(screen.getByText('Import').closest('button'))
    await waitFor(() => {
      expect(screen.getByText('2 bindings skipped')).toBeInTheDocument()
    })
  })

  it('shows an error notification when import fails', async () => {
    mockImport.mockRejectedValue(new Error('boom'))
    render(<MappingNodeGraphEditor />)
    const textarea = screen.getByLabelText('Mixxx XML body')
    fireEvent.change(textarea, { target: { value: 'x' } })
    fireEvent.click(screen.getByText('Import').closest('button'))
    await waitFor(() => {
      expect(screen.getByText('Mapping editor error')).toBeInTheDocument()
    })
  })
})
