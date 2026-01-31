import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Combobox,
  ComboboxItem,
  ComboboxPopover,
  ComboboxProvider,
  useComboboxStore,
} from '@ariakit/react'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Info,
  Loader2,
  Power,
  Redo2,
  RefreshCcw,
  Save,
  Trash2,
  Undo2,
  // Plugin category icons
  Zap,           // Amplifier/Distortion
  SlidersHorizontal, // EQ/Filter
  Timer,         // Delay
  Waves,         // Reverb
  Activity,      // Modulation
  Gauge,         // Compressor/Dynamics
  Guitar,        // Instrument/Simulator
  Mic,           // Cabinet/IR
  Volume2,       // Utility/Gain
  AudioLines,    // General audio
  Sparkles,      // Effects
  Settings2,     // Utility
  // Layout icons
  Combine,       // Mixer/merge point
  ArrowRight,
  Speaker,
  Radio,         // Tuner/Analyser
  BarChart2,     // Spectrum/Meter
  Star,          // Favorites
  // JUCE feature icons
  Cpu,           // Per-plugin CPU
  Clock,         // Latency
  Link2,         // Sidechain
  AlertTriangle, // XRun warning
  CheckCircle2,  // PDC active
  // JUCE integration icons
  Music,         // MIDI Learn
  Sliders,       // Audio Config
  PlayCircle,    // Automation Timeline
  X,             // Close
  // Signal flow icons
  ArrowRightToLine, // Signal input
  ArrowLeftFromLine, // Signal output
  Circle,        // Signal indicator
  Signal,        // Signal strength
  Minus,         // Level indicator
} from 'lucide-react'
import { ChainPanel } from '../components/ChainPanel'
import { BottomRoutingPanel } from '../components/BottomRoutingPanel'
import type { Chain, ChainPlugin, ChainsResponse, HistoryStatus, Plugin, PluginParameter, PluginUIInfo, PluginFormat } from '../../map2/types'

// ============================================================================
// N-Chain Flow System Types
// ============================================================================

interface ChainSlot {
  id: string;              // Unique slot identifier
  chainId: number | null;  // Selected chain ID (null = empty)
  label: string;           // Display label (A, B, C, D, E, F)
  color: string;           // Theme color
  dryWetMix: number;       // Per-chain dry/wet (0-100)
  muted: boolean;          // Per-chain mute
  solo: boolean;           // Per-chain solo
}

type RoutingMode =
  | 'parallel_blend'    // All chains mixed with individual levels
  | 'ab_switch'         // Toggle between any single chain
  | 'series'            // Sequential A→B→C→...
  | 'parameter_morph'   // Interpolate between two chains
  | 'sidechain';        // Plugin sidechain routing view

interface RoutingConfig {
  mode: RoutingMode;
  activeSlotId: string | null;
  blendPositions: Record<string, number>;
  morphProgress: number;
  morphSourceSlotId: string | null;
  morphTargetSlotId: string | null;
  seriesOrder: string[];
}

// Slot color palette - up to 6 chains
const SLOT_COLORS = [
  { label: 'A', color: '#00d4ff', bg: 'rgba(0, 212, 255, 0.15)' },    // Cyan
  { label: 'B', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' },   // Purple
  { label: 'C', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' },    // Green
  { label: 'D', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },   // Amber
  { label: 'E', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)' },   // Pink
  { label: 'F', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' },    // Teal
]

const MAX_CHAINS = 6
const MIN_CHAINS = 2
const DEFAULT_CHAIN_COUNT = 3

// Create default chain slots
function createDefaultSlots(count: number = DEFAULT_CHAIN_COUNT): ChainSlot[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `slot-${i}`,
    chainId: null,
    label: SLOT_COLORS[i].label,
    color: SLOT_COLORS[i].color,
    dryWetMix: 100,
    muted: false,
    solo: false,
  }))
}

// Create default routing config
function createDefaultRouting(): RoutingConfig {
  return {
    mode: 'parallel_blend',
    activeSlotId: 'slot-0',
    blendPositions: {},
    morphProgress: 0.5,
    morphSourceSlotId: null,
    morphTargetSlotId: null,
    seriesOrder: [],
  }
}

// Migration function - converts old A/B format to new N-chain format
function migrateLocalStorage(): { slots: ChainSlot[]; routing: RoutingConfig; activeIndex: number } | null {
  const MIGRATION_KEY = 'map2_flow_migrated_v2'

  // Check if already migrated
  if (localStorage.getItem(MIGRATION_KEY) === 'true') {
    return null
  }

  try {
    // Read old state
    const oldSelectedChain = localStorage.getItem('map2_flow_selected_chain')
    const oldSecondChain = localStorage.getItem('map2_flow_second_chain')
    const oldActiveSlot = localStorage.getItem('map2_flow_active_slot')
    const oldRoutingMode = localStorage.getItem('map2_flow_routing_mode')
    const oldChainMix = localStorage.getItem('map2_flow_chain_mix')

    // If no old data exists, skip migration
    if (!oldSelectedChain && !oldSecondChain) {
      localStorage.setItem(MIGRATION_KEY, 'true')
      return null
    }

    // Create new slots - 3 by default, first two with migrated data
    const newSlots: ChainSlot[] = [
      {
        id: 'slot-0',
        chainId: oldSelectedChain ? parseInt(oldSelectedChain, 10) : null,
        label: 'A',
        color: '#00d4ff',
        dryWetMix: 100,
        muted: false,
        solo: false,
      },
      {
        id: 'slot-1',
        chainId: oldSecondChain ? parseInt(oldSecondChain, 10) : null,
        label: 'B',
        color: '#8b5cf6',
        dryWetMix: 100,
        muted: false,
        solo: false,
      },
      {
        id: 'slot-2',
        chainId: null, // New third slot starts empty
        label: 'C',
        color: '#22c55e',
        dryWetMix: 100,
        muted: false,
        solo: false,
      },
    ]

    // Map old routing mode to new format
    const modeMap: Record<string, RoutingMode> = {
      'parallel': 'parallel_blend',
      'ab_switch': 'ab_switch',
      'series': 'series',
    }

    const mixValue = oldChainMix ? parseInt(oldChainMix, 10) : 50

    const newRouting: RoutingConfig = {
      mode: modeMap[oldRoutingMode || 'parallel'] || 'parallel_blend',
      activeSlotId: oldActiveSlot === '2' ? 'slot-1' : 'slot-0',
      blendPositions: {
        'slot-0': 100 - mixValue,
        'slot-1': mixValue,
        'slot-2': 100,
      },
      morphProgress: 0.5,
      morphSourceSlotId: null,
      morphTargetSlotId: null,
      seriesOrder: ['slot-0', 'slot-1', 'slot-2'],
    }

    const activeIndex = oldActiveSlot === '2' ? 1 : 0

    // Save new format
    localStorage.setItem('map2_flow_chain_slots_v2', JSON.stringify(newSlots))
    localStorage.setItem('map2_flow_routing_v2', JSON.stringify(newRouting))
    localStorage.setItem('map2_flow_active_slot_v2', String(activeIndex))

    // Mark migration complete
    localStorage.setItem(MIGRATION_KEY, 'true')

    return { slots: newSlots, routing: newRouting, activeIndex }
  } catch (e) {
    console.error('Migration failed:', e)
    localStorage.setItem(MIGRATION_KEY, 'true')
    return null
  }
}
// Plugin visualization components
import { AudioMeter, GainReductionMeter } from '../components/AudioMeter'
import { AudioMeteringCard } from '../components/Visualizations/AudioMeteringCard'
// Native plugin cards for Flows
import { CabinetIRFlowCard } from '../components/NativePlugins/CabinetIRFlowCard'
import { useNativePlugins } from '../hooks/useNativePlugins'
// JUCE metrics hook for real-time CPU and performance data
import { useCPUMetrics } from '../hooks/useCPUMetrics'

// JUCE Integration Components - Direct imports to avoid MUI dependency chain
import MidiLearnButton from '../../map2/components/MIDI/MidiLearnButton'
import { AudioConfigDialog } from '../../map2/components/Audio'
// These use MUI and are disabled for now:
// import { LatencyOverlay } from '../../map2/components/ChainBuilder/index'
// import { MidiMappingsPanel } from '../../map2/components/MIDI'
// import { AutomationTimeline } from '../../map2/components/Automation'

// CSS keyframes for bypass animation - injected once
const BYPASS_ANIMATION_STYLE = `
@keyframes bypassPulse {
  0%, 100% { opacity: 0.5; border-style: dashed; }
  50% { opacity: 0.7; }
}
@keyframes signalFlow {
  0% { background-position: 0% 50%; }
  100% { background-position: 100% 50%; }
}
@keyframes levelMeter {
  0% { transform: scaleY(0.1); }
  50% { transform: scaleY(1); }
  100% { transform: scaleY(0.1); }
}
@keyframes glowPulse {
  0%, 100% { box-shadow: 0 0 5px currentColor, 0 0 10px currentColor; }
  50% { box-shadow: 0 0 15px currentColor, 0 0 25px currentColor, 0 0 35px currentColor; }
}
@keyframes borderGlow {
  0%, 100% { border-color: var(--primary); box-shadow: 0 0 8px rgba(0, 212, 255, 0.3); }
  50% { border-color: #00ffff; box-shadow: 0 0 20px rgba(0, 255, 255, 0.6), 0 0 40px rgba(0, 212, 255, 0.3); }
}
@keyframes iconSpin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes iconBounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes pulseRing {
  0% { transform: scale(0.8); opacity: 1; }
  100% { transform: scale(1.5); opacity: 0; }
}
@keyframes activeGlow {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
@keyframes dataFlow {
  0% { stroke-dashoffset: 20; }
  100% { stroke-dashoffset: 0; }
}
@keyframes floatBubble {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-5px) scale(1.1); }
}
@keyframes waveform {
  0% { d: path('M0,10 Q5,5 10,10 T20,10'); }
  50% { d: path('M0,10 Q5,15 10,10 T20,10'); }
  100% { d: path('M0,10 Q5,5 10,10 T20,10'); }
}
@keyframes neonFlicker {
  0%, 19%, 21%, 23%, 25%, 54%, 56%, 100% { opacity: 1; text-shadow: 0 0 5px currentColor, 0 0 10px currentColor; }
  20%, 24%, 55% { opacity: 0.8; text-shadow: none; }
}
@keyframes rippleEffect {
  0% { transform: scale(0); opacity: 0.6; }
  100% { transform: scale(4); opacity: 0; }
}
@keyframes cardRipple {
  0% { background-position: 50% 100%; }
  50% { background-position: 50% 0%; }
  100% { background-position: 50% 100%; }
}
@keyframes rotateHue {
  0% { filter: hue-rotate(0deg); }
  100% { filter: hue-rotate(360deg); }
}
@keyframes breathe {
  0%, 100% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.05); opacity: 1; }
}
.bypass-animated {
  animation: bypassPulse 2s ease-in-out infinite;
}
.signal-flow-active {
  background: linear-gradient(90deg, transparent, rgba(0, 212, 255, 0.3), transparent);
  background-size: 200% 100%;
  animation: signalFlow 1.5s ease-in-out infinite;
}
.glow-pulse {
  animation: glowPulse 2s ease-in-out infinite;
}
.border-glow {
  animation: borderGlow 2s ease-in-out infinite;
}
.icon-bounce {
  animation: iconBounce 1s ease-in-out infinite;
}
.shimmer-bg {
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%);
  background-size: 200% 100%;
  animation: shimmer 2s ease-in-out infinite;
}
.active-glow {
  animation: activeGlow 1.5s ease-in-out infinite;
}
.breathe {
  animation: breathe 3s ease-in-out infinite;
}
.mixer-glow {
  animation: borderGlow 3s ease-in-out infinite, breathe 4s ease-in-out infinite;
}
.neon-text {
  animation: neonFlicker 3s ease-in-out infinite;
}
`

