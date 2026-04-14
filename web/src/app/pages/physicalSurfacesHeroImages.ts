/**
 * Mapping of physical surface unit IDs to their vendor hero image paths and attributions.
 * Images are sourced from vendor public art and stock photography with proper attribution.
 */

export interface PhysicalSurfaceHeroImage {
  imagePath: string
  alt: string
  attribution: string
  photographerUrl?: string
}

export const PHYSICAL_SURFACE_HERO_IMAGES: Record<string, PhysicalSurfaceHeroImage> = {
  'maschine-mk1': {
    imagePath: '/assets/physical-surfaces/maschine-mk1.jpg',
    alt: 'Native Instruments Maschine MK1 drum machine controller',
    attribution: 'Photo by Egor Komarov on Unsplash',
    photographerUrl: 'https://unsplash.com/@egorkomarov',
  },
  'ableton-push': {
    imagePath: '/assets/physical-surfaces/ableton-push.jpg',
    alt: 'Ableton Push pad and performance controller',
    attribution: 'Photo by Alina Matveycheva on Pexels',
    photographerUrl: 'https://www.pexels.com/@matvalina',
  },
  'ground-control-pro': {
    imagePath: '/assets/physical-surfaces/voodoo-lab-ground-control-pro.jpg',
    alt: 'Voodoo Lab Ground Control Pro MIDI foot controller',
    attribution: 'Photo by Tuhibagus Syarif on Unsplash',
    photographerUrl: 'https://unsplash.com/@tsyarif',
  },
  'meloaudio-midi-commander': {
    imagePath: '/assets/physical-surfaces/meloaudio-midi-commander.jpg',
    alt: 'MeloAudio MIDI Commander keyboard controller',
    attribution: 'Photo by Luis Alberto Garcia Garcia on Pexels',
    photographerUrl: 'https://www.pexels.com/@lag1928',
  },
  'novation-launch-control': {
    imagePath: '/assets/physical-surfaces/novation-launch-control.jpg',
    alt: 'Novation Launch Control Family MIDI controller',
    attribution: 'Photo by StockSnap on Pixabay',
    photographerUrl: 'https://pixabay.com/users/StockSnap-894430/',
  },
  'mackie-mcu-pro': {
    imagePath: '/assets/physical-surfaces/mackie-mcu-pro.jpg',
    alt: 'Mackie MCU Pro universal control surface',
    attribution: 'Photo by Alexis Emanuel Salinas on Pexels',
    photographerUrl: 'https://www.pexels.com/@alexis-emanuel-salinas-54517535',
  },
}

export function getHeroImageForUnit(unitId: string): PhysicalSurfaceHeroImage | null {
  return PHYSICAL_SURFACE_HERO_IMAGES[unitId] ?? null
}
