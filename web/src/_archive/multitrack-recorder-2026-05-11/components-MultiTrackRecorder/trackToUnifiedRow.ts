/**
 * T2503 Set 10 — DAW track → UnifiedChannelRow adapter.
 *
 * The DAW Mixer view reuses the SnapshotEditor's UnifiedChannelGrid (T710)
 * so operators get the same 8-slot channel-strip language they already know.
 * This adapter is the only seam between the DAW project model and the
 * grid primitive — keep it pure / dependency-free.
 *
 * Category resolution: we don't yet have a plugin-meta inventory for DAW
 * (Set 9 lands the shared scanner). For now, plugin display names map to a
 * lightweight category guess via keyword match. When Set 9 ships, swap
 * `guessCategoryFromUri` for a real registry lookup.
 */
import type { MAP2Category } from '../SnapshotEditor/categoryHues'
import {
  type UnifiedChannelRow,
  type UnifiedSlot,
  SLOT_COUNT,
  makeEmptySlot,
} from '../SnapshotEditor/UnifiedChannelGrid/gridConstants'

import type { DawTrack } from '../../stores/dawProjectStore'

const CATEGORY_KEYWORDS: Array<{ pattern: RegExp; category: MAP2Category }> = [
  { pattern: /reverb|hall|plate|room/i, category: 'Reverb' },
  { pattern: /delay|echo|tape/i, category: 'Delay' },
  { pattern: /eq|equaliz|filter/i, category: 'EQ' },
  { pattern: /comp(ressor)?|limit|gate/i, category: 'Dynamics' },
  { pattern: /distort|fuzz|overdrive|saturat/i, category: 'Distortion' },
  { pattern: /chorus|flange|phaser|tremolo|modulat/i, category: 'Modulation' },
  { pattern: /amp(lifier)?|preamp/i, category: 'Amplifier' },
  { pattern: /cab(inet)?|ir\b/i, category: 'Cabinet' },
  { pattern: /pitch|harmoniz|shift/i, category: 'Pitch' },
  { pattern: /synth|inst(rument)?|sampler/i, category: 'Instrument' },
  { pattern: /drum|kick|snare|perc/i, category: 'Drums' },
  { pattern: /avb|stream|talker|listener/i, category: 'AVB' },
  { pattern: /multi|combo|suite/i, category: 'Multi-Effect' },
  { pattern: /gain|volume|trim|util/i, category: 'Utility' },
]

function guessCategory(displayName: string, uri: string): MAP2Category | null {
  const haystack = `${displayName} ${uri}`
  for (const entry of CATEGORY_KEYWORDS) {
    if (entry.pattern.test(haystack)) {
      return entry.category
    }
  }
  return null
}

export function dawTrackChainId(trackId: number): string {
  return `daw-track-${trackId}`
}

export function trackToUnifiedRow(track: DawTrack): UnifiedChannelRow {
  const slots: UnifiedSlot[] = Array.from({ length: SLOT_COUNT }, (_, i) => makeEmptySlot(i))
  track.plugins.slice(0, SLOT_COUNT).forEach((plugin) => {
    const idx = Math.min(SLOT_COUNT - 1, Math.max(0, plugin.slot_index))
    slots[idx] = {
      index: idx,
      kind: 'plugin',
      uri: plugin.uri,
      label: plugin.display_name,
      category: guessCategory(plugin.display_name, plugin.uri),
      bypass: plugin.bypass,
      sidechainSourceLabel: null,
      cpuPercent: 0,
    }
  })
  return {
    id: dawTrackChainId(track.id),
    name: track.name,
    ioLabel: track.type === 'audio' ? 'Audio' : 'MIDI',
    muted: track.muted,
    solo: track.solo,
    stereo: track.type === 'audio',
    slots,
  }
}
