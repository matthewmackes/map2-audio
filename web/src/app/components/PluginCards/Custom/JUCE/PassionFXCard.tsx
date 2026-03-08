/**
 * PassionFXCard - Multi-Effect Processor
 *
 * Full signal chain multi-effect inspired by Steve Vai's Passion and Warfare rack.
 * Tie-dye green/black/jade aesthetic inspired by the Ibanez JEM77GMC.
 *
 * Signal chain: Gate > Comp > Wah > Phaser > Chorus > Pitch > Harmonizer >
 *               Delay > Reverb > EQ > Exciter > Tremolo
 */

import { usePassionFX, PASSIONFX_PRESETS } from '../../../../hooks/usePassionFX'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import type { PluginCardProps } from '../../types'
import './PassionFXCard.css'

// Plugin URI for MIDI mappings
const PASSIONFX_URI = 'map2://juce/multieffect/passionfx'

// Parameter indices (must match juce_processors.json order)
const PARAM = {
  GATE_ENABLED: 0,
  GATE_THRESHOLD: 1,
  GATE_RELEASE: 2,
  COMP_ENABLED: 3,
  COMP_THRESHOLD: 4,
  COMP_RATIO: 5,
  COMP_ATTACK: 6,
  COMP_RELEASE: 7,
  COMP_GLASSY: 8,
  WAH_ENABLED: 9,
  WAH_MODE: 10,
  WAH_POSITION: 11,
  WAH_Q: 12,
  PHASER_ENABLED: 13,
  PHASER_RATE: 14,
  PHASER_DEPTH: 15,
  PHASER_STAGES: 16,
  PHASER_FEEDBACK: 17,
  CHORUS_ENABLED: 18,
  CHORUS_RATE: 19,
  CHORUS_DEPTH: 20,
  CHORUS_VOICES: 21,
  CHORUS_MIX: 22,
  PITCH_ENABLED: 23,
  PITCH_SEMITONES: 24,
  PITCH_MIX: 25,
  HARM_ENABLED: 26,
  HARM_VOICE1: 27,
  HARM_VOICE2: 28,
  HARM_DETUNE: 29,
  HARM_MIX: 30,
  DELAY_ENABLED: 31,
  DELAY_TIME_L: 32,
  DELAY_TIME_R: 33,
  DELAY_FEEDBACK: 34,
  DELAY_MIX: 35,
  DELAY_FREEZE: 36,
  DELAY_PITCH_L: 37,
  DELAY_PITCH_R: 38,
  REVERB_ENABLED: 39,
  REVERB_TYPE: 40,
  REVERB_DECAY: 41,
  REVERB_SHIMMER: 42,
  REVERB_SHIMMER_INT: 43,
  REVERB_MIX: 44,
  REVERB_FREEZE: 45,
  EQ_ENABLED: 46,
  EQ_LOW: 47,
  EQ_MID: 48,
  EQ_HIGH: 49,
  EQ_TILT: 50,
  EXCITER_ENABLED: 51,
  EXCITER_WARMTH: 52,
  EXCITER_PRESENCE: 53,
  EXCITER_AIR: 54,
  TREM_ENABLED: 55,
  TREM_RATE: 56,
  TREM_DEPTH: 57,
  TREM_WAVEFORM: 58,
  MIX: 59,
  OUTPUT_LEVEL: 60,
  PRESET: 61,
  BYPASS: 62,
}

