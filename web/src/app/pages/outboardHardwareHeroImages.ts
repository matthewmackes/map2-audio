/**
 * Mapping of outboard hardware device IDs to their vendor hero image paths and attributions.
 * Images are sourced from vendor public art and stock photography with proper attribution.
 */

export interface OutboardHardwareHeroImage {
  imagePath: string
  alt: string
  attribution: string
  photographerUrl?: string
}

export const OUTBOARD_HARDWARE_HERO_IMAGES: Record<string, OutboardHardwareHeroImage> = {
  'biamp-tesira': {
    imagePath: '/assets/outboard-hardware/biamp-tesira.svg',
    alt: 'Biamp Tesira AVB hero artwork',
    attribution: 'MAP2 product hero artwork',
  },
  'edirol-ua1000': {
    imagePath: '/assets/outboard-hardware/edirol-ua1000.svg',
    alt: 'Edirol UA-1000 hero artwork',
    attribution: 'MAP2 product hero artwork',
  },
  'hotone-jogg': {
    imagePath: '/assets/outboard-hardware/hotone-jogg.svg',
    alt: 'HoTone JoGG hero artwork',
    attribution: 'MAP2 product hero artwork',
  },
  'lexicon-mpx1': {
    imagePath: '/assets/outboard-hardware/lexicon-mpx1.svg',
    alt: 'Lexicon MPX1 hero artwork',
    attribution: 'MAP2 product hero artwork',
  },
  'eventide-intelfx': {
    imagePath: '/assets/outboard-hardware/eventide-intelfx.svg',
    alt: 'IntelFX Rack hero artwork',
    attribution: 'MAP2 product hero artwork',
  },
}

export function getHeroImageForDevice(deviceId: string): OutboardHardwareHeroImage | null {
  return OUTBOARD_HARDWARE_HERO_IMAGES[deviceId] ?? null
}