// Plugin category configuration: colors and icons
type IconProps = { size?: number; style?: React.CSSProperties; className?: string }
const CATEGORY_CONFIG: Record<string, { color: string; bg: string; icon: React.ComponentType<IconProps> }> = {
  // Favorites (always at top)
  'Favorites': { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)', icon: Star },
  // Amp/Distortion
  'Distortion': { color: '#ff6b6b', bg: 'rgba(255, 107, 107, 0.15)', icon: Zap },
  'Amplifier': { color: '#ff6b6b', bg: 'rgba(255, 107, 107, 0.15)', icon: Zap },
  'Overdrive': { color: '#ff8c42', bg: 'rgba(255, 140, 66, 0.15)', icon: Zap },
  'Fuzz': { color: '#ff6b6b', bg: 'rgba(255, 107, 107, 0.15)', icon: Zap },
  // EQ/Filter
  'Filter': { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: SlidersHorizontal },
  'EQ': { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: SlidersHorizontal },
  'Equalizer': { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: SlidersHorizontal },
  'Parametric': { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: SlidersHorizontal },
  // Delay
  'Delay': { color: '#45b7d1', bg: 'rgba(69, 183, 209, 0.15)', icon: Timer },
  'Echo': { color: '#45b7d1', bg: 'rgba(69, 183, 209, 0.15)', icon: Timer },
  // Reverb
  'Reverb': { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', icon: Waves },
  'Spatial': { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', icon: Waves },
  // Modulation
  'Modulation': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: Activity },
  'Chorus': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: Activity },
  'Flanger': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: Activity },
  'Phaser': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: Activity },
  'Tremolo': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: Activity },
  'Vibrato': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: Activity },
  // Dynamics
  'Compressor': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: Gauge },
  'Dynamics': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: Gauge },
  'Limiter': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: Gauge },
  'Gate': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: Gauge },
  'Expander': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: Gauge },
  // Simulator/Instrument
  'Simulator': { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', icon: Guitar },
  'Instrument': { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', icon: Guitar },
  'Guitar': { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', icon: Guitar },
  // Cabinet/IR
  'Cabinet': { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', icon: Mic },
  'IR': { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', icon: Mic },
  'Convolution': { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', icon: Mic },
  // Utility
  'Utility': { color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', icon: Settings2 },
  'Gain': { color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', icon: Volume2 },
  'Mixer': { color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', icon: Volume2 },
  // Analyser/Tuner/Meter
  'Analyser': { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', icon: BarChart2 },
  'Analyzer': { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', icon: BarChart2 },
  'Tuner': { color: '#22d3ee', bg: 'rgba(34, 211, 238, 0.15)', icon: Radio },
  'Meter': { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', icon: Gauge },
  'Spectrum': { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', icon: BarChart2 },
  // Default
  'Effect': { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', icon: Sparkles },
  'default': { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)', icon: AudioLines },
}

function getCategoryConfig(category: string) {
  // Check direct match
  if (CATEGORY_CONFIG[category]) return CATEGORY_CONFIG[category]
  // Check partial match
  for (const [key, config] of Object.entries(CATEGORY_CONFIG)) {
    if (category.toLowerCase().includes(key.toLowerCase())) return config
  }
  return CATEGORY_CONFIG['default']
}

// Signal flow cable component - draws a vertical connector between plugins with impressive animations
function SignalCable({ isActive, color = 'var(--primary)' }: { isActive?: boolean; color?: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: 24,
      position: 'relative',
    }}>
      <svg width="40" height="24" viewBox="0 0 40 24" style={{ overflow: 'visible' }}>
        {/* Glow filter for active state */}
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <linearGradient id="cableGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="50%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.3" />
          </linearGradient>
        </defs>
        
        {/* Outer glow line */}
        {isActive && (
          <line
            x1="20" y1="0" x2="20" y2="24"
            stroke={color}
            strokeWidth={8}
            strokeLinecap="round"
            opacity={0.15}
            filter="url(#glow)"
          />
        )}
        
        {/* Main cable line */}
        <line
          x1="20" y1="0" x2="20" y2="24"
          stroke={isActive ? "url(#cableGradient)" : color}
          strokeWidth={isActive ? 4 : 2}
          strokeLinecap="round"
          opacity={isActive ? 1 : 0.4}
          filter={isActive ? "url(#glow)" : undefined}
        />
        
        {/* Animated data packets flowing down */}
        {isActive && (
          <>
            <circle cx="20" cy="0" r="3" fill={color} filter="url(#glow)">
              <animate attributeName="cy" values="-4;28" dur="0.8s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;1;1;0" dur="0.8s" repeatCount="indefinite" />
              <animate attributeName="r" values="2;4;2" dur="0.8s" repeatCount="indefinite" />
            </circle>
            <circle cx="20" cy="0" r="2" fill="#fff" opacity="0.8">
              <animate attributeName="cy" values="-4;28" dur="0.8s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;0.8;0.8;0" dur="0.8s" repeatCount="indefinite" />
            </circle>
            {/* Secondary packet with offset timing */}
            <circle cx="20" cy="0" r="2" fill={color} filter="url(#glow)">
              <animate attributeName="cy" values="-4;28" dur="0.8s" begin="0.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;0.7;0.7;0" dur="0.8s" begin="0.4s" repeatCount="indefinite" />
            </circle>
          </>
        )}
        
        {/* Connection nodes at top and bottom */}
        <circle cx="20" cy="2" r={isActive ? 3 : 2} fill={isActive ? color : '#666'} opacity={isActive ? 1 : 0.5}>
          {isActive && <animate attributeName="r" values="2;4;2" dur="1.5s" repeatCount="indefinite" />}
        </circle>
        <circle cx="20" cy="22" r={isActive ? 3 : 2} fill={isActive ? color : '#666'} opacity={isActive ? 1 : 0.5}>
          {isActive && <animate attributeName="r" values="2;4;2" dur="1.5s" repeatCount="indefinite" />}
        </circle>
      </svg>
    </div>
  )
}

// Input/Output connector icons for chain endpoints with animated effects and audio status
interface AudioInterfaceStatus {
  deviceName?: string;
  sampleRate?: number;
  bufferSize?: number;
  latencyMs?: number;
  channels?: number;
  cpuLoad?: number;
  xruns?: number;
  isRunning?: boolean;
}

function ChainEndpoint({ 
  type, 
  label,
  audioStatus
}: { 
  type: 'input' | 'output'; 
  label: string;
  audioStatus?: AudioInterfaceStatus;
}) {
  const color = type === 'input' ? '#22c55e' : '#a855f7'
  const bgColor = type === 'input' ? 'rgba(34, 197, 94, 0.08)' : 'rgba(168, 85, 247, 0.08)'
  const secondaryColor = type === 'input' ? '#4ade80' : '#c084fc'
  
  // Default values if no status provided
  const deviceName = audioStatus?.deviceName || 'Audio Interface'
  const sampleRate = audioStatus?.sampleRate || 48000
  const bufferSize = audioStatus?.bufferSize || 256
  const latencyMs = audioStatus?.latencyMs || (bufferSize / sampleRate * 1000 * 2)
  const channels = audioStatus?.channels || 2
  const cpuLoad = audioStatus?.cpuLoad || 0
  const xruns = audioStatus?.xruns || 0
  const isRunning = audioStatus?.isRunning ?? true
  
  // Status indicators
  const latencyStatus = latencyMs < 10 ? 'excellent' : latencyMs < 20 ? 'good' : 'high'
  const cpuStatus = cpuLoad < 50 ? 'low' : cpuLoad < 80 ? 'medium' : 'high'
  
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
      padding: '12px 16px',
      background: `linear-gradient(135deg, ${bgColor} 0%, rgba(0,0,0,0.25) 100%)`,
      borderRadius: 12,
      border: `2px solid ${color}60`,
      marginBottom: type === 'input' ? 6 : 0,
      marginTop: type === 'output' ? 6 : 0,
      position: 'relative',
      overflow: 'hidden',
      boxShadow: `0 0 20px ${color}30, inset 0 0 30px ${color}08`,
      minWidth: 200,
    }}>
      {/* Animated shimmer overlay */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: '-100%',
        width: '200%',
        height: '100%',
        background: `linear-gradient(90deg, transparent 0%, ${color}15 50%, transparent 100%)`,
        animation: 'shimmer 4s ease-in-out infinite',
        pointerEvents: 'none',
      }} />
      
      {/* Status indicator light */}
      <div style={{
        position: 'absolute',
        top: 8,
        right: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: isRunning ? '#22c55e' : '#ef4444',
          boxShadow: isRunning ? '0 0 8px #22c55e, 0 0 16px #22c55e50' : '0 0 8px #ef4444',
          animation: isRunning ? 'breathe 2s ease-in-out infinite' : 'none',
        }} />
        <span style={{ fontSize: 9, color: isRunning ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
          {isRunning ? 'ACTIVE' : 'STOPPED'}
        </span>
      </div>
      
      {/* Header row with icon and label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        {/* Icon container with glow */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          borderRadius: 10,
          background: `linear-gradient(135deg, ${color}40 0%, ${color}20 100%)`,
          boxShadow: `0 0 15px ${color}50, inset 0 0 10px ${color}30`,
          position: 'relative',
        }}>
          {/* Pulsing ring */}
          <div style={{
            position: 'absolute',
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: `2px solid ${color}`,
            animation: 'pulseRing 2.5s ease-out infinite',
            opacity: 0.4,
          }} />
          {type === 'input' ? (
            <ArrowDown size={18} style={{ color, filter: `drop-shadow(0 0 4px ${color})` }} className="icon-bounce" />
          ) : (
            <Speaker size={18} style={{ color, filter: `drop-shadow(0 0 4px ${color})` }} className="breathe" />
          )}
        </div>
        
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            color: color,
            textShadow: `0 0 10px ${color}60`,
            letterSpacing: '1px',
          }}>
            {label}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
            {deviceName}
          </div>
        </div>
        
        {/* Audio waveform indicator */}
        <svg width="32" height="20" viewBox="0 0 32 20" style={{ opacity: 0.8 }}>
          <defs>
            <linearGradient id={`waveGrad-${type}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="50%" stopColor={secondaryColor} stopOpacity="1" />
              <stop offset="100%" stopColor={color} stopOpacity="0.3" />
            </linearGradient>
          </defs>
          <path
            d="M2,10 Q8,2 12,10 T22,10 T32,10"
            fill="none"
            stroke={`url(#waveGrad-${type})`}
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <animate attributeName="d" 
              values="M2,10 Q8,2 12,10 T22,10 T32,10;M2,10 Q8,18 12,10 T22,10 T32,10;M2,10 Q8,2 12,10 T22,10 T32,10" 
              dur="0.8s" 
              repeatCount="indefinite" 
            />
          </path>
        </svg>
      </div>
      
      {/* Audio configuration stats grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
        padding: '10px 0',
        borderTop: `1px solid ${color}30`,
        borderBottom: `1px solid ${color}30`,
      }}>
        {/* Sample Rate */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: secondaryColor, textShadow: `0 0 8px ${color}50` }}>
            {(sampleRate / 1000).toFixed(sampleRate % 1000 === 0 ? 0 : 1)}k
          </div>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Sample Rate
          </div>
        </div>
        
        {/* Buffer Size */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: secondaryColor, textShadow: `0 0 8px ${color}50` }}>
            {bufferSize}
          </div>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Buffer
          </div>
        </div>
        
        {/* Channels */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: secondaryColor, textShadow: `0 0 8px ${color}50` }}>
            {channels === 1 ? 'Mono' : channels === 2 ? 'Stereo' : `${channels}ch`}
          </div>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Channels
          </div>
        </div>
      </div>
      
      {/* Performance metrics row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginTop: 10,
      }}>
        {/* Latency indicator */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 6,
          padding: '4px 8px',
          background: latencyStatus === 'excellent' ? 'rgba(34, 197, 94, 0.2)' : latencyStatus === 'good' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)',
          borderRadius: 6,
          border: `1px solid ${latencyStatus === 'excellent' ? '#22c55e' : latencyStatus === 'good' ? '#f59e0b' : '#ef4444'}40`,
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12">
            <circle cx="6" cy="6" r="5" fill="none" stroke={latencyStatus === 'excellent' ? '#22c55e' : latencyStatus === 'good' ? '#f59e0b' : '#ef4444'} strokeWidth="1.5" opacity="0.5" />
            <path d="M6,3 L6,6 L8,7" fill="none" stroke={latencyStatus === 'excellent' ? '#22c55e' : latencyStatus === 'good' ? '#f59e0b' : '#ef4444'} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span style={{ 
            fontSize: 10, 
            fontWeight: 600, 
            color: latencyStatus === 'excellent' ? '#22c55e' : latencyStatus === 'good' ? '#f59e0b' : '#ef4444',
          }}>
            {latencyMs.toFixed(1)}ms
          </span>
        </div>
        
        {/* CPU Load with mini bar */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 6,
          flex: 1,
        }}>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>CPU</span>
          <div style={{
            flex: 1,
            height: 6,
            background: 'rgba(0,0,0,0.3)',
            borderRadius: 3,
            overflow: 'hidden',
            position: 'relative',
          }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, cpuLoad)}%`,
              background: cpuStatus === 'low' ? 'linear-gradient(90deg, #22c55e, #4ade80)' : cpuStatus === 'medium' ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : 'linear-gradient(90deg, #ef4444, #f87171)',
              borderRadius: 3,
              boxShadow: cpuStatus === 'low' ? '0 0 6px #22c55e' : cpuStatus === 'medium' ? '0 0 6px #f59e0b' : '0 0 6px #ef4444',
              transition: 'width 0.3s ease',
            }} />
          </div>
          <span style={{ 
            fontSize: 10, 
            fontWeight: 600, 
            color: cpuStatus === 'low' ? '#22c55e' : cpuStatus === 'medium' ? '#f59e0b' : '#ef4444',
            minWidth: 32,
            textAlign: 'right',
          }}>
            {cpuLoad.toFixed(0)}%
          </span>
        </div>
        
        {/* Xruns indicator */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 4,
          padding: '4px 8px',
          background: xruns === 0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
          borderRadius: 6,
          border: `1px solid ${xruns === 0 ? '#22c55e' : '#ef4444'}40`,
        }}>
          <span style={{ 
            fontSize: 9, 
            color: xruns === 0 ? '#22c55e' : '#ef4444',
            fontWeight: 600,
          }}>
            {xruns === 0 ? '✓' : '⚠'} {xruns} xruns
          </span>
        </div>
      </div>
    </div>
  )
}
import { chainsApi, pluginsApi, historyApi, audioApi, metricsApi, PluginDiscoverResponse } from '../../map2/api'
import type { AudioStatus, JackMetrics, SystemMetrics } from '../../map2/types'
import { PageHeader } from '../components/PageHeader'
import { useToasts } from '../components/Toasts'
import { NativePluginsSection } from '../components/loaders/NativePluginsSection'
import { PluginDetailsModal } from '../components/PluginDetailsModal'

// Native plugin URIs - order matters for signal chain positioning
const NAM_PLUGIN_URI = 'urn:map2:nam-player'
const CABINET_IR_PLUGIN_URI = 'urn:map2:ir-cabinet'
const REVERB_IR_PLUGIN_URI = 'urn:map2:ir-reverb'
const COCOA_DELAY_PLUGIN_URI = 'http://map2-audio.local/cocoa-delay'
const ZITA_AT1_PLUGIN_URI = 'http://map2-audio.local/zita-at1'
const TRIPLESPREAD_PLUGIN_URI = 'http://map2-audio.local/triplespread'
const VALENTINE_PLUGIN_URI = 'http://map2-audio.local/valentine'
const ZLEQUALIZER_PLUGIN_URI = 'http://map2-audio.local/zl-equalizer'
const FREEVERB3_PLUGIN_URI = 'http://map2-audio.local/freeverb3'
const WHAMMY_PLUGIN_URI = 'http://map2-audio.local/whammy'
const DRAGONFLY_PLUGIN_URI = 'http://map2-audio.local/dragonfly'

// Desired signal chain order: NAM → Cabinet IR → Reverb IR → other plugins
const NATIVE_PLUGIN_ORDER = [NAM_PLUGIN_URI, CABINET_IR_PLUGIN_URI, REVERB_IR_PLUGIN_URI]

function getParamKey(param: PluginParameter) {
  return param.symbol || param.name || `param-${param.index}`
}

interface PluginFlowItemProps {
  plugin: ChainPlugin
  pluginMeta?: Plugin
  idx: number
  totalPlugins: number
  isSelected: boolean
  chainId: number
  onSelect: (uri: string) => void
  onMove: (uri: string, direction: -1 | 1) => void
  onToggleBypass: any
  onRemove: any
  reorderPending: boolean
  // New props for enhanced features
  onDragStart?: (e: React.DragEvent, uri: string) => void
  onDragOver?: (e: React.DragEvent, uri: string) => void
  onDragEnd?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent, uri: string) => void
  isDragging?: boolean
  isDragOver?: boolean
  levelIn?: number
  levelOut?: number
  wetDryMix?: number
  onWetDryChange?: (uri: string, value: number) => void
  onSavePreset?: (uri: string) => void
  // UI capabilities
  uiInfo?: PluginUIInfo
  showOutputMeters?: boolean
}

function PluginFlowItem({
  plugin,
  pluginMeta,
  idx,
  totalPlugins,
  isSelected,
  chainId,
  onSelect,
  onMove,
  onToggleBypass,
  onRemove,
  reorderPending,
  // New enhanced props
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  isDragging,
  isDragOver,
  levelIn = 0,
  levelOut = 0,
  wetDryMix = 100,
  onWetDryChange,
  onSavePreset,
  // UI capabilities
  uiInfo,
  showOutputMeters = true,
}: PluginFlowItemProps) {
  // Use metadata for display, fallback to chain plugin data
  const displayName = pluginMeta?.name || plugin.name
  const category = pluginMeta?.category || plugin.plugin_display_type || 'Effect'
  const author = pluginMeta?.author || 'Unknown'
  const inPorts = pluginMeta?.in_ports ?? plugin.in_ports ?? 2
  const outPorts = pluginMeta?.out_ports ?? plugin.out_ports ?? 2
  const paramCount = pluginMeta?.parameters?.length ?? 0
  const isStereo = inPorts > 1 || outPorts > 1
  const portConfig = inPorts === outPorts ? `${inPorts}×${outPorts}` : `${inPorts}→${outPorts}`
  
  // Check for output visualization capabilities
  const hasMeters = uiInfo?.has_meters || false
  const hasTuner = uiInfo?.has_tuner || false
  const hasSpectrum = uiInfo?.has_spectrum || false
  const hasNativeUI = uiInfo?.has_native_ui || false
  const outputPorts = uiInfo?.output_ports || []

  // Get category-based styling
  const catConfig = getCategoryConfig(category)
  const CategoryIcon = catConfig.icon

  return (
    <div
        className={`list-item ${isSelected ? 'active' : ''} ${plugin.bypassed ? 'bypass-animated' : ''}`}
        draggable
        onDragStart={(e) => {
          // Only allow drag from the grip handle, not from buttons
          const target = e.target as HTMLElement
          if (target.closest('button') || target.closest('[role="button"]')) {
            e.preventDefault()
            return
          }
          onDragStart?.(e, plugin.uri)
        }}
        onDragOver={(e) => { e.preventDefault(); onDragOver?.(e, plugin.uri) }}
        onDragEnd={onDragEnd}
        onDrop={(e) => onDrop?.(e, plugin.uri)}
        style={{
          width: '70%',
          minWidth: 160,
          maxWidth: 240,
          margin: '0 auto',
          border: isSelected ? `2px solid ${catConfig.color}` : isDragOver ? `2px dashed ${catConfig.color}` : `1px solid ${catConfig.color}40`,
          borderRadius: 10,
          padding: '12px 10px 14px',
          background: plugin.bypassed
            ? 'rgba(30, 30, 30, 0.6)'
            : `linear-gradient(135deg, ${catConfig.bg} 0%, rgba(0,0,0,0.4) 100%)`,
          opacity: isDragging ? 0.5 : 1,
          borderLeft: `4px solid ${plugin.bypassed ? '#666' : catConfig.color}`,
          borderTop: `1px solid ${plugin.bypassed ? '#444' : catConfig.color}30`,
          cursor: 'grab',
          transition: 'all 0.2s ease',
          transform: isDragOver ? 'scale(1.02)' : 'scale(1)',
          position: 'relative',
          boxShadow: isSelected
            ? `0 0 20px ${catConfig.color}50, inset 0 0 15px ${catConfig.color}15`
            : plugin.bypassed
              ? 'none'
              : `0 2px 8px rgba(0,0,0,0.3), 0 0 12px ${catConfig.color}20`,
        }}
        onClick={() => onSelect(plugin.uri)}
      >
        {/* Compact Signal Input Widget - Left side */}
        <div style={{
          position: 'absolute',
          left: -8,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          zIndex: 5,
        }}>
          {/* Stereo/Mono indicator */}
          <div style={{
            fontSize: 6,
            fontWeight: 700,
            color: isStereo ? '#22c55e' : '#64748b',
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}>
            {isStereo ? 'ST' : 'M'}
          </div>
          {/* Input signal indicator with icon */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: levelIn > 0.1
                ? levelIn > 0.9 ? 'rgba(239, 68, 68, 0.95)' : levelIn > 0.6 ? 'rgba(245, 158, 11, 0.95)' : 'rgba(34, 197, 94, 0.95)'
                : 'rgba(51, 65, 85, 0.6)',
              border: `1.5px solid ${levelIn > 0.1
                ? levelIn > 0.9 ? '#ef4444' : levelIn > 0.6 ? '#f59e0b' : '#22c55e'
                : 'rgba(100, 116, 139, 0.4)'}`,
              boxShadow: levelIn > 0.1
                ? `0 0 8px ${levelIn > 0.9 ? '#ef4444' : levelIn > 0.6 ? '#f59e0b' : '#22c55e'}80`
                : '0 1px 3px rgba(0,0,0,0.3)',
              transition: 'all 0.06s ease',
            }}
            title={`Input Level: ${Math.round(levelIn * 100)}%${levelIn > 0.9 ? ' ⚠ CLIP' : ''}`}
          >
            <ArrowRightToLine size={9} style={{
              color: levelIn > 0.1 ? '#fff' : 'rgba(255,255,255,0.35)',
              filter: levelIn > 0.9 ? 'drop-shadow(0 0 2px #fff)' : 'none',
            }} />
          </div>
          {/* Vertical level meter - gradient fill */}
          <div style={{
            width: 4,
            height: 24,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), rgba(0,0,0,0.3))',
            borderRadius: 2,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.08)',
            position: 'relative',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
          }}>
            {/* Meter fill with gradient */}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: `${Math.min(100, levelIn * 100)}%`,
              background: levelIn > 0.9
                ? 'linear-gradient(to top, #ef4444, #f87171)'
                : levelIn > 0.6
                  ? 'linear-gradient(to top, #f59e0b, #fbbf24)'
                  : 'linear-gradient(to top, #22c55e, #4ade80)',
              borderRadius: 1,
              transition: 'height 0.04s linear',
              boxShadow: levelIn > 0.1 ? '0 0 4px currentColor' : 'none',
            }} />
            {/* Peak line indicator */}
            {levelIn > 0.7 && (
              <div style={{
                position: 'absolute',
                bottom: `${Math.min(98, levelIn * 100)}%`,
                left: 0,
                right: 0,
                height: 1,
                background: levelIn > 0.9 ? '#fff' : '#fbbf24',
                opacity: 0.8,
              }} />
            )}
          </div>
          {/* Signal present dot */}
          <div style={{
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: levelIn > 0.05 ? '#22c55e' : '#334155',
            boxShadow: levelIn > 0.05 ? '0 0 4px #22c55e' : 'none',
            transition: 'all 0.1s ease',
          }} />
        </div>

        {/* Compact Signal Output Widget - Right side */}
        <div style={{
          position: 'absolute',
          right: -8,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          zIndex: 5,
        }}>
          {/* Gain change indicator */}
          <div style={{
            fontSize: 6,
            fontWeight: 700,
            color: levelOut > levelIn ? '#22c55e' : levelOut < levelIn ? '#f59e0b' : '#64748b',
            letterSpacing: 0.5,
          }}>
            {levelOut > levelIn + 0.1 ? '+' : levelOut < levelIn - 0.1 ? '−' : '='}
          </div>
          {/* Output signal indicator with icon */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: levelOut > 0.1
                ? levelOut > 0.9 ? 'rgba(239, 68, 68, 0.95)' : levelOut > 0.6 ? 'rgba(245, 158, 11, 0.95)' : 'rgba(34, 197, 94, 0.95)'
                : 'rgba(51, 65, 85, 0.6)',
              border: `1.5px solid ${levelOut > 0.1
                ? levelOut > 0.9 ? '#ef4444' : levelOut > 0.6 ? '#f59e0b' : '#22c55e'
                : 'rgba(100, 116, 139, 0.4)'}`,
              boxShadow: levelOut > 0.1
                ? `0 0 8px ${levelOut > 0.9 ? '#ef4444' : levelOut > 0.6 ? '#f59e0b' : '#22c55e'}80`
                : '0 1px 3px rgba(0,0,0,0.3)',
              transition: 'all 0.06s ease',
            }}
            title={`Output Level: ${Math.round(levelOut * 100)}%${levelOut > 0.9 ? ' ⚠ CLIP' : ''}`}
          >
            <ArrowLeftFromLine size={9} style={{
              color: levelOut > 0.1 ? '#fff' : 'rgba(255,255,255,0.35)',
              filter: levelOut > 0.9 ? 'drop-shadow(0 0 2px #fff)' : 'none',
            }} />
          </div>
          {/* Vertical level meter - gradient fill */}
          <div style={{
            width: 4,
            height: 24,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), rgba(0,0,0,0.3))',
            borderRadius: 2,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.08)',
            position: 'relative',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
          }}>
            {/* Meter fill with gradient */}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: `${Math.min(100, levelOut * 100)}%`,
              background: levelOut > 0.9
                ? 'linear-gradient(to top, #ef4444, #f87171)'
                : levelOut > 0.6
                  ? 'linear-gradient(to top, #f59e0b, #fbbf24)'
                  : 'linear-gradient(to top, #22c55e, #4ade80)',
              borderRadius: 1,
              transition: 'height 0.04s linear',
              boxShadow: levelOut > 0.1 ? '0 0 4px currentColor' : 'none',
            }} />
            {/* Peak line indicator */}
            {levelOut > 0.7 && (
              <div style={{
                position: 'absolute',
                bottom: `${Math.min(98, levelOut * 100)}%`,
                left: 0,
                right: 0,
                height: 1,
                background: levelOut > 0.9 ? '#fff' : '#fbbf24',
                opacity: 0.8,
              }} />
            )}
          </div>
          {/* Signal flow indicator */}
          <div style={{
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: levelOut > 0.05 ? (plugin.bypassed ? '#64748b' : '#22c55e') : '#334155',
            boxShadow: levelOut > 0.05 && !plugin.bypassed ? '0 0 4px #22c55e' : 'none',
            transition: 'all 0.1s ease',
          }} />
        </div>
        {/* Category color bar at top */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: plugin.bypassed
            ? 'linear-gradient(90deg, #666, #444)'
            : `linear-gradient(90deg, ${catConfig.color}, ${catConfig.color}80)`,
          borderRadius: '10px 10px 0 0',
          boxShadow: plugin.bypassed ? 'none' : `0 0 8px ${catConfig.color}60`,
        }} />

        {/* Header row: Drag handle + Icon + Name + Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8, marginTop: 2 }}>
          <span
            style={{ cursor: 'grab', color: catConfig.color, flexShrink: 0, opacity: 0.6 }}
            title="Drag to reorder"
          >
            <GripVertical size={12} />
          </span>
          <span style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            borderRadius: 6,
            background: plugin.bypassed
              ? 'rgba(50, 50, 50, 0.6)'
              : `linear-gradient(135deg, ${catConfig.color}30 0%, ${catConfig.color}15 100%)`,
            color: catConfig.color,
            flexShrink: 0,
            boxShadow: plugin.bypassed ? 'none' : `0 0 10px ${catConfig.color}40`,
            border: `1.5px solid ${plugin.bypassed ? '#555' : catConfig.color}60`,
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Subtle shimmer on active plugins */}
            {!plugin.bypassed && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(135deg, transparent 0%, ${catConfig.color}25 50%, transparent 100%)`,
                animation: 'shimmer 3s ease-in-out infinite',
                opacity: 0.6,
              }} />
            )}
            <CategoryIcon size={13} style={{
              filter: plugin.bypassed ? 'grayscale(1)' : `drop-shadow(0 0 4px ${catConfig.color})`,
              position: 'relative',
              zIndex: 1,
            }} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Effect Type as Main Title */}
            <div style={{
              fontSize: 12,
              fontWeight: 700,
              color: plugin.bypassed ? '#888' : catConfig.color,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textShadow: plugin.bypassed ? 'none' : `0 0 10px ${catConfig.color}50`,
              letterSpacing: 0.3,
            }} title={category}>
              {category}
            </div>
            {/* Plugin Name as Subtext */}
            <div className="stat-label" style={{
              fontSize: 9,
              color: plugin.bypassed ? '#666' : 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginTop: 2,
            }} title={displayName}>
              {displayName}
            </div>
          </div>
          <span
            style={{
              fontSize: 8,
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 4,
              background: plugin.bypassed
                ? 'rgba(100, 100, 100, 0.3)'
                : `${catConfig.color}25`,
              color: plugin.bypassed ? '#888' : catConfig.color,
              border: `1px solid ${plugin.bypassed ? '#555' : catConfig.color}50`,
              boxShadow: plugin.bypassed ? 'none' : `0 0 6px ${catConfig.color}40`,
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            {/* Status dot */}
            <span style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: plugin.bypassed ? '#666' : catConfig.color,
              boxShadow: plugin.bypassed ? 'none' : `0 0 4px ${catConfig.color}`,
              animation: plugin.bypassed ? 'none' : 'breathe 1.5s ease-in-out infinite',
            }} />
            {plugin.bypassed ? 'OFF' : 'ON'}
          </span>
        </div>

        {/* Compact info row: Ports + Params */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          marginBottom: 6,
          padding: '3px 0',
          borderTop: `1px solid ${catConfig.color}15`,
          borderBottom: `1px solid ${catConfig.color}15`,
        }}>
          <span style={{
            fontSize: 8,
            fontWeight: 500,
            color: isStereo ? catConfig.color : '#666',
            padding: '1px 4px',
            background: isStereo ? `${catConfig.color}15` : 'rgba(100,100,100,0.2)',
            borderRadius: 3,
          }} title={`${inPorts} in, ${outPorts} out`}>
            {portConfig}
          </span>
          {paramCount > 0 && (
            <span style={{
              fontSize: 8,
              color: '#888',
              fontFamily: 'monospace',
            }} title={`${paramCount} parameters`}>
              {paramCount}P
            </span>
          )}
        </div>

        {/* UI Capability Badges - Compact inline */}
        {(hasMeters || hasTuner || hasSpectrum || hasNativeUI) && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
            marginBottom: 6,
            flexWrap: 'wrap',
          }}>
            {hasMeters && (
              <span
                style={{
                  fontSize: 7,
                  fontWeight: 600,
                  padding: '1px 4px',
                  background: `${catConfig.color}15`,
                  color: catConfig.color,
                  borderRadius: 3,
                }}
                title="Gain reduction/level meters"
              >
                <Gauge size={7} style={{ marginRight: 2, verticalAlign: 'middle' }} />M
              </span>
            )}
            {hasTuner && (
              <span
                style={{
                  fontSize: 7,
                  fontWeight: 600,
                  padding: '1px 4px',
                  background: `${catConfig.color}15`,
                  color: catConfig.color,
                  borderRadius: 3,
                }}
                title="Tuner output"
              >
                <Radio size={7} style={{ marginRight: 2, verticalAlign: 'middle' }} />T
              </span>
            )}
            {hasSpectrum && (
              <span
                style={{
                  fontSize: 7,
                  fontWeight: 600,
                  padding: '1px 4px',
                  background: `${catConfig.color}15`,
                  color: catConfig.color,
                  borderRadius: 3,
                }}
                title="Spectrum analyzer"
              >
                <BarChart2 size={7} style={{ marginRight: 2, verticalAlign: 'middle' }} />S
              </span>
            )}
            {hasNativeUI && (
              <span
                style={{
                  fontSize: 7,
                  fontWeight: 600,
                  padding: '1px 4px',
                  background: `${catConfig.color}15`,
                  color: catConfig.color,
                  borderRadius: 3,
                }}
                title={`Native UI: ${uiInfo?.ui_types?.join(', ') || 'GUI'}`}
              >
                UI
              </span>
            )}
          </div>
        )}

        {/* JUCE Performance Metrics Row - Compact */}
        {(plugin.format || plugin.cpu_percent !== undefined || plugin.latency_samples || plugin.sidechain_source || plugin.latency_compensated) && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            marginBottom: 6,
            flexWrap: 'wrap',
          }}>
            {/* Plugin Format Badge */}
            {plugin.format && plugin.format !== 'Unknown' && (
              <span
                style={{
                  fontSize: 7,
                  fontWeight: 700,
                  padding: '1px 4px',
                  background: plugin.format === 'VST3' ? 'rgba(74, 222, 128, 0.2)'
                    : plugin.format === 'AudioUnit' ? 'rgba(96, 165, 250, 0.2)'
                    : plugin.format === 'LV2' ? 'rgba(244, 114, 182, 0.2)'
                    : 'rgba(251, 191, 36, 0.2)',
                  color: plugin.format === 'VST3' ? '#4ade80'
                    : plugin.format === 'AudioUnit' ? '#60a5fa'
                    : plugin.format === 'LV2' ? '#f472b6'
                    : '#fbbf24',
                  borderRadius: 3,
                  letterSpacing: 0.3,
                }}
                title={`Plugin format: ${plugin.format}`}
              >
                {plugin.format}
              </span>
            )}

            {/* Per-Plugin CPU */}
            {plugin.cpu_percent !== undefined && plugin.cpu_percent > 0 && (
              <span
                style={{
                  fontSize: 7,
                  fontWeight: 600,
                  fontFamily: 'monospace',
                  padding: '1px 4px',
                  background: plugin.cpu_percent > 30 ? 'rgba(239, 68, 68, 0.2)'
                    : plugin.cpu_percent > 15 ? 'rgba(251, 191, 36, 0.2)'
                    : 'rgba(100, 181, 246, 0.2)',
                  color: plugin.cpu_percent > 30 ? '#ef4444'
                    : plugin.cpu_percent > 15 ? '#fbbf24'
                    : '#64b5f6',
                  borderRadius: 3,
                }}
                title={`CPU: ${plugin.cpu_percent.toFixed(1)}%`}
              >
                {plugin.cpu_percent.toFixed(0)}%
              </span>
            )}

            {/* Per-Plugin Latency */}
            {plugin.latency_samples !== undefined && plugin.latency_samples > 0 && (
              <span
                style={{
                  fontSize: 7,
                  fontWeight: 600,
                  fontFamily: 'monospace',
                  padding: '1px 4px',
                  background: 'rgba(171, 71, 188, 0.2)',
                  color: '#ab47bc',
                  borderRadius: 3,
                }}
                title={`Latency: ${plugin.latency_samples} samples (${((plugin.latency_samples / 48000) * 1000).toFixed(2)}ms)`}
              >
                {plugin.latency_samples}s
              </span>
            )}

            {/* PDC Status */}
            {plugin.latency_compensated && (
              <span
                style={{
                  fontSize: 7,
                  fontWeight: 600,
                  padding: '1px 4px',
                  background: 'rgba(34, 197, 94, 0.2)',
                  color: '#22c55e',
                  borderRadius: 3,
                }}
                title="PDC Active"
              >
                PDC
              </span>
            )}

            {/* Sidechain Indicator */}
            {plugin.sidechain_source && (
              <span
                style={{
                  fontSize: 7,
                  fontWeight: 600,
                  padding: '1px 4px',
                  background: 'rgba(168, 85, 247, 0.2)',
                  color: '#a855f7',
                  borderRadius: 3,
                }}
                title={`Sidechain from: ${plugin.sidechain_source}`}
              >
                SC
              </span>
            )}
          </div>
        )}

        {/* Output Port Meters - Compact inline visualization */}
        {showOutputMeters && hasMeters && outputPorts.length > 0 && !plugin.bypassed && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              marginBottom: 6,
              padding: '4px 6px',
              background: `${catConfig.color}08`,
              borderRadius: 4,
              border: `1px solid ${catConfig.color}20`,
            }}
          >
            {outputPorts.slice(0, 3).map((port) => {
              // Render appropriate meter based on designation
              if (port.designation === 'gain_reduction') {
                return (
                  <GainReductionMeter
                    key={port.index}
                    gainReduction={0} // TODO: Wire to real data
                    maxReduction={Math.abs(port.min_value) || 24}
                    orientation="horizontal"
                    size={12}
                    length={60}
                    showValue={true}
                  />
                )
              }
              if (port.designation === 'meter') {
                return (
                  <AudioMeter
                    key={port.index}
                    peak={0} // TODO: Wire to real data
                    orientation="vertical"
                    size={10}
                    length={40}
                    showScale={false}
                    showValue={false}
                    label={port.name.substring(0, 4)}
                    variant="mini"
                  />
                )
              }
              // Generic numeric output
              return (
                <div 
                  key={port.index}
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center',
                    gap: 2,
                  }}
                >
                  <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
                    {port.name.substring(0, 6)}
                  </span>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)' }}>
                    --
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Wet/Dry Mix Slider - Compact */}
        {onWetDryChange && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginBottom: 6,
            padding: '2px 4px',
            background: `${catConfig.color}08`,
            borderRadius: 4,
          }}>
            <span style={{ fontSize: 7, fontWeight: 600, color: catConfig.color, minWidth: 18 }}>MIX</span>
            <input
              type="range"
              min={0}
              max={100}
              value={wetDryMix}
              onChange={(e) => { e.stopPropagation(); onWetDryChange(plugin.uri, Number(e.target.value)) }}
              onClick={(e) => e.stopPropagation()}
              style={{ flex: 1, height: 3, accentColor: catConfig.color }}
              title={`Wet/Dry: ${wetDryMix}%`}
            />
            <span style={{ fontSize: 8, fontFamily: 'monospace', color: '#888', minWidth: 22 }}>{wetDryMix}%</span>
          </div>
        )}

        {/* Button row: compact icon buttons */}
        <div style={{
          display: 'flex',
          gap: 3,
          marginTop: 4,
          position: 'relative',
          zIndex: 10,
          pointerEvents: 'auto',
        }}>
          <button
            className="btn btn-ghost btn-sm"
            style={{
              padding: '4px',
              fontSize: 10,
              justifyContent: 'center',
              flex: 1,
              minWidth: 0,
              background: `${catConfig.color}10`,
              borderColor: `${catConfig.color}30`,
              borderRadius: 4,
              cursor: 'pointer',
            }}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onMove(plugin.uri, -1) }}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={reorderPending || idx === 0}
            title="Move up (↑)"
          >
            <ArrowUp size={10} style={{ color: catConfig.color }} />
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{
              padding: '4px',
              fontSize: 10,
              justifyContent: 'center',
              flex: 1,
              minWidth: 0,
              background: `${catConfig.color}10`,
              borderColor: `${catConfig.color}30`,
              borderRadius: 4,
              cursor: 'pointer',
            }}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onMove(plugin.uri, 1) }}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={reorderPending || idx === totalPlugins - 1}
            title="Move down (↓)"
          >
            <ArrowDown size={10} style={{ color: catConfig.color }} />
          </button>
          <button
            className="btn btn-sm"
            style={{
              padding: '4px',
              fontSize: 10,
              justifyContent: 'center',
              flex: 1,
              minWidth: 0,
              background: plugin.bypassed ? catConfig.color : `${catConfig.color}10`,
              borderColor: plugin.bypassed ? catConfig.color : `${catConfig.color}30`,
              borderRadius: 4,
              cursor: 'pointer',
            }}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggleBypass.mutate({ chainId, uri: plugin.uri, bypass: plugin.bypassed }) }}
            onMouseDown={(e) => e.stopPropagation()}
            title={plugin.bypassed ? 'Enable (B)' : 'Bypass (B)'}
          >
            <Power size={10} style={{ color: plugin.bypassed ? '#fff' : catConfig.color }} />
          </button>
          {onSavePreset && (
            <button
              className="btn btn-ghost btn-sm"
              style={{
                padding: '4px',
                fontSize: 10,
                justifyContent: 'center',
                flex: 1,
                minWidth: 0,
                background: `${catConfig.color}10`,
                borderColor: `${catConfig.color}30`,
                borderRadius: 4,
                cursor: 'pointer',
              }}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onSavePreset(plugin.uri) }}
              onMouseDown={(e) => e.stopPropagation()}
              title="Save preset (S)"
            >
              <Save size={10} style={{ color: catConfig.color }} />
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            style={{
              padding: '4px',
              fontSize: 10,
              justifyContent: 'center',
              flex: 1,
              minWidth: 0,
              background: 'rgba(239, 68, 68, 0.1)',
              borderColor: 'rgba(239, 68, 68, 0.3)',
              borderRadius: 4,
              cursor: 'pointer',
            }}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRemove.mutate({ chainId, uri: plugin.uri }) }}
            onMouseDown={(e) => e.stopPropagation()}
            title="Delete"
          >
            <Trash2 size={10} style={{ color: '#ef4444' }} />
          </button>
        </div>
      </div>
  )
}

