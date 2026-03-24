import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type RefObject, useEffect, useRef, useState } from 'react'
import {
  Accordion,
  AccordionItem,
  Button,
  InlineLoading,
  InlineNotification,
  Modal,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  Tile,
} from '@carbon/react'
import {
  Add,
  Music,
  PauseFilled,
  PlayFilled,
  StopFilled,
  TrashCan,
  VolumeUp,
  Waveform,
} from '@carbon/icons-react'

import { PageHeader } from '@/app/components/PageHeader'
import { NumberInput } from '@/app/components/Controls/NumberInput'
import './DrumsPage.css'
import {
  useDrumActiveKit,
  useDrumCcMapping,
  useDrumKits,
  useDrumMasterFx,
  useDrumMidiMapping,
  useLoadDrumKit,
  useLoadDrumMidiPreset,
  useDrumMetering,
  useDrumSampleEditor,
  useDrumPosition,
  useDrumSong,
  useDrumSongTransport,
  useClearDrumPattern,
  useCopyDrumPattern,
  useDrumMachineState,
  useDrumMidiLearn,
  useDrumMixer,
  usePatchDrumKitInstrument,
  useDrumPattern,
  useDrumPacks,
  useSetDrumPattern,
  useSetDrumPadSoundSource,
  useSetDrumPadSynthParams,
  useSetDrumPadFilter,
  useSetDrumPadCvGateConfig,
  useSetDrumPadControl,
  useSetDrumBusMixer,
  useSetDrumCcMappings,
  useSetDrumMasterFx,
  useSetDrumMasterVolume,
  useSetDrumMidiMapping,
  useSetDrumMidiOutputConfig,
  useSetDrumMidiZones,
  useSetDrumTrackLength,
  useSetDrumVelocityCurve,
  useAddDrumSongEntry,
  usePlayDrumSongTransport,
  useRemoveDrumSongEntry,
  useSetDrumSong,
  useSetDrumStep,
  useSetDrumTrackSwing,
  useStartDrumCcLearn,
  useStartDrumMidiLearn,
  useStopDrumCcLearn,
  useStopDrumSongTransport,
  useStopDrumMidiLearn,
  useTriggerDrumFill,
  useDrumTransport,
  useUpdateDrumMachineState,
  useUpdateDrumTransport,
} from '@/app/hooks/useDrumMachine'
import { drumsApi } from '@/map2/api'
import { normalizeDrumMachineState } from '@/map2/drumMachineState'
import type {
  DrumBusMixer,
  DrumCcMapping,
  DrumCcTarget,
  DrumInstrument,
  DrumKit,
  DrumMachineState,
  DrumMasterFxState,
  DrumMidiMapping,
  DrumMidiZones,
  DrumMidiOutputConfig,
  DrumCvGateConfig,
  DrumPadControl,
  DrumPadFilter,
  DrumPadSampleWaveform,
  DrumPadSoundSource,
  DrumPattern,
  DrumSynthParams,
  DrumVelocityCurve,
} from '@/map2/types'

type DrumMode = DrumMachineState['ui_mode']

const MODE_ORDER: DrumMode[] = ['practice', 'advanced', 'backing_tracks']

const MODE_META: Record<DrumMode, { label: string; accent: string; description: string }> = {
  practice: {
    label: 'Practice',
    accent: '#4589ff',
    description: 'Style-driven rehearsal controls, arrangement loading, and guided repetition.',
  },
  advanced: {
    label: 'Advanced',
    accent: '#24a148',
    description: 'Sequencer, pattern tools, mixer, and MIDI editing workspace.',
  },
  backing_tracks: {
    label: 'Backing Tracks',
    accent: '#ff832b',
    description: 'Track browser and transport surface for supported accompaniment playback.',
  },
}

const PRACTICE_STYLES = [
  { id: 'rock_8', label: 'Rock 8', icon: '8', feel: 'Straight', signature: '4/4' },
  { id: 'rock_16', label: 'Rock 16', icon: '16', feel: 'Driving', signature: '4/4' },
  { id: 'shuffle_blues', label: 'Shuffle Blues', icon: 'S', feel: 'Shuffle', signature: '12/8' },
  { id: 'funk_16', label: 'Funk 16', icon: 'F', feel: 'Syncopated', signature: '4/4' },
  { id: 'metal_doublekick', label: 'Metal DK', icon: 'M', feel: 'Aggressive', signature: '4/4' },
  { id: 'pop_4onfloor', label: 'Pop 4', icon: 'P', feel: 'Four on Floor', signature: '4/4' },
  { id: 'jazz_swing', label: 'Jazz Swing', icon: 'J', feel: 'Swing', signature: '4/4' },
  { id: 'reggae_1drop', label: 'Reggae 1', icon: 'R', feel: 'One Drop', signature: '4/4' },
] as const

const BACKING_TRACK_LIBRARY = [
  { id: 'bt-001', name: 'Midnight Motor', genre: 'Rock', key: 'E minor', tempo: 118, duration: '03:24' },
  { id: 'bt-002', name: 'City Lights', genre: 'Pop', key: 'A major', tempo: 124, duration: '02:58' },
  { id: 'bt-003', name: 'Copper Shuffle', genre: 'Blues', key: 'G', tempo: 92, duration: '04:11' },
  { id: 'bt-004', name: 'Neon Circuit', genre: 'Electronic', key: 'D minor', tempo: 128, duration: '03:42' },
] as const

const VELOCITY_CURVE_OPTIONS: Array<{ value: DrumVelocityCurve['curve_type']; label: string }> = [
  { value: 0, label: 'Linear' },
  { value: 1, label: 'Log' },
  { value: 2, label: 'Exp' },
  { value: 3, label: 'S-Curve' },
  { value: 4, label: 'Fixed' },
]

const CC_TARGET_OPTIONS: Array<{ value: DrumCcTarget; label: string }> = [
  { value: 'pad_volume', label: 'Pad Volume' },
  { value: 'pad_pan', label: 'Pad Pan' },
  { value: 'pad_tune', label: 'Pad Tune' },
  { value: 'pad_filter_cutoff', label: 'Pad Filter Cutoff' },
  { value: 'bus_level', label: 'Bus Level' },
  { value: 'bus_pan', label: 'Bus Pan' },
  { value: 'master_volume', label: 'Master Volume' },
  { value: 'tempo', label: 'Tempo' },
  { value: 'swing', label: 'Swing' },
  { value: 'synth_pitch_start_hz', label: 'Synth Pitch Start' },
  { value: 'synth_pitch_end_hz', label: 'Synth Pitch End' },
  { value: 'synth_pitch_decay_ms', label: 'Synth Pitch Decay' },
  { value: 'synth_noise_level', label: 'Synth Noise Level' },
  { value: 'synth_noise_decay_ms', label: 'Synth Noise Decay' },
  { value: 'synth_body_decay_ms', label: 'Synth Body Decay' },
  { value: 'synth_tone_amount', label: 'Synth Tone' },
]

const shellStyle: Record<string, React.CSSProperties> = {
  page: {
    padding: '24px 24px 40px',
    maxWidth: 1480,
    margin: '0 auto',
    display: 'grid',
    gap: 24,
  },
  skipLinks: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
  },
  skipLink: {
    position: 'absolute',
    left: -9999,
    top: 'auto',
    width: 1,
    height: 1,
    overflow: 'hidden',
    padding: '10px 14px',
    borderRadius: 999,
    background: '#0f62fe',
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 700,
    textDecoration: 'none',
    zIndex: 5,
  },
  visuallyHidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  } as React.CSSProperties,
  transport: {
    borderRadius: 18,
    border: '1px solid rgba(255,255,255,0.08)',
    background:
      'linear-gradient(145deg, rgba(18,18,18,0.98), rgba(8,8,8,0.94)),' +
      'radial-gradient(circle at top right, rgba(69,137,255,0.18), transparent 40%)',
    padding: 20,
    display: 'grid',
    gap: 18,
    boxShadow: '0 28px 60px rgba(0,0,0,0.28)',
  },
  transportRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 16,
    alignItems: 'end',
  },
  transportCluster: {
    display: 'grid',
    gap: 8,
  },
  clusterLabel: {
    fontSize: 11,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#a8a8a8',
  },
  buttonRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  sliderWrap: {
    display: 'grid',
    gap: 8,
  },
  sliderValue: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 12,
    color: '#c6c6c6',
  },
  range: {
    width: '100%',
    accentColor: '#4589ff',
  },
  modeShell: {
    display: 'grid',
    gap: 18,
    minHeight: 520,
  },
  modeGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 2.4fr) minmax(280px, 1fr)',
    gap: 18,
  },
  sequencerLayout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 320px',
    gap: 18,
  },
  modeColumn: {
    display: 'grid',
    gap: 18,
  },
  tile: {
    borderRadius: 16,
    minHeight: 180,
    display: 'grid',
    gap: 14,
    alignContent: 'start',
    background: 'linear-gradient(180deg, rgba(30,30,30,0.92), rgba(18,18,18,0.98))',
  },
  tileHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  tileTitle: {
    margin: 0,
    fontSize: 18,
    color: '#f4f4f4',
  },
  tileText: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.6,
    color: '#c6c6c6',
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: 12,
  },
  statCard: {
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.02)',
    padding: 12,
    display: 'grid',
    gap: 6,
  },
  statLabel: {
    fontSize: 11,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#8d8d8d',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 600,
    color: '#f4f4f4',
  },
  footer: {
    borderRadius: 16,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(18,18,18,0.92)',
    padding: '12px 16px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  dotRow: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.16)',
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
  },
  sequencerGrid: {
    overflowX: 'auto',
    paddingBottom: 4,
  },
  sequencerHeader: {
    display: 'grid',
    gridTemplateColumns: '220px repeat(16, 40px) 120px',
    gap: 8,
    alignItems: 'center',
    minWidth: 1080,
    marginBottom: 12,
  },
  sequencerRow: {
    display: 'grid',
    gridTemplateColumns: '220px repeat(16, 40px) 120px',
    gap: 8,
    alignItems: 'center',
    minWidth: 1080,
    marginBottom: 10,
  },
  rowLabel: {
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)',
    padding: '10px 12px',
    display: 'grid',
    gap: 6,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#f4f4f4',
  },
  rowHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  colorSwatch: {
    width: 16,
    height: 16,
    borderRadius: '50%',
    boxShadow: '0 0 0 1px rgba(255,255,255,0.24)',
  },
  rowNameInput: {
    width: '100%',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(0,0,0,0.16)',
    color: '#f4f4f4',
    padding: '7px 9px',
    fontSize: 13,
  },
  rowMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  rowControlStrip: {
    display: 'grid',
    gap: 8,
  },
  toggleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  miniToggle: {
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.06)',
    color: '#f4f4f4',
    padding: '5px 10px',
    fontSize: 11,
    cursor: 'pointer',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  compactRangeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 8,
  },
  compactRangeCard: {
    display: 'grid',
    gap: 4,
  },
  compactRangeLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 11,
    color: '#c6c6c6',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  compactRange: {
    width: '100%',
    accentColor: '#24a148',
  },
  stepButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    border: '1px solid #6f6f6f',
    background: '#262626',
    color: '#f4f4f4',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    transition: 'transform 120ms ease, border-color 120ms ease, background 120ms ease',
  },
  rowSlider: {
    width: '100%',
    accentColor: '#24a148',
  },
  inspectorTile: {
    borderTop: '3px solid #24a148',
    minHeight: 420,
  },
  inspectorGrid: {
    display: 'grid',
    gap: 14,
  },
  inspectorSection: {
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.02)',
    padding: 12,
    display: 'grid',
    gap: 10,
  },
  inspectorValue: {
    fontSize: 14,
    color: '#f4f4f4',
  },
  inspectorSelect: {
    width: '100%',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(0,0,0,0.18)',
    color: '#f4f4f4',
    padding: '9px 10px',
    fontSize: 13,
  },
  panelGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)',
    gap: 18,
  },
  patternBankGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
    gap: 8,
  },
  patternTileButton: {
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.03)',
    color: '#f4f4f4',
    padding: '10px 8px',
    cursor: 'pointer',
    display: 'grid',
    gap: 4,
    textAlign: 'left',
  },
  patternTileMeta: {
    fontSize: 11,
    color: '#a8a8a8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  actionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 10,
  },
  fieldGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
    alignItems: 'end',
  },
  fieldStack: {
    display: 'grid',
    gap: 6,
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: '#f4f4f4',
    fontSize: 13,
  },
  input: {
    width: '100%',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(0,0,0,0.18)',
    color: '#f4f4f4',
    padding: '9px 10px',
    fontSize: 13,
  },
  songList: {
    display: 'grid',
    gap: 10,
  },
  songEntry: {
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.03)',
    padding: 12,
    display: 'grid',
    gap: 10,
  },
  songEntryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  songEntryActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  kitGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 10,
  },
  practiceStyleGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 10,
  },
  styleTileButton: {
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.03)',
    color: '#f4f4f4',
    padding: 12,
    cursor: 'pointer',
    display: 'grid',
    gap: 8,
    textAlign: 'left',
  },
  styleHero: {
    width: 32,
    height: 32,
    borderRadius: 10,
    display: 'grid',
    placeItems: 'center',
    fontSize: 14,
    fontWeight: 700,
    background: 'rgba(69,137,255,0.16)',
    color: '#a6c8ff',
  },
  kitTileButton: {
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.03)',
    color: '#f4f4f4',
    padding: 12,
    cursor: 'pointer',
    display: 'grid',
    gap: 8,
    textAlign: 'left',
  },
  busStripGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
    gap: 12,
  },
  busStrip: {
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.03)',
    padding: 12,
    display: 'grid',
    gap: 10,
  },
  meterWrap: {
    height: 110,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(0,0,0,0.25)',
    display: 'flex',
    alignItems: 'flex-end',
    overflow: 'hidden',
  },
  meterFill: {
    width: '100%',
    background: 'linear-gradient(180deg, #42be65, #24a148)',
    transition: 'height 120ms linear',
    minHeight: 2,
  },
  trackTable: {
    width: '100%',
    borderCollapse: 'collapse',
    color: '#f4f4f4',
  },
  trackCell: {
    padding: '10px 8px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    fontSize: 13,
  },
  waveform: {
    position: 'relative',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.08)',
    background:
      'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
    padding: 12,
    minHeight: 140,
    overflow: 'hidden',
  },
  waveformBars: {
    display: 'grid',
    gridTemplateColumns: 'repeat(48, 1fr)',
    gap: 4,
    alignItems: 'end',
    minHeight: 90,
  },
  waveformBar: {
    borderRadius: 999,
    background: 'linear-gradient(180deg, rgba(255,131,43,0.92), rgba(69,137,255,0.6))',
  },
  midiTable: {
    width: '100%',
    borderCollapse: 'collapse',
    color: '#f4f4f4',
  },
  midiTableWrap: {
    overflowX: 'auto',
  },
  miniInput: {
    width: '100%',
    minWidth: 72,
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(0,0,0,0.18)',
    color: '#f4f4f4',
    padding: '7px 8px',
    fontSize: 12,
  },
}

function transportTag(active: boolean) {
  return active ? <Tag type="green">Playing</Tag> : <Tag type="gray">Stopped</Tag>
}

function modeIndex(mode: DrumMode | undefined) {
  return Math.max(0, MODE_ORDER.indexOf(mode ?? 'practice'))
}

function clampPatternLength(pattern: DrumPattern | undefined) {
  const length = pattern?.length ?? 16
  return Math.max(1, Math.min(64, length))
}

function buildPatternPayload(patternId: number, pattern: DrumPattern | undefined, length: number): DrumPattern {
  const boundedLength = Math.max(1, Math.min(64, length))
  return {
    pattern_id: patternId,
    variation: pattern?.variation ?? 0,
    length: boundedLength,
    track_lengths: Array.from({ length: 16 }, (_, instrumentIndex) => {
      const trackLength = pattern?.track_lengths?.[instrumentIndex] ?? 0
      return Math.max(0, Math.min(64, trackLength))
    }),
    steps: Array.from({ length: 16 }, (_, instrumentIndex) =>
      Array.from({ length: 64 }, (_, stepIndex) => {
        const step = pattern?.steps?.[instrumentIndex]?.[stepIndex]
        return {
          active: (step?.velocity ?? 0) > 0,
          velocity: step?.velocity ?? 0,
          accent: Boolean(step?.accent),
          micro_timing: step?.micro_timing ?? 0,
          probability: step?.probability ?? 1,
          ratchet_count: step?.ratchet_count ?? 1,
          ratchet_decay: step?.ratchet_decay ?? 0,
          lock_pitch: step?.lock_pitch ?? null,
          lock_filter_cutoff: step?.lock_filter_cutoff ?? null,
          lock_decay: step?.lock_decay ?? null,
          lock_pan: step?.lock_pan ?? null,
          lock_volume: step?.lock_volume ?? null,
        }
      }),
    ),
  }
}

function meterPercent(level: number | undefined) {
  const value = Number.isFinite(level) ? Number(level) : 0
  return Math.max(0, Math.min(100, Math.round(value * 100)))
}

function waveformWindow(
  waveform: DrumPadSampleWaveform | undefined,
  zoomPercent: number,
  scrollPercent: number,
) {
  if (!waveform || waveform.peaks.length === 0) {
    return { peaks: [], startSample: 0, endSample: 0 }
  }

  const totalPoints = waveform.peaks.length
  const visiblePoints = Math.max(16, Math.min(totalPoints, Math.round(totalPoints * (zoomPercent / 100))))
  const maxOffset = Math.max(0, totalPoints - visiblePoints)
  const startPoint = Math.round((scrollPercent / 100) * maxOffset)
  const endPoint = Math.min(totalPoints, startPoint + visiblePoints)
  const samplesPerPoint = waveform.sample_count / totalPoints

  return {
    peaks: waveform.peaks.slice(startPoint, endPoint),
    startSample: Math.round(startPoint * samplesPerPoint),
    endSample: Math.round(endPoint * samplesPerPoint),
  }
}

