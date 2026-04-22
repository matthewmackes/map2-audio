import fs from 'node:fs'
import path from 'node:path'

import { DEVICE_HERO_IMAGES } from './deviceHeroImages'
import { DEVICE_REGISTRY } from './deviceRegistry'

function resolvePublicAsset(absoluteImagePath: string): string {
  return path.resolve(__dirname, '../../../public', `.${absoluteImagePath}`)
}

describe('unified device hero image assets', () => {
  it('keeps every hero image path backed by a committed public asset', () => {
    for (const heroImage of Object.values(DEVICE_HERO_IMAGES)) {
      expect(fs.existsSync(resolvePublicAsset(heroImage.imagePath))).toBe(true)
    }
  })

  it('maps every hero image key to a real device in the registry', () => {
    const registryIds = new Set(DEVICE_REGISTRY.map((entry) => entry.id))
    for (const key of Object.keys(DEVICE_HERO_IMAGES)) {
      expect(registryIds.has(key)).toBe(true)
    }
  })
})