export function ChainFlowPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { pushToast } = useToasts()
  const queryClient = useQueryClient()

  const chainsKey = ['chains'] as const
  const chainsQuery = useQuery<ChainsResponse>({ 
    queryKey: chainsKey, 
    queryFn: chainsApi.list,
    staleTime: 30000, // Keep data fresh for 30 seconds - don't refetch too aggressively
    refetchOnMount: false, // Don't auto-refetch when component mounts
    refetchOnWindowFocus: false, // Don't refetch on window focus
    // Deliberately NO refetchInterval - polling will cause stale data issues with deletes
    // Chain state changes will be handled by explicit mutations with onSettled refetch
  })
  const pluginsQuery = useQuery<PluginDiscoverResponse>({
    queryKey: ['plugins', 'discover'],
    queryFn: () => pluginsApi.discover(),
    staleTime: 60000, // Refetch if data is older than 1 minute
    refetchOnMount: 'always', // Always refetch when component mounts
  })

  // Audio interface status queries for input/output cards
  const audioStatusQuery = useQuery<AudioStatus>({
    queryKey: ['audio', 'status'],
    queryFn: () => audioApi.getStatus(),
    refetchInterval: 3000, // Refresh every 3 seconds
  })

  // Native plugins hook for Cabinet IR and other native plugin status
  const {
    cabinet: cabinetStatus,
    updateCabinetIR,
    updateCabinetMix,
    updateCabinetBypass
  } = useNativePlugins()
  
  const jackMetricsQuery = useQuery<JackMetrics>({
    queryKey: ['metrics', 'jack'],
    queryFn: () => metricsApi.getJack(),
    refetchInterval: 2000, // Refresh every 2 seconds for responsive display
  })
  
  const systemMetricsQuery = useQuery<SystemMetrics>({
    queryKey: ['metrics', 'current'],
    queryFn: () => metricsApi.getCurrent(),
    refetchInterval: 2000,
  })

  // JUCE audio engine metrics via WebSocket for real-time CPU, XRuns, etc.
  const {
    metrics: juceMetrics,
    status: juceStatus,
    hasXruns: juceHasXruns,
    getTopConsumers: getTopCpuPlugins,
    isConnected: juceConnected
  } = useCPUMetrics({ useWebSocket: true })

  // Compute audio interface status for ChainEndpoint components
  const audioInterfaceStatus: AudioInterfaceStatus = useMemo(() => {
    const audio = audioStatusQuery.data
    const jack = jackMetricsQuery.data
    const metrics = systemMetricsQuery.data

    return {
      deviceName: audio?.engine || 'JACK Audio',
      sampleRate: jack?.sample_rate || audio?.sample_rate || 48000,
      bufferSize: jack?.buffer_size || audio?.buffer_size || 256,
      latencyMs: jack?.latency_ms || metrics?.audio_latency_ms || 5.3,
      channels: 2, // Default stereo
      // Use JUCE metrics when available, fallback to system metrics
      cpuLoad: juceMetrics.running ? juceMetrics.totalCpuPercent : (audio?.cpu_load || metrics?.cpu_percent || 0),
      xruns: juceMetrics.running ? juceMetrics.xrunCount : (metrics?.audio_xruns || 0),
      isRunning: audio?.running ?? true,
    }
  }, [audioStatusQuery.data, jackMetricsQuery.data, systemMetricsQuery.data, juceMetrics])

  // ============================================================================
  // N-Chain Flow System State
  // ============================================================================

  // Chain slots - array of chain slot configurations (default 3, max 6)
  const [chainSlots, setChainSlots] = useState<ChainSlot[]>(() => {
    // Run migration first
    const migrated = migrateLocalStorage()
    if (migrated) return migrated.slots

    try {
      const saved = localStorage.getItem('map2_flow_chain_slots_v2')
      if (saved) return JSON.parse(saved)
    } catch { /* ignore */ }

    return createDefaultSlots(DEFAULT_CHAIN_COUNT)
  })

  // Active slot index - which slot is currently focused for editing
  const [activeSlotIndex, setActiveSlotIndex] = useState<number>(() => {
    const migrated = migrateLocalStorage()
    if (migrated) return migrated.activeIndex

    try {
      const val = localStorage.getItem('map2_flow_active_slot_v2')
      return val ? parseInt(val, 10) : 0
    } catch { return 0 }
  })

  // Routing configuration
  const [routing, setRouting] = useState<RoutingConfig>(() => {
    const migrated = migrateLocalStorage()
    if (migrated) return migrated.routing

    try {
      const saved = localStorage.getItem('map2_flow_routing_v2')
      if (saved) return JSON.parse(saved)
    } catch { /* ignore */ }

    return createDefaultRouting()
  })

  // Legacy compatibility - derive old values for existing code
  const selectedChainId = chainSlots[0]?.chainId ?? null
  const secondChainId = chainSlots[1]?.chainId ?? null
  const activeChainSlot = (activeSlotIndex + 1) as 1 | 2  // For backwards compat
  const chainRoutingMode = routing.mode === 'parallel_blend' ? 'parallel' as const :
                           routing.mode === 'ab_switch' ? 'ab_switch' as const : 'series' as const
  const chainMix = routing.blendPositions['slot-1'] ?? 50

  // Setters for legacy code - redirect to new state
  const setSelectedChainId = useCallback((id: number | null) => {
    setChainSlots(prev => prev.map((slot, i) => i === 0 ? { ...slot, chainId: id } : slot))
  }, [])

  const setSecondChainId = useCallback((id: number | null) => {
    setChainSlots(prev => prev.map((slot, i) => i === 1 ? { ...slot, chainId: id } : slot))
  }, [])

  const setActiveChainSlot = useCallback((slot: 1 | 2) => {
    setActiveSlotIndex(slot - 1)
  }, [])

  const setChainRoutingMode = useCallback((mode: 'parallel' | 'ab_switch' | 'series') => {
    const modeMap: Record<string, RoutingMode> = {
      'parallel': 'parallel_blend',
      'ab_switch': 'ab_switch',
      'series': 'series',
    }
    setRouting(prev => ({ ...prev, mode: modeMap[mode] || 'parallel_blend' }))
  }, [])

  const setChainMix = useCallback((mix: number) => {
    setRouting(prev => ({
      ...prev,
      blendPositions: {
        ...prev.blendPositions,
        'slot-0': 100 - mix,
        'slot-1': mix,
      }
    }))
  }, [])

  // Enhanced routing mode setter (supports all 5 JUCE modes)
  const setRoutingMode = useCallback((mode: RoutingMode) => {
    setRouting(prev => ({ ...prev, mode }))
  }, [])

  // Morph progress setter
  const setMorphProgress = useCallback((progress: number) => {
    setRouting(prev => ({ ...prev, morphProgress: progress }))
  }, [])

  // Morph source/target setters
  const setMorphSource = useCallback((slotId: string | null) => {
    setRouting(prev => ({ ...prev, morphSourceSlotId: slotId }))
  }, [])

  const setMorphTarget = useCallback((slotId: string | null) => {
    setRouting(prev => ({ ...prev, morphTargetSlotId: slotId }))
  }, [])

  // Series order setter
  const setSeriesOrder = useCallback((order: string[]) => {
    setRouting(prev => ({ ...prev, seriesOrder: order }))
  }, [])

  // Per-chain blend position setter (for parallel mode with N chains)
  const setSlotBlendLevel = useCallback((slotId: string, level: number) => {
    setRouting(prev => ({
      ...prev,
      blendPositions: {
        ...prev.blendPositions,
        [slotId]: level,
      }
    }))
  }, [])

  // ============================================================================
  // Chain Slot Management Functions
  // ============================================================================

  const addChainSlot = useCallback(() => {
    if (chainSlots.length >= MAX_CHAINS) return

    const nextIndex = chainSlots.length
    const colorConfig = SLOT_COLORS[nextIndex] || SLOT_COLORS[nextIndex % SLOT_COLORS.length]

    setChainSlots(prev => [...prev, {
      id: `slot-${Date.now()}`,
      chainId: null,
      label: colorConfig.label,
      color: colorConfig.color,
      dryWetMix: 100,
      muted: false,
      solo: false,
    }])
  }, [chainSlots.length])

  const removeChainSlot = useCallback((slotId: string) => {
    if (chainSlots.length <= MIN_CHAINS) {
      return // Don't allow removing below minimum
    }

    setChainSlots(prev => prev.filter(s => s.id !== slotId))

    // Adjust active slot if necessary
    const removedIndex = chainSlots.findIndex(s => s.id === slotId)
    if (activeSlotIndex >= removedIndex && activeSlotIndex > 0) {
      setActiveSlotIndex(prev => prev - 1)
    }
  }, [chainSlots, activeSlotIndex])

  const updateChainSlot = useCallback((slotId: string, updates: Partial<ChainSlot>) => {
    setChainSlots(prev => prev.map(slot =>
      slot.id === slotId ? { ...slot, ...updates } : slot
    ))
  }, [])

  // Get chain for a specific slot
  const getChainForSlot = useCallback((slot: ChainSlot): Chain | undefined => {
    return chainsQuery.data?.chains.find(c => c.id === slot.chainId)
  }, [chainsQuery.data])

  // ============================================================================
  // Other UI State
  // ============================================================================

  const [selectedPluginUri, setSelectedPluginUri] = useState<string | null>(null)
  const [search, setSearch] = useState(() => {
    try {
      return localStorage.getItem('map2_flow_search') || '';
    } catch { return ''; }
  })
  const [category, setCategory] = useState<string>(() => {
    try {
      return localStorage.getItem('map2_flow_category') || 'all';
    } catch { return 'all'; }
  })
  const [detailsPlugin, setDetailsPlugin] = useState<Plugin | null>(null)

  // New state for enhanced features
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => {
    try {
      const val = localStorage.getItem('map2_flow_collapsed_categories');
      return val ? new Set(JSON.parse(val)) : new Set();
    } catch { return new Set(); }
  })

  // Favorites - persisted to localStorage
  const [favoritePlugins, setFavoritePlugins] = useState<Set<string>>(new Set())
  const [draggedPluginUri, setDraggedPluginUri] = useState<string | null>(null)
  const [dragOverPluginUri, setDragOverPluginUri] = useState<string | null>(null)
  const [pluginLevels, setPluginLevels] = useState<Record<string, { in: number; out: number }>>({})
  const [wetDryMixes, setWetDryMixes] = useState<Record<string, number>>({})
  const [isMobile, setIsMobile] = useState(false)
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus | null>(null)
  const _containerRef = useRef<HTMLDivElement>(null) // Reserved for future scrolling features

  // JUCE Integration Feature State
  const [audioConfigDialogOpen, setAudioConfigDialogOpen] = useState(false)
  const [midiLearnMode, setMidiLearnMode] = useState(false)
  const [midiMappingsPanelOpen, setMidiMappingsPanelOpen] = useState(false)
  const [automationTimelineExpanded, setAutomationTimelineExpanded] = useState(false)
  const [automationPlaying, setAutomationPlaying] = useState(false)
  const [automationRecording, setAutomationRecording] = useState(false)
  const [automationLoopEnabled, setAutomationLoopEnabled] = useState(false)
  const [automationCurrentTime, setAutomationCurrentTime] = useState(0)
  const [automationDuration, setAutomationDuration] = useState(60)

  // History query
  const historyQuery = useQuery({
    queryKey: ['history', 'status'],
    queryFn: () => historyApi.getStatus(),
    refetchInterval: 5000,
  })

  useEffect(() => {
    if (historyQuery.data) {
      setHistoryStatus(historyQuery.data)
    }
  }, [historyQuery.data])

  // Load favorites from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('map2-favorite-plugins')
      if (stored) {
        setFavoritePlugins(new Set(JSON.parse(stored)))
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [])

  // Persist N-chain state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('map2_flow_chain_slots_v2', JSON.stringify(chainSlots))
    } catch { /* Ignore localStorage errors */ }
  }, [chainSlots])

  useEffect(() => {
    try {
      localStorage.setItem('map2_flow_routing_v2', JSON.stringify(routing))
    } catch { /* Ignore localStorage errors */ }
  }, [routing])

  useEffect(() => {
    try {
      localStorage.setItem('map2_flow_active_slot_v2', String(activeSlotIndex))
    } catch { /* Ignore localStorage errors */ }
  }, [activeSlotIndex])

  useEffect(() => {
    try {
      localStorage.setItem('map2_flow_search', search);
    } catch { /* Ignore localStorage errors */ }
  }, [search])

  useEffect(() => {
    try {
      localStorage.setItem('map2_flow_category', category);
    } catch { /* Ignore localStorage errors */ }
  }, [category])

  useEffect(() => {
    try {
      localStorage.setItem('map2_flow_collapsed_categories', JSON.stringify([...collapsedCategories]));
    } catch { /* Ignore localStorage errors */ }
  }, [collapsedCategories])

  // Inject CSS for animations (once on mount)
  useEffect(() => {
    const styleId = 'chainflow-animations'
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = BYPASS_ANIMATION_STYLE
      document.head.appendChild(style)
    }
    return () => {
      // Cleanup on unmount (optional - keep styles for performance)
    }
  }, [])

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Initialize chain slots with available chains
  useEffect(() => {
    if (!chainsQuery.data?.chains?.length) return

    const availableChains = chainsQuery.data.chains
    const needsInit = chainSlots.some((slot, idx) => slot.chainId === null && idx < availableChains.length)

    if (needsInit) {
      setChainSlots(prev => prev.map((slot, idx) => {
        // Only initialize slots that don't have a chain selected
        if (slot.chainId !== null) return slot

        // Find a chain not already used in other slots
        const usedChainIds = prev.filter((s, i) => i !== idx && s.chainId !== null).map(s => s.chainId)
        const availableChain = availableChains.find(c => !usedChainIds.includes(c.id))

        // Prefer the active chain for the first slot
        if (idx === 0) {
          const activeChain = availableChains.find(c => c.is_active)
          if (activeChain && !usedChainIds.includes(activeChain.id)) {
            return { ...slot, chainId: activeChain.id }
          }
        }

        return availableChain ? { ...slot, chainId: availableChain.id } : slot
      }))
    }
  }, [chainsQuery.data, chainSlots])

  // Memoized chain lookups for all slots
  const slotChains = useMemo(() => {
    return chainSlots.map(slot => ({
      slot,
      chain: chainsQuery.data?.chains.find(c => c.id === slot.chainId),
    }))
  }, [chainsQuery.data, chainSlots])

  // Legacy derived values for backwards compatibility
  const selectedChain = useMemo<Chain | undefined>(() => {
    return chainsQuery.data?.chains.find((c) => c.id === selectedChainId)
  }, [chainsQuery.data, selectedChainId])

  const secondChain = useMemo<Chain | undefined>(() => {
    return chainsQuery.data?.chains.find((c) => c.id === secondChainId)
  }, [chainsQuery.data, secondChainId])

  // Get the active chain for plugin operations (N-chain aware)
  const activeSlot = chainSlots[activeSlotIndex]
  const activeChain = activeSlot ? slotChains.find(sc => sc.slot.id === activeSlot.id)?.chain : undefined
  const activeChainId = activeSlot?.chainId ?? null

  useEffect(() => {
    if (selectedPluginUri && activeChain) {
      const exists = activeChain.plugins.some((p) => p.uri === selectedPluginUri)
      if (!exists) {
        setSelectedPluginUri(activeChain.plugins[0]?.uri ?? null)
      }
    } else if (activeChain && !selectedPluginUri && activeChain.plugins.length > 0) {
      setSelectedPluginUri(activeChain.plugins[0].uri)
    }
  }, [activeChain, selectedPluginUri])

  // Simulate level meters for all chain slots
  useEffect(() => {
    const interval = setInterval(() => {
      const newLevels: Record<string, { in: number; out: number }> = {}

      // Process all chains in all slots
      slotChains.forEach(({ slot, chain }) => {
        if (!chain || slot.muted) return

        chain.plugins.forEach((p) => {
          if (!p.bypassed) {
            newLevels[p.uri] = {
              in: Math.random() * 0.7 + 0.1,
              out: Math.random() * 0.7 + 0.1,
            }
          } else {
            newLevels[p.uri] = { in: 0, out: 0 }
          }
        })
      })

      setPluginLevels(newLevels)
    }, 100)
    return () => clearInterval(interval)
  }, [slotChains])

  const pluginMetaByUri = useMemo(() => {
    const map: Record<string, Plugin> = {}
    pluginsQuery.data?.plugins?.forEach((p: Plugin) => {
      map[p.uri] = p
    })
    return map
  }, [pluginsQuery.data])

  const categories = useMemo(() => {
    const set = new Set<string>()
    pluginsQuery.data?.plugins?.forEach((p: Plugin) => set.add(p.category))
    return Array.from(set).sort()
  }, [pluginsQuery.data])

  const invalidateChains = () => queryClient.invalidateQueries({ queryKey: chainsKey })
  // invalidateHistory is called via historyQuery refetch
  const _invalidateHistory = () => queryClient.invalidateQueries({ queryKey: ['history', 'status'] })

  // Undo/Redo mutations
  const undoMutation = useMutation({
    mutationFn: () => historyApi.undo(),
    onSuccess: (data) => {
      setHistoryStatus((prev) => prev ? {
        ...prev,
        can_undo: data.can_undo,
        can_redo: data.can_redo,
        next_undo: data.next_undo,
      } : null)
      invalidateChains()
      pushToast('Undo: ' + (data.message || 'Action undone'), 'info')
    },
    onError: () => pushToast('Undo failed', 'error'),
  })

  const redoMutation = useMutation({
    mutationFn: () => historyApi.redo(),
    onSuccess: (data) => {
      setHistoryStatus((prev) => prev ? {
        ...prev,
        can_undo: data.can_undo,
        can_redo: data.can_redo,
        next_redo: data.next_redo,
      } : null)
      invalidateChains()
      pushToast('Redo: ' + (data.message || 'Action redone'), 'info')
    },
    onError: () => pushToast('Redo failed', 'error'),
  })

  const optimisticUpdateChain = (updater: (prev: ChainsResponse) => ChainsResponse) => {
    queryClient.setQueryData(chainsKey, (prev?: ChainsResponse) => {
      if (!prev) return prev as any
      return updater(prev)
    })
  }

  const addPlugin = useMutation({
    mutationFn: (uri: string) => chainsApi.addPlugin(activeChainId as number, uri),
    onSuccess: () => {
      invalidateChains()
      const chainLabel = activeChainSlot === 1 ? 'Chain A' : 'Chain B'
      pushToast(`Plugin added to ${chainLabel}`, 'success')
    },
    onError: () => pushToast('Failed to add plugin', 'error'),
  })

  // Handle addPlugin query parameter from plugin browser pages
  useEffect(() => {
    const pluginUri = searchParams.get('addPlugin')
    if (pluginUri && activeChainId) {
      // Clear the query parameter immediately to prevent re-adding on refresh
      setSearchParams({}, { replace: true })
      // Add the plugin to the active chain
      addPlugin.mutate(pluginUri)
    }
  }, [searchParams, activeChainId, addPlugin, setSearchParams])

  const removePlugin = useMutation({
    mutationFn: ({ chainId, uri }: { chainId: number; uri: string }) => chainsApi.removePlugin(chainId, uri),
    onMutate: async ({ chainId, uri }) => {
      await queryClient.cancelQueries({ queryKey: chainsKey })
      const previous = queryClient.getQueryData(chainsKey) as ChainsResponse | undefined
      optimisticUpdateChain((prev) => ({
        ...prev,
        chains: prev.chains.map((c) =>
          c.id === chainId ? { ...c, plugins: c.plugins.filter((p) => p.uri !== uri) } : c
        ),
      }))
      return { previous, chainId, uri }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(chainsKey, context.previous)
      pushToast('Failed to remove plugin', 'error')
    },
    onSuccess: (_data, { chainId, uri }) => {
      if (selectedPluginUri === uri) {
        const updated = queryClient.getQueryData(chainsKey) as ChainsResponse | undefined
        const chain = updated?.chains.find((c) => c.id === chainId)
        setSelectedPluginUri(chain?.plugins[0]?.uri ?? null)
      }
      pushToast('Plugin removed', 'warn')
    },
    onSettled: async () => {
      // NO-JUMP DELETION: Keep optimistic UI, validate in background
      // The server has already verified deletion succeeded before returning
      // Just do a silent background refetch without triggering a visible re-render jump
      
      // Invalidate (mark as stale) but don't immediately refetch
      // This allows background refresh without interrupting user interaction
      queryClient.invalidateQueries({ 
        queryKey: chainsKey,
        // Don't trigger immediate refetch, just mark as stale
      })
      
      // Background refetch will happen automatically on next focus/interaction
      // or manually trigger a background refresh without awaiting
      // This prevents the page jump that happens with immediate refetch
      queryClient.refetchQueries({
        queryKey: chainsKey,
        type: 'active'  // Refetch active queries
      })
    },
  })

  const toggleBypass = useMutation({
    mutationFn: ({ chainId, uri, bypass }: { chainId: number; uri: string; bypass: boolean }) =>
      chainsApi.togglePluginBypass(chainId, uri, !bypass),
    onMutate: async ({ chainId, uri }) => {
      await queryClient.cancelQueries({ queryKey: chainsKey })
      const previous = queryClient.getQueryData(chainsKey) as ChainsResponse | undefined
      optimisticUpdateChain((prev) => ({
        ...prev,
        chains: prev.chains.map((c) =>
          c.id === chainId
            ? {
                ...c,
                plugins: c.plugins.map((p) => (p.uri === uri ? { ...p, bypassed: !p.bypassed } : p)),
              }
            : c
        ),
      }))
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(chainsKey, context.previous)
      pushToast('Failed to toggle bypass', 'error')
    },
    onSettled: () => invalidateChains(),
  })

  const reorder = useMutation({
    mutationFn: ({ chainId, order }: { chainId: number; order: string[] }) => chainsApi.reorderPlugins(chainId, order),
    onMutate: async ({ chainId, order }) => {
      await queryClient.cancelQueries({ queryKey: chainsKey })
      const previous = queryClient.getQueryData(chainsKey) as ChainsResponse | undefined
      optimisticUpdateChain((prev) => ({
        ...prev,
        chains: prev.chains.map((c) =>
          c.id === chainId
            ? { ...c, plugins: order.map((uri) => c.plugins.find((p) => p.uri === uri)!).filter(Boolean) }
            : c
        ),
      }))
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(chainsKey, context.previous)
      pushToast('Failed to reorder chain', 'error')
    },
    onSuccess: () => {
      pushToast('Chain reordered', 'success')
    },
    onSettled: () => invalidateChains(),
  })

  const setParameter = useMutation({
    mutationFn: ({ uri, paramIndex, value }: { uri: string; paramIndex: number; value: number }) =>
      pluginsApi.setParameter(uri, paramIndex, value),
    onMutate: ({ uri, paramIndex, value }) => {
      const meta = pluginMetaByUri[uri]
      const param = meta?.parameters?.find((p) => p.index === paramIndex)
      const key = param ? getParamKey(param) : String(paramIndex)
      optimisticUpdateChain((prev) => ({
        ...prev,
        chains: prev.chains.map((c) =>
          c.id === selectedChainId
            ? {
                ...c,
                plugins: c.plugins.map((p) =>
                  p.uri === uri ? { ...p, parameters: { ...p.parameters, [key]: value } } : p
                ),
              }
            : c
        ),
      }))
    },
    onError: () => pushToast('Failed to set parameter', 'error'),
    onSuccess: () => invalidateChains(),
  })

  const selectedPlugin = useMemo<ChainPlugin | undefined>(() => {
    if (!selectedChain || !selectedPluginUri) return undefined
    return selectedChain.plugins.find((p) => p.uri === selectedPluginUri)
  }, [selectedChain, selectedPluginUri])

  const filteredPlugins = useMemo(() => {
    if (!pluginsQuery.data?.plugins) return [] as Plugin[]
    const term = search.toLowerCase()
    return pluginsQuery.data.plugins.filter((p: Plugin) => {
      const matchCategory = category === 'all' || p.category === category
      const matchText = p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term)
      return matchCategory && matchText
    })
  }, [pluginsQuery.data, search, category])

  // Group plugins by category for organized display (with Favorites at top)
  const groupedPlugins = useMemo(() => {
    const groups: Record<string, Plugin[]> = {}

    // First, collect favorites
    const favoritesList: Plugin[] = []

    filteredPlugins.forEach((p) => {
      // Add to favorites if marked
      if (favoritePlugins.has(p.uri)) {
        favoritesList.push(p)
      }
      // Also add to regular category
      const cat = p.category || 'Other'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(p)
    })

    // Sort categories by the order they appear in CATEGORY_CONFIG, then alphabetically
    const categoryOrder = Object.keys(CATEGORY_CONFIG)
    const sortedGroups = Object.entries(groups).sort(([a], [b]) => {
      const aIdx = categoryOrder.findIndex((k) => a.toLowerCase().includes(k.toLowerCase()))
      const bIdx = categoryOrder.findIndex((k) => b.toLowerCase().includes(k.toLowerCase()))
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx
      if (aIdx !== -1) return -1
      if (bIdx !== -1) return 1
      return a.localeCompare(b)
    })

    // Prepend Favorites if there are any
    if (favoritesList.length > 0) {
      return [['Favorites', favoritesList] as [string, Plugin[]], ...sortedGroups]
    }

    return sortedGroups
  }, [filteredPlugins, favoritePlugins])

  const combobox = useComboboxStore({ value: search, setValue: (val) => setSearch(val) })

  // Toggle category collapse
  const toggleCategory = useCallback((categoryName: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(categoryName)) {
        next.delete(categoryName)
      } else {
        next.add(categoryName)
      }
      return next
    })
  }, [])

  // Collapse/Expand all categories
  const collapseAllCategories = useCallback(() => {
    const allCategoryNames = groupedPlugins.map(([name]) => name)
    setCollapsedCategories(new Set(allCategoryNames))
  }, [groupedPlugins])

  const expandAllCategories = useCallback(() => {
    setCollapsedCategories(new Set())
  }, [])

  // Toggle favorite plugin
  const toggleFavorite = useCallback((uri: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setFavoritePlugins((prev) => {
      const next = new Set(prev)
      if (next.has(uri)) {
        next.delete(uri)
      } else {
        next.add(uri)
      }
      // Persist to localStorage
      localStorage.setItem('map2-favorite-plugins', JSON.stringify([...next]))
      return next
    })
  }, [])

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, uri: string) => {
    setDraggedPluginUri(uri)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, uri: string) => {
    e.preventDefault()
    if (draggedPluginUri && draggedPluginUri !== uri) {
      setDragOverPluginUri(uri)
    }
  }, [draggedPluginUri])

  const handleDragEnd = useCallback(() => {
    setDraggedPluginUri(null)
    setDragOverPluginUri(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, targetUri: string) => {
    e.preventDefault()
    if (!draggedPluginUri || !selectedChain || draggedPluginUri === targetUri) {
      handleDragEnd()
      return
    }

    const plugins = [...selectedChain.plugins]
    const dragIdx = plugins.findIndex((p) => p.uri === draggedPluginUri)
    const dropIdx = plugins.findIndex((p) => p.uri === targetUri)

    if (dragIdx !== -1 && dropIdx !== -1) {
      const [dragged] = plugins.splice(dragIdx, 1)
      plugins.splice(dropIdx, 0, dragged)
      reorder.mutate({ chainId: selectedChain.id, order: plugins.map((p) => p.uri) })
    }

    handleDragEnd()
  }, [draggedPluginUri, selectedChain, reorder, handleDragEnd])

  // Wet/dry mix handler
  const handleWetDryChange = useCallback((uri: string, value: number) => {
    setWetDryMixes((prev) => ({ ...prev, [uri]: value }))
    // In production, send to backend API
  }, [])

  // Save preset handler
  const handleSavePreset = useCallback((uri: string) => {
    const plugin = selectedChain?.plugins.find((p) => p.uri === uri)
    if (plugin) {
      pushToast(`Preset saved for ${pluginMetaByUri[uri]?.name || plugin.name}`, 'success')
      // In production, open preset save dialog or save directly
    }
  }, [selectedChain, pluginMetaByUri, pushToast])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      // Global shortcuts (work regardless of chain)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          // Ctrl+Shift+Z = Redo
          if (historyStatus?.can_redo) redoMutation.mutate()
        } else {
          // Ctrl+Z = Undo
          if (historyStatus?.can_undo) undoMutation.mutate()
        }
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault()
        if (historyStatus?.can_redo) redoMutation.mutate()
        return
      }

      const currentChain = activeChainSlot === 1 ? selectedChain : secondChain
      if (!currentChain) return

      const plugins = currentChain.plugins
      const currentIdx = plugins.findIndex((p) => p.uri === selectedPluginUri)

      switch (e.key) {
        case 'ArrowUp':
        case 'k':
          e.preventDefault()
          if (currentIdx > 0) {
            setSelectedPluginUri(plugins[currentIdx - 1].uri)
          } else if (plugins.length > 0) {
            setSelectedPluginUri(plugins[plugins.length - 1].uri)
          }
          break
        case 'ArrowDown':
        case 'j':
          e.preventDefault()
          if (currentIdx < plugins.length - 1) {
            setSelectedPluginUri(plugins[currentIdx + 1].uri)
          } else if (plugins.length > 0) {
            setSelectedPluginUri(plugins[0].uri)
          }
          break
        case 'b':
        case 'B':
          e.preventDefault()
          if (selectedPluginUri) {
            const plugin = plugins.find((p) => p.uri === selectedPluginUri)
            if (plugin) {
              toggleBypass.mutate({ chainId: currentChain.id, uri: selectedPluginUri, bypass: plugin.bypassed })
            }
          }
          break
        case 'Delete':
        case 'Backspace':
          if (e.shiftKey && selectedPluginUri) {
            e.preventDefault()
            removePlugin.mutate({ chainId: currentChain.id, uri: selectedPluginUri })
          }
          break
        case 's':
        case 'S':
          if (e.ctrlKey || e.metaKey) {
            // Let browser handle save
          } else if (selectedPluginUri) {
            e.preventDefault()
            handleSavePreset(selectedPluginUri)
          }
          break
        case '1': case '2': case '3': case '4': case '5':
        case '6': case '7': case '8': case '9':
          e.preventDefault()
          const idx = parseInt(e.key) - 1
          if (plugins[idx]) {
            setSelectedPluginUri(plugins[idx].uri)
          }
          break
        case 'Tab':
          e.preventDefault()
          setActiveChainSlot(activeChainSlot === 1 ? 2 : 1)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeChainSlot, selectedChain, secondChain, selectedPluginUri, toggleBypass, removePlugin, handleSavePreset, historyStatus, undoMutation, redoMutation])

  const movePlugin = (uri: string, direction: -1 | 1) => {
    if (!selectedChain) return
    const order = [...selectedChain.plugins]
    const idx = order.findIndex((p) => p.uri === uri)
    if (idx === -1) return
    const swapIdx = idx + direction
    if (swapIdx < 0 || swapIdx >= order.length) return
    const tmp = order[idx]
    order[idx] = order[swapIdx]
    order[swapIdx] = tmp
    reorder.mutate({ chainId: selectedChain.id, order: order.map((p) => p.uri) })
  }

  const handleRefresh = () => {
    invalidateChains()
    queryClient.invalidateQueries({ queryKey: ['plugins', 'discover'] })
    pushToast('Refreshed chains and plugins', 'info')
  }

  // Helper to compute correct order after adding a native plugin
  const getOrderedPluginUris = (currentPlugins: ChainPlugin[], newPluginUri: string): string[] => {
    const currentUris = currentPlugins.map((p) => p.uri)
    const allUris = [...currentUris, newPluginUri]

    // Separate native plugins from other plugins
    const nativePlugins = allUris.filter((uri) => NATIVE_PLUGIN_ORDER.includes(uri))
    const otherPlugins = allUris.filter((uri) => !NATIVE_PLUGIN_ORDER.includes(uri))

    // Sort native plugins by their defined order
    nativePlugins.sort((a, b) => NATIVE_PLUGIN_ORDER.indexOf(a) - NATIVE_PLUGIN_ORDER.indexOf(b))

    // Native plugins first, then other plugins
    return [...nativePlugins, ...otherPlugins]
  }

  const handleLoadNAM = (modelName: string) => {
    if (!activeChainId || !activeChain) {
      pushToast('No chain selected', 'error')
      return
    }
    const chainId = activeChain.id
    const hasNAM = activeChain.plugins.some((p) => p.uri === NAM_PLUGIN_URI)
    if (!hasNAM) {
      addPlugin.mutate(NAM_PLUGIN_URI, {
        onSuccess: () => {
          // Reorder to ensure correct signal chain position
          const newOrder = getOrderedPluginUris(activeChain.plugins, NAM_PLUGIN_URI)
          if (newOrder.length > 1) {
            reorder.mutate({ chainId, order: newOrder })
          }
          pushToast(`Added NAM to chain with model: ${modelName}`, 'success')
        },
      })
    }
  }

  const handleLoadCabinetIR = (irName: string) => {
    if (!activeChainId || !activeChain) {
      pushToast('No chain selected', 'error')
      return
    }
    const chainId = activeChain.id
    const hasCabinetIR = activeChain.plugins.some((p) => p.uri === CABINET_IR_PLUGIN_URI)
    if (!hasCabinetIR) {
      addPlugin.mutate(CABINET_IR_PLUGIN_URI, {
        onSuccess: () => {
          const newOrder = getOrderedPluginUris(activeChain.plugins, CABINET_IR_PLUGIN_URI)
          if (newOrder.length > 1) {
            reorder.mutate({ chainId, order: newOrder })
          }
          pushToast(`Added Cabinet IR to chain with: ${irName}`, 'success')
        },
      })
    }
  }

  const handleLoadReverbIR = (irName: string) => {
    if (!activeChainId || !activeChain) {
      pushToast('No chain selected', 'error')
      return
    }
    const chainId = activeChain.id
    const hasReverbIR = activeChain.plugins.some((p) => p.uri === REVERB_IR_PLUGIN_URI)
    if (!hasReverbIR) {
      addPlugin.mutate(REVERB_IR_PLUGIN_URI, {
        onSuccess: () => {
          const newOrder = getOrderedPluginUris(activeChain.plugins, REVERB_IR_PLUGIN_URI)
          if (newOrder.length > 1) {
            reorder.mutate({ chainId, order: newOrder })
          }
          pushToast(`Added Reverb IR to chain with: ${irName}`, 'success')
        },
      })
    }
  }

  const handleAddNativePluginToChain = (pluginType: string) => {
    if (!activeChainId || !activeChain) {
      pushToast('No chain selected', 'error')
      return
    }

    const chainId = activeChain.id
    let pluginUri = ''
    let pluginName = ''

    switch (pluginType) {
      case 'nam':
        pluginUri = NAM_PLUGIN_URI
        pluginName = 'NAM Player'
        break
      case 'cabinet':
        pluginUri = CABINET_IR_PLUGIN_URI
        pluginName = 'Cabinet IR'
        break
      case 'reverb':
        pluginUri = REVERB_IR_PLUGIN_URI
        pluginName = 'Reverb IR'
        break
      case 'delay':
        pluginUri = COCOA_DELAY_PLUGIN_URI
        pluginName = 'Cocoa Delay'
        break
      case 'autotune':
        pluginUri = ZITA_AT1_PLUGIN_URI
        pluginName = 'Zita AT1 Autotune'
        break
      case 'triplespread':
        pluginUri = TRIPLESPREAD_PLUGIN_URI
        pluginName = 'TripleSpread'
        break
      case 'valentine':
        pluginUri = VALENTINE_PLUGIN_URI
        pluginName = 'Valentine'
        break
      case 'zlequalizer':
        pluginUri = ZLEQUALIZER_PLUGIN_URI
        pluginName = 'ZL Equalizer'
        break
      case 'freeverb3':
        pluginUri = FREEVERB3_PLUGIN_URI
        pluginName = 'Freeverb3'
        break
      case 'whammy':
        pluginUri = WHAMMY_PLUGIN_URI
        pluginName = 'dm-Whammy'
        break
      case 'dragonfly':
        pluginUri = DRAGONFLY_PLUGIN_URI
        pluginName = 'Dragonfly Reverb'
        break
      default:
        pushToast(`Unknown plugin type: ${pluginType}`, 'error')
        return
    }

    const hasPlugin = activeChain.plugins.some((p) => p.uri === pluginUri)
    if (hasPlugin) {
      pushToast(`${pluginName} is already in the chain`, 'warn')
      return
    }

    addPlugin.mutate(pluginUri, {
      onSuccess: () => {
        const newOrder = getOrderedPluginUris(activeChain.plugins, pluginUri)
        if (newOrder.length > 1) {
          reorder.mutate({ chainId, order: newOrder })
        }
        pushToast(`Added ${pluginName} to ${activeChainSlot === 1 ? 'Chain A' : 'Chain B'}`, 'success')
      },
    })
  }

  return (
    <div className="stack">
      <PageHeader
        title="Chain Flow"
        subtitle="Ariakit-native signal flow with full plugin and parameter control."
        actions={
          <div className="flex" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="flex" style={{ gap: 4, borderRight: '1px solid var(--surface-border)', paddingRight: 8 }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => undoMutation.mutate()}
                disabled={!historyStatus?.can_undo || undoMutation.isPending}
                title={historyStatus?.next_undo ? `Undo: ${historyStatus.next_undo} (Ctrl+Z)` : 'Undo (Ctrl+Z)'}
              >
                <Undo2 size={16} />
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => redoMutation.mutate()}
                disabled={!historyStatus?.can_redo || redoMutation.isPending}
                title={historyStatus?.next_redo ? `Redo: ${historyStatus.next_redo} (Ctrl+Y)` : 'Redo (Ctrl+Y)'}
              >
                <Redo2 size={16} />
              </button>
            </div>
            <button className="btn btn-ghost" onClick={handleRefresh}>
              <RefreshCcw size={16} /> Refresh
            </button>
            {/* JUCE Audio Metrics Indicator */}
            {juceMetrics.running && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 10px',
                background: juceHasXruns ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                border: `1px solid ${juceHasXruns ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
                borderRadius: 6,
                marginLeft: 8,
              }}>
                {/* XRun Warning */}
                {juceHasXruns && (
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    color: '#ef4444',
                    fontWeight: 600,
                  }} title={`${juceMetrics.xrunCount} audio dropouts detected`}>
                    <AlertTriangle size={12} /> {juceMetrics.xrunCount}
                  </span>
                )}
                {/* Audio CPU */}
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  color: juceStatus === 'critical' ? '#ef4444' : juceStatus === 'warning' ? '#fbbf24' : '#22c55e',
                  fontFamily: 'monospace',
                }} title={`Audio CPU: ${juceMetrics.totalCpuPercent.toFixed(1)}% (Peak: ${juceMetrics.peakCpuPercent.toFixed(1)}%)`}>
                  <Cpu size={12} /> {juceMetrics.totalCpuPercent.toFixed(1)}%
                </span>
                {/* Headroom */}
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  color: juceMetrics.headroomPercent < 20 ? '#ef4444' : juceMetrics.headroomPercent < 40 ? '#fbbf24' : '#22c55e',
                  fontFamily: 'monospace',
                }} title={`Headroom: ${juceMetrics.headroomPercent.toFixed(0)}% (Callback: ${juceMetrics.currentCallbackMs.toFixed(2)}ms / ${juceMetrics.budgetMs.toFixed(2)}ms budget)`}>
                  {juceMetrics.headroomPercent.toFixed(0)}% free
                </span>
                {/* Live indicator */}
                {juceConnected && (
                  <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#22c55e',
                    boxShadow: '0 0 6px #22c55e',
                    animation: 'breathe 1s ease-in-out infinite',
                  }} title="JUCE metrics connected via WebSocket" />
                )}
              </div>
            )}

            {/* JUCE Integration Controls */}
            <div className="flex" style={{ gap: 4, borderLeft: '1px solid var(--surface-border)', paddingLeft: 8 }}>
              {/* MIDI Learn Button */}
              <MidiLearnButton
                isActive={midiLearnMode}
                onToggle={() => setMidiLearnMode(!midiLearnMode)}
                position="relative"
                size="small"
              />

              {/* Audio Configuration */}
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setAudioConfigDialogOpen(true)}
                title="Audio Configuration"
              >
                <Sliders size={16} />
              </button>

              {/* Automation Timeline Toggle */}
              <button
                className={`btn btn-sm ${automationTimelineExpanded ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setAutomationTimelineExpanded(!automationTimelineExpanded)}
                title={automationTimelineExpanded ? 'Hide Automation Timeline' : 'Show Automation Timeline'}
              >
                <PlayCircle size={16} />
              </button>
            </div>
          </div>
        }
      />

      {/* Audio Metering Card - At top above Signal Chain */}
      <AudioMeteringCard defaultExpanded={true} />

      {/* Signal Chain Panels - Full-width horizontal layout */}
      <div className="chain-panels-container">
        {chainSlots.map((slot, index) => {
          const chain = getChainForSlot(slot)
          return (
            <ChainPanel
              key={slot.id}
              slot={slot}
              slotIndex={index}
              chain={chain}
              isActive={activeSlotIndex === index}
              onSlotSelect={() => setActiveSlotIndex(index)}
              onChainSelect={(chainId) => updateChainSlot(slot.id, { chainId })}
              availableChains={chainsQuery.data?.chains || []}
              pluginMeta={pluginMetaByUri}
              selectedPluginUri={activeSlotIndex === index ? selectedPluginUri : null}
              onPluginSelect={(uri) => {
                setActiveSlotIndex(index)
                setSelectedPluginUri(uri)
                // Scroll to parameter panel
                setTimeout(() => {
                  document.getElementById('plugin-parameters')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }, 50)
              }}
              onPluginReorder={(uris) => chain && reorder.mutate({ chainId: chain.id, order: uris })}
              onToggleBypass={(uri, bypass) => chain && toggleBypass.mutate({ chainId: chain.id, uri, bypass })}
              onDeletePlugin={(uri) => chain && removePlugin.mutate({ chainId: chain.id, uri })}
              onMuteToggle={() => updateChainSlot(slot.id, { muted: !slot.muted })}
              onSoloToggle={() => updateChainSlot(slot.id, { solo: !slot.solo })}
            />
          )
        })}
      </div>

      {/* Bottom Routing Panel */}
      <BottomRoutingPanel
        chainSlots={chainSlots}
        routing={routing}
        activeSlotIndex={activeSlotIndex}
        onAddChain={addChainSlot}
        onRemoveChain={removeChainSlot}
        onSetRoutingMode={setRoutingMode}
        onSetActiveSlot={setActiveSlotIndex}
        canAddChain={chainSlots.length < MAX_CHAINS}
        canRemoveChain={chainSlots.length > MIN_CHAINS}
      />

      {/* Selected Plugin Parameters - Bottom of page */}
      {selectedPluginUri && activeChain && (() => {
        const selectedPlugin = activeChain.plugins.find(p => p.uri === selectedPluginUri)
        const selectedMeta = pluginMetaByUri[selectedPluginUri]
        if (!selectedPlugin) return null
        return (
          <div className="card" style={{ marginTop: 16 }} id="plugin-parameters">
            <ParameterPanel
              plugin={selectedPlugin}
              meta={selectedMeta}
              onChange={(paramIndex, value) => {
                setParameter.mutate({ uri: selectedPluginUri, paramIndex, value })
              }}
              onSavePreset={() => handleSavePreset(selectedPluginUri)}
            />
          </div>
        )
      })()}

      {/* Latency Overlay - Temporarily disabled
      {activeChain && (
        <div style={{ margin: '16px 0' }}>
          <LatencyOverlay
            plugins={(activeChain.plugins || []).map((p) => ({
              uri: p.uri,
              name: p.name,
              latencySamples: p.latency_samples || 0,
              isCompensated: true,
            }))}
            sampleRate={audioInterfaceStatus.sampleRate}
            position="bottom"
            pdcEnabled
          />
        </div>
      )}
      */}

      {/* Automation Timeline - Temporarily disabled
      {automationTimelineExpanded && (
        <div style={{ margin: '16px 0' }}>
          <AutomationTimeline
            lanes={[]}
            isPlaying={automationPlaying}
            isRecording={automationRecording}
            loopEnabled={automationLoopEnabled}
            currentTime={automationCurrentTime}
            duration={automationDuration}
            onPlay={() => setAutomationPlaying(!automationPlaying)}
            onStop={() => {
              setAutomationPlaying(false)
              setAutomationRecording(false)
              setAutomationCurrentTime(0)
            }}
            onRecord={() => {
              setAutomationRecording(!automationRecording)
              if (!automationPlaying) setAutomationPlaying(true)
            }}
            onToggleLoop={() => setAutomationLoopEnabled(!automationLoopEnabled)}
            onSeek={(time) => setAutomationCurrentTime(time)}
            onAddLane={() => console.log('Add automation lane')}
            onDeleteLane={(laneId) => console.log('Delete lane:', laneId)}
            onToggleLaneEnabled={(laneId) => console.log('Toggle lane enabled:', laneId)}
            onToggleLaneArmed={(laneId) => console.log('Toggle lane armed:', laneId)}
            onAddPoint={(laneId, time, value) => console.log('Add point:', laneId, time, value)}
            onMovePoint={(laneId, pointId, time, value) => console.log('Move point:', laneId, pointId, time, value)}
            onDeletePoint={(laneId, pointId) => console.log('Delete point:', laneId, pointId)}
            onChangeCurve={(laneId, pointId, curve) => console.log('Change curve:', laneId, pointId, curve)}
            defaultCollapsed={false}
            position="bottom"
            expandedSize={200}
          />
        </div>
      )}
      */}

      <NativePluginsSection
        onLoadNAM={handleLoadNAM}
        onLoadCabinetIR={handleLoadCabinetIR}
        onLoadReverbIR={handleLoadReverbIR}
        chainName={activeChain ? `${activeChainSlot === 1 ? 'A' : 'B'}: ${activeChain.name}` : undefined}
        onAddToChain={handleAddNativePluginToChain}
        hideMetering={true}
      />

      <PluginDetailsModal
        plugin={detailsPlugin}
        open={detailsPlugin !== null}
        onClose={() => setDetailsPlugin(null)}
        onAdd={(uri) => { addPlugin.mutate(uri); setDetailsPlugin(null); }}
      />

      {/* Audio Configuration Dialog */}
      <AudioConfigDialog
        open={audioConfigDialogOpen}
        onClose={() => setAudioConfigDialogOpen(false)}
        currentConfig={{
          deviceId: 'default',
          sampleRate: audioInterfaceStatus.sampleRate ?? 48000,
          bufferSize: audioInterfaceStatus.bufferSize ?? 256,
        }}
        devices={[{
          id: 'default',
          name: audioInterfaceStatus.deviceName || 'Default Audio Device',
          inputChannels: 2,
          outputChannels: 2,
          supportedSampleRates: [44100, 48000, 96000],
          isDefault: true,
        }]}
        onApply={async (config) => {
          console.log('Apply audio config:', config)
          setAudioConfigDialogOpen(false)
        }}
      />

      {/* MIDI Mappings Panel - Temporarily disabled
      {midiMappingsPanelOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 400,
          background: 'var(--surface-background)',
          borderLeft: '1px solid var(--surface-border)',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.3)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--surface-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <Music size={20} style={{ color: 'var(--primary)' }} />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, flex: 1 }}>MIDI Mappings</h3>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setMidiMappingsPanelOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <MidiMappingsPanel
              mappings={[]}
              onDelete={(id) => console.log('Delete mapping:', id)}
              onUpdate={(id, updates) => console.log('Update mapping:', id, updates)}
              collapsible={false}
            />
          </div>
        </div>
      )}
      */}
    </div>
  )
}

