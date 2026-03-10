import type { ComponentType } from 'react'
import { SquaresFour, Sparkle, Package, Waveform, MusicNotes, Pulse, Usb, Monitor, HardDrives, ShareNetwork, Cube, BookOpen, GridFour, Guitar, SlidersHorizontal } from '@phosphor-icons/react'
import { BiampIcon } from '../components/Tesira/BiampIcon'

export type NavigationMaturityState = 'production' | 'qualified-with-waiver' | 'beta' | 'experimental' | 'hardware-blocked'
export type NavigationTier = 'primary' | 'secondary' | 'advanced'

export const DEFAULT_NAVIGATION_ALLOWED_STATES: NavigationMaturityState[] = ['production', 'qualified-with-waiver']
export const ADVANCED_NAVIGATION_ALLOWED_STATES: NavigationMaturityState[] = ['beta', 'experimental', 'hardware-blocked']

export interface ShellNavigationItem {
  to: string
  label: string
  shortLabel?: string
  icon: ComponentType<any>
  description: string
  color: string
  dividerBefore?: boolean
  group?: string
  popupMenu?: 'hardware-interfaces'
  promotionKey: string
  promotable?: boolean
  maturity: NavigationMaturityState
  navigationTier: NavigationTier
  gatedReason?: string
}

export interface AdvancedMenuItem extends ShellNavigationItem {
  navigationTier: 'advanced'
}

export interface HardwareInterfaceMenuItem {
  to: string
  label: string
  icon: ComponentType<any>
  description: string
  color: string
  maturity: NavigationMaturityState
  gatedReason?: string
}

export const navigationMaturityMeta: Record<
  NavigationMaturityState,
  { label: NavigationMaturityState; description: string; accent: string; surface: string; border: string }
> = {
  production: {
    label: 'production',
    description: 'Qualified, operator-safe by default, and appropriate for default navigation.',
    accent: '#22c55e',
    surface: 'rgba(34, 197, 94, 0.12)',
    border: 'rgba(34, 197, 94, 0.32)',
  },
  'qualified-with-waiver': {
    label: 'qualified-with-waiver',
    description: 'Operationally credible, but still carrying documented caveats, qualification limits, or deployment waivers.',
    accent: '#38bdf8',
    surface: 'rgba(56, 189, 248, 0.12)',
    border: 'rgba(56, 189, 248, 0.32)',
  },
  beta: {
    label: 'beta',
    description: 'Functionally substantial, but still missing closure, consistency, or enough operational proof for default trust.',
    accent: '#f59e0b',
    surface: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.32)',
  },
  experimental: {
    label: 'experimental',
    description: 'Exploratory, incomplete, or weakly validated. Must never be presented as routine operator workflow.',
    accent: '#c084fc',
    surface: 'rgba(192, 132, 252, 0.12)',
    border: 'rgba(192, 132, 252, 0.32)',
  },
  'hardware-blocked': {
    label: 'hardware-blocked',
    description: 'Depends on unavailable hardware, environment, or qualification evidence and should be hidden or explicitly blocked in normal operation.',
    accent: '#f87171',
    surface: 'rgba(248, 113, 113, 0.12)',
    border: 'rgba(248, 113, 113, 0.32)',
  },
}

// Shared navigation items used by the shell and operator-facing docs.
// Route entries should stay in sync with App route registrations.
// Popup entries use `popupMenu` and are handled by the renderers.
export const defaultPromotedAdvancedRoutes: string[] = []

