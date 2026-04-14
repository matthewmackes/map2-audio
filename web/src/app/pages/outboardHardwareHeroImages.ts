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
    imagePath: '/assets/outboard-hardware/biamp-tesira.jpg',
    alt: 'Biamp Tesira AVB professional audio processor and mixer',
    attribution: 'Photo by Icier Llido on Pexels',
    photographerUrl: 'https://www.pexels.com/@icier-llido-1929755902',
  },
  'edirol-ua1000': {
    imagePath: '/assets/outboard-hardware/edirol-ua1000.jpg',
    alt: 'Edirol UA-1000 USB audio interface with cables',
    attribution: 'Photo by Alena Sharkova on Pexels',
    photographerUrl: 'https://www.pexels.com/@alenakroon',
  },
  'hotone-jogg': {
    imagePath: '/assets/outboard-hardware/hotone-jogg.jpg',
    alt: 'HoTone JoGG USB audio interface device',
    attribution: 'Photo by www.kaboompics.com on Pexels',
    photographerUrl: 'https://www.pexels.com/@karola-g',
  },
  'lexicon-mpx1': {
    imagePath: '/assets/outboard-hardware/lexicon-mpx1.jpg',
    alt: 'Lexicon MPX1 multi-effects processor rack equipment',
    attribution: 'Photo by Alena Sharkova on Pexels',
    photographerUrl: 'https://www.pexels.com/@alenakroon',
  },
  'eventide-intelfx': {
    imagePath: '/assets/outboard-hardware/eventide-intelfx.jpg',
    alt: 'Rocktron Eventide IntelFX rack processor equipment',
    attribution: 'Photo by Icier Llido on Pexels',
    photographerUrl: 'https://www.pexels.com/@icier-llido-1929755902',
  },
}

export function getHeroImageForDevice(deviceId: string): OutboardHardwareHeroImage | null {
  return OUTBOARD_HARDWARE_HERO_IMAGES[deviceId] ?? null
}