// Parameter category detection - identifies specialized vs standard parameters
function categorizeParameter(param: PluginParameter): { category: string; icon: React.ElementType; color: string; isSpecial: boolean } {
  const nameLower = param.name.toLowerCase()
  const symbolLower = param.symbol.toLowerCase()
  
  // Specialized/Advanced parameters
  if (nameLower.includes('bypass') || nameLower.includes('enable')) {
    return { category: 'Control', icon: Power, color: '#ff6b35', isSpecial: true }
  }
  if (nameLower.includes('mix') || nameLower.includes('wet') || nameLower.includes('dry') || nameLower.includes('blend')) {
    return { category: 'Mix', icon: Combine, color: '#9b59b6', isSpecial: true }
  }
  if (nameLower.includes('input') && (nameLower.includes('gain') || nameLower.includes('level'))) {
    return { category: 'Input', icon: ArrowRight, color: '#3498db', isSpecial: true }
  }
  if (nameLower.includes('output') && (nameLower.includes('gain') || nameLower.includes('level') || nameLower.includes('volume'))) {
    return { category: 'Output', icon: Speaker, color: '#e74c3c', isSpecial: true }
  }
  
  // Standard audio parameters
  if (nameLower.includes('gain') || nameLower.includes('volume') || nameLower.includes('level')) {
    return { category: 'Level', icon: Volume2, color: '#00d4ff', isSpecial: false }
  }
  if (nameLower.includes('freq') || nameLower.includes('hz') || symbolLower.includes('hz')) {
    return { category: 'Frequency', icon: Waves, color: '#4ecdc4', isSpecial: false }
  }
  if (nameLower.includes('time') || nameLower.includes('delay') || nameLower.includes('ms') || symbolLower.includes('ms')) {
    return { category: 'Time', icon: Timer, color: '#f39c12', isSpecial: false }
  }
  if (nameLower.includes('ratio') || nameLower.includes('threshold') || nameLower.includes('attack') || nameLower.includes('release')) {
    return { category: 'Dynamics', icon: Gauge, color: '#e67e22', isSpecial: false }
  }
  if (nameLower.includes('bass') || nameLower.includes('mid') || nameLower.includes('treble') || nameLower.includes('low') || nameLower.includes('high')) {
    return { category: 'EQ', icon: SlidersHorizontal, color: '#1abc9c', isSpecial: false }
  }
  if (nameLower.includes('drive') || nameLower.includes('distort') || nameLower.includes('saturation') || nameLower.includes('pregain')) {
    return { category: 'Drive', icon: Zap, color: '#ff6b35', isSpecial: false }
  }
  if (nameLower.includes('depth') || nameLower.includes('rate') || nameLower.includes('speed') || nameLower.includes('modulation')) {
    return { category: 'Modulation', icon: Activity, color: '#9b59b6', isSpecial: false }
  }
  
  return { category: 'Parameter', icon: Settings2, color: '#95a5a6', isSpecial: false }
}

