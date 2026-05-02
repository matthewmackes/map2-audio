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
const mockGet = jest.fn()
const mockCreate = jest.fn()
const mockUpdate = jest.fn()
const mockDelete = jest.fn()
const mockEnable = jest.fn()
const mockDisable = jest.fn()

jest.mock('../../../map2/clients/midiBindings', () => {
  const actual = jest.requireActual('../../../map2/clients/midiBindings')
  return {
    ...actual,
    midiBindingsApi: {
      list: (...args: unknown[]) => mockList(...args),
      count: (...args: unknown[]) => mockCount(...args),
      matrix: (...args: unknown[]) => mockMatrix(...args),
      get: (...args: unknown[]) => mockGet(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
      enable: (...args: unknown[]) => mockEnable(...args),
      disable: (...args: unknown[]) => mockDisable(...args),
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
  mockGet.mockReset()
  mockCreate.mockReset()
  mockUpdate.mockReset()
  mockDelete.mockReset()
  mockEnable.mockReset()
  mockDisable.mockReset()
})

const FAKE_BINDING = {
  binding_id: 'b1',
  consumer_type: 'plugin_param' as const,
  consumer_id: 'lv2:foo:0',
  consumer_label: 'Cabinet gain',
  source_type: 'midi_cc' as const,
  source_descriptor: { cc: 7 },
  target_type: 'engine_param' as const,
  target_descriptor: { plugin_uri: 'lv2:foo', param_index: 0 },
  device_id: null,
  scope: 'global' as const,
  scope_id: null,
  enabled: true,
  source: 'manual',
  metadata: {},
  created_at: '2026-05-02',
  created_by: 'web-ui',
  modified_at: '2026-05-02',
  modified_by: 'web-ui',
}

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

// T2483-10B iter 168 — mutation-flow tests.
describe('MidiServicesBindingsPage mutation flows', () => {
  it('Add binding button is present in the page header', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /Add binding/i })).toBeInTheDocument()
  })

  it('clicking Add binding opens the create drawer', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Add binding/i }))
    // Carbon Modal renders 'Create binding' as the modalHeading.
    expect(screen.getByText('Create binding')).toBeInTheDocument()
  })

  it('per-row toggle ON->OFF calls midiBindingsApi.disable', async () => {
    mockList.mockResolvedValue([FAKE_BINDING])
    mockDisable.mockResolvedValue({ ...FAKE_BINDING, enabled: false })
    renderPage('/midi/bindings?consumer_type=plugin_param')
    await waitFor(() =>
      expect(screen.getByText('plugin_param:lv2:foo:0')).toBeInTheDocument(),
    )
    const toggle = screen.getByRole('switch', { name: /Enable binding/i })
    fireEvent.click(toggle)
    await waitFor(() => expect(mockDisable).toHaveBeenCalledWith('b1'))
  })

  it('per-row toggle OFF->ON calls midiBindingsApi.enable', async () => {
    mockList.mockResolvedValue([{ ...FAKE_BINDING, enabled: false }])
    mockEnable.mockResolvedValue({ ...FAKE_BINDING, enabled: true })
    renderPage('/midi/bindings?consumer_type=plugin_param')
    await waitFor(() =>
      expect(screen.getByText('plugin_param:lv2:foo:0')).toBeInTheDocument(),
    )
    const toggle = screen.getByRole('switch', { name: /Enable binding/i })
    fireEvent.click(toggle)
    await waitFor(() => expect(mockEnable).toHaveBeenCalledWith('b1'))
  })

  it('per-row OverflowMenu trigger button is present', async () => {
    mockList.mockResolvedValue([FAKE_BINDING])
    renderPage('/midi/bindings?consumer_type=plugin_param')
    await waitFor(() =>
      expect(screen.getByText('plugin_param:lv2:foo:0')).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: /Row actions/i })).toBeInTheDocument()
  })

  // NOTE: testing the OverflowMenuItem click path inside jsdom requires
  // a Carbon-portal-aware setup that jest-dom alone doesn't provide.
  // The Edit + Delete row actions are instead covered by the iter-152/153
  // Devices-page mutation tests + the iter-105/106 drawer tests which
  // exercise the same iter-104 mutation surface this page uses.
})
