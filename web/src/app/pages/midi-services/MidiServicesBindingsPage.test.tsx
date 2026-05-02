/**
 * T2483 loop 17 / iter 167 — interactive tests for the iter-103
 * MidiServicesBindingsPage filter form (T2483-10A).
 *
 * Mock midiBindingsApi at the module level (not fetch). Wrap in
 * MemoryRouter + QueryClientProvider so React Router's useSearchParams
 * + TanStack Query's useQuery work.
 *
 * Iter 168 adds the mutation-flow tests (Add binding, per-row Edit /
 * Toggle / Delete).
 */

import '@testing-library/jest-dom'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

const mockList = jest.fn()
const mockCount = jest.fn(async () => 0)
const mockMatrix = jest.fn(async () => ({ matrix: {}, total_bindings: 0 }))

jest.mock('../../../map2/clients/midiBindings', () => {
  const actual = jest.requireActual('../../../map2/clients/midiBindings')
  return {
    ...actual,
    midiBindingsApi: {
      list: (...args: unknown[]) => mockList(...args),
      count: (...args: unknown[]) => mockCount(...args),
      matrix: (...args: unknown[]) => mockMatrix(...args),
      get: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      enable: jest.fn(),
      disable: jest.fn(),
    },
  }
})

import { MidiServicesBindingsPage } from './MidiServicesBindingsPage'

function renderPage(initialPath = '/midi/bindings') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={client}>
        <MidiServicesBindingsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockList.mockReset()
  mockList.mockResolvedValue([])
  mockCount.mockReset()
  mockCount.mockResolvedValue(0)
  mockMatrix.mockReset()
  mockMatrix.mockResolvedValue({ matrix: {}, total_bindings: 0 })
})

describe('MidiServicesBindingsPage filter form', () => {
  it('renders the page header + filter strategy dropdown', () => {
    const { container } = renderPage()
    // The 'Bindings' text appears in both the page title heading and
    // the Modal chrome, so target the page title via its CSS class.
    const title = container.querySelector('.midi-services-bindings__title')
    expect(title).not.toBeNull()
    expect(title?.textContent).toBe('Bindings')
    expect(screen.getByText('Filter strategy')).toBeInTheDocument()
  })

  it("does not call midiBindingsApi.list when no filter strategy is picked", () => {
    renderPage()
    expect(mockList).not.toHaveBeenCalled()
  })

  it('shows the empty-state guidance when no filter strategy is picked', () => {
    renderPage()
    expect(
      screen.getByText(/Pick a filter strategy above to load bindings/i),
    ).toBeInTheDocument()
  })

  it('preselects consumer strategy when ?consumer_type=plugin_param is in the URL', async () => {
    renderPage('/midi/bindings?consumer_type=plugin_param')
    // Confirm the API was called with the right consumer_type.
    await waitFor(() => expect(mockList).toHaveBeenCalled())
    const call = mockList.mock.calls[0][0]
    expect(call.consumer_type).toBe('plugin_param')
    // consumer_id defaults to '*' per iter-103 EMPTY_FILTER.
    expect(call.consumer_id).toBe('*')
  })

  it('preselects device strategy when ?device_id=usb-1 is in the URL', async () => {
    renderPage('/midi/bindings?device_id=usb-1')
    await waitFor(() => expect(mockList).toHaveBeenCalled())
    const call = mockList.mock.calls[0][0]
    expect(call.device_id).toBe('usb-1')
  })

  it('preselects scope strategy when ?scope=node is in the URL', async () => {
    renderPage('/midi/bindings?scope=node&scope_id=local')
    await waitFor(() => expect(mockList).toHaveBeenCalled())
    const call = mockList.mock.calls[0][0]
    expect(call.scope).toBe('node')
    expect(call.scope_id).toBe('local')
  })

  it('renders matching binding rows when the API returns data', async () => {
    mockList.mockResolvedValue([
      {
        binding_id: 'b1',
        consumer_type: 'plugin_param',
        consumer_id: 'lv2:foo:0',
        consumer_label: 'Cabinet gain',
        source_type: 'midi_cc',
        source_descriptor: { cc: 7 },
        target_type: 'engine_param',
        target_descriptor: { plugin_uri: 'lv2:foo', param_index: 0 },
        device_id: null,
        scope: 'global',
        scope_id: null,
        enabled: true,
        source: 'manual',
        metadata: {},
        created_at: '2026-05-02',
        created_by: 'web-ui',
        modified_at: '2026-05-02',
        modified_by: 'web-ui',
      },
    ])
    renderPage('/midi/bindings?consumer_type=plugin_param')
    await waitFor(() =>
      expect(screen.getByText('plugin_param:lv2:foo:0')).toBeInTheDocument(),
    )
  })

  it('client-side filters by source_type when ?source_type=midi_note is in the URL', async () => {
    mockList.mockResolvedValue([
      {
        binding_id: 'b1',
        consumer_type: 'plugin_param',
        consumer_id: 'lv2:foo:0',
        consumer_label: 'a',
        source_type: 'midi_cc',
        source_descriptor: {},
        target_type: 'engine_param',
        target_descriptor: {},
        device_id: null,
        scope: 'global',
        scope_id: null,
        enabled: true,
        source: 'manual',
        metadata: {},
        created_at: '2026-05-02',
        created_by: 'web-ui',
        modified_at: '2026-05-02',
        modified_by: 'web-ui',
      },
      {
        binding_id: 'b2',
        consumer_type: 'plugin_param',
        consumer_id: 'lv2:foo:1',
        consumer_label: 'b',
        source_type: 'midi_note',
        source_descriptor: {},
        target_type: 'engine_param',
        target_descriptor: {},
        device_id: null,
        scope: 'global',
        scope_id: null,
        enabled: true,
        source: 'manual',
        metadata: {},
        created_at: '2026-05-02',
        created_by: 'web-ui',
        modified_at: '2026-05-02',
        modified_by: 'web-ui',
      },
    ])
    renderPage('/midi/bindings?consumer_type=plugin_param&source_type=midi_note')
    await waitFor(() =>
      expect(screen.getByText('plugin_param:lv2:foo:1')).toBeInTheDocument(),
    )
    // The midi_cc row should be filtered out client-side.
    expect(screen.queryByText('plugin_param:lv2:foo:0')).not.toBeInTheDocument()
  })
})
