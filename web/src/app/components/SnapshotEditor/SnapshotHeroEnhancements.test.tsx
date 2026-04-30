import { act, fireEvent, render, screen } from '@testing-library/react'

import {
  buildHeroMetadataRows,
  SnapshotHeroLockButton,
  SnapshotHeroMetadataCluster,
  SnapshotHeroStateRow,
} from './SnapshotHeroEnhancements'
import type { SnapshotDetail, SnapshotPublishReadiness } from '../../../map2/types'

function makeSnapshot(overrides: Partial<SnapshotDetail> = {}): SnapshotDetail {
  const base = {
    id: 1,
    name: '5150andInteFX',
    description: 'Engine designs',
    tags: ['electric', '5150'],
    program_number: 31,
    input_device: 'Default input',
    output_device: 'Default output',
    is_favorite: false,
    is_locked: false,
    display_order: 0,
    channels: [],
    channel_count: 3,
    chain_count: 3,
    community_uuid: null,
    community_shared: false,
    community_download_count: 0,
    community_rating: null,
    community_rating_count: 0,
    chains: [],
    routing: {
      mode: 'ab switch',
      active_channel_key: 'B',
      blend_positions: {},
      morph_position: 1,
      morph_source_channel_key: null,
      morph_target_channel_key: null,
      series_order: [],
    },
    midi_map: [],
    paths: [],
    io_bindings: { input_device: 'Default input', output_device: 'Default output', remap_required: false },
    controls: { midi_map: [], automation_lanes: [], expression_mappings: [], maschine_encoder_map: {
      enc1: null, enc2: null, enc3: null, enc4: null, enc5: null, enc6: null, enc7: null, enc8: null, vol: {}, tempo: {}, swing: null,
    } },
    assets: [],
    live_state: {
      is_live: true,
      activated_at: '2026-04-30T14:02:11Z',
      paths: [],
      runtime_chains: [],
      node_id: 'AUDIO-NODE-8f5eaa99-98B785',
    },
    lineage: { derived_from_snapshot_id: null },
    snapshot_revision: 'a12cc9e24cef2ed9bb526dab677def262217e9ab0bed995fb54faffea5e346b8',
    activated_at: '2026-04-30T14:02:11Z',
    created_at: '2026-04-12T14:02:00Z',
    updated_at: new Date().toISOString(),
    active_channel_index: 0,
  } as unknown as SnapshotDetail
  return { ...base, ...overrides }
}

function makeReadiness(status: SnapshotPublishReadiness['status'] = 'live_confirmed'): SnapshotPublishReadiness {
  return {
    snapshot_id: 1,
    draft_revision_id: 4218,
    requested_revision_id: 4218,
    confirmed_revision_id: 4218,
    status,
    requirements: [],
    blockers: [],
    warnings: [],
    available_repairs: [],
    applicable_steps: [],
  }
}

describe('buildHeroMetadataRows', () => {
  it('returns curated rows for a populated snapshot, mono on hash + host', () => {
    const rows = buildHeroMetadataRows(makeSnapshot(), makeReadiness())
    const ids = rows.map((row) => row.id)
    expect(ids).toContain('save')
    expect(ids).toContain('host')
    expect(ids).toContain('sound')
    expect(ids).toContain('routing')
    expect(ids).toContain('chains')
    expect(ids).toContain('program')
    expect(ids).toContain('tags')
    expect(ids).toContain('created')
    expect(ids).toContain('updated')
    // Activated only renders when status === 'live_confirmed'
    expect(ids).toContain('activated')
    const save = rows.find((row) => row.id === 'save')
    expect(save?.monospace).toBe(true)
    expect(save?.copyValue).toBe('a12cc9e24cef2ed9bb526dab677def262217e9ab0bed995fb54faffea5e346b8')
  })

  it('omits ACTIVATED row when status is not live_confirmed', () => {
    const rows = buildHeroMetadataRows(makeSnapshot(), makeReadiness('ready'))
    expect(rows.map((row) => row.id)).not.toContain('activated')
  })

  it('returns empty list when no snapshot', () => {
    expect(buildHeroMetadataRows(null, null)).toEqual([])
  })

  it('caps at 12 rows', () => {
    const rows = buildHeroMetadataRows(makeSnapshot(), makeReadiness())
    expect(rows.length).toBeLessThanOrEqual(12)
  })
})