function resolvedStep(pattern: DrumPattern | undefined, instrumentIndex: number, stepIndex: number) {
  const step = pattern?.steps?.[instrumentIndex]?.[stepIndex]
  return {
    velocity: step?.velocity ?? 0,
    accent: Boolean(step?.accent),
    active: (step?.velocity ?? 0) > 0,
    micro_timing: step?.micro_timing ?? 0,
    probability: step?.probability ?? 1,
    ratchet_count: step?.ratchet_count ?? 1,
    ratchet_decay: step?.ratchet_decay ?? 0,
    lock_pitch: step?.lock_pitch ?? null,
    lock_filter_cutoff: step?.lock_filter_cutoff ?? null,
    lock_decay: step?.lock_decay ?? null,
    lock_pan: step?.lock_pan ?? null,
    lock_volume: step?.lock_volume ?? null,
  }
}

function resolvedTrackLength(pattern: DrumPattern | undefined, instrumentIndex: number) {
  const trackLength = pattern?.track_lengths?.[instrumentIndex] ?? 0
  return Math.max(0, Math.min(64, trackLength))
}

function stepHasLocks(step: ReturnType<typeof resolvedStep>) {
  return [
    step.lock_pitch,
    step.lock_filter_cutoff,
    step.lock_decay,
    step.lock_pan,
    step.lock_volume,
  ].some((value) => value !== null && value !== undefined)
}

function stepHasProbabilityOverride(step: ReturnType<typeof resolvedStep>) {
  return Math.abs((step.probability ?? 1) - 1) > 0.0001
}

function stepHasDetailEdits(step: ReturnType<typeof resolvedStep>) {
  return step.micro_timing !== 0 || stepHasProbabilityOverride(step) || stepHasLocks(step)
    || (step.ratchet_count ?? 1) > 1
    || (step.ratchet_decay ?? 0) > 0
}

function resolvedPadControl(
  padControls: DrumPadControl[] | undefined,
  instrumentIndex: number,
  instrument: DrumInstrument | undefined,
) {
  const pad = padControls?.find((entry) => entry.pad_id === instrumentIndex)
  return {
    volume: pad?.volume ?? instrument?.volume ?? 80,
    pan: pad?.pan ?? instrument?.pan ?? 0,
    tune: pad?.tune ?? instrument?.tune ?? 0,
    mute: pad?.mute ?? instrument?.mute ?? false,
    solo: pad?.solo ?? instrument?.solo ?? false,
    bus: pad?.bus_assignment ?? instrument?.bus_assignment ?? (instrumentIndex % 8),
  }
}

function resolvedMidiPad(mapping: DrumMidiMapping | undefined, pad: number) {
  return mapping?.pads?.find((entry) => entry.pad === pad) ?? { pad, notes: [36 + pad], midi_channel: 10 }
}

function resolvedVelocityCurve(curves: { pads: DrumVelocityCurve[] } | undefined, pad: number) {
  return curves?.pads?.find((entry) => entry.pad === pad) ?? {
    pad,
    curve_type: 0 as DrumVelocityCurve['curve_type'],
    fixed_velocity: 1,
    input_floor: 0,
    output_floor: 0,
    output_ceiling: 1,
    preview: [],
    last_velocity: 0,
  }
}

function resolvedZones(zones: DrumMidiZones | undefined, pad: number) {
  return zones?.pads?.find((entry) => entry.pad === pad) ?? { pad, zones: [] }
}

function resolvedCcMapping(mapping: DrumCcMapping | undefined, slot: number) {
  return mapping?.mappings?.find((entry) => entry.slot === slot) ?? {
    slot,
    cc_number: 0,
    midi_channel: 0,
    target: 'pad_volume' as DrumCcTarget,
    target_index: 0,
    active: false,
  }
}

function padAccent(index: number) {
  const accents = ['#4589ff', '#24a148', '#ff832b', '#be95ff', '#08bdba', '#fa4d56', '#d2a106', '#a56eff']
  return accents[index % accents.length]
}

function practicePanel(
  state: DrumMachineState,
  packs: { factory: { pack_id: string; name: string; description: string }[]; user: { pack_id: string; name: string; description: string }[] },
  accent: string,
  onUpdateState: (patch: Partial<DrumMachineState>) => void,
) {
  return (
    <div style={shellStyle.modeShell}>
      <div style={shellStyle.modeGrid}>
        <div style={shellStyle.modeColumn}>
          <Tile style={{ ...shellStyle.tile, borderTop: `3px solid ${accent}` }}>
            <div style={shellStyle.tileHeader}>
              <h2 style={shellStyle.tileTitle}>Practice Workspace</h2>
              <Tag type="blue">Live</Tag>
            </div>
            <p style={shellStyle.tileText}>
              Style, count-in, quantize, variation, and arrangement sources now live in one rehearsal
              surface so practice sessions can be configured without dropping back to Advanced mode.
            </p>
            <div style={shellStyle.practiceStyleGrid}>
              {PRACTICE_STYLES.map((style) => {
                const isActive = state.practice_style_id === style.id
                return (
                  <button
                    key={style.id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => onUpdateState({ practice_style_id: style.id })}
                    style={{
                      ...shellStyle.styleTileButton,
                      borderColor: isActive ? accent : 'rgba(255,255,255,0.12)',
                      boxShadow: isActive ? `0 0 0 1px ${accent}` : 'none',
                    }}
                  >
                    <span style={shellStyle.styleHero} aria-hidden>{style.icon}</span>
                    <strong>{style.label}</strong>
                    <div style={shellStyle.rowMeta}>
                      <Tag type={isActive ? 'green' : 'cool-gray'}>{isActive ? 'Active' : style.feel}</Tag>
                      <Tag type="blue">{style.signature}</Tag>
                    </div>
                  </button>
                )
              })}
            </div>
          </Tile>
          <Tile style={shellStyle.tile}>
            <div style={shellStyle.tileHeader}>
              <h3 style={shellStyle.tileTitle}>Rehearsal Controls</h3>
              <Tag type="cool-gray">Session</Tag>
            </div>
            <div style={shellStyle.fieldGrid}>
              <label style={shellStyle.fieldStack}>
                <span style={shellStyle.clusterLabel}>Count-In Bars</span>
                <input
                  aria-label="Practice count-in bars"
                  type="number"
                  min={0}
                  max={4}
                  value={state.practice_count_in_bars}
                  onChange={(event) => onUpdateState({ practice_count_in_bars: Number(event.currentTarget.value) })}
                  style={shellStyle.input}
                />
              </label>
              <label style={shellStyle.fieldStack}>
                <span style={shellStyle.clusterLabel}>Quantize Bars</span>
                <input
                  aria-label="Practice quantize bars"
                  type="number"
                  min={1}
                  max={8}
                  value={state.practice_change_quantization}
                  onChange={(event) => onUpdateState({ practice_change_quantization: Number(event.currentTarget.value) })}
                  style={shellStyle.input}
                />
              </label>
            </div>
            <label style={shellStyle.fieldStack}>
              <span style={shellStyle.clusterLabel}>Variation</span>
              <div style={shellStyle.sliderValue}>
                <span>Intensity</span>
                <strong>{state.practice_variation}</strong>
              </div>
              <input
                aria-label="Practice variation"
                type="range"
                min={0}
                max={10}
                step={1}
                value={state.practice_variation}
                onChange={(event) => onUpdateState({ practice_variation: Number(event.currentTarget.value) })}
                style={shellStyle.range}
              />
            </label>
            <div style={shellStyle.toggleRow}>
              <Button
                kind={state.practice_auto_fill ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => onUpdateState({ practice_auto_fill: !state.practice_auto_fill })}
              >
                Auto Fill {state.practice_auto_fill ? 'On' : 'Off'}
              </Button>
            </div>
            <div style={shellStyle.statGrid}>
              <div style={shellStyle.statCard}>
                <span style={shellStyle.statLabel}>Variation</span>
                <span style={shellStyle.statValue}>{state.practice_variation}</span>
              </div>
              <div style={shellStyle.statCard}>
                <span style={shellStyle.statLabel}>Count-In</span>
                <span style={shellStyle.statValue}>{state.practice_count_in_bars} bars</span>
              </div>
              <div style={shellStyle.statCard}>
                <span style={shellStyle.statLabel}>Quantize</span>
                <span style={shellStyle.statValue}>{state.practice_change_quantization}</span>
              </div>
              <div style={shellStyle.statCard}>
                <span style={shellStyle.statLabel}>Auto Fill</span>
                <span style={shellStyle.statValue}>{state.practice_auto_fill ? 'On' : 'Off'}</span>
              </div>
            </div>
          </Tile>
        </div>
        <div style={shellStyle.modeColumn}>
          <Tile style={shellStyle.tile}>
            <div style={shellStyle.tileHeader}>
              <h3 style={shellStyle.tileTitle}>Practice Pack Browser</h3>
              <Tag type="teal">Catalog</Tag>
            </div>
            <Accordion align="start">
              <AccordionItem title={`Factory Packs (${packs.factory.length})`}>
                <div style={shellStyle.songList}>
                  {packs.factory.length === 0 ? (
                    <p style={shellStyle.tileText}>No factory packs detected.</p>
                  ) : packs.factory.map((pack) => (
                    <div key={pack.pack_id} style={shellStyle.songEntry}>
                      <strong>{pack.name}</strong>
                      <p style={shellStyle.tileText}>{pack.description || 'Factory rehearsal arrangement pack.'}</p>
                      <Button size="sm" kind="ghost" onClick={() => onUpdateState({ active_pack: pack.pack_id })}>
                        Load Arrangement
                      </Button>
                    </div>
                  ))}
                </div>
              </AccordionItem>
              <AccordionItem title={`User Packs (${packs.user.length})`}>
                <div style={shellStyle.songList}>
                  {packs.user.length === 0 ? (
                    <p style={shellStyle.tileText}>No user packs imported yet.</p>
                  ) : packs.user.map((pack) => (
                    <div key={pack.pack_id} style={shellStyle.songEntry}>
                      <strong>{pack.name}</strong>
                      <p style={shellStyle.tileText}>{pack.description || 'User rehearsal arrangement pack.'}</p>
                      <Button size="sm" kind="ghost" onClick={() => onUpdateState({ active_pack: pack.pack_id })}>
                        Load Arrangement
                      </Button>
                    </div>
                  ))}
                </div>
              </AccordionItem>
            </Accordion>
          </Tile>
        </div>
      </div>
    </div>
  )
}

