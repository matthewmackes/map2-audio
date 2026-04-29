import {
  buildTraceableChannelChainName,
  fallbackPluginLabel,
  formatCompactTimestamp,
  formatInspectorList,
  formatMidiMappingValue,
  getLivePathArrowTone,
  getLivePathBranchLabel,
  getLivePathStateLabel,
  getRoutingFocusFlowSummary,
  parseMidiMappingValue,
  sanitizeTraceableNamePart,
} from './snapshotEditorLiveLabels'

describe('snapshotEditorLiveLabels', () => {
  describe('formatInspectorList', () => {
    it('returns "None" for an empty list', () => {
      expect(formatInspectorList([])).toBe('None')
    })
    it('joins values with comma+space', () => {
      expect(formatInspectorList(['a', 'b', 'c'])).toBe('a, b, c')
    })
  })

  describe('formatMidiMappingValue / parseMidiMappingValue', () => {
    it('renders integer values without a decimal point', () => {
      expect(formatMidiMappingValue(7)).toBe('7')
    })
    it('renders three-decimal precision for fractional values', () => {
      expect(formatMidiMappingValue(0.123456)).toBe('0.123')
    })
    it('falls back to "0" for non-finite values', () => {
      expect(formatMidiMappingValue(NaN)).toBe('0')
      expect(formatMidiMappingValue(Infinity)).toBe('0')
    })
    it('parses numeric strings; falls back when invalid', () => {
      expect(parseMidiMappingValue('3.14', 0)).toBeCloseTo(3.14)
      expect(parseMidiMappingValue('not-a-number', 7)).toBe(7)
    })
  })

  describe('fallbackPluginLabel', () => {
    it('returns "Processor" for null', () => {
      expect(fallbackPluginLabel(null)).toBe('Processor')
    })
    it('humanizes the URI tail', () => {
      expect(fallbackPluginLabel('map2://juce/celestial-compressor')).toBe('celestial compressor')
      expect(fallbackPluginLabel('urn:map2:tweed_bassman_v2')).toBe('urn:map2:tweed bassman v2')
    })
  })

  describe('getLivePathArrowTone', () => {
    it.each([
      [{ sidechainKey: true }, 'sidechain'],
      [{ activeAudio: true }, 'active'],
      [{ dimmed: true }, 'dim'],
      [undefined, 'dim'],
    ] as const)('flowState %p -> %s', (state, expected) => {
      expect(getLivePathArrowTone(state)).toBe(expected)
    })
  })

  describe('getLivePathStateLabel', () => {
    it.each([
      [{ sidechainKey: true }, 'Key'],
      [{ activeAudio: true }, 'Live'],
      [{ dimmed: true }, 'Dim'],
      [{}, null],
      [undefined, null],
    ] as const)('flowState %p -> %s', (state, expected) => {
      expect(getLivePathStateLabel(state)).toBe(expected)
    })
  })

  describe('getLivePathBranchLabel', () => {
    it('returns null when no annotation present', () => {
      expect(getLivePathBranchLabel('series', 'series', undefined)).toBeNull()
      expect(getLivePathBranchLabel('series', 'series', { annotation: undefined })).toBeNull()
    })
    it('returns null when series mode + series/inactive group', () => {
      expect(getLivePathBranchLabel('series', 'series', { annotation: 'A' })).toBeNull()
      expect(getLivePathBranchLabel('series', 'inactive', { annotation: 'A' })).toBeNull()
    })
    it('returns the annotation in non-series modes', () => {
      expect(getLivePathBranchLabel('parallel_blend', 'parallel', { annotation: 'A' })).toBe('A')
      expect(getLivePathBranchLabel('ab_switch', 'ab', { annotation: 'B' })).toBe('B')
    })
  })

  describe('getRoutingFocusFlowSummary', () => {
    it('parallel_blend reports blend percent', () => {
      expect(getRoutingFocusFlowSummary('parallel_blend', 0, 'a', 'a', null, 42)).toBe('42% blend')
    })
    it('ab_switch picks Primary vs Standby branch', () => {
      expect(getRoutingFocusFlowSummary('ab_switch', 0, 'a', 'a', null, 0)).toBe('Primary branch')
      expect(getRoutingFocusFlowSummary('ab_switch', 1, 'b', 'a', null, 0)).toBe('Standby branch')
    })
    it('parameter_morph reports focus / target / context', () => {
      expect(getRoutingFocusFlowSummary('parameter_morph', 0, 'a', 'a', 'b', 0)).toBe('Morph focus')
      expect(getRoutingFocusFlowSummary('parameter_morph', 1, 'b', 'a', 'b', 0)).toBe('Morph target')
      expect(getRoutingFocusFlowSummary('parameter_morph', 2, 'c', 'a', 'b', 0)).toBe('Morph context')
    })
    it('sidechain splits on flow index 0', () => {
      expect(getRoutingFocusFlowSummary('sidechain', 0, 'a', null, null, 0)).toBe('Main audio')
      expect(getRoutingFocusFlowSummary('sidechain', 1, 'b', null, null, 0)).toBe('Sidechain key')
    })
    it('series defaults to Input vs Serial stage', () => {
      expect(getRoutingFocusFlowSummary('series', 0, 'a', null, null, 0)).toBe('Input stage')
      expect(getRoutingFocusFlowSummary('series', 1, 'b', null, null, 0)).toBe('Serial stage')
    })
  })

  describe('sanitizeTraceableNamePart', () => {
    it('returns the fallback for empty / whitespace-only input', () => {
      expect(sanitizeTraceableNamePart(null, 'fallback')).toBe('fallback')
      expect(sanitizeTraceableNamePart('   ', 'fallback')).toBe('fallback')
    })
    it('strips weird characters and collapses whitespace', () => {
      expect(sanitizeTraceableNamePart('  Hello,  World!  ', 'fallback')).toBe('Hello World')
    })
    it('preserves dash and word characters', () => {
      expect(sanitizeTraceableNamePart('Stage-Left-Channel_4', 'fallback')).toBe('Stage-Left-Channel_4')
    })
  })

  describe('formatCompactTimestamp', () => {
    it('formats YYYYMMDD-HHMMSS with zero padding', () => {
      const stamp = formatCompactTimestamp(new Date('2026-04-30T05:07:09'))
      expect(stamp).toBe('20260430-050709')
    })
  })

  describe('buildTraceableChannelChainName', () => {
    it('combines snapshot name + timestamp + channel label', () => {
      const realDate = Date
      try {
        // freeze the clock for deterministic timestamp
        ;(global as unknown as { Date: unknown }).Date = class extends realDate {
          constructor() {
            super('2026-04-30T05:07:09')
          }
          static now() {
            return new realDate('2026-04-30T05:07:09').getTime()
          }
        }
        const name = buildTraceableChannelChainName('My Rig', 'Stage Left')
        expect(name).toBe('My Rig - 20260430-050709 - Channel Stage Left')
      } finally {
        ;(global as unknown as { Date: unknown }).Date = realDate
      }
    })
    it('falls back when inputs are empty / null', () => {
      const realDate = Date
      try {
        ;(global as unknown as { Date: unknown }).Date = class extends realDate {
          constructor() { super('2026-04-30T05:07:09') }
          static now() { return new realDate('2026-04-30T05:07:09').getTime() }
        }
        const name = buildTraceableChannelChainName(null, '')
        expect(name).toBe('Snapshot Editor - 20260430-050709 - Channel A')
      } finally {
        ;(global as unknown as { Date: unknown }).Date = realDate
      }
    })
  })
})
