/**
 * T2499-C Slice 4 — DataTable picker tests.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

import {
  AvdeccDataTablePicker,
  entityRole,
  suggestForBrainInput,
} from './AvdeccDataTablePicker'
import type { AvbAvdeccEntity } from '../../../components/AvbRouting/types/endpoint'

function makeEntity(overrides: Partial<AvbAvdeccEntity> = {}): AvbAvdeccEntity {
  return {
    entity_id: '0010fa0000000001',
    entity_model_id: 'fa00000000000000',
    entity_name: 'Test Entity',
    firmware_version: '1.0.0-sim',
    mac_address: '00:11:22:33:44:55',
    capabilities: {
      talker_streams: 4,
      listener_streams: 4,
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

// ---------------------------------------------------------------------------
// entityRole
// ---------------------------------------------------------------------------

describe('entityRole', () => {
  it('returns talker for talker-only entities', () => {
    expect(
      entityRole(
        makeEntity({
          capabilities: {
            talker_streams: 8,
            listener_streams: 0,
            is_audio_talker: true,
            is_audio_listener: false,
            gptp_supported: true,
          },
        }),
      ),
    ).toBe('talker')
  })

  it('returns listener for listener-only entities', () => {
    expect(
      entityRole(
        makeEntity({
          capabilities: {
            talker_streams: 0,
            listener_streams: 8,
            is_audio_talker: false,
            is_audio_listener: true,
            gptp_supported: true,
          },
        }),
      ),
    ).toBe('listener')
  })

  it('returns bidir for both-role entities', () => {
    expect(entityRole(makeEntity())).toBe('bidir')
  })

  it('returns idle for neither-role entities', () => {
    expect(
      entityRole(
        makeEntity({
          capabilities: {
            talker_streams: 0,
            listener_streams: 0,
            is_audio_talker: false,
            is_audio_listener: false,
            gptp_supported: false,
          },
        }),
      ),
    ).toBe('idle')
  })
})

// ---------------------------------------------------------------------------
// suggestForBrainInput
// ---------------------------------------------------------------------------

describe('suggestForBrainInput', () => {
  it('suggests entities whose name contains a known keyword (talker)', () => {
    expect(
      suggestForBrainInput(makeEntity({ entity_name: 'Drum kit AVB' })),
    ).toBe(true)
    expect(
      suggestForBrainInput(makeEntity({ entity_name: 'Lead vox mic' })),
    ).toBe(true)
  })

  it('does not suggest pure listeners even when keyword matches', () => {
    expect(
      suggestForBrainInput(
        makeEntity({
          entity_name: 'Drum aux return',
          capabilities: {
            talker_streams: 0,
            listener_streams: 8,
            is_audio_talker: false,
            is_audio_listener: true,
            gptp_supported: true,
          },
        }),
      ),
    ).toBe(false)
  })

  it('does not suggest entities whose name has no keyword', () => {
    expect(
      suggestForBrainInput(makeEntity({ entity_name: 'Q-SYS Core 110f' })),
    ).toBe(false)
  })

  it('does not suggest empty-name entities', () => {
    expect(suggestForBrainInput(makeEntity({ entity_name: '' }))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Picker component — render + sort + filter + bind
// ---------------------------------------------------------------------------

describe('AvdeccDataTablePicker', () => {
  function entities() {
    return [
      makeEntity({
        entity_id: '0010fa0000000001',
        entity_name: 'Q-SYS Core 110f',
        mac_address: '00:d0:88:12:34:56',
      }),
      makeEntity({
        entity_id: '0010fa0000000002',
        entity_name: 'Snare drum mic',
        mac_address: '00:10:fa:aa:bb:cc',
        capabilities: {
          talker_streams: 1,
          listener_streams: 0,
          is_audio_talker: true,
          is_audio_listener: false,
          gptp_supported: true,
        },
      }),
      makeEntity({
        entity_id: '0010fa0000000003',
        entity_name: 'L-Acoustics P1',
        mac_address: '00:0a:35:11:22:33',
        capabilities: {
          talker_streams: 0,
          listener_streams: 16,
          is_audio_talker: false,
          is_audio_listener: true,
          gptp_supported: true,
        },
      }),
    ]
  }

  it('renders one row per entity', () => {
    render(
      <AvdeccDataTablePicker entities={entities()} onSelectEntity={() => {}} />,
    )
    expect(screen.queryAllByTestId(/^avdecc-picker-row-/).length).toBe(3)
  })

  it('floats suggested rows to the top', () => {
    render(
      <AvdeccDataTablePicker entities={entities()} onSelectEntity={() => {}} />,
    )
    const rows = screen.queryAllByTestId(/^avdecc-picker-row-/)
    // 'Snare drum mic' is a talker with a keyword → suggested.
    expect(rows[0].getAttribute('data-testid')).toContain('0010fa0000000002')
    expect(rows[0].getAttribute('data-suggested')).toBe('true')
  })

  it('renders a Suggested tag on suggested rows only', () => {
    render(
      <AvdeccDataTablePicker entities={entities()} onSelectEntity={() => {}} />,
    )
    const tagElements = screen.queryAllByText('Suggested')
    expect(tagElements.length).toBe(1)
  })

  it('extracts vendor from MAC OUI prefix', () => {
    render(
      <AvdeccDataTablePicker entities={entities()} onSelectEntity={() => {}} />,
    )
    expect(screen.queryByText('QSC')).not.toBeNull() // 00:d0:88
    expect(screen.queryByText('Apple/MOTU')).not.toBeNull() // 00:10:fa
    expect(screen.queryByText('L-Acoustics')).not.toBeNull() // 00:0a:35
  })

  it('filters by name', () => {
    render(
      <AvdeccDataTablePicker entities={entities()} onSelectEntity={() => {}} />,
    )
    const filter = screen.getByPlaceholderText('name, vendor, role…') as HTMLInputElement
    fireEvent.change(filter, { target: { value: 'snare' } })
    const rows = screen.queryAllByTestId(/^avdecc-picker-row-/)
    expect(rows.length).toBe(1)
    expect(rows[0].getAttribute('data-testid')).toContain('0010fa0000000002')
  })

  it('shows no-match copy when filter matches nothing', () => {
    render(
      <AvdeccDataTablePicker entities={entities()} onSelectEntity={() => {}} />,
    )
    const filter = screen.getByPlaceholderText('name, vendor, role…') as HTMLInputElement
    fireEvent.change(filter, { target: { value: 'xyzzy' } })
    expect(screen.queryByTestId('avdecc-picker-no-match')).not.toBeNull()
  })

  it('fires onSelectEntity with the bound entity', () => {
    const onSelect = jest.fn()
    render(
      <AvdeccDataTablePicker entities={entities()} onSelectEntity={onSelect} />,
    )
    fireEvent.click(screen.getByTestId('avdecc-picker-bind-0010fa0000000001'))
    expect(onSelect).toHaveBeenCalled()
    expect(onSelect.mock.calls[0][0].entity_id).toBe('0010fa0000000001')
  })
})