const shellNavigationItems: ShellNavigationItem[] = [
  {
    to: '/',
    label: 'Overview',
    shortLabel: 'Status',
    icon: Sparkle,
    description: 'System status, quick actions, and overall readiness',
    color: '#f59e0b',
    promotionKey: '/',
    maturity: 'qualified-with-waiver',
    navigationTier: 'primary',
  },
  {
    to: '/engine',
    label: 'Audio Engine',
    shortLabel: 'Engine',
    icon: Pulse,
    description: 'Signal path, engine health, metering, and realtime controls',
    color: '#3b82f6',
    promotionKey: '/engine',
    maturity: 'qualified-with-waiver',
    navigationTier: 'primary',
  },
  {
    to: '/avb-routing',
    label: 'AVB Routing',
    shortLabel: 'AVB',
    icon: ShareNetwork,
    description: 'AVB/TSN routing matrix and network diagnostics',
    color: '#06b6d4',
    promotionKey: '/avb-routing',
    maturity: 'qualified-with-waiver',
    navigationTier: 'primary',
  },
  {
    to: '/host-machine',
    label: 'Host Machine',
    shortLabel: 'Host',
    icon: HardDrives,
    description: 'Real-time host health, hardware info, and machine state',
    color: '#2563eb',
    promotionKey: '/host-machine',
    maturity: 'qualified-with-waiver',
    navigationTier: 'primary',
  },
  {
    to: '/perform',
    label: 'Stage Mode',
    shortLabel: 'Stage',
    icon: Guitar,
    description: 'Full-window performance interface: preset grid, bypass strip, tap tempo, tuner',
    color: '#f1c21b',
    promotionKey: '/perform',
    promotable: true,
    maturity: 'beta',
    navigationTier: 'primary',
  },
  {
    to: '/expression',
    label: 'Expression',
    icon: SlidersHorizontal,
    description: 'Map MIDI CC pedals to any engine parameter with real-time visual feedback',
    color: '#009d9a',
    group: 'Beta workflows',
    promotionKey: '/expression',
    promotable: false,
    maturity: 'beta',
    navigationTier: 'advanced',
  },
  {
    to: '/welcome',
    label: 'Guide',
    shortLabel: 'Guide',
    icon: BookOpen,
    description: 'Platform guide, concepts, and operating model',
    color: '#60a5fa',
    promotionKey: '/welcome',
    maturity: 'production',
    navigationTier: 'secondary',
  },
  {
    to: '/presets',
    label: 'Presets',
    icon: SquaresFour,
    description: 'Save, recall, and organize sounds and sessions',
    color: '#22c55e',
    group: 'Beta workflows',
    promotionKey: '/presets',
    promotable: false,
    maturity: 'beta',
    navigationTier: 'advanced',
  },
  {
    to: '/plugins',
    label: 'LV2 Plugins',
    icon: Package,
    description: 'Plugin manager and catalog maintenance',
    color: '#06b6d4',
    group: 'Beta workflows',
    promotionKey: '/plugins',
    promotable: false,
    maturity: 'beta',
    navigationTier: 'advanced',
  },
  {
    to: '/midi',
    label: 'MIDI',
    icon: MusicNotes,
    description: 'MIDI mapping and control workflows',
    color: '#ec4899',
    group: 'Beta workflows',
    promotionKey: '/midi',
    promotable: false,
    maturity: 'beta',
    navigationTier: 'advanced',
  },
  {
    to: '/midi-hub',
    label: 'MIDI Hub',
    icon: MusicNotes,
    description: 'Routing, scripts, clock, and MIDI diagnostics',
    color: '#22c55e',
    group: 'Beta workflows',
    promotionKey: '/midi-hub',
    promotable: false,
    maturity: 'beta',
    navigationTier: 'advanced',
  },
  {
    to: '/mpx1',
    label: 'MPX1 Rack',
    icon: Waveform,
    description: 'Lexicon MPX-1 rack editor and hardware control',
    color: '#3b82f6',
    group: 'Beta workflows',
    promotionKey: '/mpx1',
    promotable: false,
    maturity: 'beta',
    navigationTier: 'advanced',
  },
  {
    to: '/tesira',
    label: 'Tesira AVB',
    icon: BiampIcon as ComponentType<any>,
    description: 'Biamp Tesira Forte AVB fleet control and metering',
    color: '#E31837',
    group: 'Beta workflows',
    promotionKey: '/tesira',
    promotable: false,
    maturity: 'beta',
    navigationTier: 'advanced',
  },
  {
    to: '/cluster-dashboard',
    label: 'Cluster Dashboard',
    icon: HardDrives,
    description: 'Multi-node monitoring, orchestration, and cluster simulation',
    color: '#2563eb',
    group: 'Beta workflows',
    promotionKey: '/cluster-dashboard',
    promotable: false,
    maturity: 'beta',
    navigationTier: 'advanced',
  },
  {
    to: '/multi-system',
    label: 'Multi-System',
    icon: Monitor,
    description: 'Side-by-side multi-host metrics and comparison dashboards',
    color: '#38bdf8',
    group: 'Beta workflows',
    promotionKey: '/multi-system',
    promotable: false,
    maturity: 'beta',
    navigationTier: 'advanced',
  },
  {
    to: '/grid',
    label: 'Grid',
    icon: GridFour,
    description: 'Exploratory Cortex-style grid editor surface',
    color: '#2563eb',
    group: 'Experimental',
    promotionKey: '/grid',
    promotable: false,
    maturity: 'experimental',
    navigationTier: 'advanced',
  },
  {
    to: '/grid-3d',
    label: '3D Grid',
    icon: Cube,
    description: '3D signal-flow visualization and exploratory graph tooling',
    color: '#7c3aed',
    group: 'Experimental',
    promotionKey: '/grid-3d',
    promotable: false,
    maturity: 'experimental',
    navigationTier: 'advanced',
  },
  {
    to: '/library',
    label: 'IR & NAM Library',
    icon: Waveform,
    description: 'Model and IR acquisition workflows and content browsing',
    color: '#06b6d4',
    group: 'Experimental',
    promotionKey: '/library',
    promotable: false,
    maturity: 'experimental',
    navigationTier: 'advanced',
  },
  {
    to: '/lcd',
    label: 'LCD Console',
    icon: Monitor,
    description: 'Dedicated display and hardware-panel console surface',
    color: '#22c55e',
    group: 'Hardware-blocked',
    promotionKey: '/lcd',
    promotable: false,
    maturity: 'hardware-blocked',
    navigationTier: 'advanced',
    gatedReason: 'Requires the dedicated LCD hardware path and qualification evidence before routine use.',
  },
  {
    to: '#hardware-interfaces',
    label: 'Audio Interfaces',
    icon: Usb,
    description: 'Interface-specific control pages for connected or configured audio hardware',
    color: '#0ea5e9',
    group: 'Interfaces',
    popupMenu: 'hardware-interfaces',
    promotionKey: '/hardware-interfaces',
    promotable: false,
    maturity: 'beta',
    navigationTier: 'advanced',
    gatedReason: 'Pages open directly and reflect current connection state instead of being hard-blocked.',
  },
]

