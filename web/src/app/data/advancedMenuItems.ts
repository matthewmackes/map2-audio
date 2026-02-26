import type { ComponentType } from 'react'
import { SquaresFour, Sparkle, Package, Waveform, MusicNotes, Pulse, Usb, Monitor, HardDrives, Cpu, ShareNetwork, Cube } from '@phosphor-icons/react'
import { BiampIcon } from '../components/Tesira/BiampIcon'

export interface AdvancedMenuItem {
  to: string
  label: string
  icon: ComponentType<any>
  description: string
  color: string
  dividerBefore?: boolean
  group?: string
  popupMenu?: 'hardware-interfaces'
}

export interface HardwareInterfaceMenuItem {
  to: string
  label: string
  icon: ComponentType<any>
  description: string
  color: string
}

// Shared advanced-navigation items used by the shell and About page menu.
// Route entries should stay in sync with App route registrations.
// Popup entries use `popupMenu` and are handled by the renderers.
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
  {
    to: '/grid-3d',
    label: '3D Grid',
    icon: Cube,
    description: '3D signal flow visualization',
    color: '#7c3aed',
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
    to: '#hardware-interfaces',
    label: 'Audio Interfaces',
    icon: Usb,
    description: 'Edirol, HoTone, generic model, and expansion slots',
    color: '#0ea5e9',
    group: 'Hardware & Interfaces',
    popupMenu: 'hardware-interfaces',
  },
  {
    to: '/avb-routing',
    label: 'AVB Routing',
    icon: ShareNetwork,
    description: 'AVB/TSN routing matrix & network diagnostics',
    color: '#06b6d4',
    group: 'Hardware & Interfaces',
  },
  {
    to: '/tesira',
    label: 'Tesira AVB',
    icon: BiampIcon as ComponentType<any>,
    description: 'Biamp Tesira Forte AVB fleet control & metering',
    color: '#E31837',
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

export const hardwareInterfaceMenuItems: HardwareInterfaceMenuItem[] = [
  {
    to: '/edirol-ua1000',
    label: 'Edirol UA-1000',
    icon: Usb,
    description: 'USB audio interface control',
    color: '#0066cc',
  },
  {
    to: '/hotone-jogg',
    label: 'HoTone JoGG',
    icon: Waveform,
    description: 'HoTone audio interface',
    color: '#e53935',
  },
  {
    to: '/hotone-jogg',
    label: 'Generic',
    icon: Waveform,
    description: 'Generic model based on the HoTone interface',
    color: '#94a3b8',
  },
]
