import { applyFlowSlotUpdate } from './snapshotFlowSlots'

describe('snapshotFlowSlots', () => {
  it('enforces a single solo channel when enabling solo on another flow', () => {
    const result = applyFlowSlotUpdate([
      { id: 'flow-a', solo: true, muted: false, label: 'A' },
      { id: 'flow-b', solo: false, muted: false, label: 'B' },
    ], 'flow-b', { solo: true })

    expect(result.changed).toBe(true)
    expect(result.nextFlowSlots).toEqual([
      { id: 'flow-a', solo: false, muted: false, label: 'A' },
      { id: 'flow-b', solo: true, muted: false, label: 'B' },
    ])
  })

  it('does not clear other flows when updating a non-solo field', () => {
    const result = applyFlowSlotUpdate([
      { id: 'flow-a', solo: true, muted: false, label: 'A' },
      { id: 'flow-b', solo: false, muted: false, label: 'B' },
    ], 'flow-b', { muted: true })

    expect(result.changed).toBe(true)
    expect(result.nextFlowSlots).toEqual([
      { id: 'flow-a', solo: true, muted: false, label: 'A' },
      { id: 'flow-b', solo: false, muted: true, label: 'B' },
    ])
  })

  it('reports unchanged when the requested update matches the current flow state', () => {
    const result = applyFlowSlotUpdate([
      { id: 'flow-a', solo: false, muted: false, label: 'A' },
    ], 'flow-a', { solo: false })

    expect(result.changed).toBe(false)
    expect(result.nextFlowSlots).toEqual([
      { id: 'flow-a', solo: false, muted: false, label: 'A' },
    ])
  })
})