describe('SnapshotHeroMetadataCluster', () => {
  it('renders rows + copy button hidden until hover (opacity:0 by default)', () => {
    const onCopy = jest.fn()
    const rows = buildHeroMetadataRows(makeSnapshot(), makeReadiness())
    render(<SnapshotHeroMetadataCluster rows={rows} onCopyValue={onCopy} />)
    expect(screen.getByText('SAVE')).not.toBeNull()
    const copyButton = screen.getByLabelText('Copy save value')
    fireEvent.click(copyButton)
    expect(onCopy).toHaveBeenCalledWith('a12cc9e24cef2ed9bb526dab677def262217e9ab0bed995fb54faffea5e346b8')
  })

  it('renders nothing when rows are empty', () => {
    const { container } = render(<SnapshotHeroMetadataCluster rows={[]} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('SnapshotHeroLockButton', () => {
  it('locks instantly on click when unlocked', () => {
    const onToggle = jest.fn()
    render(<SnapshotHeroLockButton isLocked={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByLabelText('Lock snapshot — prevents edits'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('requires confirm before unlocking', () => {
    const onToggle = jest.fn()
    render(<SnapshotHeroLockButton isLocked onToggle={onToggle} />)
    fireEvent.click(screen.getByLabelText('Unlock snapshot'))
    // Button is replaced by inline confirm row.
    expect(onToggle).not.toHaveBeenCalled()
    expect(screen.getByText('Unlock?')).not.toBeNull()
    fireEvent.click(screen.getByLabelText('Confirm unlock'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('cancel restores the lock button without firing the toggle', () => {
    const onToggle = jest.fn()
    render(<SnapshotHeroLockButton isLocked onToggle={onToggle} />)
    fireEvent.click(screen.getByLabelText('Unlock snapshot'))
    fireEvent.click(screen.getByLabelText('Cancel unlock'))
    expect(onToggle).not.toHaveBeenCalled()
    expect(screen.queryByText('Unlock?')).toBeNull()
  })

  it('auto-reverts the inline confirm after 3 s', () => {
    jest.useFakeTimers()
    try {
      render(<SnapshotHeroLockButton isLocked onToggle={jest.fn()} />)
      fireEvent.click(screen.getByLabelText('Unlock snapshot'))
      expect(screen.getByText('Unlock?')).not.toBeNull()
      act(() => { jest.advanceTimersByTime(3_001) })
      expect(screen.queryByText('Unlock?')).toBeNull()
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('SnapshotHeroStateRow', () => {
  it('renders the live_confirmed pill with active node + activation time in the context line', () => {
    render(
      <SnapshotHeroStateRow
        status="live_confirmed"
        readiness={makeReadiness('live_confirmed')}
        snapshot={makeSnapshot()}
        isLocked={false}
      />,
    )
    expect(screen.getByText('Live · Confirmed')).not.toBeNull()
    expect(screen.getByText(/Active on AUDIO-NODE-8f5eaa99-98B785/)).not.toBeNull()
  })

  it('renders Confirm + Reject for waiting_for_confirmation when unlocked', () => {
    const onConfirm = jest.fn()
    const onReject = jest.fn()
    render(
      <SnapshotHeroStateRow
        status="waiting_for_confirmation"
        readiness={makeReadiness('waiting_for_confirmation')}
        snapshot={makeSnapshot()}
        isLocked={false}
        onConfirm={onConfirm}
        onReject={onReject}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(onConfirm).toHaveBeenCalled()
    expect(onReject).toHaveBeenCalled()
  })

  it('hides action buttons when locked', () => {
    render(
      <SnapshotHeroStateRow
        status="waiting_for_confirmation"
        readiness={makeReadiness('waiting_for_confirmation')}
        snapshot={makeSnapshot()}
        isLocked
        onConfirm={jest.fn()}
        onReject={jest.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull()
    expect(screen.getByText('Waiting for confirmation')).not.toBeNull()
  })

  it('renders View errors action for blocked with blocker count in context line', () => {
    const onViewErrors = jest.fn()
    const readiness = makeReadiness('blocked')
    readiness.blockers = [
      { code: 'plugin_unavailable', severity: 'blocking', message: 'missing plugin', scope: 'cluster' } as unknown as SnapshotPublishReadiness['blockers'][number],
      { code: 'plugin_unavailable', severity: 'blocking', message: 'missing plugin', scope: 'cluster' } as unknown as SnapshotPublishReadiness['blockers'][number],
    ]
    render(
      <SnapshotHeroStateRow
        status="blocked"
        readiness={readiness}
        snapshot={makeSnapshot()}
        isLocked={false}
        onViewErrors={onViewErrors}
      />,
    )
    expect(screen.getByText(/2 blocks failed to load/)).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /View errors/ }))
    expect(onViewErrors).toHaveBeenCalled()
  })
})
