import fs from 'node:fs'
import path from 'node:path'

import { DEVICE_HERO_IMAGES } from './deviceHeroImages'
import { LEGACY_DEVICE_MANIFEST } from './legacyDeviceManifest'

function resolvePublicAsset(absoluteImagePath: string): string {
  return path.resolve(__dirname, '../../../public', `.${absoluteImagePath}`)
}

describe('unified device hero image assets', () => {
  it('keeps every hero image path backed by a committed public asset', () => {
    for (const heroImage of Object.values(DEVICE_HERO_IMAGES)) {
      expect(fs.existsSync(resolvePublicAsset(heroImage.imagePath))).toBe(true)
    }
  })

  it('maps every hero image key to a real legacy device manifest id', () => {
    const manifestIds = new Set(LEGACY_DEVICE_MANIFEST.map((entry) => entry.id))
    for (const key of Object.keys(DEVICE_HERO_IMAGES)) {
      // Hero images may also exist for profile-registry-driven devices
      // (id contains slash/dot). Manifest-based check applies only to
      // the legacy hand-coded device ids.
      const looksLikeProfileKey = key.includes('/') || key.includes('.')
      if (!looksLikeProfileKey) {
        expect(manifestIds.has(key)).toBe(true)
      }
    }
  })
})
