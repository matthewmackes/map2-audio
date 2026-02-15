import type { ComponentType } from 'react'
import { SquaresFour, Sparkle, Package, Waveform, MusicNotes, Pulse, Usb, Monitor, HardDrives, Stack, Cpu } from '@phosphor-icons/react'

export interface AdvancedMenuItem {
  to: string
  label: string
  icon: ComponentType<any>
  description: string
  color: string
  dividerBefore?: boolean
  group?: string
}

// Shared advanced-navigation items used by the shell and About page menu.
// Keep this list route-valid and in sync with App route registrations.
export const advancedMenuItems: AdvancedMenuItem[] = [
  // ── System ──
  {
    to: '/',
    label: 'Overview',
    icon: Sparkle,
    description: 'System status & quick actions',
    color: '#f59e0b',
    group: 'System',
  },
  {
    to: '/presets',
    label: 'Presets',
    icon: SquaresFour,
    description: 'Save & recall your sounds',
    color: '#22c55e',
    group: 'System',
  },

  // ── Content & Plugins ──
  {
    to: '/plugins',
    label: 'LV2 Plugins',
    icon: Package,
    description: 'LV2 plugin manager',
    color: '#06b6d4',
    dividerBefore: true,
    group: 'Content & Plugins',
  },
  {
    to: '/library',
    label: 'IR & NAM Library',
    icon: Waveform,
    description: 'Impulse responses & NAM models',
    color: '#06b6d4',
    group: 'Content & Plugins',
  },

  // ── Audio Processing ──
  {
    to: '/engine',
    label: 'Audio Engine',
    icon: Pulse,
    description: 'Engine cluster, metering, signal path & diagnostics',
    color: '#3b82f6',
    dividerBefore: true,
    group: 'Audio Processing',
  },

  // ── Control ──
  {
    to: '/midi',
    label: 'MIDI',
    icon: MusicNotes,
    description: 'MIDI mapping & control',
    color: '#ec4899',
    dividerBefore: true,
    group: 'Control',
  },

  // ── Hardware & Interfaces ──
  {
    to: '/lcd',
    label: 'LCD Console',
    icon: Monitor,
    description: 'Displays, events, nodes, alerts, hardware & settings',
    color: '#22c55e',
    dividerBefore: true,
    group: 'Hardware & Interfaces',
  },
  {
    to: '/edirol-ua1000',
    label: 'Edirol UA-1000',
    icon: Usb,
    description: 'USB audio interface control',
    color: '#0066cc',
    group: 'Hardware & Interfaces',
  },
  {
    to: '/motu-rme',
    label: 'MOTU + RME ADAT',
    icon: Stack,
    description: 'MOTU UltraLite-mk5 + RME ADI-8 QS monitoring',
    color: '#00D4FF',
    group: 'Hardware & Interfaces',
  },
  {
    to: '/hotone-jogg',
    label: 'HoTone JoGG',
    icon: Waveform,
    description: 'HoTone audio interface',
    color: '#e53935',
    group: 'Hardware & Interfaces',
  },

  // ── Infrastructure ──
  {
    to: '/host-machine',
    label: 'Host Machine',
    icon: HardDrives,
    description: 'Hardware info & real-time health',
    color: '#2563eb',
    dividerBefore: true,
    group: 'Infrastructure',
  },
  {
    to: '/cpu-performance',
    label: 'CPU Performance',
    icon: Cpu,
    description: 'Intel generation comparison & capacity analysis',
    color: '#0066FF',
    group: 'Infrastructure',
  },
  {
    to: '/cluster-dashboard',
    label: 'Cluster Dashboard',
    icon: HardDrives,
    description: 'Multi-node cluster monitoring & simulation',
    color: '#2563eb',
    group: 'Infrastructure',
  },
  {
    to: '/multi-system',
    label: 'Multi-System',
    icon: Monitor,
    description: 'Side-by-side multi-host metrics & comparison',
    color: '#38bdf8',
    group: 'Infrastructure',
  },
]
