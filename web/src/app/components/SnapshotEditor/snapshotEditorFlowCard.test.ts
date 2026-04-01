import {
  FLOW_CARD_CLIP_HOLD_MS,
  FLOW_CARD_CLIP_LED_COLOR,
  FLOW_CARD_LED_COLOR,
  FLOW_CARD_SLOT_COLORS,
  buildFlowCardMetadataItems,
  buildFlowCardMetadataLine,
  normalizeFlowCardLabel,
  resolveFlowEdgeClipTimestamp,
  resolveFlowClipTimestamp,
  validateFlowCardLabel,
} from './snapshotEditorFlowCard'

describe('snapshotEditorFlowCard helpers', () => {
  it('builds the desktop metadata strip in the approved order', () => {
    const items = buildFlowCardMetadataItems({
      flowSummary: '3 loaded blocks',
      isActive: true,
      activeAudio: true,
      branchLabel: 'Selected branch',
      secondaryAnnotation: '100% blend',
      ioLabel: '2 in / 2 out',
      clockLabel: '48K / 256',
      routingMode: 'MIX',
      avbLabel: 'Local only',
    })

    expect(items).toEqual([
      '3 loaded blocks',
      'Selected',
      'Live path',
      '100% blend',
      'I/O routing',
      '2 in / 2 out',
      '48K / 256',
      'MIX',
      'LOCAL ONLY',
    ])

    expect(buildFlowCardMetadataLine({
      flowSummary: '3 loaded blocks',
      isActive: true,
      activeAudio: true,
      branchLabel: 'Selected branch',
      secondaryAnnotation: '100% blend',
      ioLabel: '2 in / 2 out',
      clockLabel: '48K / 256',
      routingMode: 'MIX',
      avbLabel: 'Local only',
    })).toBe('3 loaded blocks / Selected / Live path / 100% blend / I/O routing / 2 in / 2 out / 48K / 256 / MIX / LOCAL ONLY')
  })

  it('keeps the flow-card LED and slot palette theme-driven', () => {
    expect(FLOW_CARD_LED_COLOR).toBe('var(--cds-link-primary)')
    expect(FLOW_CARD_CLIP_LED_COLOR).toBe('var(--cds-support-warning)')
    expect(FLOW_CARD_CLIP_HOLD_MS).toBe(1000)

    expect(FLOW_CARD_SLOT_COLORS).toHaveLength(6)
    expect(
      FLOW_CARD_SLOT_COLORS.every((entry) => (
        entry.color.includes('var(') || entry.color.includes('color-mix(')
      )),
    ).toBe(true)
    expect(
      FLOW_CARD_SLOT_COLORS.every((entry) => entry.bg.includes('color-mix(')),
    ).toBe(true)
  })

  it('holds flow clip state for one second after the clipping peak clears', () => {
    const plugins = [{ uri: 'urn:test:drive', position: 2 }]
    const clippingPeaks = [{ uri: 'urn:test:drive', pluginPosition: 2, isClipping: true }]
    const quietPeaks = [{ uri: 'urn:test:drive', pluginPosition: 2, isClipping: false }]

    const clippedAt = resolveFlowClipTimestamp(plugins, clippingPeaks, null, 1_000)
    expect(clippedAt).toBe(1_000)

    expect(resolveFlowClipTimestamp(plugins, quietPeaks, clippedAt, 1_500)).toBe(1_000)
    expect(resolveFlowClipTimestamp(plugins, quietPeaks, clippedAt, 2_100)).toBeNull()
  })

  it('tracks separate input and output clip hold state using edge-aware port symbols', () => {
    const plugins = [
      { uri: 'urn:test:drive', position: 0 },
      { uri: 'urn:test:delay', position: 1 },
    ]
    const inputPeaks = [
      { uri: 'urn:test:drive', pluginPosition: 0, portSymbol: 'input_left', isClipping: true },
      { uri: 'urn:test:delay', pluginPosition: 1, portSymbol: 'output_left', isClipping: false },
    ]
    const outputPeaks = [
      { uri: 'urn:test:drive', pluginPosition: 0, portSymbol: 'input_left', isClipping: false },
      { uri: 'urn:test:delay', pluginPosition: 1, portSymbol: 'output_left', isClipping: true },
    ]

    const inputClippedAt = resolveFlowEdgeClipTimestamp(plugins, inputPeaks, 'input', null, 2_000)
    const outputClippedAt = resolveFlowEdgeClipTimestamp(plugins, outputPeaks, 'output', null, 2_000)

    expect(inputClippedAt).toBe(2_000)
    expect(outputClippedAt).toBe(2_000)
    expect(resolveFlowEdgeClipTimestamp(plugins, outputPeaks, 'input', inputClippedAt, 2_300)).toBe(2_000)
    expect(resolveFlowEdgeClipTimestamp(plugins, inputPeaks, 'output', outputClippedAt, 3_200)).toBeNull()
  })

  it('trims channel labels and rejects sibling collisions', () => {
    expect(normalizeFlowCardLabel('  Lead  ')).toBe('Lead')
    expect(validateFlowCardLabel('  ', 'flow-a', [{ id: 'flow-a', label: 'A' }])).toBe('Channel name is required.')
    expect(validateFlowCardLabel('Lead', 'flow-a', [
      { id: 'flow-a', label: 'A' },
      { id: 'flow-b', label: 'Lead' },
    ])).toBe('Channel names must be unique within this snapshot.')
    expect(validateFlowCardLabel('Clean', 'flow-a', [
      { id: 'flow-a', label: 'A' },
      { id: 'flow-b', label: 'Lead' },
    ])).toBeNull()
  })
})