export const primaryOperatorMenuItems = shellNavigationItems.filter(
  (item): item is ShellNavigationItem => item.navigationTier === 'primary'
)

export const secondaryInfoMenuItems = shellNavigationItems.filter(
  (item): item is ShellNavigationItem => item.navigationTier === 'secondary'
)

export const advancedMenuItems = shellNavigationItems.filter(
  (item): item is AdvancedMenuItem => item.navigationTier === 'advanced'
)

export const hardwareInterfaceMenuItems: HardwareInterfaceMenuItem[] = [
  {
    to: '/edirol-ua1000',
    label: 'Edirol UA-1000',
    icon: Usb,
    description: 'USB audio interface control',
    color: '#0066cc',
    maturity: 'beta',
    gatedReason: 'Opens even when the interface is offline; live controls reflect detected UA-1000 hardware.',
  },
  {
    to: '/hotone-jogg',
    label: 'HoTone JoGG',
    icon: Waveform,
    description: 'HoTone audio interface',
    color: '#e53935',
    maturity: 'beta',
    gatedReason: 'Opens directly; live status reflects whether the HoTone JoGG is detected on this host.',
  },
  {
    to: '/hotone-jogg',
    label: 'Generic',
    icon: Waveform,
    description: 'Generic model based on the HoTone interface',
    color: '#94a3b8',
    maturity: 'experimental',
    gatedReason: 'Opens directly for profile experimentation; live hardware state is still shown in-page.',
  },
]
