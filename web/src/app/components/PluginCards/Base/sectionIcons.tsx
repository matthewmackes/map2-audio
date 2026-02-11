/**
 * Section Icon Mapping Utility
 *
 * Maps parameter section titles to appropriate FontAudio and Lucide icons.
 * Used by ParameterSection component to automatically select icons.
 */

import React from 'react'
import {
  DynamicsIcon,
  ReverbIcon,
  DelayIcon,
  EQIcon,
  ModulationIcon,
  PitchIcon,
  AmplifierIcon,
  CabinetIcon,
  MultiEffectIcon,
} from '../../icons/fontaudio'
import { Clock, SpeakerHigh, Sliders, GearSix } from '@phosphor-icons/react'

/**
 * Get appropriate icon for a parameter section title
 * @param title - Section title to map
 * @param size - Icon size in pixels (default: 14)
 * @returns Icon component or null if no mapping found
 */
export function getSectionIcon(title: string, size: number = 14): React.ReactNode | null {
  if (!title) return null

  const lowerTitle = title.toLowerCase()

  // Dynamics/Compression icons
  if (
    lowerTitle.includes('dynamics') ||
    lowerTitle.includes('gate') ||
    lowerTitle.includes('ceiling') ||
    lowerTitle.includes('compressor') ||
    lowerTitle.includes('limiter')
  ) {
    return <DynamicsIcon size={size} />
  }

  // Reverb/Space icons
  if (
    lowerTitle.includes('space') ||
    lowerTitle.includes('room') ||
    lowerTitle.includes('hall') ||
    lowerTitle.includes('plate') ||
    lowerTitle.includes('atmosphere') ||
    lowerTitle.includes('reverb')
  ) {
    return <ReverbIcon size={size} />
  }

  // Delay/Echo icons
  if (lowerTitle.includes('delay') || lowerTitle.includes('echo')) {
    return <DelayIcon size={size} />
  }

  // EQ/Filter icons
  if (
    lowerTitle === 'eq' ||
    lowerTitle.includes('bands') ||
    lowerTitle.includes('filter') ||
    lowerTitle === 'tone' ||
    lowerTitle.includes('equalization')
  ) {
    return <EQIcon size={size} />
  }

  // Modulation/LFO icons
  if (
    lowerTitle.includes('modulation') ||
    lowerTitle.includes('lfo') ||
    lowerTitle.includes('shimmer') ||
    lowerTitle.includes('chorus') ||
    lowerTitle.includes('flanger') ||
    lowerTitle.includes('phaser')
  ) {
    return <ModulationIcon size={size} />
  }

  // Pitch/Tuning icons
  if (
    lowerTitle.includes('pitch') ||
    lowerTitle.includes('interval') ||
    lowerTitle.includes('tuning') ||
    lowerTitle.includes('correction') ||
    lowerTitle.includes('key & scale') ||
    lowerTitle.includes('fine tune') ||
    lowerTitle.includes('transpose')
  ) {
    return <PitchIcon size={size} />
  }

  // Amplifier/Distortion icons
  if (
    lowerTitle.includes('drive') ||
    lowerTitle === 'amp' ||
    lowerTitle.includes('amplifier') ||
    lowerTitle.includes('distortion') ||
    lowerTitle.includes('overdrive')
  ) {
    return <AmplifierIcon size={size} />
  }

  // Cabinet/IR icons
  if (
    lowerTitle.includes('cabinet') ||
    lowerTitle.includes('ir') ||
    lowerTitle.includes('speaker')
  ) {
    return <CabinetIcon size={size} />
  }

  // Timing/Clock icons (for envelope timing, not delay)
  if (
    lowerTitle === 'timing' ||
    (lowerTitle === 'time' && !title.toLowerCase().includes('delay'))
  ) {
    return <Clock size={size} weight="duotone" />
  }

  // Output/Mix icons
  if (lowerTitle.includes('output') || lowerTitle === 'mix') {
    return <SpeakerHigh size={size} weight="duotone" />
  }

  // Character/Shape/Waveform icons
  if (
    lowerTitle.includes('character') ||
    lowerTitle.includes('shape') ||
    lowerTitle.includes('waveform') ||
    lowerTitle.includes('boss ce-2') ||
    lowerTitle.includes('boss bf-2')
  ) {
    return <Sliders size={size} weight="duotone" />
  }

  // Expression/Settings icons
  if (
    lowerTitle.includes('expression') ||
    lowerTitle.includes('pedal') ||
    lowerTitle.includes('settings')
  ) {
    return <GearSix size={size} weight="duotone" />
  }

  // Multi-Effect/Misc icons (fallback for generic sections)
  if (
    lowerTitle === 'master' ||
    lowerTitle === 'main' ||
    lowerTitle === 'more' ||
    lowerTitle === 'other' ||
    lowerTitle.includes('advanced') ||
    lowerTitle.includes('options') ||
    lowerTitle.includes('levels') ||
    lowerTitle.includes('hush')
  ) {
    return <MultiEffectIcon size={size} />
  }

  // No mapping found
  return null
}