// Compact slider component with glow effects
function CompactSlider({ 
  param, 
  value, 
  category, 
  onChange, 
  onReset 
}: { 
  param: PluginParameter
  value: number
  category: { category: string; icon: React.ElementType; color: string; isSpecial: boolean }
  onChange: (value: number) => void
  onReset: () => void
}) {
  const Icon = category.icon
  const percentage = ((value - param.min) / (param.max - param.min)) * 100
  const isToggle = param.is_toggled
  const isOn = value > (param.min + param.max) / 2
  
  return (
    <div
      style={{
        padding: '8px 10px',
        borderRadius: 10,
        background: `linear-gradient(135deg, ${category.color}08 0%, rgba(0,0,0,0.2) 100%)`,
        border: `1px solid ${category.color}30`,
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `0 0 15px ${category.color}25, inset 0 0 20px ${category.color}08`
        e.currentTarget.style.borderColor = `${category.color}60`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.borderColor = `${category.color}30`
      }}
    >
      {/* Glow bar showing current value */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: `${percentage}%`,
        height: 2,
        background: `linear-gradient(90deg, ${category.color}40 0%, ${category.color} 100%)`,
        borderRadius: '0 2px 0 0',
        boxShadow: `0 0 8px ${category.color}`,
        transition: 'width 0.1s ease',
      }} />
      
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Icon size={12} style={{ color: category.color, opacity: 0.8, flexShrink: 0 }} />
        <span style={{ 
          fontSize: 11, 
          fontWeight: 500, 
          color: '#fff', 
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }} title={param.name}>
          {param.name}
        </span>
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          color: category.color,
          background: `${category.color}15`,
          padding: '2px 6px',
          borderRadius: 4,
          fontFamily: 'monospace',
          minWidth: 45,
          textAlign: 'right',
        }}>
          {isToggle ? (isOn ? 'ON' : 'OFF') : value.toFixed(value % 1 === 0 ? 0 : 2)}
        </span>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {isToggle ? (
          <button
            onClick={() => onChange(isOn ? param.min : param.max)}
            style={{
              flex: 1,
              padding: '4px 8px',
              borderRadius: 6,
              border: `1px solid ${isOn ? '#00ff41' : '#666'}`,
              background: isOn ? 'rgba(0, 255, 65, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              color: isOn ? '#00ff41' : '#999',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {isOn ? '● ENABLED' : '○ DISABLED'}
          </button>
        ) : (
          <>
            <span style={{ fontSize: 9, color: '#666', minWidth: 28 }}>{param.min.toFixed(0)}</span>
            <input
              type="range"
              min={param.min}
              max={param.max}
              step={(param.max - param.min) / 200}
              value={value}
              onChange={(e) => onChange(Number(e.target.value))}
              style={{
                flex: 1,
                height: 4,
                cursor: 'pointer',
                accentColor: category.color,
              }}
            />
            <span style={{ fontSize: 9, color: '#666', minWidth: 28, textAlign: 'right' }}>{param.max.toFixed(0)}</span>
          </>
        )}
        <button
          onClick={onReset}
          title="Reset to default"
          style={{
            padding: '3px 6px',
            borderRadius: 4,
            border: '1px solid #444',
            background: 'rgba(255, 255, 255, 0.05)',
            color: '#888',
            fontSize: 9,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = category.color; e.currentTarget.style.color = category.color }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.color = '#888' }}
        >
          ↺
        </button>
      </div>
    </div>
  )
}