// Parameter definitions for MIDI mapping dialog
const PASSIONFX_PARAMS: PluginParamDef[] = [
  { index: PARAM.GATE_THRESHOLD, name: 'Gate Threshold', symbol: 'gateThreshold' },
  { index: PARAM.COMP_THRESHOLD, name: 'Comp Threshold', symbol: 'compThreshold' },
  { index: PARAM.COMP_RATIO, name: 'Comp Ratio', symbol: 'compRatio' },
  { index: PARAM.WAH_POSITION, name: 'Wah Position', symbol: 'wahPosition' },
  { index: PARAM.WAH_Q, name: 'Wah Q', symbol: 'wahQ' },
  { index: PARAM.PHASER_RATE, name: 'Phaser Rate', symbol: 'phaserRate' },
  { index: PARAM.PHASER_DEPTH, name: 'Phaser Depth', symbol: 'phaserDepth' },
  { index: PARAM.CHORUS_RATE, name: 'Chorus Rate', symbol: 'chorusRate' },
  { index: PARAM.CHORUS_DEPTH, name: 'Chorus Depth', symbol: 'chorusDepth' },
  { index: PARAM.CHORUS_MIX, name: 'Chorus Mix', symbol: 'chorusMix' },
  { index: PARAM.PITCH_SEMITONES, name: 'Pitch Semitones', symbol: 'pitchSemitones' },
  { index: PARAM.PITCH_MIX, name: 'Pitch Mix', symbol: 'pitchMix' },
  { index: PARAM.HARM_VOICE1, name: 'Harm Voice 1', symbol: 'harmVoice1Interval' },
  { index: PARAM.HARM_VOICE2, name: 'Harm Voice 2', symbol: 'harmVoice2Interval' },
  { index: PARAM.HARM_DETUNE, name: 'Harm Detune', symbol: 'harmDetuneCents' },
  { index: PARAM.DELAY_TIME_L, name: 'Delay Time L', symbol: 'delayTimeL' },
  { index: PARAM.DELAY_FEEDBACK, name: 'Delay Feedback', symbol: 'delayFeedback' },
  { index: PARAM.DELAY_MIX, name: 'Delay Mix', symbol: 'delayMix' },
  { index: PARAM.REVERB_DECAY, name: 'Reverb Decay', symbol: 'reverbDecay' },
  { index: PARAM.REVERB_SHIMMER, name: 'Reverb Shimmer', symbol: 'reverbShimmerAmount' },
  { index: PARAM.REVERB_MIX, name: 'Reverb Mix', symbol: 'reverbMix' },
  { index: PARAM.EQ_LOW, name: 'EQ Low', symbol: 'eqLowGain' },
  { index: PARAM.EQ_MID, name: 'EQ Mid', symbol: 'eqMidGain' },
  { index: PARAM.EQ_HIGH, name: 'EQ High', symbol: 'eqHighGain' },
  { index: PARAM.EXCITER_WARMTH, name: 'Exciter Warmth', symbol: 'exciterWarmth' },
  { index: PARAM.EXCITER_PRESENCE, name: 'Exciter Presence', symbol: 'exciterPresence' },
  { index: PARAM.EXCITER_AIR, name: 'Exciter Air', symbol: 'exciterAir' },
  { index: PARAM.TREM_RATE, name: 'Trem Rate', symbol: 'tremRate' },
  { index: PARAM.TREM_DEPTH, name: 'Trem Depth', symbol: 'tremDepth' },
  { index: PARAM.MIX, name: 'Mix', symbol: 'mix' },
  { index: PARAM.OUTPUT_LEVEL, name: 'Output Level', symbol: 'outputLevel' },
]

// Display helpers
function intervalLabel(semitones: number): string {
  const intervals: Record<number, string> = {
    '-12': '-Oct', '-7': '-5th', '-5': '-4th', '-4': '-3rd', '-3': '-m3',
    '0': 'Uni', '3': 'm3', '4': '3rd', '5': '4th', '7': '5th',
    '8': 'm6', '9': '6th', '12': 'Oct',
  }
  return intervals[String(semitones)] || ((semitones > 0 ? '+' : '') + semitones + 'st')
}

function pitchLabel(semitones: number): string {
  if (semitones === 0) return '0'
  if (semitones === 12) return '+Oct'
  if (semitones === -12) return '-Oct'
  if (semitones === 24) return '+2Oct'
  if (semitones === -24) return '-2Oct'
  return (semitones > 0 ? '+' : '') + semitones
}

