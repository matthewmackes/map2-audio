/**
 * Unified device hero images — keyed on DEVICE_REGISTRY.id.
 *
 * SVG files live under /assets/devices/. Historically they were split across
 * /assets/physical-surfaces/ and /assets/outboard-hardware/; the unified
 * `/devices` landing merges both sets into a single artwork catalog.
 */

export interface DeviceHeroImage {
  imagePath: string
  alt: string
  attribution: string
}

export const DEVICE_HERO_IMAGES: Record<string, DeviceHeroImage> = {
  'mpx1': {
    imagePath: '/assets/devices/mpx1.svg',
    alt: 'Lexicon MPX-1 rack multi-effects processor hero artwork',
    attribution: 'MAP2 product hero artwork',
  },
  'intelfx': {
    imagePath: '/assets/devices/intelfx.svg',
    alt: 'Rocktron IntelliFex rack processor hero artwork',
    attribution: 'MAP2 product hero artwork',
  },
  'tesira': {
    imagePath: '/assets/devices/tesira.svg',
    alt: 'Biamp Tesira AVB DSP hero artwork',
    attribution: 'MAP2 product hero artwork',
  },
  'edirol-ua1000': {
    imagePath: '/assets/devices/edirol-ua1000.svg',
    alt: 'Edirol UA-1000 USB audio interface hero artwork',
    attribution: 'MAP2 product hero artwork',
  },
  'hotone-jogg': {
    imagePath: '/assets/devices/hotone-jogg.svg',
    alt: 'HoTone JoGG USB interface hero artwork',
    attribution: 'MAP2 product hero artwork',
  },
  'maschine-mk1': {
    imagePath: '/assets/devices/maschine-mk1.svg',
    alt: 'Native Instruments Maschine MK1 hero artwork',
    attribution: 'MAP2 product hero artwork',
  },
  'ableton-push': {
    imagePath: '/assets/devices/ableton-push.svg',
    alt: 'Ableton Push performance controller hero artwork',
    attribution: 'MAP2 product hero artwork',
  },
  'ground-control-pro': {
    imagePath: '/assets/devices/ground-control-pro.svg',
    alt: 'Voodoo Lab Ground Control Pro hero artwork',
    attribution: 'MAP2 product hero artwork',
  },
  'meloaudio-midi-commander': {
    imagePath: '/assets/devices/meloaudio-midi-commander.svg',
    alt: 'MeloAudio MIDI Commander hero artwork',
    attribution: 'MAP2 product hero artwork',
  },
  'novation-launch-control': {
    imagePath: '/assets/devices/novation-launch-control.svg',
    alt: 'Novation Launch Control hero artwork',
    attribution: 'MAP2 product hero artwork',
  },
  'mackie-mcu-pro': {
    imagePath: '/assets/devices/mackie-mcu-pro.svg',
    alt: 'Mackie MCU Pro hero artwork',
    attribution: 'MAP2 product hero artwork',
  },
}

export function getDeviceHeroImage(deviceId: string): DeviceHeroImage | null {
  return DEVICE_HERO_IMAGES[deviceId] ?? null
}
