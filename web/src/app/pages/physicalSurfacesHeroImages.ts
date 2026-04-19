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
    imagePath: '/assets/physical-surfaces/maschine-mk1.svg',
    alt: 'Native Instruments Maschine MK1 hero artwork',
    attribution: 'MAP2 product hero artwork',
  },
  'ableton-push': {
    imagePath: '/assets/physical-surfaces/ableton-push.svg',
    alt: 'Ableton Push performance controller hero artwork',
    attribution: 'MAP2 product hero artwork',
  },
  'ground-control-pro': {
    imagePath: '/assets/physical-surfaces/voodoo-lab-ground-control-pro.svg',
    alt: 'Voodoo Lab Ground Control Pro hero artwork',
    attribution: 'MAP2 product hero artwork',
  },
  'meloaudio-midi-commander': {
    imagePath: '/assets/physical-surfaces/meloaudio-midi-commander.svg',
    alt: 'MeloAudio MIDI Commander hero artwork',
    attribution: 'MAP2 product hero artwork',
  },
  'novation-launch-control': {
    imagePath: '/assets/physical-surfaces/novation-launch-control.svg',
    alt: 'Novation Launch Control hero artwork',
    attribution: 'MAP2 product hero artwork',
  },
  'mackie-mcu-pro': {
    imagePath: '/assets/physical-surfaces/mackie-mcu-pro.svg',
    alt: 'Mackie MCU Pro hero artwork',
    attribution: 'MAP2 product hero artwork',
  },
}

export function getHeroImageForUnit(unitId: string): PhysicalSurfaceHeroImage | null {
  return PHYSICAL_SURFACE_HERO_IMAGES[unitId] ?? null
}