// Signal chain module definitions
const SIGNAL_CHAIN = [
  { id: 'gate', label: 'GATE', mfr: 'Classic', color: '#4caf50' },
  { id: 'comp', label: 'COMP', mfr: 'UREI', color: '#66bb6a' },
  { id: 'wah', label: 'WAH', mfr: 'Cry Baby', color: '#81c784' },
  { id: 'phaser', label: 'PHASE', mfr: 'MXR', color: '#a5d6a7' },
  { id: 'chorus', label: 'CHOR', mfr: 'TC', color: '#00e676' },
  { id: 'pitch', label: 'PITCH', mfr: 'DigiTech', color: '#69f0ae' },
  { id: 'harm', label: 'HARM', mfr: 'Studio', color: '#00c853' },
  { id: 'delay', label: 'DELAY', mfr: 'TC 2290', color: '#00bfa5' },
  { id: 'reverb', label: 'VERB', mfr: 'Rack', color: '#1de9b6' },
  { id: 'eq', label: 'EQ', mfr: 'API', color: '#64ffda' },
  { id: 'exciter', label: 'EXCITE', mfr: 'Aphex', color: '#a7ffeb' },
  { id: 'trem', label: 'TREM', mfr: 'Fender', color: '#b9f6ca' },
] as const

// Map chain ID to enabled parameter key
const CHAIN_ENABLED_MAP: Record<string, keyof typeof PARAM> = {
  gate: 'GATE_ENABLED',
  comp: 'COMP_ENABLED',
  wah: 'WAH_ENABLED',
  phaser: 'PHASER_ENABLED',
  chorus: 'CHORUS_ENABLED',
  pitch: 'PITCH_ENABLED',
  harm: 'HARM_ENABLED',
  delay: 'DELAY_ENABLED',
  reverb: 'REVERB_ENABLED',
  eq: 'EQ_ENABLED',
  exciter: 'EXCITER_ENABLED',
  trem: 'TREM_ENABLED',
}