function advancedPanel(
  patternId: number,
  variation: number,
  isPlaying: boolean,
  isSongPlaying: boolean,
  currentSongEntryIndex: number,
  accent: string,
  pattern: DrumPattern | undefined,
  activeKit: DrumKit | null | undefined,
  padSoundSources: DrumPadSoundSource[],
  padSynthParams: DrumSynthParams[],
  padFilters: DrumPadFilter[],
  padCvGateConfigs: DrumCvGateConfig[],
  selectedPadSample: DrumPadSampleWaveform | undefined,
  sampleRecordingActive: boolean,
  sampleZoom: number,
  sampleScroll: number,
  sampleTrimStart: number,
  sampleTrimEnd: number,
  padControls: DrumPadControl[] | undefined,
  currentStep: number,
  selectedPad: number,
  draftNames: string[],
  onSelectPad: (padId: number) => void,
  onRenameDraft: (padId: number, value: string) => void,
  onCommitName: (padId: number) => void,
  onUpdatePadControl: (padId: number, params: Partial<DrumPadControl>) => void,
  onUpdatePadSoundSource: (padId: number, source: DrumPadSoundSource) => void,
  onUpdatePadSynthParams: (padId: number, params: DrumSynthParams) => void,
  onUpdatePadFilter: (padId: number, filter: DrumPadFilter) => void,
  onUpdatePadCvGateConfig: (padId: number, config: DrumCvGateConfig) => void,
  onUploadSample: (padId: number, file: File) => void,
  onStartSampleRecording: (padId: number) => void,
  onStopSampleRecording: (padId: number) => void,
  onChangeSampleZoom: (value: number) => void,
  onChangeSampleScroll: (value: number) => void,
  onChangeSampleTrimStart: (value: number) => void,
  onChangeSampleTrimEnd: (value: number) => void,
  onTrimSample: (padId: number, startSample: number, endSample: number) => void,
  onNormalizeSample: (padId: number) => void,
  onReverseSample: (padId: number) => void,
  onFadeSample: (padId: number, fadeInMs: number, fadeOutMs: number) => void,
  trackSwing: number[],
  onUpdateTrackSwing: (instrumentIndex: number, swing: number) => void,
  onUpdateTrackLength: (instrumentIndex: number, length: number) => void,
  onToggleStep: (instrumentIndex: number, stepIndex: number, nextVelocity: number, accent: boolean) => void,
  selectedStep: { instrumentIndex: number; stepIndex: number } | null,
  onSelectStep: (instrumentIndex: number, stepIndex: number) => void,
  onUpdateStepLocks: (
    instrumentIndex: number,
    stepIndex: number,
    locks: Partial<Pick<DrumPattern['steps'][number][number], 'micro_timing' | 'probability' | 'ratchet_count' | 'ratchet_decay' | 'lock_pitch' | 'lock_filter_cutoff' | 'lock_decay' | 'lock_pan' | 'lock_volume'>>,
  ) => void,
  selectedPatternSlot: number,
  selectedPatternPage: number,
  patternClipboard: number | null,
  clearModalOpen: boolean,
  songEntries: { pattern_id: number; repeat_count: number }[],
  songLoop: boolean,
  songDraftPattern: number,
  songDraftRepeats: number,
  onSelectPatternSlot: (patternId: number) => void,
  onChangePatternPage: (page: number) => void,
  onCopyPattern: () => void,
  onPastePattern: () => void,
  onDuplicatePattern: () => void,
  onRequestClearPattern: () => void,
  onConfirmClearPattern: () => void,
  onCloseClearPattern: () => void,
  onSetPatternLength: (length: number) => void,
  onSetVariation: (variation: number) => void,
  onTriggerFill: () => void,
  onSongDraftPatternChange: (patternId: number) => void,
  onSongDraftRepeatsChange: (repeatCount: number) => void,
  onAddSongEntry: () => void,
  onRemoveSongEntry: (index: number) => void,
  onMoveSongEntry: (index: number, direction: -1 | 1) => void,
  onToggleSongLoop: () => void,
  onPlaySong: () => void,
  onStopSong: () => void,
  kits: DrumKit[],
  busMixers: DrumBusMixer[],
  masterVolume: number,
  masterFx: DrumMasterFxState | undefined,
  metering: {
    per_pad_peak: number[]
    per_bus_peak: number[]
    master_peak_left: number
    master_peak_right: number
  } | undefined,
  pendingKitId: string | null,
  kitModalOpen: boolean,
  onSelectKit: (kitId: string) => void,
  onCloseKitModal: () => void,
  onConfirmLoadKit: () => void,
  onUpdateBusMixer: (busId: number, params: Partial<DrumBusMixer>) => void,
  onUpdateMasterVolume: (volume: number) => void,
  onUpdateMasterFx: (patch: Partial<DrumMasterFxState>) => void,
  midiMapping: DrumMidiMapping | undefined,
  ccMapping: DrumCcMapping | undefined,
  ccLearnState: { active: boolean; slot: number; last_cc: number; last_channel: number } | undefined,
  velocityCurves: { pads: DrumVelocityCurve[] } | undefined,
  midiZones: DrumMidiZones | undefined,
  midiLearnState: { active: boolean; active_pad_index: number; learn_all: boolean; last_received_note: number; last_received_channel: number } | undefined,
  midiPresets: string[],
  selectedMidiPreset: string,
  onSelectMidiPreset: (presetName: string) => void,
  onUpdateMidiPad: (padId: number, patch: { notes?: number[]; midi_channel?: number }) => void,
  onUpdateCcMapping: (slot: number, patch: Partial<DrumCcMapping['mappings'][number]>) => void,
  onUpdateVelocityCurve: (padId: number, patch: Partial<DrumVelocityCurve>) => void,
  onUpdateMidiZones: (padId: number, zones: DrumMidiZones['pads'][number]['zones']) => void,
  onStartCcLearn: (slot: number) => void,
  onStopCcLearn: () => void,
  onStartMidiLearn: (padId?: number) => void,
  onStopMidiLearn: () => void,
  onLoadMidiPreset: () => void,
  onNavigateStep: (rowDelta: number, colDelta: number, instrumentIndex: number, stepIndex: number) => void,
  sequencerRef: RefObject<HTMLDivElement | null>,
) {
  const visibleSteps = Math.min(16, clampPatternLength(pattern))
  const selectedInstrument = activeKit?.instruments?.[selectedPad]
  const selectedPadControl = resolvedPadControl(padControls, selectedPad, selectedInstrument)
  const instruments = Array.from({ length: 16 }, (_, instrumentIndex) => {
    const kitInstrument = activeKit?.instruments?.[instrumentIndex]
    const pad = resolvedPadControl(padControls, instrumentIndex, kitInstrument)
    return {
      name: kitInstrument?.name ?? `Pad ${instrumentIndex + 1}`,
      note: kitInstrument?.default_note ?? (36 + instrumentIndex),
      sfzPath: kitInstrument?.sfz_path ?? 'Factory assignment',
      color: padAccent(instrumentIndex),
      ...pad,
    }
  })
  const pageStart = selectedPatternPage * 32
  const pagePatterns = Array.from({ length: 32 }, (_, offset) => pageStart + offset)
  const selectedKitSummary = kits.find((kit) => kit.kit_id === pendingKitId) ?? null
  const selectedMidiPad = resolvedMidiPad(midiMapping, selectedPad)
  const selectedVelocityCurve = resolvedVelocityCurve(velocityCurves, selectedPad)
  const selectedZoneConfig = resolvedZones(midiZones, selectedPad)
  const selectedPadSoundSource = padSoundSources[selectedPad] ?? 'sample'
  const selectedPadSynth = padSynthParams[selectedPad] ?? {
    oscillator_type: 'sine',
    pitch_envelope_start_hz: 160,
    pitch_envelope_end_hz: 50,
    pitch_envelope_decay_ms: 180,
    noise_level: 0.2,
    noise_decay_ms: 120,
    body_decay_ms: 420,
    tone_amount: 0.55,
  }
  const selectedPadFilter = padFilters[selectedPad] ?? {
    type: 'lowpass',
    cutoff_hz: 12000,
    resonance: 0.35,
    env_amount: 0,
    env_decay_ms: 180,
  }
  const selectedPadCvGate = padCvGateConfigs[selectedPad] ?? {
    enabled: false,
    output_pair: 0,
    gate_length_ms: 25,
    note_min: 36,
    note_max: 84,
    pitch_min_volts: 0,
    pitch_max_volts: 5,
  }
  const selectedSampleWindow = waveformWindow(selectedPadSample, sampleZoom, sampleScroll)
  const resolvedMasterFx = masterFx ?? {
    drive_db: 0,
    compressor_threshold: -18,
    compressor_ratio: 2,
    compressor_attack: 10,
    compressor_release: 80,
    compressor_makeup: 0,
    reverb_mix: 0.18,
    reverb_size: 0.45,
    reverb_damping: 0.35,
    reverb_width: 1,
    limiter_threshold: -0.5,
    limiter_release: 60,
  }
  const selectedStepState = selectedStep
    ? resolvedStep(pattern, selectedStep.instrumentIndex, selectedStep.stepIndex)
    : null

  return (
    <div style={shellStyle.modeShell}>
      <div style={shellStyle.sequencerLayout}>
        <div style={shellStyle.modeColumn}>
          <Tile style={{ ...shellStyle.tile, borderTop: `3px solid ${accent}`, minHeight: 420 }}>
            <div style={shellStyle.tileHeader}>
              <h2 style={shellStyle.tileTitle}>Sequencer Workspace</h2>
              <Tag type="green">Primary View</Tag>
            </div>
            <p style={shellStyle.tileText}>
              The advanced workspace now carries editable row controls directly beside the TR-style
              sequencer so pad-level mixer and kit metadata can be adjusted without leaving the grid.
            </p>
            <div style={shellStyle.statGrid}>
              <div style={shellStyle.statCard}>
                <span style={shellStyle.statLabel}>Pattern</span>
                <span style={shellStyle.statValue}>{patternId}</span>
              </div>
              <div style={shellStyle.statCard}>
                <span style={shellStyle.statLabel}>Variation</span>
                <span style={shellStyle.statValue}>{variation}</span>
              </div>
              <div style={shellStyle.statCard}>
                <span style={shellStyle.statLabel}>Rows</span>
                <span style={shellStyle.statValue}>16</span>
              </div>
              <div style={shellStyle.statCard}>
                <span style={shellStyle.statLabel}>Step Grid</span>
                <span style={shellStyle.statValue}>{visibleSteps} visible</span>
              </div>
            </div>

            <div ref={sequencerRef} style={shellStyle.sequencerGrid} role="grid" aria-label="TR-style drum step sequencer">
              <div style={shellStyle.sequencerHeader}>
                <span style={shellStyle.clusterLabel}>Instrument</span>
                {Array.from({ length: visibleSteps }, (_, stepIndex) => (
                  <Tag
                    key={`header-${stepIndex}`}
                    type={stepIndex === currentStep ? 'blue' : 'cool-gray'}
                    title={`Step ${stepIndex + 1}`}
                  >
                    {stepIndex + 1}
                  </Tag>
                ))}
                <span style={shellStyle.clusterLabel}>Level / Loop</span>
              </div>

              {instruments.map((instrument, instrumentIndex) => {
                const trackLength = resolvedTrackLength(pattern, instrumentIndex)
                const effectiveTrackLength = trackLength || clampPatternLength(pattern)
                const rowActive =
                  (currentStep < visibleSteps && resolvedStep(pattern, instrumentIndex, currentStep).active) ||
                  (metering?.per_pad_peak?.[instrumentIndex] ?? 0) > 0.05

                return (
                  <div
                    key={`${instrument.name}-${instrumentIndex}`}
                    style={{
                      ...shellStyle.sequencerRow,
                      padding: selectedPad === instrumentIndex ? '6px 6px 10px' : undefined,
                      borderRadius: selectedPad === instrumentIndex ? 14 : undefined,
                      background: selectedPad === instrumentIndex ? 'rgba(255,255,255,0.03)' : undefined,
                    }}
                    role="row"
                  >
                  <div
                    style={{
                      ...shellStyle.rowLabel,
                      borderColor: rowActive
                        ? instrument.color
                        : selectedPad === instrumentIndex
                          ? accent
                          : 'rgba(255,255,255,0.08)',
                      boxShadow: rowActive
                        ? `0 0 0 1px ${instrument.color}, 0 0 16px rgba(0,0,0,0.18)`
                        : selectedPad === instrumentIndex
                          ? `0 0 0 1px ${accent}`
                          : 'none',
                    }}
                    onClick={() => onSelectPad(instrumentIndex)}
                  >
                    <div style={shellStyle.rowHeader}>
                      <span style={{ ...shellStyle.colorSwatch, background: instrument.color }} aria-hidden />
                      <input
                        aria-label={`${instrument.name} name`}
                        value={draftNames[instrumentIndex] ?? instrument.name}
                        onChange={(event) => onRenameDraft(instrumentIndex, event.currentTarget.value)}
                        onBlur={() => onCommitName(instrumentIndex)}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            onCommitName(instrumentIndex)
                          }
                        }}
                        style={shellStyle.rowNameInput}
                      />
                    </div>
                    <div style={shellStyle.rowMeta}>
                      <Tag type="green">Bus {instrument.bus}</Tag>
                      <Tag type="blue">Note {instrument.note}</Tag>
                      <Tag type="cool-gray">Row {instrumentIndex + 1}</Tag>
                      {rowActive ? <Tag type="cyan">Input</Tag> : null}
                    </div>
                    <div style={shellStyle.rowControlStrip}>
                      <div style={shellStyle.toggleRow}>
                        <button
                          type="button"
                          aria-label={`${instrument.name} mute`}
                          aria-pressed={instrument.mute}
                          onClick={(event) => {
                            event.stopPropagation()
                            onUpdatePadControl(instrumentIndex, { mute: !instrument.mute })
                          }}
                          style={{
                            ...shellStyle.miniToggle,
                            background: instrument.mute ? 'rgba(250,77,86,0.18)' : 'rgba(255,255,255,0.06)',
                            borderColor: instrument.mute ? '#fa4d56' : 'rgba(255,255,255,0.14)',
                          }}
                        >
                          Mute
                        </button>
                        <button
                          type="button"
                          aria-label={`${instrument.name} solo`}
                          aria-pressed={instrument.solo}
                          onClick={(event) => {
                            event.stopPropagation()
                            onUpdatePadControl(instrumentIndex, { solo: !instrument.solo })
                          }}
                          style={{
                            ...shellStyle.miniToggle,
                            background: instrument.solo ? 'rgba(69,137,255,0.18)' : 'rgba(255,255,255,0.06)',
                            borderColor: instrument.solo ? '#4589ff' : 'rgba(255,255,255,0.14)',
                          }}
                        >
                          Solo
                        </button>
                      </div>
                      <div style={shellStyle.compactRangeGrid}>
                        {[
                          { label: 'Vol', min: 0, max: 100, value: instrument.volume, key: 'volume' },
                          { label: 'Pan', min: -100, max: 100, value: instrument.pan, key: 'pan' },
                          { label: 'Tune', min: -24, max: 24, value: instrument.tune, key: 'tune' },
                          { label: 'Swing', min: 0, max: 100, value: trackSwing[instrumentIndex] ?? 0, key: 'track_swing' },
                          { label: 'Loop', min: 0, max: 64, value: trackLength, key: 'track_length' },
                        ].map((control) => (
                          <div key={control.key} style={shellStyle.compactRangeCard}>
                            <div style={shellStyle.compactRangeLabel}>
                              <span>{control.label}</span>
                              <strong>{control.key === 'track_length' && control.value === 0 ? 'Global' : control.value}</strong>
                            </div>
                            <input
                              type="range"
                              min={control.min}
                              max={control.max}
                              step={1}
                              value={control.value}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => {
                                const value = Number(event.currentTarget.value)
                                if (control.key === 'track_swing') {
                                  onUpdateTrackSwing(instrumentIndex, value)
                                  return
                                }
                                if (control.key === 'track_length') {
                                  onUpdateTrackLength(instrumentIndex, value)
                                  return
                                }
                                onUpdatePadControl(instrumentIndex, {
                                  [control.key]: value,
                                })
                              }}
                              style={shellStyle.compactRange}
                              aria-label={`${instrument.name} ${control.label}`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {Array.from({ length: visibleSteps }, (_, stepIndex) => {
                    const step = resolvedStep(pattern, instrumentIndex, stepIndex)
                    const hasLocks = stepHasLocks(step)
                    const hasProbabilityOverride = stepHasProbabilityOverride(step)
                    const hasRatchet = (step.ratchet_count ?? 1) > 1
                    const isCurrent = stepIndex === currentStep
                    return (
                      <button
                        key={`${instrumentIndex}-${stepIndex}`}
                        type="button"
                        role="gridcell"
                        data-step-key={`${instrumentIndex}:${stepIndex}`}
                        aria-label={`${instrument.name} step ${stepIndex + 1}`}
                        aria-pressed={step.active}
                        aria-rowindex={instrumentIndex + 1}
                        aria-colindex={stepIndex + 1}
                        onClick={(event) => {
                          onSelectPad(instrumentIndex)
                          onSelectStep(instrumentIndex, stepIndex)
                          if (event.shiftKey) {
                            return
                          }
                          const nextVelocity = step.active ? 0 : 100
                          const nextAccent = step.active ? false : event.shiftKey || step.accent
                          onToggleStep(instrumentIndex, stepIndex, nextVelocity, nextAccent)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowRight') {
                            event.preventDefault()
                            onNavigateStep(0, 1, instrumentIndex, stepIndex)
                            return
                          }
                          if (event.key === 'ArrowLeft') {
                            event.preventDefault()
                            onNavigateStep(0, -1, instrumentIndex, stepIndex)
                            return
                          }
                          if (event.key === 'ArrowDown') {
                            event.preventDefault()
                            onNavigateStep(1, 0, instrumentIndex, stepIndex)
                            return
                          }
                          if (event.key === 'ArrowUp') {
                            event.preventDefault()
                            onNavigateStep(-1, 0, instrumentIndex, stepIndex)
                            return
                          }
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            onSelectPad(instrumentIndex)
                            const nextVelocity = step.active ? 0 : 100
                            const nextAccent = step.active ? false : event.shiftKey || step.accent
                            onToggleStep(instrumentIndex, stepIndex, nextVelocity, nextAccent)
                          }
                        }}
                        style={{
                          ...shellStyle.stepButton,
                          background: step.active
                            ? step.accent
                              ? 'linear-gradient(180deg, #78a9ff, #0f62fe)'
                              : 'linear-gradient(180deg, #42be65, #198038)'
                            : '#262626',
                          opacity: step.active ? Math.max(0.35, step.probability ?? 1) : 1,
                          borderColor: isCurrent
                            ? '#ffffff'
                            : step.accent
                              ? '#d0e2ff'
                              : step.active
                                ? '#a7f0ba'
                                : '#6f6f6f',
                          boxShadow:
                            isCurrent
                              ? `0 0 0 2px ${accent}, 0 0 0 4px rgba(255,255,255,0.18)`
                              : effectiveTrackLength <= visibleSteps && stepIndex === effectiveTrackLength - 1
                                ? `inset 0 -3px 0 ${instrument.color}`
                                : 'none',
                          transform: isCurrent ? 'translateY(-1px)' : 'none',
                          position: 'relative',
                        }}
                        title={`${instrument.name} step ${stepIndex + 1}: ${step.active ? `${step.velocity}${step.accent ? ' accent' : ''}` : 'off'}${step.micro_timing ? ` • micro ${step.micro_timing > 0 ? '+' : ''}${step.micro_timing}` : ''}${hasProbabilityOverride ? ` • ${Math.round((step.probability ?? 1) * 100)}%` : ''}${hasRatchet ? ` • ratchet x${step.ratchet_count}` : ''}${effectiveTrackLength <= visibleSteps && stepIndex === effectiveTrackLength - 1 ? ' • loop point' : ''}`}
                      >
                        {step.active ? (step.accent ? 'A' : step.velocity) : hasLocks ? '•' : ''}
                        {step.active && hasRatchet ? (
                          <span
                            aria-hidden
                            style={{
                              position: 'absolute',
                              right: 4,
                              bottom: 4,
                              padding: '1px 4px',
                              borderRadius: 999,
                              background: 'rgba(0, 0, 0, 0.45)',
                              color: '#f4f4f4',
                              fontSize: 10,
                              lineHeight: 1.2,
                            }}
                          >
                            x{step.ratchet_count}
                          </span>
                        ) : null}
                        {step.active && hasProbabilityOverride ? (
                          <span
                            aria-hidden
                            style={{
                              position: 'absolute',
                              left: 4,
                              bottom: 4,
                              padding: '1px 4px',
                              borderRadius: 999,
                              background: 'rgba(0, 0, 0, 0.45)',
                              color: '#f4f4f4',
                              fontSize: 10,
                              lineHeight: 1.2,
                            }}
                          >
                            {Math.round((step.probability ?? 1) * 100)}%
                          </span>
                        ) : null}
                        {hasLocks ? (
                          <span
                            aria-hidden
                            style={{
                              position: 'absolute',
                              top: 4,
                              right: 5,
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              background: '#ff832b',
                              boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
                            }}
                          />
                        ) : null}
                      </button>
                    )
                  })}

                  <div style={shellStyle.sliderWrap}>
                    <div style={shellStyle.sliderValue}>
                      <span>Loop</span>
                      <strong>{trackLength === 0 ? `Global ${clampPatternLength(pattern)}` : trackLength}</strong>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={64}
                      value={trackLength}
                      onChange={(event) => onUpdateTrackLength(instrumentIndex, Number(event.currentTarget.value))}
                      aria-label={`${instrument.name} loop length`}
                      style={shellStyle.rowSlider}
                    />
                  </div>
                  </div>
                )
              })}
            </div>
          </Tile>
          <div style={shellStyle.panelGrid}>
            <Tile style={{ ...shellStyle.tile, borderTop: `3px solid ${accent}` }}>
              <div style={shellStyle.tileHeader}>
                <h3 style={shellStyle.tileTitle}>Pattern Management</h3>
                <Tag type="blue">Slot {selectedPatternSlot}</Tag>
              </div>
              <p style={shellStyle.tileText}>
                Pattern banking is now live with slot paging, clipboard copy/paste, duplicate, length
                updates, and confirmed clear for the selected slot.
              </p>
              <div style={shellStyle.actionGrid}>
                {[0, 1, 2, 3].map((page) => (
                  <Button
                    key={`pattern-page-${page}`}
                    kind={selectedPatternPage === page ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => onChangePatternPage(page)}
                  >
                    Slots {page * 32}-{page * 32 + 31}
                  </Button>
                ))}
              </div>
              <div style={shellStyle.patternBankGrid}>
                {pagePatterns.map((slotPatternId) => (
                  <button
                    key={`pattern-slot-${slotPatternId}`}
                    type="button"
                    aria-label={`Pattern slot ${slotPatternId}`}
                    onClick={() => onSelectPatternSlot(slotPatternId)}
                    style={{
                      ...shellStyle.patternTileButton,
                      borderColor:
                        slotPatternId === patternId
                          ? accent
                          : slotPatternId === patternClipboard
                            ? '#4589ff'
                            : 'rgba(255,255,255,0.12)',
                      boxShadow: slotPatternId === patternId ? `0 0 0 1px ${accent}` : 'none',
                      background:
                        slotPatternId === patternId ? 'rgba(36,161,72,0.12)' : 'rgba(255,255,255,0.03)',
                    }}
                  >
                    <strong>P{slotPatternId.toString().padStart(3, '0')}</strong>
                    <span style={shellStyle.patternTileMeta}>
                      {slotPatternId === patternId ? 'Active' : slotPatternId === selectedPatternSlot ? 'Selected' : 'Slot'}
                    </span>
                  </button>
                ))}
              </div>
              <div style={shellStyle.actionGrid}>
                <Button kind="secondary" size="sm" onClick={onCopyPattern}>
                  Copy
                </Button>
                <Button kind="secondary" size="sm" onClick={onPastePattern} disabled={patternClipboard === null}>
                  Paste
                </Button>
                <Button kind="secondary" size="sm" onClick={onDuplicatePattern}>
                  Duplicate
                </Button>
                <Button kind="danger--tertiary" size="sm" onClick={onRequestClearPattern}>
                  Clear
                </Button>
              </div>
              <div style={shellStyle.fieldGrid}>
                <label style={shellStyle.fieldStack}>
                  <span style={shellStyle.clusterLabel}>Pattern Length</span>
                  <input
                    aria-label="Pattern length"
                    type="number"
                    min={1}
                    max={64}
                    value={clampPatternLength(pattern)}
                    onChange={(event) => onSetPatternLength(Number(event.currentTarget.value))}
                    style={shellStyle.input}
                  />
                </label>
                <label style={shellStyle.fieldStack}>
                  <span style={shellStyle.clusterLabel}>Variation</span>
                  <select
                    aria-label="Pattern variation"
                    value={variation}
                    onChange={(event) => onSetVariation(Number(event.currentTarget.value))}
                    style={shellStyle.input}
                  >
                    <option value={0}>Main</option>
                    {Array.from({ length: 10 }, (_, index) => (
                      <option key={`variation-${index + 1}`} value={index + 1}>
                        Var {index + 1}
                      </option>
                    ))}
                  </select>
                </label>
                <div style={shellStyle.fieldStack}>
                  <span style={shellStyle.clusterLabel}>Fill</span>
                  <Button kind="ghost" size="sm" onClick={onTriggerFill}>
                    Trigger Fill
                  </Button>
                </div>
              </div>
              <Modal
                open={clearModalOpen}
                modalHeading={`Clear pattern ${selectedPatternSlot}`}
                primaryButtonText="Clear Pattern"
                secondaryButtonText="Cancel"
                danger
                onRequestSubmit={onConfirmClearPattern}
                onRequestClose={onCloseClearPattern}
              >
                Clearing resets the selected slot to a blank 16-step pattern.
              </Modal>
            </Tile>
            <Tile style={{ ...shellStyle.tile, borderTop: '3px solid #4589ff' }}>
              <div style={shellStyle.tileHeader}>
                <h3 style={shellStyle.tileTitle}>Song Arranger</h3>
                <Tag type={songLoop ? 'blue' : 'gray'}>{songLoop ? 'Looping' : 'One Pass'}</Tag>
              </div>
              <p style={shellStyle.tileText}>
                The arranger now supports append/remove plus accessible move controls so pattern
                chains can be assembled without drag-only interactions.
              </p>
              <div style={shellStyle.actionGrid}>
                <Button kind="primary" size="sm" renderIcon={Add} onClick={onAddSongEntry}>
                  Add Entry
                </Button>
                <Button kind={isSongPlaying ? 'secondary' : 'primary'} size="sm" onClick={onPlaySong}>
                  Play Song
                </Button>
                <Button kind="tertiary" size="sm" onClick={onStopSong}>
                  Stop Song
                </Button>
                <Button kind={songLoop ? 'primary' : 'secondary'} size="sm" onClick={onToggleSongLoop}>
                  Loop {songLoop ? 'On' : 'Off'}
                </Button>
              </div>
              <div style={shellStyle.fieldGrid}>
                <label style={shellStyle.fieldStack}>
                  <span style={shellStyle.clusterLabel}>Pattern</span>
                  <input
                    aria-label="Song entry pattern"
                    type="number"
                    min={0}
                    max={127}
                    value={songDraftPattern}
                    onChange={(event) => onSongDraftPatternChange(Number(event.currentTarget.value))}
                    style={shellStyle.input}
                  />
                </label>
                <label style={shellStyle.fieldStack}>
                  <span style={shellStyle.clusterLabel}>Repeats</span>
                  <input
                    aria-label="Song entry repeats"
                    type="number"
                    min={1}
                    max={99}
                    value={songDraftRepeats}
                    onChange={(event) => onSongDraftRepeatsChange(Number(event.currentTarget.value))}
                    style={shellStyle.input}
                  />
                </label>
              </div>
              <div style={shellStyle.songList}>
                {songEntries.length === 0 ? (
                  <InlineNotification
                    kind="info"
                    lowContrast
                    hideCloseButton
                    title="No song entries yet"
                    subtitle="Add patterns above to build a repeatable song arrangement."
                  />
                ) : (
                  songEntries.map((entry, index) => {
                    const isCurrent = isSongPlaying && currentSongEntryIndex === index
                    return (
                      <div
                        key={`song-entry-${index}-${entry.pattern_id}`}
                        style={{
                          ...shellStyle.songEntry,
                          borderColor: isCurrent ? accent : 'rgba(255,255,255,0.1)',
                          boxShadow: isCurrent ? `0 0 0 1px ${accent}` : 'none',
                        }}
                      >
                        <div style={shellStyle.songEntryHeader}>
                          <div>
                            <strong>Pattern {entry.pattern_id}</strong>
                            <p style={{ ...shellStyle.tileText, marginTop: 4 }}>Repeat {entry.repeat_count}x</p>
                          </div>
                          <div style={shellStyle.songEntryActions}>
                            <Tag type={isCurrent ? 'green' : 'cool-gray'}>{isCurrent ? 'Current' : `Step ${index + 1}`}</Tag>
                          </div>
                        </div>
                        <div style={shellStyle.songEntryActions}>
                          <Button
                            kind="ghost"
                            size="sm"
                            disabled={index === 0}
                            onClick={() => onMoveSongEntry(index, -1)}
                          >
                            Move Up
                          </Button>
                          <Button
                            kind="ghost"
                            size="sm"
                            disabled={index === songEntries.length - 1}
                            onClick={() => onMoveSongEntry(index, 1)}
                          >
                            Move Down
                          </Button>
                          <Button
                            kind="danger--ghost"
                            size="sm"
                            renderIcon={TrashCan}
                            onClick={() => onRemoveSongEntry(index)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </Tile>
          </div>
          <div style={shellStyle.panelGrid}>
            <Tile style={{ ...shellStyle.tile, borderTop: '3px solid #08bdba' }}>
              <div style={shellStyle.tileHeader}>
                <h3 style={shellStyle.tileTitle}>Kit Browser</h3>
                <Tag type="teal">{kits.length} kits</Tag>
              </div>
              <p style={shellStyle.tileText}>
                Available drum kits are now browsable inline and load through a confirmation modal so
                the active assignment cannot be replaced accidentally.
              </p>
              <div style={shellStyle.kitGrid}>
                {kits.map((kit) => {
                  const isActiveKit = kit.kit_id === activeKit?.kit_id
                  return (
                    <button
                      key={kit.kit_id}
                      type="button"
                      aria-label={`Load kit ${kit.name}`}
                      onClick={() => onSelectKit(kit.kit_id)}
                      style={{
                        ...shellStyle.kitTileButton,
                        borderColor: isActiveKit ? '#08bdba' : 'rgba(255,255,255,0.12)',
                        boxShadow: isActiveKit ? '0 0 0 1px #08bdba' : 'none',
                      }}
                    >
                      <strong>{kit.name}</strong>
                      <div style={shellStyle.rowMeta}>
                        <Tag type={isActiveKit ? 'green' : 'cool-gray'}>{isActiveKit ? 'Active' : 'Available'}</Tag>
                        <Tag type="blue">{kit.category}</Tag>
                      </div>
                      <span style={shellStyle.tileText}>{kit.instruments?.length ?? 0} instruments</span>
                    </button>
                  )
                })}
              </div>
              <Modal
                open={kitModalOpen}
                modalHeading={selectedKitSummary ? `Load ${selectedKitSummary.name}` : 'Load drum kit'}
                primaryButtonText="Load Kit"
                secondaryButtonText="Cancel"
                onRequestSubmit={onConfirmLoadKit}
                onRequestClose={onCloseKitModal}
              >
                Loading a kit replaces the current active drum assignment and row metadata.
              </Modal>
            </Tile>
            <Tile style={{ ...shellStyle.tile, borderTop: '3px solid #d2a106' }}>
              <div style={shellStyle.tileHeader}>
                <h3 style={shellStyle.tileTitle}>Mixer + Metering</h3>
                <Tag type="warm-gray">8 buses</Tag>
              </div>
              <p style={shellStyle.tileText}>
                Bus strips now expose EQ, compressor, mute/solo, level, and live peak metering,
                with master output control, direct physical-output routing, and stereo peak readout alongside them.
              </p>
              <div style={shellStyle.fieldGrid}>
                <label style={shellStyle.fieldStack}>
                  <span style={shellStyle.clusterLabel}>Master Output</span>
                  <input
                    aria-label="Mixer master volume"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={masterVolume}
                    onChange={(event) => onUpdateMasterVolume(Number(event.currentTarget.value))}
                    style={shellStyle.compactRange}
                  />
                </label>
                <div style={shellStyle.statGrid}>
                  <div style={shellStyle.statCard}>
                    <span style={shellStyle.statLabel}>Master L</span>
                    <span style={shellStyle.statValue}>{meterPercent(metering?.master_peak_left)}%</span>
                  </div>
                  <div style={shellStyle.statCard}>
                    <span style={shellStyle.statLabel}>Master R</span>
                    <span style={shellStyle.statValue}>{meterPercent(metering?.master_peak_right)}%</span>
                  </div>
                </div>
              </div>
              <div style={shellStyle.fieldGrid}>
                {[
                  {
                    label: 'Drive',
                    aria: 'Master FX drive',
                    min: 0,
                    max: 24,
                    step: 1,
                    value: resolvedMasterFx.drive_db,
                    patch: (value: number) => ({ drive_db: value }),
                  },
                  {
                    label: 'Reverb Mix',
                    aria: 'Master FX reverb mix',
                    min: 0,
                    max: 100,
                    step: 1,
                    value: Math.round(resolvedMasterFx.reverb_mix * 100),
                    patch: (value: number) => ({ reverb_mix: value / 100 }),
                  },
                  {
                    label: 'Comp Ratio',
                    aria: 'Master FX compressor ratio',
                    min: 1,
                    max: 20,
                    step: 1,
                    value: resolvedMasterFx.compressor_ratio,
                    patch: (value: number) => ({ compressor_ratio: value }),
                  },
                  {
                    label: 'Limiter Threshold',
                    aria: 'Master FX limiter threshold',
                    min: -12,
                    max: 0,
                    step: 0.5,
                    value: resolvedMasterFx.limiter_threshold,
                    patch: (value: number) => ({ limiter_threshold: value }),
                  },
                ].map((control) => (
                  <label key={control.aria} style={shellStyle.fieldStack}>
                    <div style={shellStyle.sliderValue}>
                      <span>{control.label}</span>
                      <strong>{control.value}</strong>
                    </div>
                    <input
                      aria-label={control.aria}
                      type="range"
                      min={control.min}
                      max={control.max}
                      step={control.step}
                      value={control.value}
                      onChange={(event) => onUpdateMasterFx(control.patch(Number(event.currentTarget.value)))}
                      style={shellStyle.compactRange}
                    />
                  </label>
                ))}
              </div>
              <div style={shellStyle.busStripGrid}>
                {busMixers.map((bus) => (
                  <div key={bus.bus_id} style={shellStyle.busStrip}>
                    <div style={shellStyle.tileHeader}>
                      <strong>{bus.name || `Bus ${bus.bus_id}`}</strong>
                      <Tag type={bus.mute ? 'red' : bus.solo ? 'cyan' : 'cool-gray'}>
                        {bus.mute ? 'Muted' : bus.solo ? 'Solo' : 'Live'}
                      </Tag>
                    </div>
                    <div style={shellStyle.meterWrap} aria-label={`${bus.name} peak meter`}>
                      <div
                        style={{
                          ...shellStyle.meterFill,
                          height: `${meterPercent(metering?.per_bus_peak?.[bus.bus_id])}%`,
                        }}
                      />
                    </div>
                    <div style={shellStyle.toggleRow}>
                      <button
                        type="button"
                        aria-label={`${bus.name} mute`}
                        aria-pressed={bus.mute}
                        onClick={() => onUpdateBusMixer(bus.bus_id, { mute: !bus.mute })}
                        style={shellStyle.miniToggle}
                      >
                        Mute
                      </button>
                      <button
                        type="button"
                        aria-label={`${bus.name} solo`}
                        aria-pressed={bus.solo}
                        onClick={() => onUpdateBusMixer(bus.bus_id, { solo: !bus.solo })}
                        style={shellStyle.miniToggle}
                      >
                        Solo
                      </button>
                    </div>
                    <label style={shellStyle.fieldStack}>
                      <div style={shellStyle.sliderValue}>
                        <span>Output Pair</span>
                        <strong>{bus.output_pair + 1}</strong>
                      </div>
                      <select
                        aria-label={`${bus.name} output pair`}
                        value={bus.output_pair}
                        onChange={(event) => onUpdateBusMixer(bus.bus_id, { output_pair: Number(event.currentTarget.value) })}
                        style={shellStyle.inspectorSelect}
                      >
                        {bus.available_output_pairs.map((pairIndex) => (
                          <option key={`${bus.bus_id}-pair-${pairIndex}`} value={pairIndex}>
                            Pair {pairIndex + 1} ({pairIndex * 2 + 1}/{pairIndex * 2 + 2})
                          </option>
                        ))}
                      </select>
                    </label>
                    {[
                      { label: 'Level', min: 0, max: 100, value: bus.level, update: (value: number) => ({ level: value }) },
                      { label: 'Send', min: 0, max: 100, value: bus.reverb_send, update: (value: number) => ({ reverb_send: value }) },
                      { label: 'Pan', min: -100, max: 100, value: bus.pan, update: (value: number) => ({ pan: value }) },
                      { label: 'Low', min: -24, max: 24, value: bus.eq.low_gain, update: (value: number) => ({ eq: { ...bus.eq, low_gain: value } }) },
                      { label: 'Mid', min: -24, max: 24, value: bus.eq.mid_gain, update: (value: number) => ({ eq: { ...bus.eq, mid_gain: value } }) },
                      { label: 'High', min: -24, max: 24, value: bus.eq.high_gain, update: (value: number) => ({ eq: { ...bus.eq, high_gain: value } }) },
                      { label: 'Ratio', min: 1, max: 20, value: bus.comp.ratio, update: (value: number) => ({ comp: { ...bus.comp, ratio: value } }) },
                    ].map((control) => (
                      <label key={`${bus.bus_id}-${control.label}`} style={shellStyle.fieldStack}>
                        <div style={shellStyle.sliderValue}>
                          <span>{control.label}</span>
                          <strong>{control.value}</strong>
                        </div>
                        <input
                          aria-label={`${bus.name} ${control.label}`}
                          type="range"
                          min={control.min}
                          max={control.max}
                          step={1}
                          value={control.value}
                          onChange={(event) => onUpdateBusMixer(bus.bus_id, control.update(Number(event.currentTarget.value)))}
                          style={shellStyle.compactRange}
                        />
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </Tile>
          </div>
        </div>
        <div style={shellStyle.modeColumn}>
          <Tile style={{ ...shellStyle.tile, ...shellStyle.inspectorTile }}>
            <div style={shellStyle.tileHeader}>
              <h3 style={shellStyle.tileTitle}>Instrument Inspector</h3>
              <Tag type="green">Pad {selectedPad + 1}</Tag>
            </div>
            <p style={shellStyle.tileText}>
              Selected-row context stays visible here so bus routing, note assignment, and sample
              metadata do not compete with the sequencer grid itself.
            </p>
            <div style={shellStyle.inspectorGrid}>
              <div style={shellStyle.inspectorSection}>
                <div style={shellStyle.rowHeader}>
                  <span style={{ ...shellStyle.colorSwatch, background: padAccent(selectedPad) }} aria-hidden />
                  <span style={shellStyle.rowTitle}>{draftNames[selectedPad] ?? selectedInstrument?.name ?? `Pad ${selectedPad + 1}`}</span>
                </div>
                <div style={shellStyle.rowMeta}>
                  <Tag type="blue">MIDI Note {selectedInstrument?.default_note ?? (36 + selectedPad)}</Tag>
                  <Tag type={selectedPadControl.mute ? 'red' : 'gray'}>{selectedPadControl.mute ? 'Muted' : 'Live'}</Tag>
                  <Tag type={selectedPadControl.solo ? 'cyan' : 'gray'}>{selectedPadControl.solo ? 'Soloed' : 'Grouped'}</Tag>
                </div>
              </div>
              <div style={shellStyle.inspectorSection}>
                <span style={shellStyle.clusterLabel}>Bus Assignment</span>
                <select
                  aria-label="Selected pad bus assignment"
                  value={selectedPadControl.bus}
                  onChange={(event) => onUpdatePadControl(selectedPad, { bus_assignment: Number(event.currentTarget.value) })}
                  style={shellStyle.inspectorSelect}
                >
                  {Array.from({ length: 8 }, (_, busIndex) => (
                    <option key={busIndex} value={busIndex}>
                      Bus {busIndex}
                    </option>
                  ))}
                </select>
              </div>
              <div style={shellStyle.inspectorSection}>
                <span style={shellStyle.clusterLabel}>Sound Source</span>
                <select
                  aria-label="Selected pad sound source"
                  value={selectedPadSoundSource}
                  onChange={(event) => onUpdatePadSoundSource(selectedPad, event.currentTarget.value as DrumPadSoundSource)}
                  style={shellStyle.inspectorSelect}
                >
                  <option value="sample">Sample</option>
                  <option value="synth">Synth</option>
                  <option value="hybrid">Hybrid</option>
                </select>
                <span style={shellStyle.inspectorValue}>{selectedInstrument?.sfz_path ?? 'Factory assignment'}</span>
                <div style={shellStyle.toggleRow}>
                  <Tag type={selectedPadSoundSource === 'sample' ? 'green' : 'cool-gray'}>
                    {selectedPadSoundSource === 'sample' ? 'Sample path active' : 'Sample layer optional'}
                  </Tag>
                  <Tag type={selectedPadSoundSource === 'synth' ? 'cyan' : selectedPadSoundSource === 'hybrid' ? 'teal' : 'cool-gray'}>
                    {selectedPadSoundSource === 'sample' ? 'Synth layer bypassed' : selectedPadSoundSource === 'synth' ? 'Synth only' : 'Hybrid layered'}
                  </Tag>
                </div>
              </div>
              <div style={shellStyle.inspectorSection}>
                <div style={shellStyle.tileHeader}>
                  <span style={shellStyle.clusterLabel}>Sample Layer</span>
                  <Tag type={selectedPadSample ? 'green' : 'cool-gray'}>
                    {selectedPadSample ? `${selectedPadSample.sample_rate} Hz` : 'No waveform'}
                  </Tag>
                </div>
                <div style={shellStyle.fieldGrid}>
                  <label style={shellStyle.fieldStack}>
                    <span style={shellStyle.clusterLabel}>Import Sample</span>
                    <input
                      aria-label="Selected pad sample upload"
                      type="file"
                      accept=".wav,.aiff,.aif,.flac"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0]
                        if (!file) {
                          return
                        }
                        onUploadSample(selectedPad, file)
                        event.currentTarget.value = ''
                      }}
                      style={shellStyle.miniInput}
                    />
                  </label>
                  <div style={shellStyle.fieldStack}>
                    <span style={shellStyle.clusterLabel}>Capture</span>
                    <div style={shellStyle.buttonRow}>
                      <Button
                        size="sm"
                        kind={sampleRecordingActive ? 'danger' : 'secondary'}
                        onClick={() => (sampleRecordingActive ? onStopSampleRecording(selectedPad) : onStartSampleRecording(selectedPad))}
                      >
                        {sampleRecordingActive ? 'Stop Record' : 'Record Input'}
                      </Button>
                      <Button size="sm" kind="ghost" onClick={() => onNormalizeSample(selectedPad)}>
                        Normalize
                      </Button>
                      <Button size="sm" kind="ghost" onClick={() => onReverseSample(selectedPad)}>
                        Reverse
                      </Button>
                      <Button size="sm" kind="ghost" onClick={() => onFadeSample(selectedPad, 5, 5)}>
                        Fade 5ms
                      </Button>
                    </div>
                  </div>
                </div>
                <div style={shellStyle.waveform} aria-label="Selected pad sample waveform">
                  <div
                    style={{
                      ...shellStyle.waveformBars,
                      gridTemplateColumns: `repeat(${Math.max(1, selectedSampleWindow.peaks.length)}, 1fr)`,
                    }}
                  >
                    {selectedSampleWindow.peaks.length > 0
                      ? selectedSampleWindow.peaks.map((peak, index) => (
                          <div
                            key={`selected-pad-waveform-${index}`}
                            style={{
                              ...shellStyle.waveformBar,
                              minHeight: 8,
                              height: `${Math.max(8, Math.round(peak * 90))}px`,
                            }}
                          />
                        ))
                      : <p style={shellStyle.tileText}>Upload or record a sample to view the waveform.</p>}
                  </div>
                </div>
                <div style={shellStyle.fieldGrid}>
                  <label style={shellStyle.fieldStack}>
                    <div style={shellStyle.sliderValue}>
                      <span>Zoom</span>
                      <strong>{sampleZoom}%</strong>
                    </div>
                    <input
                      aria-label="Selected pad waveform zoom"
                      type="range"
                      min={10}
                      max={100}
                      step={5}
                      value={sampleZoom}
                      onChange={(event) => onChangeSampleZoom(Number(event.currentTarget.value))}
                      style={shellStyle.compactRange}
                    />
                  </label>
                  <label style={shellStyle.fieldStack}>
                    <div style={shellStyle.sliderValue}>
                      <span>Scroll</span>
                      <strong>{sampleScroll}%</strong>
                    </div>
                    <input
                      aria-label="Selected pad waveform scroll"
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={sampleScroll}
                      onChange={(event) => onChangeSampleScroll(Number(event.currentTarget.value))}
                      style={shellStyle.compactRange}
                    />
                  </label>
                  <label style={shellStyle.fieldStack}>
                    <div style={shellStyle.sliderValue}>
                      <span>Trim Start</span>
                      <strong>{sampleTrimStart}</strong>
                    </div>
                    <input
                      aria-label="Selected pad sample trim start"
                      type="range"
                      min={0}
                      max={Math.max(1, selectedPadSample?.sample_count ?? 1)}
                      step={1}
                      value={Math.min(sampleTrimStart, Math.max(0, sampleTrimEnd - 1))}
                      onChange={(event) => onChangeSampleTrimStart(Number(event.currentTarget.value))}
                      style={shellStyle.compactRange}
                    />
                  </label>
                  <label style={shellStyle.fieldStack}>
                    <div style={shellStyle.sliderValue}>
                      <span>Trim End</span>
                      <strong>{sampleTrimEnd}</strong>
                    </div>
                    <input
                      aria-label="Selected pad sample trim end"
                      type="range"
                      min={1}
                      max={Math.max(1, selectedPadSample?.sample_count ?? 1)}
                      step={1}
                      value={Math.max(1, sampleTrimEnd)}
                      onChange={(event) => onChangeSampleTrimEnd(Number(event.currentTarget.value))}
                      style={shellStyle.compactRange}
                    />
                  </label>
                </div>
                <div style={shellStyle.buttonRow}>
                  <Button
                    size="sm"
                    kind="tertiary"
                    disabled={!selectedPadSample || sampleTrimEnd <= sampleTrimStart}
                    onClick={() => onTrimSample(selectedPad, sampleTrimStart, sampleTrimEnd)}
                  >
                    Apply Trim
                  </Button>
                  <Tag type="warm-gray">
                    {selectedPadSample
                      ? `${selectedPadSample.sample_count} samples • ${selectedSampleWindow.startSample}-${selectedSampleWindow.endSample} in view`
                      : 'Sample editor idle'}
                  </Tag>
                </div>
              </div>
              <div style={shellStyle.inspectorSection}>
                <span style={shellStyle.clusterLabel}>Synth Voice</span>
                <div style={shellStyle.fieldGrid}>
                  <label style={shellStyle.fieldStack}>
                    <span style={shellStyle.clusterLabel}>Oscillator</span>
                    <select
                      aria-label="Selected pad synth oscillator"
                      value={selectedPadSynth.oscillator_type}
                      onChange={(event) => onUpdatePadSynthParams(selectedPad, {
                        ...selectedPadSynth,
                        oscillator_type: event.currentTarget.value as DrumSynthParams['oscillator_type'],
                      })}
                      style={shellStyle.inspectorSelect}
                    >
                      <option value="sine">Sine</option>
                      <option value="triangle">Triangle</option>
                      <option value="saw">Saw</option>
                      <option value="square">Square</option>
                      <option value="metallic">Metallic</option>
                    </select>
                  </label>
                  {[
                    { key: 'pitch_envelope_start_hz', label: 'Pitch Start', min: 20, max: 4000, step: 1 },
                    { key: 'pitch_envelope_end_hz', label: 'Pitch End', min: 20, max: 4000, step: 1 },
                    { key: 'pitch_envelope_decay_ms', label: 'Pitch Decay', min: 1, max: 5000, step: 1 },
                    { key: 'noise_level', label: 'Noise', min: 0, max: 1, step: 0.01 },
                    { key: 'noise_decay_ms', label: 'Noise Decay', min: 1, max: 5000, step: 1 },
                    { key: 'body_decay_ms', label: 'Body Decay', min: 1, max: 5000, step: 1 },
                    { key: 'tone_amount', label: 'Tone', min: 0, max: 1, step: 0.01 },
                  ].map((control) => (
                    <label key={control.key} style={shellStyle.fieldStack}>
                      <div style={shellStyle.sliderValue}>
                        <span>{control.label}</span>
                        <strong>{Number(selectedPadSynth[control.key as keyof DrumSynthParams]).toFixed(control.step < 1 ? 2 : 0)}</strong>
                      </div>
                      <input
                        aria-label={`Selected pad ${control.label}`}
                        type="range"
                        min={control.min}
                        max={control.max}
                        step={control.step}
                        value={selectedPadSynth[control.key as keyof DrumSynthParams] as number}
                        onChange={(event) => onUpdatePadSynthParams(selectedPad, {
                          ...selectedPadSynth,
                          [control.key]: Number(event.currentTarget.value),
                        })}
                        style={shellStyle.compactRange}
                      />
                    </label>
                  ))}
                </div>
              </div>
              <div style={shellStyle.inspectorSection}>
                <span style={shellStyle.clusterLabel}>Per-Pad Filter</span>
                <div style={shellStyle.fieldGrid}>
                  <label style={shellStyle.fieldStack}>
                    <span style={shellStyle.clusterLabel}>Type</span>
                    <select
                      aria-label="Selected pad filter type"
                      value={selectedPadFilter.type}
                      onChange={(event) => onUpdatePadFilter(selectedPad, {
                        ...selectedPadFilter,
                        type: event.currentTarget.value as DrumPadFilter['type'],
                      })}
                      style={shellStyle.inspectorSelect}
                    >
                      <option value="lowpass">Low-pass</option>
                      <option value="highpass">High-pass</option>
                      <option value="bandpass">Band-pass</option>
                      <option value="notch">Notch</option>
                    </select>
                  </label>
                  {[
                    { key: 'cutoff_hz', label: 'Cutoff', min: 20, max: 20000, step: 10 },
                    { key: 'resonance', label: 'Resonance', min: 0.1, max: 10, step: 0.01 },
                    { key: 'env_amount', label: 'Env Amt', min: -1, max: 1, step: 0.01 },
                    { key: 'env_decay_ms', label: 'Env Decay', min: 1, max: 5000, step: 1 },
                  ].map((control) => (
                    <label key={control.key} style={shellStyle.fieldStack}>
                      <div style={shellStyle.sliderValue}>
                        <span>{control.label}</span>
                        <strong>{Number(selectedPadFilter[control.key as keyof DrumPadFilter]).toFixed(control.step < 1 ? 2 : 0)}</strong>
                      </div>
                      <input
                        aria-label={`Selected pad filter ${control.label}`}
                        type="range"
                        min={control.min}
                        max={control.max}
                        step={control.step}
                        value={selectedPadFilter[control.key as keyof DrumPadFilter] as number}
                        onChange={(event) => onUpdatePadFilter(selectedPad, {
                          ...selectedPadFilter,
                          [control.key]: Number(event.currentTarget.value),
                        })}
                        style={shellStyle.compactRange}
                      />
                    </label>
                  ))}
                </div>
              </div>
              <div style={shellStyle.inspectorSection}>
                <span style={shellStyle.clusterLabel}>CV / Gate Output</span>
                <div style={shellStyle.fieldGrid}>
                  <label style={shellStyle.fieldStack}>
                    <span style={shellStyle.clusterLabel}>Enabled</span>
                    <select
                      aria-label="Selected pad CV/Gate enabled"
                      value={selectedPadCvGate.enabled ? 'on' : 'off'}
                      onChange={(event) => onUpdatePadCvGateConfig(selectedPad, {
                        ...selectedPadCvGate,
                        enabled: event.currentTarget.value === 'on',
                      })}
                      style={shellStyle.inspectorSelect}
                    >
                      <option value="off">Off</option>
                      <option value="on">On</option>
                    </select>
                  </label>
                  <label style={shellStyle.fieldStack}>
                    <span style={shellStyle.clusterLabel}>Output Pair</span>
                    <select
                      aria-label="Selected pad CV/Gate output pair"
                      value={selectedPadCvGate.output_pair}
                      onChange={(event) => onUpdatePadCvGateConfig(selectedPad, {
                        ...selectedPadCvGate,
                        output_pair: Number(event.currentTarget.value),
                      })}
                      style={shellStyle.inspectorSelect}
                    >
                      {Array.from({ length: 8 }, (_, pairIndex) => (
                        <option key={`cv-pair-${pairIndex}`} value={pairIndex}>
                          Pair {pairIndex + 1} ({pairIndex * 2 + 1}/{pairIndex * 2 + 2})
                        </option>
                      ))}
                    </select>
                  </label>
                  {[
                    { key: 'gate_length_ms', label: 'Gate Length', min: 1, max: 5000, step: 1 },
                    { key: 'note_min', label: 'Note Min', min: 0, max: 126, step: 1 },
                    { key: 'note_max', label: 'Note Max', min: 1, max: 127, step: 1 },
                    { key: 'pitch_min_volts', label: 'Pitch Min V', min: -10, max: 10, step: 0.1 },
                    { key: 'pitch_max_volts', label: 'Pitch Max V', min: -10, max: 10, step: 0.1 },
                  ].map((control) => (
                    <label key={control.key} style={shellStyle.fieldStack}>
                      <div style={shellStyle.sliderValue}>
                        <span>{control.label}</span>
                        <strong>{Number(selectedPadCvGate[control.key as keyof DrumCvGateConfig]).toFixed(control.step < 1 ? 1 : 0)}</strong>
                      </div>
                      <input
                        aria-label={`Selected pad CV/Gate ${control.label}`}
                        type="range"
                        min={control.min}
                        max={control.max}
                        step={control.step}
                        value={selectedPadCvGate[control.key as keyof DrumCvGateConfig] as number}
                        onChange={(event) => onUpdatePadCvGateConfig(selectedPad, {
                          ...selectedPadCvGate,
                          [control.key]: Number(event.currentTarget.value),
                        })}
                        style={shellStyle.compactRange}
                      />
                    </label>
                  ))}
                </div>
                <div style={shellStyle.toggleRow}>
                  <Tag type={selectedPadCvGate.enabled ? 'cyan' : 'cool-gray'}>
                    {selectedPadCvGate.enabled ? 'Gate on left, pitch CV on right' : 'CV/Gate disabled'}
                  </Tag>
                  <Tag type="warm-gray">
                    {`${selectedPadCvGate.pitch_min_volts.toFixed(1)}V to ${selectedPadCvGate.pitch_max_volts.toFixed(1)}V`}
                  </Tag>
                </div>
              </div>
            </div>
          </Tile>
          <Tile style={{ ...shellStyle.tile, borderTop: '3px solid #ff832b' }}>
            <div style={shellStyle.tileHeader}>
              <h3 style={shellStyle.tileTitle}>Parameter Locks</h3>
              <Tag type="warm-gray">
                {selectedStep ? `Step ${selectedStep.stepIndex + 1}` : 'Select Step'}
              </Tag>
            </div>
            <p style={shellStyle.tileText}>
              Shift-click a sequencer cell to focus its per-hit parameter locks. Any locked value only applies on that step trigger.
            </p>
            {selectedStep ? (
              <div style={shellStyle.fieldGrid}>
                <div style={shellStyle.fieldStack}>
                  <span style={shellStyle.clusterLabel}>Micro Timing</span>
                  <div style={shellStyle.sliderValue}>
                    <span>Offset</span>
                    <strong>{selectedStepState?.micro_timing ?? 0} ticks</strong>
                  </div>
                  <div style={shellStyle.buttonRow}>
                    {[-6, -1, 1, 6].map((delta) => (
                      <Button
                        key={`micro-${delta}`}
                        size="sm"
                        kind="secondary"
                        onClick={() => onUpdateStepLocks(selectedStep.instrumentIndex, selectedStep.stepIndex, {
                          micro_timing: Math.max(-48, Math.min(48, (selectedStepState?.micro_timing ?? 0) + delta)),
                        })}
                      >
                        {delta > 0 ? `+${delta}` : delta}
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      kind="ghost"
                      onClick={() => onUpdateStepLocks(selectedStep.instrumentIndex, selectedStep.stepIndex, { micro_timing: 0 })}
                    >
                      Reset
                    </Button>
                  </div>
                </div>
                <label style={shellStyle.fieldStack}>
                  <span style={shellStyle.clusterLabel}>Probability</span>
                  <div style={shellStyle.sliderValue}>
                    <span>Chance</span>
                    <strong>{Math.round((selectedStepState?.probability ?? 1) * 100)}%</strong>
                  </div>
                  <input
                    aria-label="Step probability"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={selectedStepState?.probability ?? 1}
                    onChange={(event) => onUpdateStepLocks(selectedStep.instrumentIndex, selectedStep.stepIndex, {
                      probability: Number(event.currentTarget.value),
                    })}
                    style={shellStyle.compactRange}
                  />
                  <Button
                    size="sm"
                    kind="ghost"
                    onClick={() => onUpdateStepLocks(selectedStep.instrumentIndex, selectedStep.stepIndex, { probability: 1 })}
                  >
                    Reset Probability
                  </Button>
                </label>
                <div style={shellStyle.fieldStack}>
                  <span style={shellStyle.clusterLabel}>Ratchet</span>
                  <div style={shellStyle.sliderValue}>
                    <span>Repeats</span>
                    <strong>x{selectedStepState?.ratchet_count ?? 1}</strong>
                  </div>
                  <div style={shellStyle.buttonRow}>
                    {[1, 2, 3, 4, 6, 8].map((count) => (
                      <Button
                        key={`ratchet-${count}`}
                        size="sm"
                        kind={(selectedStepState?.ratchet_count ?? 1) === count ? 'primary' : 'secondary'}
                        onClick={() => onUpdateStepLocks(selectedStep.instrumentIndex, selectedStep.stepIndex, {
                          ratchet_count: count,
                        })}
                      >
                        x{count}
                      </Button>
                    ))}
                  </div>
                  <div style={shellStyle.sliderValue}>
                    <span>Decay</span>
                    <strong>{selectedStepState?.ratchet_decay ?? 0}%</strong>
                  </div>
                  <input
                    aria-label="Step ratchet decay"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={selectedStepState?.ratchet_decay ?? 0}
                    onChange={(event) => onUpdateStepLocks(selectedStep.instrumentIndex, selectedStep.stepIndex, {
                      ratchet_decay: Number(event.currentTarget.value),
                    })}
                    style={shellStyle.compactRange}
                  />
                </div>
                {[
                  { key: 'lock_pitch', label: 'Pitch', min: -24, max: 24, step: 1, value: selectedStepState?.lock_pitch ?? null },
                  { key: 'lock_filter_cutoff', label: 'Filter', min: 20, max: 20000, step: 10, value: selectedStepState?.lock_filter_cutoff ?? null },
                  { key: 'lock_decay', label: 'Decay', min: 1, max: 5000, step: 10, value: selectedStepState?.lock_decay ?? null },
                  { key: 'lock_pan', label: 'Pan', min: -1, max: 1, step: 0.01, value: selectedStepState?.lock_pan ?? null },
                  { key: 'lock_volume', label: 'Volume', min: 0, max: 1, step: 0.01, value: selectedStepState?.lock_volume ?? null },
                ].map((control) => (
                  <label key={control.key} style={shellStyle.fieldStack}>
                    <div style={shellStyle.sliderValue}>
                      <span>{control.label}</span>
                      <strong>{control.value === null ? 'Off' : control.value}</strong>
                    </div>
                    <input
                      aria-label={`Step lock ${control.label}`}
                      type="range"
                      min={control.min}
                      max={control.max}
                      step={control.step}
                      value={control.value ?? control.min}
                      onChange={(event) => onUpdateStepLocks(selectedStep.instrumentIndex, selectedStep.stepIndex, {
                        [control.key]: Number(event.currentTarget.value),
                      })}
                      style={shellStyle.compactRange}
                    />
                    <Button
                      size="sm"
                      kind="ghost"
                      onClick={() => onUpdateStepLocks(selectedStep.instrumentIndex, selectedStep.stepIndex, {
                        [control.key]: null,
                      })}
                    >
                      Clear {control.label}
                    </Button>
                  </label>
                ))}
              </div>
            ) : (
              <div style={shellStyle.fieldStack}>
                <span style={shellStyle.inspectorValue}>Select a step in the sequencer to edit its p-locks.</span>
              </div>
            )}
          </Tile>
          <Tile style={{ ...shellStyle.tile, borderTop: '3px solid #be95ff' }}>
            <div style={shellStyle.tileHeader}>
              <h3 style={shellStyle.tileTitle}>MIDI Configuration</h3>
              <Tag type={midiLearnState?.active ? 'magenta' : 'purple'}>
                {midiLearnState?.active ? `Learning Pad ${midiLearnState.active_pad_index + 1}` : 'Ready'}
              </Tag>
            </div>
            <p style={shellStyle.tileText}>
              Pad note/channel assignment, velocity shaping, learn mode, hardware presets, and zone
              routing now live beside the sequencer instead of staying queued behind the inspector.
            </p>
            <div style={shellStyle.fieldGrid}>
              <label style={shellStyle.fieldStack}>
                <span style={shellStyle.clusterLabel}>Hardware Preset</span>
                <select
                  aria-label="Drum MIDI preset"
                  value={selectedMidiPreset}
                  onChange={(event) => onSelectMidiPreset(event.currentTarget.value)}
                  style={shellStyle.input}
                >
                  {midiPresets.length === 0 ? <option value="">No presets detected</option> : null}
                  {midiPresets.map((preset) => (
                    <option key={preset} value={preset}>{preset}</option>
                  ))}
                </select>
              </label>
              <div style={shellStyle.fieldStack}>
                <span style={shellStyle.clusterLabel}>Learn Controls</span>
                <div style={shellStyle.buttonRow}>
                  <Button size="sm" kind="secondary" onClick={() => onStartMidiLearn(selectedPad)}>
                    Learn Pad {selectedPad + 1}
                  </Button>
                  <Button size="sm" kind="secondary" onClick={() => onStartMidiLearn()}>
                    Learn All
                  </Button>
                  <Button size="sm" kind="tertiary" onClick={onStopMidiLearn}>
                    Stop Learn
                  </Button>
                  <Button size="sm" kind="ghost" onClick={onLoadMidiPreset} disabled={!selectedMidiPreset}>
                    Apply Preset
                  </Button>
                </div>
              </div>
            </div>
            <div style={shellStyle.statGrid}>
              <div style={shellStyle.statCard}>
                <span style={shellStyle.statLabel}>Last Note</span>
                <span style={shellStyle.statValue}>{midiLearnState && midiLearnState.last_received_note >= 0 ? midiLearnState.last_received_note : '--'}</span>
              </div>
              <div style={shellStyle.statCard}>
                <span style={shellStyle.statLabel}>Last Channel</span>
                <span style={shellStyle.statValue}>{midiLearnState && midiLearnState.last_received_channel >= 0 ? midiLearnState.last_received_channel + 1 : '--'}</span>
              </div>
            </div>
            <div style={shellStyle.midiTableWrap}>
              <table style={shellStyle.midiTable} aria-label="Drum MIDI mapping table">
                <thead>
                  <tr>
                    {['Pad', 'Note', 'Channel', 'Curve', 'Zone'].map((heading) => (
                      <th key={heading} style={{ ...shellStyle.trackCell, textAlign: 'left', color: '#a8a8a8' }}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 16 }, (_, padId) => {
                    const padMapping = resolvedMidiPad(midiMapping, padId)
                    const curve = resolvedVelocityCurve(velocityCurves, padId)
                    const zoneConfig = resolvedZones(midiZones, padId)
                    return (
                      <tr key={`midi-pad-${padId}`}>
                        <td style={shellStyle.trackCell}>{draftNames[padId] ?? `Pad ${padId + 1}`}</td>
                        <td style={shellStyle.trackCell}>
                          <input
                            aria-label={`Pad ${padId + 1} MIDI note`}
                            type="number"
                            min={0}
                            max={127}
                            value={padMapping.notes[0] ?? 36 + padId}
                            onChange={(event) => onUpdateMidiPad(padId, { notes: [Number(event.currentTarget.value)] })}
                            style={shellStyle.miniInput}
                          />
                        </td>
                        <td style={shellStyle.trackCell}>
                          <select
                            aria-label={`Pad ${padId + 1} MIDI channel`}
                            value={padMapping.midi_channel}
                            onChange={(event) => onUpdateMidiPad(padId, { midi_channel: Number(event.currentTarget.value) })}
                            style={shellStyle.miniInput}
                          >
                            {Array.from({ length: 16 }, (_, channel) => (
                              <option key={`${padId}-channel-${channel}`} value={channel}>{channel + 1}</option>
                            ))}
                          </select>
                        </td>
                        <td style={shellStyle.trackCell}>
                          <select
                            aria-label={`Pad ${padId + 1} velocity curve`}
                            value={curve.curve_type}
                            onChange={(event) => onUpdateVelocityCurve(padId, { curve_type: Number(event.currentTarget.value) as DrumVelocityCurve['curve_type'] })}
                            style={shellStyle.miniInput}
                          >
                            {VELOCITY_CURVE_OPTIONS.map((option) => (
                              <option key={`${padId}-curve-${option.value}`} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </td>
                        <td style={shellStyle.trackCell}>
                          <input
                            aria-label={`Pad ${padId + 1} head zone note`}
                            type="number"
                            min={0}
                            max={127}
                            value={zoneConfig.zones[0]?.trigger_note ?? padMapping.notes[0] ?? 36 + padId}
                            onChange={(event) =>
                              onUpdateMidiZones(padId, [
                                {
                                  kind: 0,
                                  trigger_note: Number(event.currentTarget.value),
                                  key_switch_note: zoneConfig.zones[0]?.key_switch_note ?? -1,
                                  velocity_scale: zoneConfig.zones[0]?.velocity_scale ?? 1,
                                  enabled: zoneConfig.zones[0]?.enabled ?? true,
                                },
                                ...(zoneConfig.zones.slice(1)),
                              ])
                            }
                            style={shellStyle.miniInput}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={shellStyle.fieldGrid}>
              <label style={shellStyle.fieldStack}>
                <span style={shellStyle.clusterLabel}>Selected Pad Curve</span>
                <div style={shellStyle.sliderValue}>
                  <span>Output Ceiling</span>
                  <strong>{selectedVelocityCurve.output_ceiling.toFixed(2)}</strong>
                </div>
                <input
                  aria-label="Selected pad output ceiling"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={selectedVelocityCurve.output_ceiling}
                  onChange={(event) => onUpdateVelocityCurve(selectedPad, { output_ceiling: Number(event.currentTarget.value) })}
                  style={shellStyle.range}
                />
              </label>
              <label style={shellStyle.fieldStack}>
                <span style={shellStyle.clusterLabel}>Selected Pad Zone</span>
                <div style={shellStyle.sliderValue}>
                  <span>Head Trigger</span>
                  <strong>{selectedZoneConfig.zones[0]?.trigger_note ?? selectedMidiPad.notes[0] ?? '--'}</strong>
                </div>
                <input
                  aria-label="Selected pad head zone note"
                  type="number"
                  min={0}
                  max={127}
                  value={selectedZoneConfig.zones[0]?.trigger_note ?? selectedMidiPad.notes[0] ?? 36 + selectedPad}
                  onChange={(event) =>
                    onUpdateMidiZones(selectedPad, [
                      {
                        kind: 0,
                        trigger_note: Number(event.currentTarget.value),
                        key_switch_note: selectedZoneConfig.zones[0]?.key_switch_note ?? -1,
                        velocity_scale: selectedZoneConfig.zones[0]?.velocity_scale ?? 1,
                        enabled: selectedZoneConfig.zones[0]?.enabled ?? true,
                      },
                      ...(selectedZoneConfig.zones.slice(1)),
                    ])
                  }
                  style={shellStyle.input}
                />
              </label>
            </div>
            <div style={shellStyle.tileHeader}>
              <h4 style={shellStyle.tileTitle}>CC Mapping</h4>
              <Tag type={ccLearnState?.active ? 'cyan' : 'cool-gray'}>
                {ccLearnState?.active ? `Learning Slot ${ccLearnState.slot + 1}` : 'Idle'}
              </Tag>
            </div>
            <div style={shellStyle.statGrid}>
              <div style={shellStyle.statCard}>
                <span style={shellStyle.statLabel}>Last CC</span>
                <span style={shellStyle.statValue}>{ccLearnState && ccLearnState.last_cc >= 0 ? ccLearnState.last_cc : '--'}</span>
              </div>
              <div style={shellStyle.statCard}>
                <span style={shellStyle.statLabel}>Last CC Channel</span>
                <span style={shellStyle.statValue}>{ccLearnState && ccLearnState.last_channel >= 0 ? ccLearnState.last_channel : '--'}</span>
              </div>
            </div>
            <div style={shellStyle.midiTableWrap}>
              <table style={shellStyle.midiTable} aria-label="Drum CC mapping table">
                <thead>
                  <tr>
                    {['Slot', 'CC', 'Channel', 'Target', 'Index', 'State'].map((heading) => (
                      <th key={heading} style={{ ...shellStyle.trackCell, textAlign: 'left', color: '#a8a8a8' }}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 8 }, (_, slot) => {
                    const mapping = resolvedCcMapping(ccMapping, slot)
                    return (
                      <tr key={`cc-slot-${slot}`}>
                        <td style={shellStyle.trackCell}>Slot {slot + 1}</td>
                        <td style={shellStyle.trackCell}>
                          <input
                            aria-label={`CC slot ${slot + 1} number`}
                            type="number"
                            min={0}
                            max={127}
                            value={mapping.cc_number}
                            onChange={(event) => onUpdateCcMapping(slot, { cc_number: Number(event.currentTarget.value), active: true })}
                            style={shellStyle.miniInput}
                          />
                        </td>
                        <td style={shellStyle.trackCell}>
                          <select
                            aria-label={`CC slot ${slot + 1} channel`}
                            value={mapping.midi_channel}
                            onChange={(event) => onUpdateCcMapping(slot, { midi_channel: Number(event.currentTarget.value), active: true })}
                            style={shellStyle.miniInput}
                          >
                            <option value={0}>Omni</option>
                            {Array.from({ length: 16 }, (_, channel) => (
                              <option key={`cc-slot-${slot}-channel-${channel + 1}`} value={channel + 1}>{channel + 1}</option>
                            ))}
                          </select>
                        </td>
                        <td style={shellStyle.trackCell}>
                          <select
                            aria-label={`CC slot ${slot + 1} target`}
                            value={mapping.target}
                            onChange={(event) => onUpdateCcMapping(slot, { target: event.currentTarget.value as DrumCcTarget, active: true })}
                            style={shellStyle.miniInput}
                          >
                            {CC_TARGET_OPTIONS.map((option) => (
                              <option key={`cc-slot-${slot}-target-${option.value}`} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </td>
                        <td style={shellStyle.trackCell}>
                          <input
                            aria-label={`CC slot ${slot + 1} target index`}
                            type="number"
                            min={0}
                            max={15}
                            value={mapping.target_index}
                            onChange={(event) => onUpdateCcMapping(slot, { target_index: Number(event.currentTarget.value), active: true })}
                            style={shellStyle.miniInput}
                          />
                        </td>
                        <td style={shellStyle.trackCell}>
                          <div style={shellStyle.buttonRow}>
                            <Button size="sm" kind="secondary" onClick={() => onStartCcLearn(slot)}>
                              Learn
                            </Button>
                            <Button
                              size="sm"
                              kind="tertiary"
                              onClick={() => onUpdateCcMapping(slot, { active: !mapping.active })}
                            >
                              {mapping.active ? 'Disable' : 'Enable'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={shellStyle.buttonRow}>
              <Button size="sm" kind="tertiary" onClick={onStopCcLearn}>
                Stop CC Learn
              </Button>
            </div>
          </Tile>
        </div>
      </div>
    </div>
  )
}

function backingTracksPanel(
  accent: string,
  search: string,
  selectedTrackId: string,
  loopEnabled: boolean,
  tempoShift: number,
  pitchShift: number,
  onSearchChange: (value: string) => void,
  onSelectTrack: (trackId: string) => void,
  onToggleLoop: () => void,
  onTempoShiftChange: (value: number) => void,
  onPitchShiftChange: (value: number) => void,
) {
  const filteredTracks = BACKING_TRACK_LIBRARY.filter((track) => {
    const normalized = search.trim().toLowerCase()
    if (!normalized) {
      return true
    }
    return [track.name, track.genre, track.key].some((value) => value.toLowerCase().includes(normalized))
  })
  const selectedTrack =
    filteredTracks.find((track) => track.id === selectedTrackId) ??
    BACKING_TRACK_LIBRARY.find((track) => track.id === selectedTrackId) ??
    filteredTracks[0] ??
    BACKING_TRACK_LIBRARY[0]

  return (
    <div style={shellStyle.modeShell}>
      <div style={shellStyle.modeGrid}>
        <div style={shellStyle.modeColumn}>
          <Tile style={{ ...shellStyle.tile, borderTop: `3px solid ${accent}` }}>
            <div style={shellStyle.tileHeader}>
              <h2 style={shellStyle.tileTitle}>Backing Track Browser</h2>
              <Tag type="warm-gray">UI Ready</Tag>
            </div>
            <div style={shellStyle.fieldGrid}>
              <label style={shellStyle.fieldStack}>
                <span style={shellStyle.clusterLabel}>Search Tracks</span>
                <input
                  aria-label="Backing track search"
                  type="search"
                  value={search}
                  onChange={(event) => onSearchChange(event.currentTarget.value)}
                  placeholder="Filter by name, genre, or key"
                  style={shellStyle.input}
                />
              </label>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={shellStyle.trackTable} aria-label="Backing track browser">
                <thead>
                  <tr>
                    {['Track', 'Genre', 'Key', 'Tempo', 'Duration'].map((heading) => (
                      <th key={heading} style={{ ...shellStyle.trackCell, textAlign: 'left', color: '#a8a8a8' }}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTracks.map((track) => {
                    const isSelected = selectedTrack?.id === track.id
                    return (
                      <tr
                        key={track.id}
                        onClick={() => onSelectTrack(track.id)}
                        style={{ background: isSelected ? 'rgba(255,131,43,0.08)' : 'transparent', cursor: 'pointer' }}
                      >
                        <td style={shellStyle.trackCell}>{track.name}</td>
                        <td style={shellStyle.trackCell}>{track.genre}</td>
                        <td style={shellStyle.trackCell}>{track.key}</td>
                        <td style={shellStyle.trackCell}>{track.tempo} BPM</td>
                        <td style={shellStyle.trackCell}>{track.duration}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Tile>
        </div>
        <div style={shellStyle.modeColumn}>
          <Tile style={shellStyle.tile}>
            <div style={shellStyle.tileHeader}>
              <h3 style={shellStyle.tileTitle}>Track Player</h3>
              <Tag type="warm-gray">{selectedTrack?.tempo ?? 0} BPM</Tag>
            </div>
            <strong>{selectedTrack?.name ?? 'No track selected'}</strong>
            <p style={shellStyle.tileText}>
              The browser, waveform shell, seek transport, and loop/shift controls are now in place.
              Time-stretch and pitch-shift processing remain backend-engine dependent.
            </p>
            <div style={shellStyle.waveform} aria-label="Backing track waveform overview">
              <div style={shellStyle.waveformBars}>
                {Array.from({ length: 48 }, (_, index) => (
                  <span
                    key={`wave-${index}`}
                    style={{
                      ...shellStyle.waveformBar,
                      height: `${30 + ((index * 17) % 60)}%`,
                      opacity: selectedTrack ? 1 : 0.5,
                    }}
                  />
                ))}
              </div>
            </div>
            <div style={shellStyle.buttonRow}>
              <Button size="sm" kind="secondary" renderIcon={PlayFilled}>Play</Button>
              <Button size="sm" kind="secondary" renderIcon={PauseFilled}>Pause</Button>
              <Button size="sm" kind="tertiary" renderIcon={StopFilled}>Stop</Button>
              <Button size="sm" kind={loopEnabled ? 'primary' : 'secondary'} onClick={onToggleLoop}>
                Loop {loopEnabled ? 'On' : 'Off'}
              </Button>
            </div>
            <label style={shellStyle.fieldStack}>
              <span style={shellStyle.clusterLabel}>Tempo Shift</span>
              <div style={shellStyle.sliderValue}>
                <span>Stretch</span>
                <strong>{tempoShift}%</strong>
              </div>
              <input
                aria-label="Backing track tempo shift"
                type="range"
                min={-50}
                max={50}
                step={1}
                value={tempoShift}
                onChange={(event) => onTempoShiftChange(Number(event.currentTarget.value))}
                style={shellStyle.range}
              />
            </label>
            <label style={shellStyle.fieldStack}>
              <span style={shellStyle.clusterLabel}>Pitch Shift</span>
              <div style={shellStyle.sliderValue}>
                <span>Transpose</span>
                <strong>{pitchShift} st</strong>
              </div>
              <input
                aria-label="Backing track pitch shift"
                type="range"
                min={-12}
                max={12}
                step={1}
                value={pitchShift}
                onChange={(event) => onPitchShiftChange(Number(event.currentTarget.value))}
                style={shellStyle.range}
              />
            </label>
            <InlineNotification
              kind="warning"
              lowContrast
              hideCloseButton
              title="Audio playback engine not wired here yet"
              subtitle="The UI is live; transport, looping, tempo stretch, and pitch shift still need the dedicated backing-track engine path."
            />
          </Tile>
        </div>
      </div>
    </div>
  )
}

export function DrumsPage() {
  const queryClient = useQueryClient()
  const stateQuery = useDrumMachineState()
  const transportQuery = useDrumTransport()
  const positionQuery = useDrumPosition()
  const activeKitQuery = useDrumActiveKit()
  const kitsQuery = useDrumKits()
  const masterFx = useDrumMasterFx()
  const midiMapping = useDrumMidiMapping()
  const ccMapping = useDrumCcMapping()
  const songQuery = useDrumSong()
  const songTransportQuery = useDrumSongTransport()
  const meteringQuery = useDrumMetering()
  const mixer = useDrumMixer()
  const packs = useDrumPacks()
  const midiLearn = useDrumMidiLearn()
  const [selectedPad, setSelectedPad] = useState(0)
  const sampleEditor = useDrumSampleEditor(selectedPad, 256)
  const patternQuery = useDrumPattern(transportQuery.data?.pattern ?? 0)
  const patchInstrument = usePatchDrumKitInstrument()
  const clearPattern = useClearDrumPattern()
  const copyPattern = useCopyDrumPattern()
  const loadKit = useLoadDrumKit()
  const setPadControl = useSetDrumPadControl()
  const setPadSoundSource = useSetDrumPadSoundSource()
  const setPadSynthParams = useSetDrumPadSynthParams()
  const setPadFilter = useSetDrumPadFilter()
  const setPadCvGateConfig = useSetDrumPadCvGateConfig()
  const setTrackSwing = useSetDrumTrackSwing()
  const setTrackLength = useSetDrumTrackLength()
  const setBusMixer = useSetDrumBusMixer()
  const setMasterFx = useSetDrumMasterFx()
  const setMasterVolume = useSetDrumMasterVolume()
  const setMidiMapping = useSetDrumMidiMapping()
  const setCcMappings = useSetDrumCcMappings()
  const setMidiOutputConfig = useSetDrumMidiOutputConfig()
  const setMidiZones = useSetDrumMidiZones()
  const setVelocityCurve = useSetDrumVelocityCurve()
  const setPattern = useSetDrumPattern()
  const startCcLearn = useStartDrumCcLearn()
  const startMidiLearn = useStartDrumMidiLearn()
  const addSongEntry = useAddDrumSongEntry()
  const loadMidiPreset = useLoadDrumMidiPreset()
  const playSongTransport = usePlayDrumSongTransport()
  const removeSongEntry = useRemoveDrumSongEntry()
  const setSong = useSetDrumSong()
  const setStep = useSetDrumStep()
  const stopMidiLearn = useStopDrumMidiLearn()
  const stopCcLearn = useStopDrumCcLearn()
  const stopSongTransport = useStopDrumSongTransport()
  const triggerFill = useTriggerDrumFill()
  const updateState = useUpdateDrumMachineState()
  const updateTransport = useUpdateDrumTransport()
  const tapTempo = useMutation({
    mutationFn: () => drumsApi.tapTempo(Date.now()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'state'] })
      void queryClient.invalidateQueries({ queryKey: ['drums', 'transport'] })
    },
  })

  const rawState = stateQuery.data
  const state = rawState ? normalizeDrumMachineState(rawState) : undefined
  const transport = transportQuery.data
  const activeMode = state?.ui_mode ?? 'practice'
  const activeModeMeta = MODE_META[activeMode]
  const activeKitName = activeKitQuery.data?.name ?? 'No kit loaded'
  const activeKit = activeKitQuery.data
  const kits = kitsQuery.data ?? []
  const padControls = mixer.pads.data
  const busMixers = mixer.buses.data ?? []
  const masterVolume = mixer.master.data?.volume ?? state?.volume ?? 80
  const pattern = patternQuery.data
  const song = songQuery.data ?? { entries: [], loop: false }
  const position = positionQuery.data
  const metering = meteringQuery.data
  const selectedPadSample = sampleEditor.waveform.data
  const sampleRecordingActive = sampleRecordingPad === selectedPad
  const songTransport = songTransportQuery.data ?? {
    is_playing: false,
    current_entry_index: -1,
    current_repeat: 0,
    total_entries: song.entries.length,
    loop: song.loop,
    active_pattern: transport?.pattern ?? 0,
  }
  const midiLearnState = midiLearn.status.data
  const [selectedPatternSlot, setSelectedPatternSlot] = useState(transport?.pattern ?? 0)
  const [selectedPatternPage, setSelectedPatternPage] = useState(Math.floor((transport?.pattern ?? 0) / 32))
  const [patternClipboard, setPatternClipboard] = useState<number | null>(null)
  const [clearModalOpen, setClearModalOpen] = useState(false)
  const [songDraftPattern, setSongDraftPattern] = useState(transport?.pattern ?? 0)
  const [songDraftRepeats, setSongDraftRepeats] = useState(1)
  const [pendingKitId, setPendingKitId] = useState<string | null>(null)
  const [kitModalOpen, setKitModalOpen] = useState(false)
  const [draftNames, setDraftNames] = useState<string[]>(Array.from({ length: 16 }, (_, index) => `Pad ${index + 1}`))
  const [selectedStep, setSelectedStep] = useState<{ instrumentIndex: number; stepIndex: number } | null>(null)
  const [selectedMidiPreset, setSelectedMidiPreset] = useState('')
  const [backingTrackSearch, setBackingTrackSearch] = useState('')
  const [selectedBackingTrackId, setSelectedBackingTrackId] = useState(BACKING_TRACK_LIBRARY[0]?.id ?? '')
  const [backingTrackLoop, setBackingTrackLoop] = useState(false)
  const [backingTrackTempoShift, setBackingTrackTempoShift] = useState(0)
  const [backingTrackPitchShift, setBackingTrackPitchShift] = useState(0)
  const [liveMessage, setLiveMessage] = useState('Drum machine workspace ready.')
  const [sampleRecordingPad, setSampleRecordingPad] = useState<number | null>(null)
  const [sampleZoom, setSampleZoom] = useState(100)
  const [sampleScroll, setSampleScroll] = useState(0)
  const [sampleTrimStart, setSampleTrimStart] = useState(0)
  const [sampleTrimEnd, setSampleTrimEnd] = useState(1)
  const sequencerRef = useRef<HTMLDivElement | null>(null)
  const packLists = {
    factory: packs.factory.data ?? [],
    user: packs.generated.data ?? [],
  }

  useEffect(() => {
    setDraftNames(
      Array.from({ length: 16 }, (_, index) => activeKit?.instruments?.[index]?.name ?? `Pad ${index + 1}`),
    )
  }, [activeKit?.kit_id, activeKit?.instruments])

  useEffect(() => {
    if (!transport) {
      return
    }
    setSelectedPatternSlot(transport.pattern)
    setSelectedPatternPage(Math.floor(transport.pattern / 32))
    setSongDraftPattern(transport.pattern)
  }, [transport?.pattern])

  useEffect(() => {
    const presets = midiLearn.presets.data?.presets ?? []
    if (!selectedMidiPreset && presets.length > 0) {
      setSelectedMidiPreset(presets[0])
    }
  }, [midiLearn.presets.data, selectedMidiPreset])

  useEffect(() => {
    const sampleCount = sampleEditor.waveform.data?.sample_count ?? 1
    setSampleTrimStart(0)
    setSampleTrimEnd(sampleCount)
    setSampleScroll(0)
    setSampleZoom(100)
  }, [selectedPad, sampleEditor.waveform.data?.sample_count])

  if (stateQuery.isLoading && !state) {
    return (
      <div style={shellStyle.page}>
        <PageHeader
          title="Drum Machine"
          subtitle="Loading drum workspace"
          icon={<Music size={32} style={{ color: '#4589ff' }} />}
        />
        <Tile style={{ ...shellStyle.tile, minHeight: 240, placeItems: 'center' }}>
          <InlineLoading description="Preparing drum machine layout" status="active" />
        </Tile>
      </div>
    )
  }

  if (!state || !transport) {
    return (
      <div style={shellStyle.page}>
        <PageHeader
          title="Drum Machine"
          subtitle="Unable to resolve the drum machine state"
          icon={<Music size={32} style={{ color: '#4589ff' }} />}
        />
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Drum machine unavailable"
          subtitle="The page could not load drum transport or state data from the backend."
        />
      </div>
    )
  }

  const visibleAdvancedSteps = Math.min(16, clampPatternLength(pattern))
  const currentStep = transport.is_playing
    ? Math.max(0, Math.min(visibleAdvancedSteps - 1, position?.step ?? 0))
    : 0
  const focusStep = (instrumentIndex: number, stepIndex: number) => {
    const nextStep = Math.max(0, Math.min(visibleAdvancedSteps - 1, stepIndex))
    const nextRow = Math.max(0, Math.min(15, instrumentIndex))
    const node = sequencerRef.current?.querySelector<HTMLButtonElement>(`[data-step-key="${nextRow}:${nextStep}"]`)
    node?.focus()
  }
  const announce = (message: string) => {
    setLiveMessage(message)
  }
  const patternSwitchLabel =
    transport.switch_quantization_beats === 1
      ? '1 beat'
      : transport.switch_quantization_beats === 4
        ? '1 bar'
        : transport.switch_quantization_beats === 8
          ? '2 bars'
          : '4 bars'
  const updateMidiOutput = (patch: Partial<DrumMidiOutputConfig>, message: string) => {
    setMidiOutputConfig.mutate({
      midi_output_enabled: transport.midi_output_enabled,
      midi_clock_output_enabled: transport.midi_clock_output_enabled,
      midi_output_channel: transport.midi_output_channel,
      program_change_enabled: transport.program_change_enabled,
      ...patch,
    })
    announce(message)
  }

  return (
    <main className="drums-page" style={shellStyle.page}>
      <nav aria-label="Skip links" style={shellStyle.skipLinks}>
        <a
          href="#drum-transport"
          style={shellStyle.skipLink}
          onFocus={(event) => {
            Object.assign(event.currentTarget.style, { left: '24px', top: '16px', width: 'auto', height: 'auto' })
          }}
          onBlur={(event) => {
            Object.assign(event.currentTarget.style, { left: '-9999px', top: 'auto', width: '1px', height: '1px' })
          }}
        >
          Skip to transport
        </a>
        <a
          href="#drum-modes"
          style={shellStyle.skipLink}
          onFocus={(event) => {
            Object.assign(event.currentTarget.style, { left: '170px', top: '16px', width: 'auto', height: 'auto' })
          }}
          onBlur={(event) => {
            Object.assign(event.currentTarget.style, { left: '-9999px', top: 'auto', width: '1px', height: '1px' })
          }}
        >
          Skip to modes
        </a>
        <a
          href="#drum-footer"
          style={shellStyle.skipLink}
          onFocus={(event) => {
            Object.assign(event.currentTarget.style, { left: '300px', top: '16px', width: 'auto', height: 'auto' })
          }}
          onBlur={(event) => {
            Object.assign(event.currentTarget.style, { left: '-9999px', top: 'auto', width: '1px', height: '1px' })
          }}
        >
          Skip to status
        </a>
      </nav>
      <p style={shellStyle.visuallyHidden} aria-live="polite" aria-atomic="true" role="status">
        {liveMessage}
      </p>
      <PageHeader
        title="Drum Machine"
        subtitle={activeModeMeta.description}
        icon={<Music size={32} style={{ color: activeModeMeta.accent }} />}
      />

      <section id="drum-transport" style={shellStyle.transport} aria-label="Drum transport">
        <div style={shellStyle.buttonRow}>
          <Tag type="blue">{activeModeMeta.label}</Tag>
          {transportTag(transport.is_playing)}
          <Tag type="cool-gray">Kit: {activeKitName}</Tag>
          <Tag type="warm-gray">Pattern {transport.pattern}</Tag>
          <Tag type="teal">Switch {patternSwitchLabel}</Tag>
          {transport.pending_pattern >= 0 ? <Tag type="purple">Queued {transport.pending_pattern}</Tag> : null}
        </div>

        <div style={shellStyle.transportRow}>
          <div style={shellStyle.transportCluster}>
            <span style={shellStyle.clusterLabel}>Transport</span>
            <div style={shellStyle.buttonRow}>
              <Button
                kind={transport.is_playing ? 'secondary' : 'primary'}
                size="md"
                renderIcon={transport.is_playing ? PauseFilled : PlayFilled}
                onClick={() => {
                  updateTransport.mutate({ is_playing: !transport.is_playing })
                  announce(transport.is_playing ? 'Transport paused.' : 'Transport playing.')
                }}
              >
                {transport.is_playing ? 'Pause' : 'Play'}
              </Button>
              <Button
                kind="tertiary"
                size="md"
                renderIcon={StopFilled}
                onClick={() => {
                  updateTransport.mutate({ is_playing: false })
                  announce('Transport stopped.')
                }}
              >
                Stop
              </Button>
              <Button
                kind="ghost"
                size="md"
                renderIcon={Waveform}
                disabled={tapTempo.isPending}
                onClick={() => tapTempo.mutate()}
              >
                Tap Tempo
              </Button>
            </div>
          </div>

          <div style={shellStyle.transportCluster}>
            <NumberInput
              label="BPM"
              value={transport.bpm}
              min={40}
              max={300}
              step={1}
              defaultValue={120}
              profile="integer"
              onChange={(value) => updateTransport.mutate({ bpm: value })}
              size="small"
              fullWidth
              accentColor={activeModeMeta.accent}
            />
          </div>

          <div style={shellStyle.transportCluster}>
            <NumberInput
              label="Pattern"
              value={transport.pattern}
              min={0}
              max={127}
              step={1}
              defaultValue={0}
              profile="integer"
              onChange={(value) => {
                updateTransport.mutate({ pattern: value })
                announce(
                  transport.is_playing
                    ? `Pattern ${value} queued for the next ${patternSwitchLabel}.`
                    : `Pattern ${value} selected.`,
                )
              }}
              size="small"
              fullWidth
              accentColor={activeModeMeta.accent}
            />
          </div>

          <div style={shellStyle.transportCluster}>
            <span style={shellStyle.clusterLabel}>Pattern Switch</span>
            <select
              aria-label="Pattern switch quantization"
              value={transport.switch_quantization_beats}
              onChange={(event) => {
                const value = Number(event.currentTarget.value)
                updateTransport.mutate({ switch_quantization_beats: value })
                announce(
                  value === 1
                    ? 'Pattern switch quantization set to 1 beat.'
                    : `Pattern switch quantization set to ${value / 4} bar${value === 4 ? '' : 's'}.`,
                )
              }}
              style={{
                width: '100%',
                minHeight: 40,
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.16)',
                background: 'rgba(22,22,22,0.9)',
                color: '#f4f4f4',
                padding: '0 12px',
              }}
            >
              <option value={1}>1 beat</option>
              <option value={4}>1 bar</option>
              <option value={8}>2 bars</option>
              <option value={16}>4 bars</option>
            </select>
          </div>

          <div style={shellStyle.transportCluster}>
            <NumberInput
              label="Variation"
              value={transport.variation}
              min={0}
              max={10}
              step={1}
              defaultValue={0}
              profile="integer"
              onChange={(value) => updateTransport.mutate({ variation: value })}
              size="small"
              fullWidth
              accentColor={activeModeMeta.accent}
            />
          </div>

          <div style={shellStyle.sliderWrap}>
            <span style={shellStyle.clusterLabel}>Swing</span>
            <div style={shellStyle.sliderValue}>
              <span>Groove</span>
              <strong>{transport.swing}%</strong>
            </div>
            <input
              aria-label="Swing"
              type="range"
              min={0}
              max={100}
              step={1}
              value={transport.swing}
              onChange={(event) => updateTransport.mutate({ swing: Number(event.currentTarget.value) })}
              style={shellStyle.range}
            />
          </div>

          <div style={shellStyle.transportCluster}>
            <span style={shellStyle.clusterLabel}>Sequencer MIDI Out</span>
            <div style={shellStyle.fieldStack}>
              <label style={shellStyle.checkboxRow}>
                <input
                  aria-label="Sequencer MIDI note output enabled"
                  type="checkbox"
                  checked={transport.midi_output_enabled}
                  onChange={(event) => {
                    updateMidiOutput(
                      { midi_output_enabled: event.currentTarget.checked },
                      event.currentTarget.checked ? 'Sequencer MIDI note output enabled.' : 'Sequencer MIDI note output disabled.',
                    )
                  }}
                />
                <span>Send notes</span>
              </label>
              <label style={shellStyle.checkboxRow}>
                <input
                  aria-label="Sequencer MIDI clock output enabled"
                  type="checkbox"
                  checked={transport.midi_clock_output_enabled}
                  onChange={(event) => {
                    updateMidiOutput(
                      { midi_clock_output_enabled: event.currentTarget.checked },
                      event.currentTarget.checked ? 'Sequencer MIDI clock output enabled.' : 'Sequencer MIDI clock output disabled.',
                    )
                  }}
                />
                <span>Send clock + Start/Stop</span>
              </label>
              <label style={shellStyle.checkboxRow}>
                <input
                  aria-label="Sequencer Program Change input enabled"
                  type="checkbox"
                  checked={transport.program_change_enabled}
                  onChange={(event) => {
                    updateMidiOutput(
                      { program_change_enabled: event.currentTarget.checked },
                      event.currentTarget.checked ? 'Program Change pattern switching enabled.' : 'Program Change pattern switching disabled.',
                    )
                  }}
                />
                <span>Accept Program Change</span>
              </label>
            </div>
          </div>

          <div style={shellStyle.transportCluster}>
            <span style={shellStyle.clusterLabel}>MIDI Channel</span>
            <select
              aria-label="Sequencer MIDI output channel"
              value={transport.midi_output_channel}
              onChange={(event) => {
                const value = Number(event.currentTarget.value)
                updateMidiOutput({ midi_output_channel: value }, `Sequencer MIDI output channel set to ${value + 1}.`)
              }}
              style={shellStyle.input}
            >
              {Array.from({ length: 16 }, (_, channel) => (
                <option key={`transport-midi-channel-${channel}`} value={channel}>{channel + 1}</option>
              ))}
            </select>
          </div>

          <div style={shellStyle.sliderWrap}>
            <span style={shellStyle.clusterLabel}>Master Volume</span>
            <div style={shellStyle.sliderValue}>
              <span>Output</span>
              <strong>
                {state.volume}% · L {meterPercent(metering?.master_peak_left)} / R {meterPercent(metering?.master_peak_right)}
              </strong>
            </div>
            <input
              aria-label="Master volume"
              type="range"
              min={0}
              max={100}
              step={1}
              value={state.volume}
              onChange={(event) => updateState.mutate({ volume: Number(event.currentTarget.value) })}
              style={{ ...shellStyle.range, accentColor: '#24a148' }}
            />
          </div>
        </div>
      </section>

      <Tabs
        selectedIndex={modeIndex(activeMode)}
        onChange={({ selectedIndex }) => {
          const nextMode = MODE_ORDER[selectedIndex]
          updateState.mutate({ ui_mode: nextMode })
          announce(`${MODE_META[nextMode].label} mode selected.`)
        }}
      >
        <TabList id="drum-modes" aria-label="Drum machine modes" contained>
          {MODE_ORDER.map((mode) => (
            <Tab key={mode}>{MODE_META[mode].label}</Tab>
          ))}
        </TabList>
        <TabPanels>
          <TabPanel>
            {practicePanel(state, packLists, MODE_META.practice.accent, (patch) => updateState.mutate(patch))}
          </TabPanel>
          <TabPanel>
            {advancedPanel(
              transport.pattern,
              transport.variation,
              transport.is_playing,
              songTransport.is_playing,
              songTransport.current_entry_index,
              MODE_META.advanced.accent,
              pattern,
              activeKit,
              state.pad_sound_sources ?? [],
              state.pad_synth_params ?? [],
              state.pad_filters ?? [],
              state.pad_cv_gate_configs ?? [],
              selectedPadSample,
              sampleRecordingActive,
              sampleZoom,
              sampleScroll,
              sampleTrimStart,
              sampleTrimEnd,
              padControls,
              currentStep,
              selectedPad,
              draftNames,
              setSelectedPad,
              (padId, value) => {
                setDraftNames((current) => {
                  const next = [...current]
                  next[padId] = value
                  return next
                })
              },
              (padId) => {
                if (!activeKit?.kit_id) {
                  return
                }
                const nextName = (draftNames[padId] ?? '').trim()
                const currentName = activeKit.instruments?.[padId]?.name ?? `Pad ${padId + 1}`
                if (!nextName || nextName === currentName) {
                  setDraftNames((current) => {
                    const next = [...current]
                    next[padId] = currentName
                    return next
                  })
                  return
                }
                patchInstrument.mutate({
                  kitId: activeKit.kit_id,
                  padId,
                  patch: { name: nextName },
                })
              },
              (padId, params) => {
                setPadControl.mutate({
                  padId,
                  params,
                })
              },
              (padId, source) => {
                setPadSoundSource.mutate({ padId, source })
                announce(`${activeKit?.instruments?.[padId]?.name ?? `Pad ${padId + 1}`} sound source set to ${source}.`)
              },
              (padId, params) => {
                setPadSynthParams.mutate({ padId, params })
              },
              (padId, filter) => {
                setPadFilter.mutate({ padId, filter })
              },
              (padId, config) => {
                setPadCvGateConfig.mutate({ padId, config })
              },
              (padId, file) => {
                sampleEditor.upload.mutate({ padId, file })
                announce(`${activeKit?.instruments?.[padId]?.name ?? `Pad ${padId + 1}`} sample upload started.`)
              },
              (padId) => {
                setSampleRecordingPad(padId)
                sampleEditor.startRecording.mutate(padId)
                announce(`${activeKit?.instruments?.[padId]?.name ?? `Pad ${padId + 1}`} input recording armed.`)
              },
              (padId) => {
                setSampleRecordingPad(null)
                sampleEditor.stopRecording.mutate(padId)
                announce(`${activeKit?.instruments?.[padId]?.name ?? `Pad ${padId + 1}`} input recording captured.`)
              },
              (value) => setSampleZoom(value),
              (value) => setSampleScroll(value),
              (value) => setSampleTrimStart(Math.min(value, Math.max(0, sampleTrimEnd - 1))),
              (value) => setSampleTrimEnd(Math.max(value, sampleTrimStart + 1)),
              (padId, startSample, endSample) => {
                sampleEditor.trim.mutate({ padId, startSample, endSample })
                announce(`${activeKit?.instruments?.[padId]?.name ?? `Pad ${padId + 1}`} trim applied.`)
              },
              (padId) => {
                sampleEditor.normalize.mutate({ padId, targetPeak: 0.99 })
                announce(`${activeKit?.instruments?.[padId]?.name ?? `Pad ${padId + 1}`} normalized.`)
              },
              (padId) => {
                sampleEditor.reverse.mutate(padId)
                announce(`${activeKit?.instruments?.[padId]?.name ?? `Pad ${padId + 1}`} reversed.`)
              },
              (padId, fadeInMs, fadeOutMs) => {
                sampleEditor.fade.mutate({ padId, fadeInMs, fadeOutMs })
                announce(`${activeKit?.instruments?.[padId]?.name ?? `Pad ${padId + 1}`} faded.`)
              },
              transport.track_swing ?? [],
              (instrumentIndex, swing) => {
                setTrackSwing.mutate({ instrument: instrumentIndex, swing })
                announce(
                  `${activeKit?.instruments?.[instrumentIndex]?.name ?? `Pad ${instrumentIndex + 1}`} swing set to ${swing} percent.`,
                )
              },
              (instrumentIndex, length) => {
                setTrackLength.mutate({ patternId: transport.pattern, instrument: instrumentIndex, length })
                announce(
                  `${activeKit?.instruments?.[instrumentIndex]?.name ?? `Pad ${instrumentIndex + 1}`} loop length ${length === 0 ? `inherits pattern length ${clampPatternLength(pattern)}` : `set to ${length} steps`}.`,
                )
              },
              (instrumentIndex, stepIndex, nextVelocity, accentEnabled) => {
                setStep.mutate({
                  patternId: transport.pattern,
                  instrument: instrumentIndex,
                  step: stepIndex,
                  velocity: nextVelocity,
                  accent: accentEnabled,
                })
                announce(
                  `${activeKit?.instruments?.[instrumentIndex]?.name ?? `Pad ${instrumentIndex + 1}`} step ${stepIndex + 1} ${nextVelocity > 0 ? `set to velocity ${nextVelocity}${accentEnabled ? ' with accent' : ''}` : 'cleared'}.`,
                )
              },
              selectedStep,
              (instrumentIndex, stepIndex) => {
                setSelectedStep({ instrumentIndex, stepIndex })
              },
              (instrumentIndex, stepIndex, locks) => {
                const existingStep = resolvedStep(pattern, instrumentIndex, stepIndex)
                const nextLocks: {
                  micro_timing: number
                  probability: number
                  ratchet_count: number
                  ratchet_decay: number
                  lock_pitch: number | null
                  lock_filter_cutoff: number | null
                  lock_decay: number | null
                  lock_pan: number | null
                  lock_volume: number | null
                } = {
                  micro_timing: 'micro_timing' in locks ? (locks.micro_timing ?? 0) : existingStep.micro_timing,
                  probability: 'probability' in locks ? Math.max(0, Math.min(1, locks.probability ?? 1)) : existingStep.probability,
                  ratchet_count: 'ratchet_count' in locks ? Math.max(1, Math.min(8, locks.ratchet_count ?? 1)) : existingStep.ratchet_count,
                  ratchet_decay: 'ratchet_decay' in locks ? Math.max(0, Math.min(100, locks.ratchet_decay ?? 0)) : existingStep.ratchet_decay,
                  lock_pitch: 'lock_pitch' in locks ? (locks.lock_pitch ?? null) : existingStep.lock_pitch,
                  lock_filter_cutoff: 'lock_filter_cutoff' in locks ? (locks.lock_filter_cutoff ?? null) : existingStep.lock_filter_cutoff,
                  lock_decay: 'lock_decay' in locks ? (locks.lock_decay ?? null) : existingStep.lock_decay,
                  lock_pan: 'lock_pan' in locks ? (locks.lock_pan ?? null) : existingStep.lock_pan,
                  lock_volume: 'lock_volume' in locks ? (locks.lock_volume ?? null) : existingStep.lock_volume,
                }
                const nextVelocity = existingStep.active
                  ? existingStep.velocity
                  : stepHasDetailEdits({
                    ...existingStep,
                    ...nextLocks,
                  })
                    ? 100
                    : 0
                setStep.mutate({
                  patternId: transport.pattern,
                  instrument: instrumentIndex,
                  step: stepIndex,
                  velocity: nextVelocity,
                  accent: existingStep.accent,
                  ...nextLocks,
                })
                announce(
                  `${activeKit?.instruments?.[instrumentIndex]?.name ?? `Pad ${instrumentIndex + 1}`} step ${stepIndex + 1} parameter locks updated.`,
                )
              },
              selectedPatternSlot,
              selectedPatternPage,
              patternClipboard,
              clearModalOpen,
              song.entries,
              song.loop,
              songDraftPattern,
              songDraftRepeats,
              (patternId) => {
                setSelectedPatternSlot(patternId)
                setSelectedPatternPage(Math.floor(patternId / 32))
                updateTransport.mutate({ pattern: patternId })
                announce(`Pattern ${patternId + 1} selected.`)
              },
              setSelectedPatternPage,
              () => {
                setPatternClipboard(selectedPatternSlot)
              },
              () => {
                if (patternClipboard === null) {
                  return
                }
                copyPattern.mutate({
                  sourcePatternId: patternClipboard,
                  destinationPatternId: selectedPatternSlot,
                })
                updateTransport.mutate({ pattern: selectedPatternSlot })
              },
              () => {
                const destinationPatternId = (selectedPatternSlot + 1) % 128
                copyPattern.mutate({
                  sourcePatternId: transport.pattern,
                  destinationPatternId,
                })
                setSelectedPatternSlot(destinationPatternId)
                setSelectedPatternPage(Math.floor(destinationPatternId / 32))
                updateTransport.mutate({ pattern: destinationPatternId })
              },
              () => setClearModalOpen(true),
              () => {
                clearPattern.mutate(selectedPatternSlot)
                setClearModalOpen(false)
                updateTransport.mutate({ pattern: selectedPatternSlot, variation: 0 })
                announce(`Pattern ${selectedPatternSlot + 1} cleared.`)
              },
              () => setClearModalOpen(false),
              (length) => {
                setPattern.mutate({
                  patternId: transport.pattern,
                  pattern: buildPatternPayload(transport.pattern, pattern, length),
                })
              },
              (nextVariation) => {
                updateTransport.mutate({ variation: nextVariation })
                announce(nextVariation === 0 ? 'Pattern variation set to main.' : `Pattern variation set to ${nextVariation}.`)
              },
              () => {
                triggerFill.mutate()
                announce('Drum fill triggered.')
              },
              (patternId) => setSongDraftPattern(Math.max(0, Math.min(127, patternId))),
              (repeatCount) => setSongDraftRepeats(Math.max(1, Math.min(99, repeatCount))),
              () => {
                addSongEntry.mutate({
                  pattern_id: songDraftPattern,
                  repeat_count: songDraftRepeats,
                })
                announce(`Song entry added for pattern ${songDraftPattern + 1}, ${songDraftRepeats} repeats.`)
              },
              (index) => {
                removeSongEntry.mutate(index)
                announce(`Song entry ${index + 1} removed.`)
              },
              (index, direction) => {
                const targetIndex = index + direction
                if (targetIndex < 0 || targetIndex >= song.entries.length) {
                  return
                }
                const nextEntries = [...song.entries]
                const [entry] = nextEntries.splice(index, 1)
                nextEntries.splice(targetIndex, 0, entry)
                setSong.mutate({
                  entries: nextEntries,
                  loop: song.loop,
                })
              },
              () => {
                setSong.mutate({
                  entries: song.entries,
                  loop: !song.loop,
                })
              },
              () => {
                playSongTransport.mutate()
                announce('Song playback started.')
              },
              () => {
                stopSongTransport.mutate()
                announce('Song playback stopped.')
              },
              kits,
              busMixers,
              masterVolume,
              masterFx.data,
              metering
                ? {
                    per_pad_peak: metering.per_pad_peak,
                    per_bus_peak: metering.per_bus_peak,
                    master_peak_left: metering.master_peak_left,
                    master_peak_right: metering.master_peak_right,
                  }
                : undefined,
              pendingKitId,
              kitModalOpen,
              (kitId) => {
                setPendingKitId(kitId)
                setKitModalOpen(true)
              },
              () => setKitModalOpen(false),
              () => {
                if (!pendingKitId) {
                  return
                }
                loadKit.mutate(pendingKitId)
                setKitModalOpen(false)
                const nextKitName = kits.find((kit) => kit.kit_id === pendingKitId)?.name ?? pendingKitId
                announce(`Kit ${nextKitName} loading.`)
              },
              (busId, params) => {
                setBusMixer.mutate({
                  busId,
                  params: {
                    level: params.level,
                    pan: params.pan,
                    mute: params.mute,
                    solo: params.solo,
                    eq: params.eq,
                    comp: params.comp,
                    output_pair: params.output_pair,
                    reverb_send: params.reverb_send,
                  },
                })
              },
              (volume) => {
                setMasterVolume.mutate(volume)
              },
              (patch) => {
                setMasterFx.mutate({
                  ...(masterFx.data ?? {
                    drive_db: 0,
                    compressor_threshold: -18,
                    compressor_ratio: 2,
                    compressor_attack: 10,
                    compressor_release: 80,
                    compressor_makeup: 0,
                    reverb_mix: 0.18,
                    reverb_size: 0.45,
                    reverb_damping: 0.35,
                    reverb_width: 1,
                    limiter_threshold: -0.5,
                    limiter_release: 60,
                  }),
                  ...patch,
                })
              },
              midiMapping.mapping.data,
              ccMapping.mappings.data,
              ccMapping.learn.data,
              midiMapping.velocityCurves.data,
              midiMapping.zones.data,
              midiLearnState,
              midiLearn.presets.data?.presets ?? [],
              selectedMidiPreset,
              setSelectedMidiPreset,
              (padId, patch) => {
                const current = midiMapping.mapping.data ?? { global_midi_channel: 10, pads: [] }
                const nextPads = Array.from({ length: 16 }, (_, index) => {
                  const existing = resolvedMidiPad(current, index)
                  return index === padId
                    ? {
                        ...existing,
                        notes: patch.notes ?? existing.notes,
                        midi_channel: patch.midi_channel ?? existing.midi_channel,
                      }
                    : existing
                })
                setMidiMapping.mutate({
                  global_midi_channel: current.global_midi_channel,
                  pads: nextPads,
                })
              },
              (slot, patch) => {
                const current = ccMapping.mappings.data ?? { mappings: [] }
                const nextMappings = Array.from({ length: 32 }, (_, index) => {
                  const existing = resolvedCcMapping(current, index)
                  return index === slot ? { ...existing, ...patch, slot: index } : existing
                })
                setCcMappings.mutate({ mappings: nextMappings })
              },
              (padId, patch) => {
                const existing = resolvedVelocityCurve(midiMapping.velocityCurves.data, padId)
                setVelocityCurve.mutate({
                  padId,
                  curve: {
                    ...existing,
                    ...patch,
                    pad: padId,
                  },
                })
              },
              (padId, zones) => {
                const current = midiMapping.zones.data ?? { pads: [] }
                const nextPads = Array.from({ length: 16 }, (_, index) => (
                  index === padId ? { pad: index, zones } : resolvedZones(current, index)
                ))
                setMidiZones.mutate({ pads: nextPads })
              },
              (slot) => {
                startCcLearn.mutate({ slot })
                announce(`CC learn armed for slot ${slot + 1}.`)
              },
              () => {
                stopCcLearn.mutate()
                announce('CC learn stopped.')
              },
              (padId) => {
                startMidiLearn.mutate(padId)
                announce(`MIDI learn armed for pad ${padId + 1}.`)
              },
              () => {
                stopMidiLearn.mutate()
                announce('MIDI learn stopped.')
              },
              () => {
                if (!selectedMidiPreset) {
                  return
                }
                loadMidiPreset.mutate(selectedMidiPreset)
                announce(`MIDI preset ${selectedMidiPreset} applied.`)
              },
              (rowDelta, colDelta, instrumentIndex, stepIndex) => focusStep(instrumentIndex + rowDelta, stepIndex + colDelta),
              sequencerRef,
            )}
          </TabPanel>
          <TabPanel>
            {backingTracksPanel(
              MODE_META.backing_tracks.accent,
              backingTrackSearch,
              selectedBackingTrackId,
              backingTrackLoop,
              backingTrackTempoShift,
              backingTrackPitchShift,
              setBackingTrackSearch,
              setSelectedBackingTrackId,
              () => setBackingTrackLoop((current) => !current),
              setBackingTrackTempoShift,
              setBackingTrackPitchShift,
            )}
          </TabPanel>
        </TabPanels>
      </Tabs>

      <footer id="drum-footer" style={shellStyle.footer} aria-label="Drum status footer">
        <div style={shellStyle.footerGroup}>
          <Tag type="cool-gray">Active kit: {activeKitName}</Tag>
          <Tag type="warm-gray">Pattern {transport.pattern}</Tag>
          {transportTag(transport.is_playing)}
        </div>
        <div style={shellStyle.footerGroup}>
          <div style={shellStyle.dotRow} aria-hidden>
            {Array.from({ length: 4 }).map((_, index) => (
              <span
                key={index}
                style={{
                  ...shellStyle.dot,
                  background: index === Math.max(0, (position?.beat ?? 1) - 1) ? activeModeMeta.accent : shellStyle.dot.background,
                }}
              />
            ))}
          </div>
          <Tag type={midiLearnState?.active ? 'magenta' : 'gray'}>
            MIDI {midiLearnState?.active ? `Learning Pad ${midiLearnState.active_pad_index + 1}` : 'Ready'}
          </Tag>
          {tapTempo.isPending ? <InlineLoading description="Capturing tap" status="active" /> : null}
          <Tag type="blue">
            <VolumeUp size={14} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
            {state.volume}%
          </Tag>
        </div>
      </footer>
    </main>
  )
}

export default DrumsPage
