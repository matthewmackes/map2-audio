import { decidePreloadGate } from './snapshotEditorPreloadGate'

describe('decidePreloadGate', () => {
  it('passes through when target is not pinned', () => {
    expect(decidePreloadGate({ isPinned: false, isWarm: false })).toBe('passthrough')
    expect(decidePreloadGate({ isPinned: false, isWarm: true })).toBe('passthrough')
  })

  it('passes through when target is pinned and already warm', () => {
    expect(decidePreloadGate({ isPinned: true, isWarm: true })).toBe('passthrough')
  })

  it('warms then activates when target is pinned but cold', () => {
    expect(decidePreloadGate({ isPinned: true, isWarm: false })).toBe('warm-then-activate')
  })
})
