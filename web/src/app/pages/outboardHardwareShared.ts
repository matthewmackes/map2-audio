import type { ComponentType } from 'react'
import { Usb, Waveform } from '@carbon/icons-react'

import {
  MapMatrixProcessorIcon,
  MapRackDeviceIcon,
} from '../components/icons/map'

type OutboardHardwareCategory = 'AVB DSP Mixer' | 'USB Audio Interface' | 'Multi-FX Processor'

export interface OutboardHardwareSpecItem {
  label: string
  value: string
}

export interface OutboardHardwareDevice {
  deviceId: string
  displayName: string
  shortLabel: string
  category: OutboardHardwareCategory
  dedicatedRoute: string
  icon: ComponentType<any>
  description: string
  operatorFocus: string
  connectionModel: string
  capabilitySummary: string
  protocols: string[]
  capabilities: string[]
  specs: OutboardHardwareSpecItem[]
}

export const OUTBOARD_HARDWARE_DEVICES: OutboardHardwareDevice[] = [
  {
    deviceId: 'biamp-tesira',
    displayName: 'Tesira AVB',
    shortLabel: 'Tesira',
    category: 'AVB DSP Mixer',
    dedicatedRoute: '/tesira',
    icon: MapMatrixProcessorIcon as ComponentType<any>,
    description: 'Biamp Tesira fleet operations, DSP work, AVB context, presets, and multi-device diagnostics remain available through the dedicated route.',
    operatorFocus: 'Fleet supervision, AVB DSP tuning, and deployment posture.',
    connectionModel: 'Networked AVB/TTP control surface with MAP2-side fleet orchestration.',
    capabilitySummary: 'Fleet views, DSP panels, AVB posture, preset control, and deployment tooling.',
    protocols: ['TTP / SSH control', 'AVB transport', 'Preset orchestration'],
    capabilities: ['Fleet health', 'DSP block editing', 'AVB topology visibility', 'Preset workflows'],
    specs: [
      { label: 'Vendor', value: 'Biamp' },
      { label: 'Hardware family', value: 'Tesira Forte AVB' },
      { label: 'Launch path', value: '/tesira' },
      { label: 'Primary role', value: 'Rack DSP and AVB infrastructure control' },
    ],
  },
  {
    deviceId: 'edirol-ua1000',
    displayName: 'Edirol UA-1000',
    shortLabel: 'UA-1000',
    category: 'USB Audio Interface',
    dedicatedRoute: '/edirol-ua1000',
    icon: Usb,
    description: 'Interface-specific status, latency visibility, and audio controls for the UA-1000 stay in the existing dedicated hardware page.',
    operatorFocus: 'Front-of-rig audio interface status and device-specific control.',
    connectionModel: 'Direct USB audio interface integration surfaced through the MAP2 hardware route.',
    capabilitySummary: 'Connection state, audio health, latency detail, and interface controls.',
    protocols: ['USB audio', 'ALSA / PipeWire status', 'Interface-specific monitoring'],
    capabilities: ['Runtime status', 'Latency posture', 'Interface controls', 'Host visibility'],
    specs: [
      { label: 'Vendor', value: 'Edirol / Roland' },
      { label: 'Hardware family', value: 'UA-1000 USB audio interface' },
      { label: 'Launch path', value: '/edirol-ua1000' },
      { label: 'Primary role', value: 'Dedicated MAP2 audio-interface control page' },
    ],
  },
  {
    deviceId: 'hotone-jogg',
    displayName: 'HoTone JoGG',
    shortLabel: 'JoGG',
    category: 'USB Audio Interface',
    dedicatedRoute: '/hotone-jogg',
    icon: Waveform,
    description: 'The JoGG route remains the dedicated place for host detection, profile-specific controls, and interface-state visibility.',
    operatorFocus: 'Portable interface status and profile-driven control visibility.',
    connectionModel: 'USB interface route with MAP2 profile awareness and host detection.',
    capabilitySummary: 'Connection-state visibility, profile-aware status, and interface controls.',
    protocols: ['USB audio', 'Host profile detection', 'Interface-state inspection'],
    capabilities: ['Runtime detection', 'Profile-specific controls', 'Host status', 'Device-specific workflow'],
    specs: [
      { label: 'Vendor', value: 'HoTone' },
      { label: 'Hardware family', value: 'JoGG USB interface' },
      { label: 'Launch path', value: '/hotone-jogg' },
      { label: 'Primary role', value: 'Portable audio-interface operations' },
    ],
  },
  {
    deviceId: 'lexicon-mpx1',
    displayName: 'MPX1 Rack',
    shortLabel: 'MPX1',
    category: 'Multi-FX Processor',
    dedicatedRoute: '/mpx1',
    icon: MapRackDeviceIcon,
    description: 'Live program control, editor access, diagnostics, library work, and MIDI mapping remain in the dedicated MPX1 rack route.',
    operatorFocus: 'Rack-effect editing, program management, and runtime diagnostics.',
    connectionModel: 'MIDI SysEx-driven rack processor with deep routed editor and diagnostics views.',
    capabilitySummary: 'Panel, editor, library, MIDI mapping, diagnostics, and performance views.',
    protocols: ['MIDI SysEx', 'Program recall', 'Runtime diagnostics'],
    capabilities: ['Editor workflows', 'Library tasks', 'MIDI mapping', 'Perform-mode views'],
    specs: [
      { label: 'Vendor', value: 'Lexicon' },
      { label: 'Hardware family', value: 'MPX-1 multi-effects processor' },
      { label: 'Launch path', value: '/mpx1' },
      { label: 'Primary role', value: 'Deep rack-effects editing and live control' },
    ],
  },
  {
    deviceId: 'eventide-intelfx',
    displayName: 'IntelFX Rack',
    shortLabel: 'IntelFX',
    category: 'Multi-FX Processor',
    dedicatedRoute: '/intelfx',
    icon: MapRackDeviceIcon,
    description: 'Signal-flow editing, preset library, MIDI mapping, scenes, and realtime parameter work remain on the dedicated IntelFX route.',
    operatorFocus: 'Realtime rack-effects control, preset workflows, and signal-flow editing.',
    connectionModel: 'Rack processor route with flow/editor/library surfaces and realtime parameter control.',
    capabilitySummary: 'Flow views, editor panels, library access, MIDI mapping, and monitoring.',
    protocols: ['MIDI SysEx', 'Preset workflows', 'Realtime parameter control'],
    capabilities: ['Signal-flow editing', 'Preset library', 'MIDI mapping', 'Monitor views'],
    specs: [
      { label: 'Vendor', value: 'Rocktron' },
      { label: 'Hardware family', value: 'Intellifex rack processor' },
      { label: 'Launch path', value: '/intelfx' },
      { label: 'Primary role', value: 'Rack-effects editing and monitoring' },
    ],
  },
]

export function resolveOutboardHardwareStandaloneRoute(deviceId: string): string | null {
  return OUTBOARD_HARDWARE_DEVICES.find((device) => device.deviceId === deviceId)?.dedicatedRoute ?? null
}

export interface OutboardHardwareShellContextValue {
  devices: OutboardHardwareDevice[]
}
