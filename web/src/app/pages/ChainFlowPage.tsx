import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  FolderOpen,    // File storage reference
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
} from 'lucide-react'
import type { Chain, ChainPlugin, ChainsResponse, HistoryStatus, Plugin, PluginParameter, PluginUIInfo, PluginFormat } from '../../map2/types'
// Plugin visualization components
import { AudioMeter, GainReductionMeter } from '../components/AudioMeter'
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
          width: '100%',
          border: isSelected ? `2px solid ${catConfig.color}` : isDragOver ? `2px dashed ${catConfig.color}` : '1px solid var(--surface-border)',
          borderRadius: 8,
          padding: '8px 10px',
          background: plugin.bypassed ? 'rgba(30, 30, 30, 0.6)' : catConfig.bg,
          opacity: isDragging ? 0.5 : 1,
          borderLeft: `3px solid ${plugin.bypassed ? '#666' : catConfig.color}`,
          cursor: 'grab',
          transition: 'all 0.2s ease',
          transform: isDragOver ? 'scale(1.02)' : 'scale(1)',
          position: 'relative',
        }}
        onClick={() => onSelect(plugin.uri)}
      >
        {/* Level meters - left side (input) with glow effect */}
        <div style={{
          position: 'absolute',
          left: -12,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          height: '70%',
        }}>
          {/* Outer glow container */}
          <div style={{
            position: 'relative',
            width: 6,
            height: '100%',
          }}>
            {/* Glow effect */}
            <div style={{
              position: 'absolute',
              width: 12,
              height: '100%',
              left: -3,
              background: levelIn > 0.8 ? 'rgba(255, 107, 107, 0.3)' : levelIn > 0.5 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(34, 197, 94, 0.3)',
              filter: 'blur(4px)',
              borderRadius: 4,
              opacity: levelIn > 0.1 ? 1 : 0,
              transition: 'all 0.1s ease',
            }} />
            {/* Track background */}
            <div style={{
              position: 'relative',
              width: 6,
              height: '100%',
              background: 'linear-gradient(180deg, rgba(255,100,100,0.2) 0%, rgba(255,200,0,0.2) 50%, rgba(50,200,100,0.2) 100%)',
              borderRadius: 3,
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: 'inset 0 0 4px rgba(0,0,0,0.5)',
            }}>
              {/* Level fill */}
              <div style={{
                position: 'absolute',
                bottom: 0,
                width: '100%',
                height: `${Math.min(100, levelIn * 100)}%`,
                background: levelIn > 0.8 
                  ? 'linear-gradient(180deg, #ff4444 0%, #ff6b6b 100%)' 
                  : levelIn > 0.5 
                    ? 'linear-gradient(180deg, #f59e0b 0%, #fbbf24 100%)' 
                    : 'linear-gradient(180deg, #22c55e 0%, #4ade80 100%)',
                boxShadow: levelIn > 0.8 
                  ? '0 0 8px #ff6b6b' 
                  : levelIn > 0.5 
                    ? '0 0 8px #f59e0b' 
                    : '0 0 8px #22c55e',
                transition: 'height 0.05s ease, background 0.2s ease',
                borderRadius: '0 0 2px 2px',
              }} />
              {/* Peak indicator */}
              {levelIn > 0.9 && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  width: '100%',
                  height: 3,
                  background: '#ff0000',
                  boxShadow: '0 0 10px #ff0000',
                  animation: 'activeGlow 0.3s ease-in-out infinite',
                }} />
              )}
            </div>
          </div>
          <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>IN</span>
        </div>

        {/* Level meters - right side (output) with glow effect */}
        <div style={{
          position: 'absolute',
          right: -12,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          height: '70%',
        }}>
          {/* Outer glow container */}
          <div style={{
            position: 'relative',
            width: 6,
            height: '100%',
          }}>
            {/* Glow effect */}
            <div style={{
              position: 'absolute',
              width: 12,
              height: '100%',
              left: -3,
              background: levelOut > 0.8 ? 'rgba(255, 107, 107, 0.3)' : levelOut > 0.5 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(34, 197, 94, 0.3)',
              filter: 'blur(4px)',
              borderRadius: 4,
              opacity: levelOut > 0.1 ? 1 : 0,
              transition: 'all 0.1s ease',
            }} />
            {/* Track background */}
            <div style={{
              position: 'relative',
              width: 6,
              height: '100%',
              background: 'linear-gradient(180deg, rgba(255,100,100,0.2) 0%, rgba(255,200,0,0.2) 50%, rgba(50,200,100,0.2) 100%)',
              borderRadius: 3,
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: 'inset 0 0 4px rgba(0,0,0,0.5)',
            }}>
              {/* Level fill */}
              <div style={{
                position: 'absolute',
                bottom: 0,
                width: '100%',
                height: `${Math.min(100, levelOut * 100)}%`,
                background: levelOut > 0.8 
                  ? 'linear-gradient(180deg, #ff4444 0%, #ff6b6b 100%)' 
                  : levelOut > 0.5 
                    ? 'linear-gradient(180deg, #f59e0b 0%, #fbbf24 100%)' 
                    : 'linear-gradient(180deg, #22c55e 0%, #4ade80 100%)',
                boxShadow: levelOut > 0.8 
                  ? '0 0 8px #ff6b6b' 
                  : levelOut > 0.5 
                    ? '0 0 8px #f59e0b' 
                    : '0 0 8px #22c55e',
                transition: 'height 0.05s ease, background 0.2s ease',
                borderRadius: '0 0 2px 2px',
              }} />
              {/* Peak indicator */}
              {levelOut > 0.9 && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  width: '100%',
                  height: 3,
                  background: '#ff0000',
                  boxShadow: '0 0 10px #ff0000',
                  animation: 'activeGlow 0.3s ease-in-out infinite',
                }} />
              )}
            </div>
          </div>
          <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>OUT</span>
        </div>
        {/* Header row: Drag handle + Icon + Name + Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span
            style={{ cursor: 'grab', color: 'var(--text-muted)', flexShrink: 0 }}
            title="Drag to reorder"
          >
            <GripVertical size={14} />
          </span>
          <span style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            borderRadius: 6,
            background: `linear-gradient(135deg, ${catConfig.bg} 0%, rgba(0,0,0,0.2) 100%)`,
            color: catConfig.color,
            flexShrink: 0,
            boxShadow: plugin.bypassed ? 'none' : `0 0 8px ${catConfig.color}40, inset 0 0 8px ${catConfig.color}20`,
            border: `1px solid ${catConfig.color}40`,
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Subtle shimmer on active plugins */}
            {!plugin.bypassed && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(135deg, transparent 0%, ${catConfig.color}30 50%, transparent 100%)`,
                animation: 'shimmer 3s ease-in-out infinite',
                opacity: 0.5,
              }} />
            )}
            <CategoryIcon size={14} style={{ 
              filter: plugin.bypassed ? 'none' : `drop-shadow(0 0 3px ${catConfig.color})`,
              position: 'relative',
              zIndex: 1,
            }} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="stat-label" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={displayName}>
              {displayName}
            </div>
          </div>
          <span 
            className={`pill ${plugin.bypassed ? 'warn' : 'success'}`} 
            style={{ 
              fontSize: 9, 
              padding: '2px 8px',
              boxShadow: plugin.bypassed ? 'none' : '0 0 8px rgba(34, 197, 94, 0.5)',
              animation: plugin.bypassed ? 'none' : 'activeGlow 2s ease-in-out infinite',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Animated dot indicator */}
            {!plugin.bypassed && (
              <span style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#22c55e',
                marginRight: 4,
                boxShadow: '0 0 6px #22c55e',
                animation: 'breathe 1s ease-in-out infinite',
              }} />
            )}
            {plugin.bypassed ? 'Bypass' : 'Live'}
          </span>
        </div>

        {/* Info row: Author + Category + Ports (matching plugin browser style) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
          <span className="muted" style={{ fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 70 }}>
            {author}
          </span>
          <span style={{
            fontSize: 9,
            padding: '0px 4px',
            borderRadius: 3,
            background: catConfig.bg,
            color: catConfig.color,
            fontWeight: 500,
          }}>
            {category}
          </span>
          <span className={`pill ${isStereo ? 'success' : 'muted'}`} style={{ fontSize: 9, padding: '0px 3px' }} title={`${inPorts} in, ${outPorts} out`}>
            {portConfig}
          </span>
          {paramCount > 0 && (
            <span className="pill muted" style={{ fontSize: 9, padding: '0px 3px' }} title={`${paramCount} parameters`}>
              {paramCount}p
            </span>
          )}
        </div>

        {/* UI Capability Badges */}
        {(hasMeters || hasTuner || hasSpectrum || hasNativeUI) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
            {hasMeters && (
              <span 
                style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  fontSize: 8, 
                  padding: '2px 5px', 
                  background: 'rgba(16, 185, 129, 0.15)', 
                  color: '#10b981',
                  borderRadius: 4,
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                }}
                title="Has output meters (gain reduction, level)"
              >
                <Gauge size={9} /> METERS
              </span>
            )}
            {hasTuner && (
              <span 
                style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  fontSize: 8, 
                  padding: '2px 5px', 
                  background: 'rgba(34, 211, 238, 0.15)', 
                  color: '#22d3ee',
                  borderRadius: 4,
                  border: '1px solid rgba(34, 211, 238, 0.3)',
                }}
                title="Has tuner output"
              >
                <Radio size={9} /> TUNER
              </span>
            )}
            {hasSpectrum && (
              <span 
                style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  fontSize: 8, 
                  padding: '2px 5px', 
                  background: 'rgba(168, 85, 247, 0.15)', 
                  color: '#a855f7',
                  borderRadius: 4,
                  border: '1px solid rgba(168, 85, 247, 0.3)',
                }}
                title="Has spectrum analyzer output"
              >
                <BarChart2 size={9} /> FFT
              </span>
            )}
            {hasNativeUI && (
              <span 
                style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  fontSize: 8, 
                  padding: '2px 5px', 
                  background: 'rgba(59, 130, 246, 0.15)', 
                  color: '#3b82f6',
                  borderRadius: 4,
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                }}
                title={`Native UI available: ${uiInfo?.ui_types?.join(', ') || 'Unknown type'}`}
              >
                GUI
              </span>
            )}
          </div>
        )}

        {/* JUCE Performance Metrics Row */}
        {(plugin.format || plugin.cpu_percent !== undefined || plugin.latency_samples || plugin.sidechain_source || plugin.latency_compensated) && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 8,
            padding: '4px 6px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: 4,
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}>
            {/* Plugin Format Badge */}
            {plugin.format && plugin.format !== 'Unknown' && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  fontSize: 8,
                  padding: '2px 5px',
                  background: plugin.format === 'VST3' ? 'rgba(74, 222, 128, 0.15)'
                    : plugin.format === 'AudioUnit' ? 'rgba(96, 165, 250, 0.15)'
                    : plugin.format === 'LV2' ? 'rgba(244, 114, 182, 0.15)'
                    : 'rgba(251, 191, 36, 0.15)',
                  color: plugin.format === 'VST3' ? '#4ade80'
                    : plugin.format === 'AudioUnit' ? '#60a5fa'
                    : plugin.format === 'LV2' ? '#f472b6'
                    : '#fbbf24',
                  borderRadius: 3,
                  fontWeight: 600,
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
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  fontSize: 8,
                  padding: '2px 5px',
                  background: plugin.cpu_percent > 30 ? 'rgba(239, 68, 68, 0.15)'
                    : plugin.cpu_percent > 15 ? 'rgba(251, 191, 36, 0.15)'
                    : 'rgba(100, 181, 246, 0.15)',
                  color: plugin.cpu_percent > 30 ? '#ef4444'
                    : plugin.cpu_percent > 15 ? '#fbbf24'
                    : '#64b5f6',
                  borderRadius: 3,
                  fontFamily: 'monospace',
                }}
                title={`Plugin CPU usage: ${plugin.cpu_percent.toFixed(1)}%`}
              >
                <Cpu size={8} /> {plugin.cpu_percent.toFixed(1)}%
              </span>
            )}

            {/* Per-Plugin Latency */}
            {plugin.latency_samples !== undefined && plugin.latency_samples > 0 && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  fontSize: 8,
                  padding: '2px 5px',
                  background: 'rgba(171, 71, 188, 0.15)',
                  color: '#ab47bc',
                  borderRadius: 3,
                  fontFamily: 'monospace',
                }}
                title={`Plugin latency: ${plugin.latency_samples} samples (${((plugin.latency_samples / 48000) * 1000).toFixed(2)}ms @ 48kHz)`}
              >
                <Clock size={8} /> {plugin.latency_samples}s
              </span>
            )}

            {/* PDC Status */}
            {plugin.latency_compensated && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  fontSize: 8,
                  padding: '2px 5px',
                  background: 'rgba(34, 197, 94, 0.15)',
                  color: '#22c55e',
                  borderRadius: 3,
                }}
                title="Plugin Delay Compensation active - latency is being compensated"
              >
                <CheckCircle2 size={8} /> PDC
              </span>
            )}

            {/* Sidechain Indicator */}
            {plugin.sidechain_source && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  fontSize: 8,
                  padding: '2px 5px',
                  background: 'rgba(168, 85, 247, 0.15)',
                  color: '#a855f7',
                  borderRadius: 3,
                }}
                title={`Sidechain input from: ${plugin.sidechain_source}${plugin.sidechain_bus ? ` (bus ${plugin.sidechain_bus})` : ''}`}
              >
                <Link2 size={8} /> SC
              </span>
            )}
          </div>
        )}

        {/* Output Port Meters - Inline visualization for dynamics plugins */}
        {showOutputMeters && hasMeters && outputPorts.length > 0 && !plugin.bypassed && (
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              gap: 8, 
              marginBottom: 8,
              padding: '6px 8px',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: 6,
              border: '1px solid rgba(255, 255, 255, 0.05)',
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

        {/* Wet/Dry Mix Slider */}
        {onWetDryChange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span className="muted" style={{ fontSize: 9, minWidth: 24 }}>Mix</span>
            <input
              type="range"
              min={0}
              max={100}
              value={wetDryMix}
              onChange={(e) => { e.stopPropagation(); onWetDryChange(plugin.uri, Number(e.target.value)) }}
              onClick={(e) => e.stopPropagation()}
              style={{ flex: 1, height: 4 }}
              title={`Wet/Dry: ${wetDryMix}%`}
            />
            <span className="muted" style={{ fontSize: 9, minWidth: 28 }}>{wetDryMix}%</span>
          </div>
        )}

        {/* Button row: uniform grid layout */}
        <div style={{ 
          display: 'flex', 
          gap: 4, 
          position: 'relative', 
          zIndex: 10,
          pointerEvents: 'auto',
        }}>
          <button
            className="btn btn-ghost btn-sm"
            style={{ 
              padding: '6px 8px', 
              fontSize: 11, 
              justifyContent: 'center',
              flex: 1,
              background: 'rgba(40, 40, 40, 0.8)',
              borderColor: 'rgba(160, 160, 160, 0.6)',
              cursor: 'pointer',
            }}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onMove(plugin.uri, -1) }}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={reorderPending || idx === 0}
            title="Move up in chain (↑)"
          >
            <ArrowUp size={12} />
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ 
              padding: '6px 8px', 
              fontSize: 11, 
              justifyContent: 'center',
              flex: 1,
              background: 'rgba(40, 40, 40, 0.8)',
              borderColor: 'rgba(160, 160, 160, 0.6)',
              cursor: 'pointer',
            }}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onMove(plugin.uri, 1) }}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={reorderPending || idx === totalPlugins - 1}
            title="Move down in chain (↓)"
          >
            <ArrowDown size={12} />
          </button>
          <button
            className={`btn btn-sm ${plugin.bypassed ? 'btn-primary' : 'btn-ghost'}`}
            style={{ 
              padding: '6px 8px', 
              fontSize: 11, 
              justifyContent: 'center',
              flex: 1,
              background: plugin.bypassed ? undefined : 'rgba(40, 40, 40, 0.8)',
              borderColor: plugin.bypassed ? undefined : 'rgba(160, 160, 160, 0.6)',
              cursor: 'pointer',
            }}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggleBypass.mutate({ chainId, uri: plugin.uri, bypass: plugin.bypassed }) }}
            onMouseDown={(e) => e.stopPropagation()}
            title={plugin.bypassed ? 'Enable plugin (B)' : 'Bypass plugin (B)'}
          >
            <Power size={12} />
          </button>
          {onSavePreset && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ 
                padding: '6px 8px', 
                fontSize: 11, 
                justifyContent: 'center',
                flex: 1,
                background: 'rgba(40, 40, 40, 0.8)',
                borderColor: 'rgba(160, 160, 160, 0.6)',
                cursor: 'pointer',
              }}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onSavePreset(plugin.uri) }}
              onMouseDown={(e) => e.stopPropagation()}
              title="Save preset (S)"
            >
              <Save size={12} />
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            style={{ 
              padding: '6px 8px', 
              fontSize: 11, 
              justifyContent: 'center',
              flex: 1,
              background: 'rgba(40, 40, 40, 0.8)',
              borderColor: 'rgba(160, 160, 160, 0.6)',
              cursor: 'pointer',
            }}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRemove.mutate({ chainId, uri: plugin.uri }) }}
            onMouseDown={(e) => e.stopPropagation()}
            title="Delete plugin from chain"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
  )
}

export function ChainFlowPage() {
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

  // Persisted UI state - load from localStorage
  const [selectedChainId, setSelectedChainId] = useState<number | null>(() => {
    try {
      const val = localStorage.getItem('map2_flow_selected_chain');
      return val ? parseInt(val, 10) : null;
    } catch { return null; }
  })
  const [secondChainId, setSecondChainId] = useState<number | null>(() => {
    try {
      const val = localStorage.getItem('map2_flow_second_chain');
      return val ? parseInt(val, 10) : null;
    } catch { return null; }
  })
  const [selectedPluginUri, setSelectedPluginUri] = useState<string | null>(null)
  const [activeChainSlot, setActiveChainSlot] = useState<1 | 2>(() => {
    try {
      const val = localStorage.getItem('map2_flow_active_slot');
      return val === '2' ? 2 : 1;
    } catch { return 1; }
  })
  const [search, setSearch] = useState(() => {
    try {
      return localStorage.getItem('map2_flow_search') || '';
    } catch { return ''; }
  })
  // Chain routing mode: how A and B chains interact
  const [chainRoutingMode, setChainRoutingMode] = useState<'parallel' | 'ab_switch' | 'series'>(() => {
    try {
      const val = localStorage.getItem('map2_flow_routing_mode');
      return (val as 'parallel' | 'ab_switch' | 'series') || 'parallel';
    } catch { return 'parallel'; }
  })
  // Mix balance: 0 = 100% A, 50 = equal, 100 = 100% B (only used in parallel mode)
  const [chainMix, setChainMix] = useState(() => {
    try {
      const val = localStorage.getItem('map2_flow_chain_mix');
      return val ? parseInt(val, 10) : 50;
    } catch { return 50; }
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

  // Persist UI state to localStorage
  useEffect(() => {
    try {
      if (selectedChainId !== null) {
        localStorage.setItem('map2_flow_selected_chain', String(selectedChainId));
      } else {
        localStorage.removeItem('map2_flow_selected_chain');
      }
    } catch { /* Ignore localStorage errors */ }
  }, [selectedChainId])

  useEffect(() => {
    try {
      if (secondChainId !== null) {
        localStorage.setItem('map2_flow_second_chain', String(secondChainId));
      } else {
        localStorage.removeItem('map2_flow_second_chain');
      }
    } catch { /* Ignore localStorage errors */ }
  }, [secondChainId])

  useEffect(() => {
    try {
      localStorage.setItem('map2_flow_active_slot', String(activeChainSlot));
    } catch { /* Ignore localStorage errors */ }
  }, [activeChainSlot])

  useEffect(() => {
    try {
      localStorage.setItem('map2_flow_search', search);
    } catch { /* Ignore localStorage errors */ }
  }, [search])

  useEffect(() => {
    try {
      localStorage.setItem('map2_flow_routing_mode', chainRoutingMode);
    } catch { /* Ignore localStorage errors */ }
  }, [chainRoutingMode])

  useEffect(() => {
    try {
      localStorage.setItem('map2_flow_chain_mix', String(chainMix));
    } catch { /* Ignore localStorage errors */ }
  }, [chainMix])

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

  // Initialize selection
  useEffect(() => {
    if (!chainsQuery.data?.chains?.length) return
    if (!selectedChainId) {
      const active = chainsQuery.data.chains.find((c) => c.is_active)
      setSelectedChainId(active?.id ?? chainsQuery.data.chains[0].id)
    }
    // Initialize second chain to a different chain if available
    if (!secondChainId && chainsQuery.data.chains.length > 1) {
      const otherChain = chainsQuery.data.chains.find((c) => c.id !== selectedChainId)
      if (otherChain) setSecondChainId(otherChain.id)
    }
  }, [chainsQuery.data, selectedChainId, secondChainId])

  const selectedChain = useMemo<Chain | undefined>(() => {
    return chainsQuery.data?.chains.find((c) => c.id === selectedChainId)
  }, [chainsQuery.data, selectedChainId])

  const secondChain = useMemo<Chain | undefined>(() => {
    return chainsQuery.data?.chains.find((c) => c.id === secondChainId)
  }, [chainsQuery.data, secondChainId])

  // Get the active chain for plugin operations
  const activeChain = activeChainSlot === 1 ? selectedChain : secondChain
  const activeChainId = activeChainSlot === 1 ? selectedChainId : secondChainId

  useEffect(() => {
    if (selectedPluginUri && selectedChain) {
      const exists = selectedChain.plugins.some((p) => p.uri === selectedPluginUri)
      if (!exists) {
        setSelectedPluginUri(selectedChain.plugins[0]?.uri ?? null)
      }
    } else if (selectedChain && !selectedPluginUri && selectedChain.plugins.length > 0) {
      setSelectedPluginUri(selectedChain.plugins[0].uri)
    }
  }, [selectedChain, selectedPluginUri])

  // Simulate level meters (in production, connect to WebSocket)
  useEffect(() => {
    const interval = setInterval(() => {
      const newLevels: Record<string, { in: number; out: number }> = {}
      selectedChain?.plugins.forEach((p) => {
        if (!p.bypassed) {
          newLevels[p.uri] = {
            in: Math.random() * 0.7 + 0.1,
            out: Math.random() * 0.7 + 0.1,
          }
        } else {
          newLevels[p.uri] = { in: 0, out: 0 }
        }
      })
      secondChain?.plugins.forEach((p) => {
        if (!p.bypassed) {
          newLevels[p.uri] = {
            in: Math.random() * 0.7 + 0.1,
            out: Math.random() * 0.7 + 0.1,
          }
        } else {
          newLevels[p.uri] = { in: 0, out: 0 }
        }
      })
      setPluginLevels(newLevels)
    }, 100)
    return () => clearInterval(interval)
  }, [selectedChain, secondChain])

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

      <div>
        {/* Dual Chain Display - Full Width */}
        <div className="card" style={{ minHeight: isMobile ? 'auto' : 520, position: 'relative', overflow: 'hidden' }}>
          {/* Adding to Chain Banner */}
          {activeChain && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '12px 20px',
              marginBottom: 16,
              marginLeft: -20,
              marginRight: -20,
              marginTop: -20,
              background: activeChainSlot === 1
                ? 'linear-gradient(135deg, rgba(0, 212, 255, 0.12), rgba(0, 153, 204, 0.08))'
                : 'linear-gradient(135deg, rgba(255, 0, 170, 0.12), rgba(204, 0, 136, 0.08))',
              borderBottom: activeChainSlot === 1
                ? '2px solid rgba(0, 212, 255, 0.4)'
                : '2px solid rgba(255, 0, 170, 0.4)',
            }}>
              <Zap size={18} style={{
                color: activeChainSlot === 1 ? '#00d4ff' : '#ff00aa',
                filter: `drop-shadow(0 0 4px ${activeChainSlot === 1 ? 'rgba(0, 212, 255, 0.5)' : 'rgba(255, 0, 170, 0.5)'})`
              }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: 2,
                  color: activeChainSlot === 1 ? '#00d4ff' : '#ff00aa',
                  textTransform: 'uppercase',
                  marginBottom: 1,
                }}>
                  {activeChainSlot === 1 ? 'PATH A' : 'PATH B'}
                </div>
                <div style={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: '#fff',
                  textShadow: '0 1px 2px rgba(0,0,0,0.4)',
                  letterSpacing: 0.5,
                }}>
                  Adding to: {activeChainSlot === 1 ? 'A' : 'B'}: {activeChain.name}
                </div>
              </div>
              <Radio size={18} style={{
                color: activeChainSlot === 1 ? '#00d4ff' : '#ff00aa',
                filter: `drop-shadow(0 0 4px ${activeChainSlot === 1 ? 'rgba(0, 212, 255, 0.5)' : 'rgba(255, 0, 170, 0.5)'})`
              }} />
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 0, height: '100%' }}>
            {/* Chain A */}
            <div style={{ display: 'flex', flexDirection: 'column', padding: '0 12px 0 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <button
                  className={`btn btn-sm ${activeChainSlot === 1 ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ 
                    padding: '6px 14px', 
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: '1px',
                    boxShadow: activeChainSlot === 1 ? '0 0 15px rgba(0, 212, 255, 0.5), inset 0 0 10px rgba(255,255,255,0.1)' : 'none',
                    border: activeChainSlot === 1 ? '1px solid rgba(0, 212, 255, 0.5)' : '1px solid transparent',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onClick={() => setActiveChainSlot(1)}
                >
                  {activeChainSlot === 1 && (
                    <span style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
                      animation: 'shimmer 2s ease-in-out infinite',
                    }} />
                  )}
                  <span style={{ position: 'relative', zIndex: 1 }}>A</span>
                </button>
                <select
                  className="input"
                  style={{ flex: 1, fontSize: 12, padding: '6px 8px' }}
                  value={selectedChainId ?? ''}
                  onChange={(e) => setSelectedChainId(Number(e.target.value))}
                  disabled={chainsQuery.isLoading}
                  title="Chain A - parallel signal path"
                >
                  {chainsQuery.data?.chains.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.is_active ? '●' : ''}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 4 }} title="A/B paths run in parallel and mix to output">Path A</span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {chainsQuery.isLoading ? (
                  <div className="flex" style={{ padding: '12px 4px' }}>
                    <Loader2 className="spin" size={18} /> Loading...
                  </div>
                ) : !selectedChain ? (
                  <div className="pill warn" style={{ fontSize: 11 }}>No chain</div>
                ) : selectedChain.plugins.length === 0 ? (
                  <div className="muted" style={{ fontSize: 11, padding: 8 }}>Empty chain</div>
                ) : (
                  <div className="stack" style={{ gap: 0 }}>
                    <ChainEndpoint type="input" label="AUDIO INPUT" audioStatus={audioInterfaceStatus} />
                    {selectedChain.plugins.map((plugin, idx) => (
                      <React.Fragment key={plugin.uri}>
                        <SignalCable
                          isActive={!plugin.bypassed}
                          color={getCategoryConfig(pluginMetaByUri[plugin.uri]?.category || 'Effect').color}
                        />
                        {/* Special rendering for Cabinet IR plugin with GraphicalIRLoader-style card */}
                        {plugin.uri === CABINET_IR_PLUGIN_URI ? (
                          <CabinetIRFlowCard
                            status={cabinetStatus}
                            onIRChange={updateCabinetIR}
                            onMixChange={updateCabinetMix}
                            onBypassChange={updateCabinetBypass}
                            isSelected={activeChainSlot === 1 && selectedPluginUri === plugin.uri}
                            isDragging={draggedPluginUri === plugin.uri}
                          />
                        ) : (
                          <PluginFlowItem
                            plugin={plugin}
                            pluginMeta={pluginMetaByUri[plugin.uri]}
                            idx={idx}
                            totalPlugins={selectedChain.plugins.length}
                            isSelected={activeChainSlot === 1 && selectedPluginUri === plugin.uri}
                            chainId={selectedChain.id}
                            onSelect={(uri) => { setActiveChainSlot(1); setSelectedPluginUri(uri); }}
                            onMove={movePlugin}
                            onToggleBypass={toggleBypass}
                            onRemove={removePlugin}
                            reorderPending={reorder.isPending}
                            onDragStart={handleDragStart}
                            onDragOver={handleDragOver}
                            onDragEnd={handleDragEnd}
                            onDrop={handleDrop}
                            isDragging={draggedPluginUri === plugin.uri}
                            isDragOver={dragOverPluginUri === plugin.uri}
                            levelIn={pluginLevels[plugin.uri]?.in ?? 0}
                            levelOut={pluginLevels[plugin.uri]?.out ?? 0}
                            wetDryMix={wetDryMixes[plugin.uri] ?? 100}
                            onWetDryChange={handleWetDryChange}
                            onSavePreset={handleSavePreset}
                          />
                        )}
                      </React.Fragment>
                    ))}
                    <SignalCable isActive={selectedChain.plugins.some(p => !p.bypassed)} />
                    <ChainEndpoint type="output" label="AUDIO OUTPUT" audioStatus={audioInterfaceStatus} />
                  </div>
                )}
              </div>
              {/* Plugin count indicator with glow */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                gap: 8,
                marginTop: 12,
                padding: '6px 12px',
                background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.1) 0%, rgba(0, 100, 150, 0.1) 100%)',
                borderRadius: 20,
                border: '1px solid rgba(0, 212, 255, 0.3)',
                boxShadow: '0 0 10px rgba(0, 212, 255, 0.2)',
              }}>
                <svg width="16" height="16" viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="6" fill="none" stroke="var(--primary)" strokeWidth="1.5" opacity="0.5" />
                  <circle cx="8" cy="8" r="3" fill="var(--primary)">
                    <animate attributeName="r" values="2;4;2" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />
                  </circle>
                </svg>
                <span style={{ 
                  fontSize: 11, 
                  fontWeight: 600,
                  color: 'var(--primary)',
                  textShadow: '0 0 8px rgba(0, 212, 255, 0.5)',
                }}>
                  {selectedChain?.plugins.length ?? 0} plugins
                </span>
              </div>
            </div>

            {/* Signal Flow Routing Panel - Hidden on mobile */}
            {!isMobile && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
              padding: '16px 20px',
              borderLeft: '1px solid var(--surface-border)',
              borderRight: '1px solid var(--surface-border)',
              background: 'linear-gradient(180deg, rgba(0, 212, 255, 0.02) 0%, rgba(0, 212, 255, 0.08) 50%, rgba(0, 212, 255, 0.02) 100%)',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* Ripple effect background */}
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(circle at 50% 50%, rgba(0, 212, 255, 0.15) 0%, transparent 50%)',
                backgroundSize: '200% 200%',
                animation: 'cardRipple 8s ease-in-out infinite',
                pointerEvents: 'none',
              }} />
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 100,
                height: 100,
                marginLeft: -50,
                marginTop: -50,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(0, 212, 255, 0.2) 0%, transparent 70%)',
                animation: 'pulseRing 3s ease-out infinite',
                pointerEvents: 'none',
              }} />
              {/* Routing Mode Header */}
              <div style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--text-muted)',
                letterSpacing: '1.5px',
                marginBottom: 12,
                textTransform: 'uppercase',
              }}>SIGNAL ROUTING</div>

              {/* Routing Mode Selector */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                width: '100%',
                marginBottom: 16,
              }}>
                {/* Parallel Mix Mode */}
                <button
                  onClick={() => setChainRoutingMode('parallel')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    background: chainRoutingMode === 'parallel'
                      ? 'linear-gradient(135deg, rgba(0, 212, 255, 0.25) 0%, rgba(0, 150, 200, 0.15) 100%)'
                      : 'rgba(255, 255, 255, 0.03)',
                    border: chainRoutingMode === 'parallel'
                      ? '1px solid rgba(0, 212, 255, 0.5)'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: chainRoutingMode === 'parallel'
                      ? '0 0 12px rgba(0, 212, 255, 0.3)'
                      : 'none',
                  }}
                >
                  {/* Parallel diagram */}
                  <svg width="32" height="24" viewBox="0 0 32 24">
                    <line x1="0" y1="6" x2="8" y2="6" stroke={chainRoutingMode === 'parallel' ? 'var(--primary)' : '#666'} strokeWidth="2" />
                    <line x1="0" y1="18" x2="8" y2="18" stroke={chainRoutingMode === 'parallel' ? 'var(--primary)' : '#666'} strokeWidth="2" />
                    <rect x="8" y="2" width="16" height="8" rx="2" fill="none" stroke={chainRoutingMode === 'parallel' ? 'var(--primary)' : '#666'} strokeWidth="1.5" />
                    <rect x="8" y="14" width="16" height="8" rx="2" fill="none" stroke={chainRoutingMode === 'parallel' ? 'var(--primary)' : '#666'} strokeWidth="1.5" />
                    <text x="16" y="8" textAnchor="middle" fontSize="6" fill={chainRoutingMode === 'parallel' ? 'var(--primary)' : '#666'}>A</text>
                    <text x="16" y="20" textAnchor="middle" fontSize="6" fill={chainRoutingMode === 'parallel' ? 'var(--primary)' : '#666'}>B</text>
                    <line x1="24" y1="6" x2="28" y2="12" stroke={chainRoutingMode === 'parallel' ? 'var(--primary)' : '#666'} strokeWidth="2" />
                    <line x1="24" y1="18" x2="28" y2="12" stroke={chainRoutingMode === 'parallel' ? 'var(--primary)' : '#666'} strokeWidth="2" />
                    <circle cx="28" cy="12" r="2" fill={chainRoutingMode === 'parallel' ? 'var(--primary)' : '#666'} />
                  </svg>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: chainRoutingMode === 'parallel' ? 'var(--primary)' : 'var(--text)',
                    }}>Parallel Mix</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Blend both chains</div>
                  </div>
                </button>

                {/* A/B Switch Mode */}
                <button
                  onClick={() => setChainRoutingMode('ab_switch')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    background: chainRoutingMode === 'ab_switch'
                      ? 'linear-gradient(135deg, rgba(255, 170, 0, 0.25) 0%, rgba(200, 120, 0, 0.15) 100%)'
                      : 'rgba(255, 255, 255, 0.03)',
                    border: chainRoutingMode === 'ab_switch'
                      ? '1px solid rgba(255, 170, 0, 0.5)'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: chainRoutingMode === 'ab_switch'
                      ? '0 0 12px rgba(255, 170, 0, 0.3)'
                      : 'none',
                  }}
                >
                  {/* A/B switch diagram */}
                  <svg width="32" height="24" viewBox="0 0 32 24">
                    <line x1="0" y1="12" x2="8" y2="12" stroke={chainRoutingMode === 'ab_switch' ? '#ffaa00' : '#666'} strokeWidth="2" />
                    <rect x="10" y="2" width="12" height="8" rx="2" fill="none" stroke={chainRoutingMode === 'ab_switch' ? '#ffaa00' : '#666'} strokeWidth="1.5" opacity={activeChainSlot === 1 ? 1 : 0.4} />
                    <rect x="10" y="14" width="12" height="8" rx="2" fill="none" stroke={chainRoutingMode === 'ab_switch' ? '#ffaa00' : '#666'} strokeWidth="1.5" opacity={activeChainSlot === 2 ? 1 : 0.4} />
                    <text x="16" y="8" textAnchor="middle" fontSize="6" fill={chainRoutingMode === 'ab_switch' ? '#ffaa00' : '#666'} opacity={activeChainSlot === 1 ? 1 : 0.4}>A</text>
                    <text x="16" y="20" textAnchor="middle" fontSize="6" fill={chainRoutingMode === 'ab_switch' ? '#ffaa00' : '#666'} opacity={activeChainSlot === 2 ? 1 : 0.4}>B</text>
                    <line x1="8" y1="12" x2="10" y2={activeChainSlot === 1 ? '6' : '18'} stroke={chainRoutingMode === 'ab_switch' ? '#ffaa00' : '#666'} strokeWidth="2" />
                    <line x1="22" y1={activeChainSlot === 1 ? '6' : '18'} x2="28" y2="12" stroke={chainRoutingMode === 'ab_switch' ? '#ffaa00' : '#666'} strokeWidth="2" />
                    <circle cx="28" cy="12" r="2" fill={chainRoutingMode === 'ab_switch' ? '#ffaa00' : '#666'} />
                  </svg>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: chainRoutingMode === 'ab_switch' ? '#ffaa00' : 'var(--text)',
                    }}>A/B Switch</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Toggle between chains</div>
                  </div>
                </button>

                {/* Series Mode */}
                <button
                  onClick={() => setChainRoutingMode('series')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    background: chainRoutingMode === 'series'
                      ? 'linear-gradient(135deg, rgba(170, 0, 255, 0.25) 0%, rgba(120, 0, 200, 0.15) 100%)'
                      : 'rgba(255, 255, 255, 0.03)',
                    border: chainRoutingMode === 'series'
                      ? '1px solid rgba(170, 0, 255, 0.5)'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: chainRoutingMode === 'series'
                      ? '0 0 12px rgba(170, 0, 255, 0.3)'
                      : 'none',
                  }}
                >
                  {/* Series diagram */}
                  <svg width="32" height="24" viewBox="0 0 32 24">
                    <line x1="0" y1="12" x2="4" y2="12" stroke={chainRoutingMode === 'series' ? '#aa00ff' : '#666'} strokeWidth="2" />
                    <rect x="4" y="6" width="10" height="12" rx="2" fill="none" stroke={chainRoutingMode === 'series' ? '#aa00ff' : '#666'} strokeWidth="1.5" />
                    <text x="9" y="14" textAnchor="middle" fontSize="6" fill={chainRoutingMode === 'series' ? '#aa00ff' : '#666'}>A</text>
                    <line x1="14" y1="12" x2="18" y2="12" stroke={chainRoutingMode === 'series' ? '#aa00ff' : '#666'} strokeWidth="2" />
                    <rect x="18" y="6" width="10" height="12" rx="2" fill="none" stroke={chainRoutingMode === 'series' ? '#aa00ff' : '#666'} strokeWidth="1.5" />
                    <text x="23" y="14" textAnchor="middle" fontSize="6" fill={chainRoutingMode === 'series' ? '#aa00ff' : '#666'}>B</text>
                    <line x1="28" y1="12" x2="32" y2="12" stroke={chainRoutingMode === 'series' ? '#aa00ff' : '#666'} strokeWidth="2" />
                  </svg>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: chainRoutingMode === 'series' ? '#aa00ff' : 'var(--text)',
                    }}>Series</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>A feeds into B</div>
                  </div>
                </button>
              </div>

              {/* Mix Balance Slider - Only shown in parallel mode */}
              {chainRoutingMode === 'parallel' && (
                <div style={{
                  width: '100%',
                  padding: '12px',
                  background: 'rgba(0, 212, 255, 0.08)',
                  borderRadius: 8,
                  border: '1px solid rgba(0, 212, 255, 0.2)',
                  marginBottom: 16,
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--primary)' }}>A</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>MIX BALANCE</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--primary)' }}>B</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={chainMix}
                    onChange={(e) => setChainMix(Number(e.target.value))}
                    style={{
                      width: '100%',
                      height: 6,
                      appearance: 'none',
                      background: `linear-gradient(90deg, var(--primary) ${chainMix}%, rgba(255,255,255,0.2) ${chainMix}%)`,
                      borderRadius: 3,
                      cursor: 'pointer',
                    }}
                  />
                  <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    marginTop: 8,
                  }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--text)',
                      background: 'rgba(0, 212, 255, 0.15)',
                      padding: '2px 8px',
                      borderRadius: 4,
                    }}>
                      {chainMix === 50 ? '50/50' : chainMix < 50 ? `${100 - chainMix}% A` : `${chainMix}% B`}
                    </span>
                  </div>
                </div>
              )}

              {/* A/B Switch Active Indicator */}
              {chainRoutingMode === 'ab_switch' && (
                <div style={{
                  width: '100%',
                  padding: '12px',
                  background: 'rgba(255, 170, 0, 0.08)',
                  borderRadius: 8,
                  border: '1px solid rgba(255, 170, 0, 0.2)',
                  marginBottom: 16,
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 6 }}>ACTIVE CHAIN</div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 8,
                  }}>
                    <button
                      onClick={() => setActiveChainSlot(1)}
                      style={{
                        padding: '6px 16px',
                        fontSize: 12,
                        fontWeight: 700,
                        background: activeChainSlot === 1 ? '#ffaa00' : 'transparent',
                        color: activeChainSlot === 1 ? '#000' : '#ffaa00',
                        border: '1px solid #ffaa00',
                        borderRadius: 4,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >A</button>
                    <button
                      onClick={() => setActiveChainSlot(2)}
                      style={{
                        padding: '6px 16px',
                        fontSize: 12,
                        fontWeight: 700,
                        background: activeChainSlot === 2 ? '#ffaa00' : 'transparent',
                        color: activeChainSlot === 2 ? '#000' : '#ffaa00',
                        border: '1px solid #ffaa00',
                        borderRadius: 4,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >B</button>
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 8 }}>
                    Click A or B to switch
                  </div>
                </div>
              )}

              {/* Series Flow Indicator */}
              {chainRoutingMode === 'series' && (
                <div style={{
                  width: '100%',
                  padding: '12px',
                  background: 'rgba(170, 0, 255, 0.08)',
                  borderRadius: 8,
                  border: '1px solid rgba(170, 0, 255, 0.2)',
                  marginBottom: 16,
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 8 }}>SIGNAL FLOW</div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}>
                    <span style={{
                      padding: '4px 10px',
                      fontSize: 11,
                      fontWeight: 700,
                      background: 'rgba(170, 0, 255, 0.2)',
                      color: '#aa00ff',
                      borderRadius: 4,
                    }}>INPUT</span>
                    <ArrowRight size={14} style={{ color: '#aa00ff' }} />
                    <span style={{
                      padding: '4px 10px',
                      fontSize: 11,
                      fontWeight: 700,
                      background: 'rgba(170, 0, 255, 0.3)',
                      color: '#aa00ff',
                      borderRadius: 4,
                    }}>A</span>
                    <ArrowRight size={14} style={{ color: '#aa00ff' }} />
                    <span style={{
                      padding: '4px 10px',
                      fontSize: 11,
                      fontWeight: 700,
                      background: 'rgba(170, 0, 255, 0.3)',
                      color: '#aa00ff',
                      borderRadius: 4,
                    }}>B</span>
                    <ArrowRight size={14} style={{ color: '#aa00ff' }} />
                    <span style={{
                      padding: '4px 10px',
                      fontSize: 11,
                      fontWeight: 700,
                      background: 'rgba(170, 0, 255, 0.2)',
                      color: '#aa00ff',
                      borderRadius: 4,
                    }}>OUT</span>
                  </div>
                </div>
              )}

              {/* Mode Explanation */}
              <div style={{
                width: '100%',
                padding: '10px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: 6,
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 6
                }}>
                  <Info size={12} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    {chainRoutingMode === 'parallel' ? 'Parallel Mode' : chainRoutingMode === 'ab_switch' ? 'A/B Mode' : 'Series Mode'}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {chainRoutingMode === 'parallel' && (
                    <>Audio splits to both chains simultaneously. Adjust the mix slider to blend between them. Great for wet/dry effects or layering two different sounds.</>
                  )}
                  {chainRoutingMode === 'ab_switch' && (
                    <>Only one chain is active at a time. Switch instantly between A and B for comparing tones or switching between clean/dirty sounds live.</>
                  )}
                  {chainRoutingMode === 'series' && (
                    <>Chain A's output feeds directly into Chain B's input. Use this to stack effect chains or route through multiple processing stages.</>
                  )}
                </div>
              </div>

              {/* Output Indicator */}
              <div style={{
                marginTop: 'auto',
                paddingTop: 16,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '8px 12px',
                  background: 'rgba(34, 197, 94, 0.15)',
                  borderRadius: 8,
                  border: '1px solid var(--success)',
                  boxShadow: '0 0 10px rgba(34, 197, 94, 0.3)',
                }}>
                  <Speaker size={18} style={{
                    color: 'var(--success)',
                    filter: 'drop-shadow(0 0 4px rgba(34, 197, 94, 0.8))',
                  }} />
                </div>
                <span style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: 'var(--success)',
                  letterSpacing: '1px',
                }}>OUTPUT</span>
              </div>
            </div>
            )}

            {/* Chain B */}
            <div style={{ display: 'flex', flexDirection: 'column', padding: '0 0 0 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <button
                  className={`btn btn-sm ${activeChainSlot === 2 ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ 
                    padding: '6px 14px', 
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: '1px',
                    boxShadow: activeChainSlot === 2 ? '0 0 15px rgba(0, 212, 255, 0.5), inset 0 0 10px rgba(255,255,255,0.1)' : 'none',
                    border: activeChainSlot === 2 ? '1px solid rgba(0, 212, 255, 0.5)' : '1px solid transparent',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onClick={() => setActiveChainSlot(2)}
                >
                  {activeChainSlot === 2 && (
                    <span style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
                      animation: 'shimmer 2s ease-in-out infinite',
                    }} />
                  )}
                  <span style={{ position: 'relative', zIndex: 1 }}>B</span>
                </button>
                <select
                  className="input"
                  style={{ flex: 1, fontSize: 12, padding: '6px 8px' }}
                  value={secondChainId ?? ''}
                  onChange={(e) => setSecondChainId(Number(e.target.value))}
                  disabled={chainsQuery.isLoading}
                  title="Chain B - parallel signal path"
                >
                  <option value="">None</option>
                  {chainsQuery.data?.chains.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.is_active ? '●' : ''}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 4 }} title="A/B paths run in parallel and mix to output">Path B</span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {!secondChainId ? (
                  <div className="muted" style={{ fontSize: 11, padding: 8, textAlign: 'center' }}>
                    Select a chain to compare
                  </div>
                ) : chainsQuery.isLoading ? (
                  <div className="flex" style={{ padding: '12px 4px' }}>
                    <Loader2 className="spin" size={18} /> Loading...
                  </div>
                ) : !secondChain ? (
                  <div className="pill warn" style={{ fontSize: 11 }}>No chain</div>
                ) : secondChain.plugins.length === 0 ? (
                  <div className="muted" style={{ fontSize: 11, padding: 8 }}>Empty chain</div>
                ) : (
                  <div className="stack" style={{ gap: 0 }}>
                    <ChainEndpoint type="input" label="AUDIO INPUT" audioStatus={audioInterfaceStatus} />
                    {secondChain.plugins.map((plugin, idx) => (
                      <React.Fragment key={plugin.uri}>
                        <SignalCable
                          isActive={!plugin.bypassed}
                          color={getCategoryConfig(pluginMetaByUri[plugin.uri]?.category || 'Effect').color}
                        />
                        {/* Special rendering for Cabinet IR plugin with GraphicalIRLoader-style card */}
                        {plugin.uri === CABINET_IR_PLUGIN_URI ? (
                          <CabinetIRFlowCard
                            status={cabinetStatus}
                            onIRChange={updateCabinetIR}
                            onMixChange={updateCabinetMix}
                            onBypassChange={updateCabinetBypass}
                            isSelected={activeChainSlot === 2 && selectedPluginUri === plugin.uri}
                            isDragging={draggedPluginUri === plugin.uri}
                          />
                        ) : (
                          <PluginFlowItem
                            plugin={plugin}
                            pluginMeta={pluginMetaByUri[plugin.uri]}
                            idx={idx}
                            totalPlugins={secondChain.plugins.length}
                            isSelected={activeChainSlot === 2 && selectedPluginUri === plugin.uri}
                            chainId={secondChain.id}
                            onSelect={(uri) => { setActiveChainSlot(2); setSelectedPluginUri(uri); }}
                            onMove={movePlugin}
                            onToggleBypass={toggleBypass}
                            onRemove={removePlugin}
                            reorderPending={reorder.isPending}
                            onDragStart={handleDragStart}
                            onDragOver={handleDragOver}
                            onDragEnd={handleDragEnd}
                            onDrop={handleDrop}
                            isDragging={draggedPluginUri === plugin.uri}
                            isDragOver={dragOverPluginUri === plugin.uri}
                            levelIn={pluginLevels[plugin.uri]?.in ?? 0}
                            levelOut={pluginLevels[plugin.uri]?.out ?? 0}
                            wetDryMix={wetDryMixes[plugin.uri] ?? 100}
                            onWetDryChange={handleWetDryChange}
                            onSavePreset={handleSavePreset}
                          />
                        )}
                      </React.Fragment>
                    ))}
                    <SignalCable isActive={secondChain.plugins.some(p => !p.bypassed)} />
                    <ChainEndpoint type="output" label="AUDIO OUTPUT" audioStatus={audioInterfaceStatus} />
                  </div>
                )}
              </div>
              {/* Plugin count indicator with glow */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                gap: 8,
                marginTop: 12,
                padding: '6px 12px',
                background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.1) 0%, rgba(0, 100, 150, 0.1) 100%)',
                borderRadius: 20,
                border: '1px solid rgba(0, 212, 255, 0.3)',
                boxShadow: '0 0 10px rgba(0, 212, 255, 0.2)',
              }}>
                <svg width="16" height="16" viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="6" fill="none" stroke="var(--primary)" strokeWidth="1.5" opacity="0.5" />
                  <circle cx="8" cy="8" r="3" fill="var(--primary)">
                    <animate attributeName="r" values="2;4;2" dur="2s" begin="0.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="1;0.5;1" dur="2s" begin="0.5s" repeatCount="indefinite" />
                  </circle>
                </svg>
                <span style={{ 
                  fontSize: 11, 
                  fontWeight: 600,
                  color: 'var(--primary)',
                  textShadow: '0 0 8px rgba(0, 212, 255, 0.5)',
                }}>
                  {secondChain?.plugins.length ?? 0} plugins
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>

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
      />

      <PluginDetailsModal
        plugin={detailsPlugin}
        open={detailsPlugin !== null}
        onClose={() => setDetailsPlugin(null)}
        onAdd={(uri) => { addPlugin.mutate(uri); setDetailsPlugin(null); }}
      />

      {/* File Storage Reference */}
      <div className="card" style={{
        marginTop: 24,
        background: 'linear-gradient(135deg, rgba(30, 30, 40, 0.95), rgba(20, 20, 30, 0.98))',
        border: '1px solid rgba(100, 100, 120, 0.2)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
          paddingBottom: 12,
          borderBottom: '1px solid rgba(100, 100, 120, 0.15)'
        }}>
          <FolderOpen size={18} style={{ color: '#64748b' }} />
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8', margin: 0 }}>File Storage Locations</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {/* NAM Models */}
          <div style={{
            padding: 12,
            background: 'rgba(255, 107, 53, 0.08)',
            borderRadius: 8,
            border: '1px solid rgba(255, 107, 53, 0.2)'
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#ff6b35', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Guitar size={14} />
              NAM Models (.nam)
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
              <div><code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 3 }}>~/.local/share/map2/nam</code> <span style={{ color: '#64748b' }}>primary</span></div>
              <div style={{ marginTop: 4 }}><code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 3 }}>~/NAM/models</code></div>
              <div style={{ marginTop: 4 }}><code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 3 }}>/var/lib/map2/nam</code> <span style={{ color: '#64748b' }}>system</span></div>
            </div>
          </div>

          {/* Cabinet IR */}
          <div style={{
            padding: 12,
            background: 'rgba(255, 184, 77, 0.08)',
            borderRadius: 8,
            border: '1px solid rgba(255, 184, 77, 0.2)'
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#ffb84d', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Speaker size={14} />
              Cabinet IR (.wav)
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
              <div><code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 3 }}>~/.local/share/map2/ir/cabinets</code> <span style={{ color: '#64748b' }}>primary</span></div>
              <div style={{ marginTop: 4 }}><code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 3 }}>~/IRs</code> or <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 3 }}>~/Impulses</code></div>
              <div style={{ marginTop: 4 }}><code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 3 }}>/var/lib/map2/ir</code> <span style={{ color: '#64748b' }}>system</span></div>
            </div>
          </div>

          {/* Reverb IR */}
          <div style={{
            padding: 12,
            background: 'rgba(168, 85, 247, 0.08)',
            borderRadius: 8,
            border: '1px solid rgba(168, 85, 247, 0.2)'
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#a855f7', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Waves size={14} />
              Reverb IR (.wav)
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
              <div><code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 3 }}>~/.local/share/map2/ir/reverbs</code> <span style={{ color: '#64748b' }}>primary</span></div>
              <div style={{ marginTop: 4 }}><code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 3 }}>~/IRs</code> or <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 3 }}>~/Impulses</code></div>
              <div style={{ marginTop: 4 }}><code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 3 }}>/var/lib/map2/ir</code> <span style={{ color: '#64748b' }}>system</span></div>
            </div>
          </div>
        </div>

        <div style={{
          marginTop: 12,
          fontSize: 10,
          color: '#64748b',
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap'
        }}>
          <span>Supported IR formats: <strong>.wav</strong>, <strong>.flac</strong>, <strong>.aiff</strong></span>
          <span>Upload directory: <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 4px', borderRadius: 2 }}>/var/lib/map2/irs/user</code></span>
        </div>
      </div>

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
    return (
      <div style={{
        padding: 16,
        borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.1) 0%, rgba(0,0,0,0.2) 100%)',
        border: '1px solid rgba(255, 107, 53, 0.3)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Plugin not found in metadata</div>
        <div style={{ fontSize: 11, color: '#888' }}>URI: {plugin.uri}</div>
        <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>Try clicking Refresh to reload plugin data.</div>
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
