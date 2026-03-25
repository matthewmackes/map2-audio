import { screenRegistry, screenRegistryById } from './screenRegistry'

describe('screenRegistry', () => {
  it('defines home as the entry point and exposes pinned routes', () => {
    expect(screenRegistry[0]?.id).toBe('home')
    expect(screenRegistryById.home.title).toBe('Home')
    expect(screenRegistry.filter((screen) => screen.keyHint).length).toBeGreaterThanOrEqual(9)
  })
})
