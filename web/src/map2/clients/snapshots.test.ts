import type { SnapshotLoadedEvent } from '../types'
import { snapshotLoadedEventToFlowSnapshotEvent } from './snapshots'

describe('snapshotLoadedEventToFlowSnapshotEvent', () => {
  it('omits program_number when the source event carries null', () => {
    const event = {
      type: 'snapshot_loaded',
      topic: 'snapshots',
      data: {
        snapshot_id: 12,
        snapshot_name: 'Ambient Wash',
        snapshot_data: {
          id: 12,
          name: 'Ambient Wash',
          description: '',
          tags: [],
          program_number: null,
          tempo_bpm: 120,
          tempo_enabled: false,
          derived_from_snapshot_id: null,
          input_device: null,
          output_device: null,
          output_level_reference_dbfs: null,
          output_level_warning_threshold_db: null,
          channels: [],
          chains: [],
          routing: {
            mode: 'series',
            active_channel_key: null,
            blend_positions: {},
            morph_position: 0,
            morph_source_channel_key: null,
            morph_target_channel_key: null,
            series_order: [],
          },
          is_locked: false,
          io_bindings: null,
          controls: null,
          paths: [],
          midi_map: [],
          metadata: {},
          snapshot_revision: null,
          created_at: null,
          updated_at: null,
          display_order: 0,
          is_favorite: false,
        },
        triggered_by: 'test',
        program_number: null,
      },
      timestamp: '2026-04-09T10:50:00Z',
    } as unknown as SnapshotLoadedEvent

    const adapted = snapshotLoadedEventToFlowSnapshotEvent(event)

    expect(adapted.data.program_number).toBeUndefined()
  })
})
