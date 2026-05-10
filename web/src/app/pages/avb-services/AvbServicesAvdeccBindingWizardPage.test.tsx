/**
 * T2499-C wizard route mount tests.
 *
 * Verifies the page composes substrate panel + wizard + binding writer
 * end-to-end, with prop-injected stubs replacing the live fetch /
 * TanStack Query plumbing.
 */
import '@testing-library/jest-dom'
import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { AvbServicesAvdeccBindingWizardPage } from './AvbServicesAvdeccBindingWizardPage'
import { ToastProvider } from '../../components/Toasts'
import type { AvbAvdeccEntity } from '../../components/AvbRouting/types/endpoint'
import type { AvdeccBindingWizardDataSource } from './AvdeccBindingWizard/AvdeccBindingWizard'
import type { SubstrateState } from './AvdeccBindingWizard/AvdeccSubstratePanel'
import type { AvdeccBindingClient } from './AvdeccBindingWizard/avdeccBindingWriter'

beforeAll(() => {
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    })
  }
})

function makeEntity(overrides: Partial<AvbAvdeccEntity> = {}): AvbAvdeccEntity {
  return {
    entity_id: '0x91e0f000fe000001',
    entity_model_id: '0x0000fe9100000001',
    entity_name: 'Studio Mic Pre',
    firmware_version: '1.0.0',
    mac_address: '91:e0:f0:00:fe:01',
    capabilities: {
      talker_streams: 2,
      listener_streams: 0,
      is_audio_talker: true,
      is_audio_listener: false,
      gptp_supported: true,
    },
    ptp: { grandmaster_id: '0x91e0f0fffe000001', domain: 0 },
    available: true,
    last_seen: '2026-05-10T00:00:00Z',
    ...overrides,
  }
}

function makeSubstrate(overrides: Partial<SubstrateState> = {}): SubstrateState {
  return {
    interface: { name: 'eth0', up: true },
    ptp: { locked: true, offset_ns: 12, grandmaster_id: '0x91e0f0fffe000001' },
    entity_count: 1,
    source: 'avdecc_simulator',
    origin: 'small',
    ...overrides,
  }
}

function renderWithProviders(node: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/avb/avdecc/binding-wizard']}>
        <ToastProvider>{node}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AvbServicesAvdeccBindingWizardPage', () => {
  it('renders the heading + substrate panel + wizard with one-click tile', () => {
    const entity = makeEntity()
    const dataSource: AvdeccBindingWizardDataSource = {
      useEntities: () => ({
        entities: [entity],
        isLoading: false,
        error: null,
        enabled: true,
      }),
    }
    renderWithProviders(
      <AvbServicesAvdeccBindingWizardPage
        dataSource={dataSource}
        substrateState={makeSubstrate()}
      />,
    )
    expect(
      screen.getByTestId('avb-services-avdecc-binding-wizard-page'),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Discover AVDECC devices').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByTestId('avdecc-substrate-panel')).toBeInTheDocument()
    expect(screen.getByTestId('avdecc-wizard-one-click')).toBeInTheDocument()
  })

  it('exposes the slot dropdown + notes input as the binding controls', () => {
    const dataSource: AvdeccBindingWizardDataSource = {
      useEntities: () => ({
        entities: [],
        isLoading: false,
        error: null,
        enabled: true,
      }),
    }
    renderWithProviders(
      <AvbServicesAvdeccBindingWizardPage
        dataSource={dataSource}
        substrateState={makeSubstrate()}
      />,
    )
    expect(screen.getByTestId('avdecc-wizard-binding-controls')).toBeInTheDocument()
    expect(screen.getByTestId('avdecc-wizard-slot-dropdown')).toBeInTheDocument()
    expect(screen.getByTestId('avdecc-wizard-notes-input')).toBeInTheDocument()
  })

  it('submits a Brain-input binding when the Bind button is clicked + surfaces success', async () => {
    const entity = makeEntity()
    const dataSource: AvdeccBindingWizardDataSource = {
      useEntities: () => ({
        entities: [entity],
        isLoading: false,
        error: null,
        enabled: true,
      }),
    }
    const created: unknown[] = []
    const bindingClient: AvdeccBindingClient = {
      list: async () => [],
      create: async (payload) => {
        created.push(payload)
        return { id: 'binding-1', payload }
      },
    }
    renderWithProviders(
      <AvbServicesAvdeccBindingWizardPage
        dataSource={dataSource}
        substrateState={makeSubstrate()}
        bindingClient={bindingClient}
      />,
    )
    fireEvent.click(screen.getByTestId('avdecc-wizard-bind'))
    await waitFor(() => {
      expect(created).toHaveLength(1)
    })
    expect(created[0]).toMatchObject({
      source_type: 'avdecc_stream',
      consumer_type: 'brain_slot',
      consumer_descriptor: { brain_slot_id: 0 },
      provenance: 'avdecc_binding_wizard',
    })
    await waitFor(() => {
      expect(screen.getByTestId('avdecc-wizard-last-bound')).toBeInTheDocument()
    })
  })

  it('treats an existing matching binding as a duplicate (no double-create)', async () => {
    const entity = makeEntity()
    const dataSource: AvdeccBindingWizardDataSource = {
      useEntities: () => ({
        entities: [entity],
        isLoading: false,
        error: null,
        enabled: true,
      }),
    }
    const existingPayload = {
      source_type: 'avdecc_stream' as const,
      source_descriptor: {
        entity_id: entity.entity_id,
        direction: 'talker' as const,
        talker_streams: entity.capabilities.talker_streams,
        listener_streams: entity.capabilities.listener_streams,
      },
      consumer_type: 'brain_slot' as const,
      consumer_descriptor: { brain_slot_id: 0 },
      scope: 'global' as const,
      provenance: 'avdecc_binding_wizard' as const,
    }
    let createCalls = 0
    const bindingClient: AvdeccBindingClient = {
      list: async () => [{ id: 'pre-existing', payload: existingPayload }],
      create: async () => {
        createCalls += 1
        throw new Error('create() should not be called on a duplicate')
      },
    }
    renderWithProviders(
      <AvbServicesAvdeccBindingWizardPage
        dataSource={dataSource}
        substrateState={makeSubstrate()}
        bindingClient={bindingClient}
      />,
    )
    fireEvent.click(screen.getByTestId('avdecc-wizard-bind'))
    await waitFor(() => {
      expect(screen.getByTestId('avdecc-wizard-last-bound')).toBeInTheDocument()
    })
    expect(createCalls).toBe(0)
  })

  it('renders the disabled banner when the AVDECC service reports enabled=false', () => {
    const dataSource: AvdeccBindingWizardDataSource = {
      useEntities: () => ({
        entities: [],
        isLoading: false,
        error: null,
        enabled: false,
      }),
    }
    renderWithProviders(
      <AvbServicesAvdeccBindingWizardPage
        dataSource={dataSource}
        substrateState={makeSubstrate({ source: 'live', origin: null })}
      />,
    )
    expect(screen.getByTestId('avdecc-wizard-disabled')).toBeInTheDocument()
  })

  it('renders without a substrate state when none is injected and the live query has not resolved', () => {
    const dataSource: AvdeccBindingWizardDataSource = {
      useEntities: () => ({
        entities: [],
        isLoading: false,
        error: null,
        enabled: true,
      }),
    }
    renderWithProviders(
      <AvbServicesAvdeccBindingWizardPage dataSource={dataSource} />,
    )
    expect(
      screen.getByTestId('avb-services-avdecc-binding-wizard-page'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('avdecc-substrate-panel')).toBeNull()
  })
})