interface PassionFXCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function PassionFXCardBase({
  plugin,
  accentColor = '#00c853', // Vai green
  compact = false,
  onOpenMidiMappings,
}: PassionFXCardProps) {
  const {
    parameters,
    metering,
    presets,
    currentPreset,
    // Gate
    setGateEnabled,
    setGateThreshold,
    // Comp
    setCompEnabled,
    setCompThreshold,
    setCompRatio,
    setCompGlassy,
    // Wah
    setWahEnabled,
    setWahPosition,
    setWahQ,
    // Phaser
    setPhaserEnabled,
    setPhaserRate,
    setPhaserDepth,
    // Chorus
    setChorusEnabled,
    setChorusRate,
    setChorusDepth,
    setChorusMix,
    // Pitch
    setPitchEnabled,
    setPitchSemitones,
    setPitchMix,
    // Harmonizer
    setHarmEnabled,
    setHarmVoice1Interval,
    setHarmVoice2Interval,
    setHarmDetuneCents,
    // Delay
    setDelayEnabled,
    setDelayTimeL,
    setDelayFeedback,
    setDelayMix,
    // Reverb
    setReverbEnabled,
    setReverbDecay,
    setReverbShimmerAmount,
    setReverbMix,
    // EQ
    setEqEnabled,
    setEqLowGain,
    setEqMidGain,
    setEqHighGain,
    // Exciter
    setExciterEnabled,
    setExciterWarmth,
    setExciterPresence,
    setExciterAir,
    // Tremolo
    setTremEnabled,
    setTremRate,
    setTremDepth,
    // Master
    setMix,
    setBypass,
    setPreset,
    isConnected,
  } = usePassionFX()

  // Module enabled states for the chain indicator
  const moduleEnabled: Record<string, boolean> = {
    gate: parameters.gateEnabled,
    comp: parameters.compEnabled,
    wah: parameters.wahEnabled,
    phaser: parameters.phaserEnabled,
    chorus: parameters.chorusEnabled,
    pitch: parameters.pitchEnabled,
    harm: parameters.harmEnabled,
    delay: parameters.delayEnabled,
    reverb: parameters.reverbEnabled,
    eq: parameters.eqEnabled,
    exciter: parameters.exciterEnabled,
    trem: parameters.tremEnabled,
  }

  // Toggle handler map
  const moduleToggle: Record<string, (v: boolean) => void> = {
    gate: setGateEnabled,
    comp: setCompEnabled,
    wah: setWahEnabled,
    phaser: setPhaserEnabled,
    chorus: setChorusEnabled,
    pitch: setPitchEnabled,
    harm: setHarmEnabled,
    delay: setDelayEnabled,
    reverb: setReverbEnabled,
    eq: setEqEnabled,
    exciter: setExciterEnabled,
    trem: setTremEnabled,
  }

  // Signal chain visualization
  const signalChainVisualization = (
    <div className="passionfx-visualization">
      {/* Tie-dye animated background overlay */}
      <div className="passionfx-tiedye-bg" />

      {/* Signal chain indicator */}
      <div className="passionfx-signal-chain">
        <span className="passionfx-chain-label">IN</span>
        {SIGNAL_CHAIN.map((module, i) => {
          const enabled = moduleEnabled[module.id]
          return (
            <div key={module.id} className="passionfx-chain-node-wrapper">
              {i > 0 && (
                <div className={`passionfx-chain-line ${enabled ? 'active' : ''}`} />
              )}
              <button
                className={`passionfx-chain-dot ${enabled ? 'active' : ''}`}
                style={{ '--dot-color': module.color } as React.CSSProperties}
                onClick={() => moduleToggle[module.id](!enabled)}
                title={`${module.label} (${module.mfr}) - Click to ${enabled ? 'disable' : 'enable'}`}
              >
                <span className="passionfx-chain-dot-label">{module.label}</span>
              </button>
            </div>
          )
        })}
        <div className="passionfx-chain-line active" />
        <span className="passionfx-chain-label">OUT</span>
      </div>
    </div>
  )

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={parameters.bypass}
      onBypassToggle={() => setBypass(!parameters.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={signalChainVisualization}
      compact={compact}
      customHeader={
        <div className="passionfx-card-header">
          <span className="passionfx-card-title">PASSION FX</span>
          <span className="passionfx-card-subtitle">Multi-Effect Processor</span>
        </div>
      }
    >
      {/* Preset Selector */}
      <div className="passionfx-preset-section">
        <select
          className="passionfx-preset-select"
          value={currentPreset.id}
          onChange={(e) => setPreset(e.target.value)}
          style={{ borderColor: accentColor }}
        >
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name} {preset.track ? `- ${preset.track}` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Master Mix */}
      <ParameterSection title="Master" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Mix"
            value={parameters.mix}
            min={0}
            max={100}
            defaultValue={100}
            unit="%"
            onChange={setMix}
            accentColor={accentColor}
            size="large"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.MIX }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Gate - BOSS */}
      <ParameterSection
        title="Gate"
        accentColor="#4caf50"
        collapsible
        defaultCollapsed={!parameters.gateEnabled}
      >
        <div className="passionfx-section-mfr">CLASSIC</div>
        <ParameterRow>
          <ParameterKnob
            label="Threshold"
            value={parameters.gateThreshold}
            min={-80}
            max={0}
            defaultValue={-40}
            unit="dB"
            onChange={setGateThreshold}
            accentColor="#4caf50"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.GATE_THRESHOLD }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Compressor - UREI */}
      <ParameterSection
        title="Compressor"
        accentColor="#66bb6a"
        collapsible
        defaultCollapsed={!parameters.compEnabled}
      >
        <div className="passionfx-section-mfr">UREI</div>
        <ParameterRow>
          <ParameterKnob
            label="Thresh"
            value={parameters.compThreshold}
            min={-60}
            max={0}
            defaultValue={-20}
            unit="dB"
            onChange={setCompThreshold}
            accentColor="#66bb6a"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.COMP_THRESHOLD }}
          />
          <ParameterKnob
            label="Ratio"
            value={parameters.compRatio}
            min={1}
            max={20}
            defaultValue={4}
            unit=":1"
            onChange={setCompRatio}
            accentColor="#66bb6a"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.COMP_RATIO }}
          />
        </ParameterRow>
        <div className="passionfx-toggle-row">
          <button
            className={`passionfx-toggle-btn ${parameters.compGlassy ? 'active' : ''}`}
            onClick={() => setCompGlassy(!parameters.compGlassy)}
            style={{ '--toggle-color': '#66bb6a' } as React.CSSProperties}
          >
            Glassy
          </button>
        </div>
      </ParameterSection>

      {/* Wah - Cry Baby */}
      <ParameterSection
        title="Wah"
        accentColor="#81c784"
        collapsible
        defaultCollapsed={!parameters.wahEnabled}
      >
        <div className="passionfx-section-mfr">Cry Baby</div>
        <ParameterRow>
          <ParameterKnob
            label="Position"
            value={parameters.wahPosition}
            min={0}
            max={100}
            defaultValue={50}
            unit="%"
            onChange={setWahPosition}
            accentColor="#81c784"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.WAH_POSITION }}
          />
          <ParameterKnob
            label="Q"
            value={parameters.wahQ}
            min={0.5}
            max={10}
            defaultValue={3}
            unit=""
            onChange={setWahQ}
            accentColor="#81c784"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.WAH_Q }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Phaser - MXR */}
      <ParameterSection
        title="Phaser"
        accentColor="#a5d6a7"
        collapsible
        defaultCollapsed={!parameters.phaserEnabled}
      >
        <div className="passionfx-section-mfr">MXR</div>
        <ParameterRow>
          <ParameterKnob
            label="Rate"
            value={parameters.phaserRate}
            min={0.05}
            max={10}
            defaultValue={0.5}
            unit="Hz"
            onChange={setPhaserRate}
            isLogarithmic
            accentColor="#a5d6a7"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.PHASER_RATE }}
          />
          <ParameterKnob
            label="Depth"
            value={parameters.phaserDepth}
            min={0}
            max={100}
            defaultValue={50}
            unit="%"
            onChange={setPhaserDepth}
            accentColor="#a5d6a7"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.PHASER_DEPTH }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Chorus - TC */}
      <ParameterSection
        title="Chorus"
        accentColor="#00e676"
        collapsible
        defaultCollapsed={!parameters.chorusEnabled}
      >
        <div className="passionfx-section-mfr">TC</div>
        <ParameterRow>
          <ParameterKnob
            label="Rate"
            value={parameters.chorusRate}
            min={0.1}
            max={5}
            defaultValue={0.8}
            unit="Hz"
            onChange={setChorusRate}
            isLogarithmic
            accentColor="#00e676"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.CHORUS_RATE }}
          />
          <ParameterKnob
            label="Depth"
            value={parameters.chorusDepth}
            min={0}
            max={100}
            defaultValue={40}
            unit="%"
            onChange={setChorusDepth}
            accentColor="#00e676"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.CHORUS_DEPTH }}
          />
          <ParameterKnob
            label="Mix"
            value={parameters.chorusMix}
            min={0}
            max={100}
            defaultValue={50}
            unit="%"
            onChange={setChorusMix}
            accentColor="#00e676"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.CHORUS_MIX }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Pitch Shifter - DigiTech */}
      <ParameterSection
        title="Pitch Shifter"
        accentColor="#69f0ae"
        collapsible
        defaultCollapsed={!parameters.pitchEnabled}
      >
        <div className="passionfx-section-mfr">DigiTech</div>
        <ParameterRow>
          <ParameterKnob
            label="Semi"
            value={parameters.pitchSemitones}
            min={-24}
            max={24}
            defaultValue={0}
            unit=""
            valueFormatter={(v: number) => pitchLabel(Math.round(v))}
            onChange={(v) => setPitchSemitones(Math.round(v))}
            accentColor="#69f0ae"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.PITCH_SEMITONES }}
          />
          <ParameterKnob
            label="Mix"
            value={parameters.pitchMix}
            min={0}
            max={100}
            defaultValue={50}
            unit="%"
            onChange={setPitchMix}
            accentColor="#69f0ae"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.PITCH_MIX }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Harmonizer - Eventide */}
      <ParameterSection
        title="Harmonizer"
        accentColor="#00c853"
        collapsible
        defaultCollapsed={!parameters.harmEnabled}
      >
        <div className="passionfx-section-mfr">STUDIO</div>
        <ParameterRow>
          <ParameterKnob
            label="Voice 1"
            value={parameters.harmVoice1Interval}
            min={-12}
            max={12}
            defaultValue={4}
            unit=""
            valueFormatter={(v: number) => intervalLabel(Math.round(v))}
            onChange={(v) => setHarmVoice1Interval(Math.round(v))}
            accentColor="#00c853"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.HARM_VOICE1 }}
          />
          <ParameterKnob
            label="Voice 2"
            value={parameters.harmVoice2Interval}
            min={-12}
            max={12}
            defaultValue={7}
            unit=""
            valueFormatter={(v: number) => intervalLabel(Math.round(v))}
            onChange={(v) => setHarmVoice2Interval(Math.round(v))}
            accentColor="#00c853"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.HARM_VOICE2 }}
          />
          <ParameterKnob
            label="Detune"
            value={parameters.harmDetuneCents}
            min={-50}
            max={50}
            defaultValue={0}
            unit="c"
            onChange={setHarmDetuneCents}
            accentColor="#00c853"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.HARM_DETUNE }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Delay - TC 2290 */}
      <ParameterSection
        title="Delay"
        accentColor="#00bfa5"
        collapsible
        defaultCollapsed={!parameters.delayEnabled}
      >
        <div className="passionfx-section-mfr">TC 2290</div>
        <ParameterRow>
          <ParameterKnob
            label="Time L"
            value={parameters.delayTimeL}
            min={0}
            max={2000}
            defaultValue={375}
            unit="ms"
            onChange={setDelayTimeL}
            accentColor="#00bfa5"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.DELAY_TIME_L }}
          />
          <ParameterKnob
            label="Feedback"
            value={parameters.delayFeedback}
            min={0}
            max={95}
            defaultValue={35}
            unit="%"
            onChange={setDelayFeedback}
            accentColor="#00bfa5"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.DELAY_FEEDBACK }}
          />
          <ParameterKnob
            label="Mix"
            value={parameters.delayMix}
            min={0}
            max={100}
            defaultValue={30}
            unit="%"
            onChange={setDelayMix}
            accentColor="#00bfa5"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.DELAY_MIX }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Reverb - Lexicon */}
      <ParameterSection
        title="Reverb"
        accentColor="#1de9b6"
        collapsible
        defaultCollapsed={!parameters.reverbEnabled}
      >
        <div className="passionfx-section-mfr">RACK</div>
        <ParameterRow>
          <ParameterKnob
            label="Decay"
            value={parameters.reverbDecay}
            min={0.1}
            max={30}
            defaultValue={2.5}
            unit="s"
            onChange={setReverbDecay}
            isLogarithmic
            accentColor="#1de9b6"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.REVERB_DECAY }}
          />
          <ParameterKnob
            label="Shimmer"
            value={parameters.reverbShimmerAmount}
            min={0}
            max={100}
            defaultValue={0}
            unit="%"
            onChange={setReverbShimmerAmount}
            accentColor="#1de9b6"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.REVERB_SHIMMER }}
          />
          <ParameterKnob
            label="Mix"
            value={parameters.reverbMix}
            min={0}
            max={100}
            defaultValue={25}
            unit="%"
            onChange={setReverbMix}
            accentColor="#1de9b6"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.REVERB_MIX }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* EQ - API */}
      <ParameterSection
        title="EQ"
        accentColor="#64ffda"
        collapsible
        defaultCollapsed={!parameters.eqEnabled}
      >
        <div className="passionfx-section-mfr">API</div>
        <ParameterRow>
          <ParameterKnob
            label="Low"
            value={parameters.eqLowGain}
            min={-12}
            max={12}
            defaultValue={0}
            unit="dB"
            onChange={setEqLowGain}
            accentColor="#64ffda"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.EQ_LOW }}
          />
          <ParameterKnob
            label="Mid"
            value={parameters.eqMidGain}
            min={-12}
            max={12}
            defaultValue={0}
            unit="dB"
            onChange={setEqMidGain}
            accentColor="#64ffda"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.EQ_MID }}
          />
          <ParameterKnob
            label="High"
            value={parameters.eqHighGain}
            min={-12}
            max={12}
            defaultValue={0}
            unit="dB"
            onChange={setEqHighGain}
            accentColor="#64ffda"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.EQ_HIGH }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Exciter - Aphex */}
      <ParameterSection
        title="Exciter"
        accentColor="#a7ffeb"
        collapsible
        defaultCollapsed={!parameters.exciterEnabled}
      >
        <div className="passionfx-section-mfr">Aphex</div>
        <ParameterRow>
          <ParameterKnob
            label="Warmth"
            value={parameters.exciterWarmth}
            min={0}
            max={100}
            defaultValue={30}
            unit="%"
            onChange={setExciterWarmth}
            accentColor="#a7ffeb"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.EXCITER_WARMTH }}
          />
          <ParameterKnob
            label="Presence"
            value={parameters.exciterPresence}
            min={0}
            max={100}
            defaultValue={40}
            unit="%"
            onChange={setExciterPresence}
            accentColor="#a7ffeb"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.EXCITER_PRESENCE }}
          />
          <ParameterKnob
            label="Air"
            value={parameters.exciterAir}
            min={0}
            max={100}
            defaultValue={20}
            unit="%"
            onChange={setExciterAir}
            accentColor="#a7ffeb"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.EXCITER_AIR }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Tremolo - Fender */}
      <ParameterSection
        title="Tremolo"
        accentColor="#b9f6ca"
        collapsible
        defaultCollapsed={!parameters.tremEnabled}
      >
        <div className="passionfx-section-mfr">Fender</div>
        <ParameterRow>
          <ParameterKnob
            label="Rate"
            value={parameters.tremRate}
            min={0.5}
            max={15}
            defaultValue={4}
            unit="Hz"
            onChange={setTremRate}
            isLogarithmic
            accentColor="#b9f6ca"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.TREM_RATE }}
          />
          <ParameterKnob
            label="Depth"
            value={parameters.tremDepth}
            min={0}
            max={100}
            defaultValue={50}
            unit="%"
            onChange={setTremDepth}
            accentColor="#b9f6ca"
            size="small"
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.TREM_DEPTH }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Footer with metering */}
      <div className="passionfx-footer">
        <div className="passionfx-meter-group">
          <div className="passionfx-meter-item">
            <span className="passionfx-meter-label">IN</span>
            <div className="passionfx-meter-bar-track">
              <div
                className="passionfx-meter-bar-fill"
                style={{
                  width: `${Math.max(0, Math.min(100, (metering.inputLevel + 60) * (100 / 60)))}%`,
                  background: metering.inputLevel > -6 ? '#ff5252' : accentColor,
                }}
              />
            </div>
            <span className="passionfx-meter-value">{metering.inputLevel.toFixed(1)}</span>
          </div>
          <div className="passionfx-meter-item">
            <span className="passionfx-meter-label">OUT</span>
            <div className="passionfx-meter-bar-track">
              <div
                className="passionfx-meter-bar-fill"
                style={{
                  width: `${Math.max(0, Math.min(100, (metering.outputLevel + 60) * (100 / 60)))}%`,
                  background: metering.outputLevel > -6 ? '#ff5252' : accentColor,
                }}
              />
            </div>
            <span className="passionfx-meter-value">{metering.outputLevel.toFixed(1)}</span>
          </div>
        </div>
        <div className="passionfx-meter-extras">
          <span className="passionfx-meter-badge">
            GR: {metering.compGainReduction.toFixed(1)} dB
          </span>
          <span className="passionfx-meter-badge">
            GATE: {metering.gateGain.toFixed(1)} dB
          </span>
        </div>
      </div>
    </PluginCardShell>
  )
}

// Export base component for testing
export { PassionFXCardBase as PassionFXCard }

// Export wrapped component with MIDI dialog
export default withMidiDialog(PassionFXCardBase, PASSIONFX_URI, PASSIONFX_PARAMS)