function ParameterPanel({
  plugin,
  meta,
  onChange,
  onSavePreset,
}: {
  plugin: ChainPlugin
  meta?: Plugin
  onChange: (paramIndex: number, value: number) => void
  onSavePreset?: () => void
}) {
  const [presetName, setPresetName] = useState('')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Control', 'Mix', 'Input', 'Output']))
  
  if (!meta) {
    const isNativePlugin = plugin.uri.startsWith('urn:map2:') || plugin.uri.startsWith('http://map2-audio.local/')

    return (
      <div style={{
        padding: 20,
        borderRadius: 12,
        background: isNativePlugin
          ? 'linear-gradient(135deg, rgba(55, 214, 201, 0.08) 0%, rgba(0,0,0,0.2) 100%)'
          : 'linear-gradient(135deg, rgba(100, 100, 120, 0.1) 0%, rgba(0,0,0,0.2) 100%)',
        border: `1px solid ${isNativePlugin ? 'rgba(55, 214, 201, 0.25)' : 'rgba(100, 100, 120, 0.25)'}`,
      }}>
        {isNativePlugin ? (
          <>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 12,
              paddingBottom: 12,
              borderBottom: '1px solid rgba(55, 214, 201, 0.15)'
            }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'linear-gradient(135deg, rgba(55, 214, 201, 0.2), rgba(55, 214, 201, 0.05))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
              }}>
                🎛️
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#37d6c9' }}>Native Plugin</div>
                <div style={{ fontSize: 11, color: '#888' }}>Built-in audio processor</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
              This processor has a dedicated control panel in the <strong style={{ color: '#37d6c9' }}>Native Plugins</strong> section below.
              Expand it to access the full interface with real-time visualization and optimized controls.
            </div>
          </>
        ) : (
          <>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 12,
              paddingBottom: 12,
              borderBottom: '1px solid rgba(100, 100, 120, 0.15)'
            }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'linear-gradient(135deg, rgba(100, 100, 120, 0.2), rgba(100, 100, 120, 0.05))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
              }}>
                🔌
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8' }}>LV2 / VST3 Parameters</div>
                <div style={{ fontSize: 11, color: '#666' }}>Plugin metadata not loaded</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#888', lineHeight: 1.6, marginBottom: 12 }}>
              This panel displays parameters for <strong style={{ color: '#94a3b8' }}>LV2</strong> and <strong style={{ color: '#94a3b8' }}>VST3</strong> plugins
              scanned from your system. The plugin metadata hasn't been loaded yet.
            </div>
            <div style={{
              fontSize: 11,
              color: '#666',
              padding: '8px 12px',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span style={{ color: '#64748b' }}>URI:</span>
              <code style={{
                fontSize: 10,
                color: '#94a3b8',
                background: 'rgba(255,255,255,0.05)',
                padding: '2px 6px',
                borderRadius: 3,
                wordBreak: 'break-all'
              }}>{plugin.uri}</code>
            </div>
          </>
        )}
      </div>
    )
  }
  
  if (!meta.parameters?.length) {
    return (
      <div style={{
        padding: 16,
        borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.1) 0%, rgba(0,0,0,0.2) 100%)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#00d4ff' }}>{meta.name}</div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>This plugin has no adjustable parameters.</div>
      </div>
    )
  }

  const paramValues = plugin.parameters || {}
  
  // Categorize and group parameters
  const categorizedParams = meta.parameters.map((param: PluginParameter) => ({
    param,
    ...categorizeParameter(param),
  }))
  
  // Separate special from standard parameters
  const specialParams = categorizedParams.filter(p => p.isSpecial)
  const standardParams = categorizedParams.filter(p => !p.isSpecial)
  
  // Group standard params by category
  const groupedStandard = standardParams.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {} as Record<string, typeof standardParams>)
  
  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }
  
  const handleSavePreset = () => {
    if (presetName.trim() && onSavePreset) {
      onSavePreset()
      setShowSaveDialog(false)
      setPresetName('')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header with plugin info and save button */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.15) 0%, rgba(0,0,0,0.3) 100%)',
        border: '1px solid rgba(0, 212, 255, 0.4)',
        boxShadow: '0 0 20px rgba(0, 212, 255, 0.1)',
      }}>
        <div>
          <div style={{ 
            fontSize: 14, 
            fontWeight: 700, 
            color: '#00d4ff',
            textShadow: '0 0 10px rgba(0, 212, 255, 0.5)',
          }}>
            {meta.name}
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
            {meta.parameters.length} parameters • {meta.author}
          </div>
        </div>
        
        <button
          onClick={() => setShowSaveDialog(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            borderRadius: 8,
            background: 'linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)',
            border: 'none',
            color: '#000',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(0, 212, 255, 0.4)',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = '0 6px 25px rgba(0, 212, 255, 0.6)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 212, 255, 0.4)'
          }}
        >
          <Save size={14} />
          Save Preset
        </button>
      </div>
      
      {/* Save Preset Dialog */}
      {showSaveDialog && (
        <div style={{
          padding: 14,
          borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.1) 0%, rgba(0,0,0,0.3) 100%)',
          border: '2px solid rgba(0, 212, 255, 0.5)',
          boxShadow: '0 0 30px rgba(0, 212, 255, 0.2)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#00d4ff' }}>
            💾 Save Current Settings as Preset
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Enter preset name..."
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #444',
                background: 'rgba(0,0,0,0.3)',
                color: '#fff',
                fontSize: 12,
              }}
            />
            <button
              onClick={handleSavePreset}
              disabled={!presetName.trim()}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                background: presetName.trim() ? 'linear-gradient(135deg, #00ff41 0%, #00cc33 100%)' : '#444',
                border: 'none',
                color: presetName.trim() ? '#000' : '#666',
                fontSize: 12,
                fontWeight: 700,
                cursor: presetName.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Save
            </button>
            <button
              onClick={() => { setShowSaveDialog(false); setPresetName('') }}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                background: 'transparent',
                border: '1px solid #666',
                color: '#999',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Specialized Parameters Section */}
      {specialParams.length > 0 && (
        <div style={{
          padding: 12,
          borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.08) 0%, rgba(0,0,0,0.15) 100%)',
          border: '1px solid rgba(255, 107, 53, 0.3)',
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8, 
            marginBottom: 10,
            paddingBottom: 8,
            borderBottom: '1px solid rgba(255, 107, 53, 0.2)',
          }}>
            <Sparkles size={14} style={{ color: '#ff6b35' }} />
            <span style={{ 
              fontSize: 12, 
              fontWeight: 700, 
              color: '#ff6b35',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              Quick Controls
            </span>
            <span style={{ fontSize: 10, color: '#888', marginLeft: 'auto' }}>
              {specialParams.length} control{specialParams.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', 
            gap: 8 
          }}>
            {specialParams.map(({ param, category, icon, color }) => {
              const key = getParamKey(param)
              const value = paramValues[key] ?? param.value ?? param.default ?? param.min
              return (
                <CompactSlider
                  key={key}
                  param={param}
                  value={value}
                  category={{ category, icon, color, isSpecial: true }}
                  onChange={(v) => onChange(param.index, v)}
                  onReset={() => onChange(param.index, param.default)}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Standard Parameters by Category */}
      <div style={{
        padding: 12,
        borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.05) 0%, rgba(0,0,0,0.15) 100%)',
        border: '1px solid rgba(0, 212, 255, 0.2)',
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 8, 
          marginBottom: 10,
          paddingBottom: 8,
          borderBottom: '1px solid rgba(0, 212, 255, 0.15)',
        }}>
          <SlidersHorizontal size={14} style={{ color: '#00d4ff' }} />
          <span style={{ 
            fontSize: 12, 
            fontWeight: 700, 
            color: '#00d4ff',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            All Parameters
          </span>
          <span style={{ fontSize: 10, color: '#888', marginLeft: 'auto' }}>
            {standardParams.length} parameter{standardParams.length !== 1 ? 's' : ''}
          </span>
        </div>
        
        {Object.entries(groupedStandard).map(([categoryName, items]) => {
          const firstItem = items[0]
          const CategoryIcon = firstItem.icon
          const isExpanded = expandedCategories.has(categoryName)
          
          return (
            <div key={categoryName} style={{ marginBottom: 8 }}>
              {/* Category header - collapsible */}
              <div
                onClick={() => toggleCategory(categoryName)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 8,
                  background: `${firstItem.color}10`,
                  borderLeft: `3px solid ${firstItem.color}`,
                  cursor: 'pointer',
                  marginBottom: isExpanded ? 8 : 0,
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = `${firstItem.color}18` }}
                onMouseLeave={(e) => { e.currentTarget.style.background = `${firstItem.color}10` }}
              >
                {isExpanded ? <ChevronDown size={12} style={{ color: firstItem.color }} /> : <ChevronRight size={12} style={{ color: firstItem.color }} />}
                <CategoryIcon size={12} style={{ color: firstItem.color }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: firstItem.color }}>{categoryName}</span>
                <span style={{ fontSize: 9, color: '#666', marginLeft: 'auto' }}>{items.length}</span>
              </div>
              
              {/* Parameters grid */}
              {isExpanded && (
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', 
                  gap: 6,
                  paddingLeft: 12,
                }}>
                  {items.map(({ param, category, icon, color }) => {
                    const key = getParamKey(param)
                    const value = paramValues[key] ?? param.value ?? param.default ?? param.min
                    return (
                      <CompactSlider
                        key={key}
                        param={param}
                        value={value}
                        category={{ category, icon, color, isSpecial: false }}
                        onChange={(v) => onChange(param.index, v)}
                        onReset={() => onChange(param.index, param.default)}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
        
        {/* Expand/Collapse All buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(0, 212, 255, 0.1)' }}>
          <button
            onClick={() => setExpandedCategories(new Set(Object.keys(groupedStandard)))}
            style={{
              flex: 1,
              padding: '6px 12px',
              borderRadius: 6,
              background: 'rgba(0, 212, 255, 0.1)',
              border: '1px solid rgba(0, 212, 255, 0.3)',
              color: '#00d4ff',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Expand All
          </button>
          <button
            onClick={() => setExpandedCategories(new Set())}
            style={{
              flex: 1,
              padding: '6px 12px',
              borderRadius: 6,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid #444',
              color: '#888',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Collapse All
          </button>
          <button
            onClick={() => meta.parameters?.forEach(p => onChange(p.index, p.default))}
            style={{
              flex: 1,
              padding: '6px 12px',
              borderRadius: 6,
              background: 'rgba(255, 107, 53, 0.1)',
              border: '1px solid rgba(255, 107, 53, 0.3)',
              color: '#ff6b35',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reset All
          </button>
        </div>
      </div>
    </div>
  )
}
