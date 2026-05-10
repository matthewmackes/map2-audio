/**
 * T2499-C Slice 3 — AvdeccBindingWizard tests.
 *
 * Validates render branches + tier classification + entity-select callback.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

import {
  AvdeccBindingWizard,
  type AvdeccBindingWizardDataSource,
  classifyTier,
} from './AvdeccBindingWizard'
import type { AvbAvdeccEntity } from '../../../components/AvbRouting/types/endpoint'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntity(
  overrides: Partial<AvbAvdeccEntity> = {},
): AvbAvdeccEntity {
  return {
    entity_id: '0010fa0000000001',
    entity_model_id: 'fa00000000000000',
    entity_name: 'Test Entity',
    firmware_version: '1.0.0-sim',
    mac_address: '00:11:22:33:44:55',
    capabilities: {
      talker_streams: 8,
      listener_streams: 8,
      is_audio_talker: true,
      is_audio_listener: true,
      gptp_supported: true,
    },
    ptp: { grandmaster_id: '0000000000000000', domain: 0 },
    available: true,
    last_seen: '2026-05-10T00:00:00Z',
    source_node_id: 'sim-host',
    ...overrides,
  }
}

function makeDataSource(state: {
  entities?: AvbAvdeccEntity[]
  isLoading?: boolean
  error?: Error | null
  enabled?: boolean
}): AvdeccBindingWizardDataSource {
  return {
    useEntities: () => ({
      entities: state.entities ?? [],
      isLoading: state.isLoading ?? false,
      error: state.error ?? null,
      enabled: state.enabled ?? true,
    }),
  }
}

// ---------------------------------------------------------------------------
// classifyTier — tier locks
// ---------------------------------------------------------------------------

describe('classifyTier', () => {
  it('classifies 0 entities as one_click (empty-state shows separately)', () => {
    expect(classifyTier(0)).toBe('one_click')
  })

  it('classifies 1 entity as one_click', () => {
    expect(classifyTier(1)).toBe('one_click')
  })

  it.each([2, 5, 9])('classifies %i entities as data_table', (count) => {
    expect(classifyTier(count)).toBe('data_table')
  })

  it.each([10, 16, 50])('classifies %i entities as bulk_import', (count) => {
    expect(classifyTier(count)).toBe('bulk_import')
  })
})

// ---------------------------------------------------------------------------
// Render branches
// ---------------------------------------------------------------------------

describe('AvdeccBindingWizard — render branches', () => {
  it('shows the loading state while fetching', () => {
    render(<AvdeccBindingWizard dataSource={makeDataSource({ isLoading: true })} />)
    expect(screen.queryByTestId('avdecc-wizard-loading')).not.toBeNull()
  })

  it('shows an error InlineNotification when fetch fails', () => {
    render(
      <AvdeccBindingWizard
        dataSource={makeDataSource({ error: new Error('controller offline') })}
      />,
    )
    expect(screen.queryByTestId('avdecc-wizard-error')).not.toBeNull()
    expect(screen.queryByText('controller offline')).not.toBeNull()
  })

  it('shows the disabled banner when AVDECC is not enabled', () => {
    render(
      <AvdeccBindingWizard dataSource={makeDataSource({ enabled: false })} />,
    )
    expect(screen.queryByTestId('avdecc-wizard-disabled')).not.toBeNull()
  })

  it('shows the empty state when entities is an empty list', () => {
    render(<AvdeccBindingWizard dataSource={makeDataSource({ entities: [] })} />)
    expect(screen.queryByTestId('avdecc-wizard-empty')).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tier 1 — single entity, one-click bind
// ---------------------------------------------------------------------------

describe('AvdeccBindingWizard — tier 1 (one-click)', () => {
  it('renders a one-click tile when exactly one entity is present', () => {
    render(
      <AvdeccBindingWizard
        dataSource={makeDataSource({
          entities: [makeEntity({ entity_name: 'MOTU 16A AVB (sim)' })],
        })}
      />,
    )
    expect(screen.queryByTestId('avdecc-wizard-one-click')).not.toBeNull()
    expect(screen.queryByText('MOTU 16A AVB (sim)')).not.toBeNull()
  })

  it('fires onSelectEntity when the bind button is clicked', () => {
    const entity = makeEntity({ entity_name: 'BindMe' })
    const onSelectEntity = jest.fn()
    render(
      <AvdeccBindingWizard
        dataSource={makeDataSource({ entities: [entity] })}
        onSelectEntity={onSelectEntity}
      />,
    )
    fireEvent.click(screen.getByTestId('avdecc-wizard-bind'))
    expect(onSelectEntity).toHaveBeenCalledWith(entity)
  })

  it('renders capability tags reflecting the entity role', () => {
    const entity = makeEntity({
      capabilities: {
        talker_streams: 16,
        listener_streams: 0,
        is_audio_talker: true,
        is_audio_listener: false,
        gptp_supported: true,
      },
    })
    render(
      <AvdeccBindingWizard
        dataSource={makeDataSource({ entities: [entity] })}
      />,
    )
    expect(screen.queryByText('Talker × 16')).not.toBeNull()
    expect(screen.queryByText('Listener × 0')).toBeNull()
    expect(screen.queryByText('gPTP')).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tier 2 / Tier 3 placeholders
// ---------------------------------------------------------------------------

describe('AvdeccBindingWizard — tier 2/3 picker mount', () => {
  it('renders the DataTable picker for tier 2 (2-9 entities)', () => {
    render(
      <AvdeccBindingWizard
        dataSource={makeDataSource({
          entities: [makeEntity(), makeEntity({ entity_id: '0010fa0000000002' })],
        })}
      />,
    )
    expect(screen.queryByTestId('avdecc-data-table-picker')).not.toBeNull()
  })

  it('renders the same picker for tier 3 (≥10 entities)', () => {
    const entities = Array.from({ length: 12 }, (_, i) =>
      makeEntity({ entity_id: `0010fa00000000${(i + 16).toString(16).padStart(2, '0')}` }),
    )
    render(
      <AvdeccBindingWizard dataSource={makeDataSource({ entities })} />,
    )
    expect(screen.queryByTestId('avdecc-data-table-picker')).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Header tier-tag reflects classification
// ---------------------------------------------------------------------------

describe('AvdeccBindingWizard — header tier tag', () => {
  it('shows "Tier 1 — one-click" for one entity', () => {
    render(
      <AvdeccBindingWizard
        dataSource={makeDataSource({ entities: [makeEntity()] })}
      />,
    )
    expect(screen.getByTestId('avdecc-wizard-tier').textContent).toContain('Tier 1')
  })

  it('shows "Tier 2 — DataTable (5)" for 5 entities', () => {
    const entities = Array.from({ length: 5 }, (_, i) =>
      makeEntity({ entity_id: `0010fa00000000${(i + 1).toString(16).padStart(2, '0')}` }),
    )
    render(<AvdeccBindingWizard dataSource={makeDataSource({ entities })} />)
    expect(screen.getByTestId('avdecc-wizard-tier').textContent).toContain('Tier 2')
    expect(screen.getByTestId('avdecc-wizard-tier').textContent).toContain('5')
  })

  it('shows "Tier 3 — bulk import (16)" for 16 entities', () => {
    const entities = Array.from({ length: 16 }, (_, i) =>
      makeEntity({ entity_id: `0010fa00000000${(i + 1).toString(16).padStart(2, '0')}` }),
    )
    render(<AvdeccBindingWizard dataSource={makeDataSource({ entities })} />)
    expect(screen.getByTestId('avdecc-wizard-tier').textContent).toContain('Tier 3')
    expect(screen.getByTestId('avdecc-wizard-tier').textContent).toContain('16')
  })
})
