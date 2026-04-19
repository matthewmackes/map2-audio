import fs from 'node:fs'
import path from 'node:path'

import { OUTBOARD_HARDWARE_HERO_IMAGES } from './outboardHardwareHeroImages'
import { PHYSICAL_SURFACE_HERO_IMAGES } from './physicalSurfacesHeroImages'

function resolvePublicAsset(absoluteImagePath: string): string {
  return path.resolve(__dirname, '../../../public', `.${absoluteImagePath}`)
}

describe('hero image assets', () => {
  it('keeps every physical surface hero image path backed by a committed public asset', () => {
    for (const heroImage of Object.values(PHYSICAL_SURFACE_HERO_IMAGES)) {
      expect(fs.existsSync(resolvePublicAsset(heroImage.imagePath))).toBe(true)
    }
  })

  it('keeps every outboard hardware hero image path backed by a committed public asset', () => {
    for (const heroImage of Object.values(OUTBOARD_HARDWARE_HERO_IMAGES)) {
      expect(fs.existsSync(resolvePublicAsset(heroImage.imagePath))).toBe(true)
    }
  })
})
