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
import { MultiEffectCategoryLayout, type ParamSlot } from '../../Layouts/MultiEffectCategoryLayout'
import type { AdvancedSection } from '../../Base/CarbonCardShell'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import { ParameterControl } from '../../../ParameterControl'
import { requireParameterDescriptor } from '../../../../data/parameterSchema'
import type { PluginCardProps } from '../../types'


// Plugin URI for MIDI mappings
const PASSIONFX_URI = 'map2://juce/multieffect/passionfx'
const PASSIONFX_STAGES_DESCRIPTOR = requireParameterDescriptor(PASSIONFX_URI, 'phaserStages')

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

const WAH_MODE_OPTIONS = [
  { value: 0, label: 'Auto' },
  { value: 1, label: 'Manual' },
  { value: 2, label: 'Env' },
]

const REVERB_TYPE_OPTIONS = [
  { value: 0, label: 'Hall' },
  { value: 1, label: 'Plate' },
  { value: 2, label: 'Chamber' },
  { value: 3, label: 'Spring' },
  { value: 4, label: 'Shimmer' },
]

const REVERB_INTERVAL_OPTIONS = [
  { value: 5, label: '+4th' },
  { value: 7, label: '+5th' },
  { value: 12, label: '+Oct' },
  { value: 19, label: '+12th' },
  { value: 24, label: '+2Oct' },
]

const TREM_WAVEFORM_OPTIONS = [
  { value: 0, label: 'Sine' },
  { value: 1, label: 'Tri' },
  { value: 2, label: 'Square' },
  { value: 3, label: 'Saw' },
  { value: 4, label: 'S&H' },
  { value: 5, label: 'Trap' },
]

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
    setGateRelease,
    // Comp
    setCompEnabled,
    setCompThreshold,
    setCompRatio,
    setCompAttack,
    setCompRelease,
    setCompGlassy,
    // Wah
    setWahEnabled,
    setWahMode,
    setWahPosition,
    setWahQ,
    // Phaser
    setPhaserEnabled,
    setPhaserRate,
    setPhaserDepth,
    setPhaserStages,
    setPhaserFeedback,
    // Chorus
    setChorusEnabled,
    setChorusRate,
    setChorusDepth,
    setChorusVoices,
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
    setHarmMix,
    // Delay
    setDelayEnabled,
    setDelayTimeL,
    setDelayTimeR,
    setDelayFeedback,
    setDelayMix,
    setDelayFreeze,
    setDelayPitchShiftL,
    setDelayPitchShiftR,
    // Reverb
    setReverbEnabled,
    setReverbType,
    setReverbDecay,
    setReverbShimmerAmount,
    setReverbShimmerInterval,
    setReverbMix,
    setReverbFreeze,
    // EQ
    setEqEnabled,
    setEqLowGain,
    setEqMidGain,
    setEqHighGain,
    setEqTilt,
    // Exciter
    setExciterEnabled,
    setExciterWarmth,
    setExciterPresence,
    setExciterAir,
    // Tremolo
    setTremEnabled,
    setTremRate,
    setTremDepth,
    setTremWaveform,
    // Master
    setMix,
    setOutputLevel,
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

  // Primary mix control as ParamSlot
  const mixSlot: ParamSlot = {
    label: 'Mix',
    value: parameters.mix,
    min: 0,
    max: 100,
    defaultValue: 100,
    unit: '%',
    onChange: setMix,
    midi: { pluginUri: PASSIONFX_URI, paramIndex: PARAM.MIX },
  }

  const outputSlot: ParamSlot = {
    label: 'Output',
    value: parameters.outputLevel,
    min: -24,
    max: 12,
    defaultValue: 0,
    unit: 'dB',
    onChange: setOutputLevel,
    midi: { pluginUri: PASSIONFX_URI, paramIndex: PARAM.OUTPUT_LEVEL },
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

  // Preset selector
  const presetSelector = (
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
  )

  const knobSize = compact ? 'small' : 'small'

  // Signal chain modules as advanced accordion sections
  const advancedSections: AdvancedSection[] = [
    {
      id: 'gate',
      title: 'Gate (Classic)',
      defaultOpen: parameters.gateEnabled,
      children: (
        <div className="carbon-param-row">
          <ParameterKnob
            label="Threshold"
            value={parameters.gateThreshold}
            min={-80}
            max={0}
            defaultValue={-40}
            unit="dB"
            onChange={setGateThreshold}
            accentColor="#4caf50"
            size={knobSize}
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.GATE_THRESHOLD }}
          />
        </div>
      ),
    },
    {
      id: 'comp',
      title: 'Compressor (UREI)',
      defaultOpen: parameters.compEnabled,
      children: (
        <>
          <div className="carbon-param-row">
            <ParameterKnob
              label="Thresh"
              value={parameters.compThreshold}
              min={-60}
              max={0}
              defaultValue={-20}
              unit="dB"
              onChange={setCompThreshold}
              accentColor="#66bb6a"
              size={knobSize}
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
              size={knobSize}
              midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.COMP_RATIO }}
            />
          </div>
          <div className="passionfx-toggle-row">
            <button
              className={`passionfx-toggle-btn ${parameters.compGlassy ? 'active' : ''}`}
              onClick={() => setCompGlassy(!parameters.compGlassy)}
              style={{ '--toggle-color': '#66bb6a' } as React.CSSProperties}
            >
              Glassy
            </button>
          </div>
        </>
      ),
    },
    {
      id: 'wah',
      title: 'Wah (Cry Baby)',
      defaultOpen: parameters.wahEnabled,
      children: (
        <div className="carbon-param-row">
          <ParameterKnob
            label="Position"
            value={parameters.wahPosition}
            min={0}
            max={100}
            defaultValue={50}
            unit="%"
            onChange={setWahPosition}
            accentColor="#81c784"
            size={knobSize}
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
            size={knobSize}
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.WAH_Q }}
          />
        </div>
      ),
    },
    {
      id: 'phaser',
      title: 'Phaser (MXR)',
      defaultOpen: parameters.phaserEnabled,
      children: (
        <div className="carbon-param-row">
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
            size={knobSize}
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
            size={knobSize}
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.PHASER_DEPTH }}
          />
        </div>
      ),
    },
    {
      id: 'chorus',
      title: 'Chorus (TC)',
      defaultOpen: parameters.chorusEnabled,
      children: (
        <div className="carbon-param-row">
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
            size={knobSize}
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
            size={knobSize}
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
            size={knobSize}
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.CHORUS_MIX }}
          />
        </div>
      ),
    },
    {
      id: 'pitch',
      title: 'Pitch Shifter (DigiTech)',
      defaultOpen: parameters.pitchEnabled,
      children: (
        <div className="carbon-param-row">
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
            size={knobSize}
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
            size={knobSize}
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.PITCH_MIX }}
          />
        </div>
      ),
    },
    {
      id: 'harm',
      title: 'Harmonizer (Studio)',
      defaultOpen: parameters.harmEnabled,
      children: (
        <div className="carbon-param-row">
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
            size={knobSize}
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
            size={knobSize}
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
            size={knobSize}
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.HARM_DETUNE }}
          />
        </div>
      ),
    },
    {
      id: 'delay',
      title: 'Delay (TC 2290)',
      defaultOpen: parameters.delayEnabled,
      children: (
        <div className="carbon-param-row">
          <ParameterKnob
            label="Time L"
            value={parameters.delayTimeL}
            min={0}
            max={2000}
            defaultValue={375}
            unit="ms"
            onChange={setDelayTimeL}
            accentColor="#00bfa5"
            size={knobSize}
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
            size={knobSize}
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
            size={knobSize}
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.DELAY_MIX }}
          />
        </div>
      ),
    },
    {
      id: 'reverb',
      title: 'Reverb (Rack)',
      defaultOpen: parameters.reverbEnabled,
      children: (
        <div className="carbon-param-row">
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
            size={knobSize}
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
            size={knobSize}
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
            size={knobSize}
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.REVERB_MIX }}
          />
        </div>
      ),
    },
    {
      id: 'eq',
      title: 'EQ (API)',
      defaultOpen: parameters.eqEnabled,
      children: (
        <div className="carbon-param-row">
          <ParameterKnob
            label="Low"
            value={parameters.eqLowGain}
            min={-12}
            max={12}
            defaultValue={0}
            unit="dB"
            onChange={setEqLowGain}
            accentColor="#64ffda"
            size={knobSize}
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
            size={knobSize}
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
            size={knobSize}
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.EQ_HIGH }}
          />
        </div>
      ),
    },
    {
      id: 'exciter',
      title: 'Exciter (Aphex)',
      defaultOpen: parameters.exciterEnabled,
      children: (
        <div className="carbon-param-row">
          <ParameterKnob
            label="Warmth"
            value={parameters.exciterWarmth}
            min={0}
            max={100}
            defaultValue={30}
            unit="%"
            onChange={setExciterWarmth}
            accentColor="#a7ffeb"
            size={knobSize}
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
            size={knobSize}
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
            size={knobSize}
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.EXCITER_AIR }}
          />
        </div>
      ),
    },
    {
      id: 'trem',
      title: 'Tremolo (Fender)',
      defaultOpen: parameters.tremEnabled,
      children: (
        <div className="carbon-param-row">
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
            size={knobSize}
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
            size={knobSize}
            midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.TREM_DEPTH }}
          />
        </div>
      ),
    },
    {
      id: 'rack-dynamics',
      title: 'Dynamics & Wah Detail',
      defaultOpen: false,
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="carbon-param-row">
            <ParameterKnob
              label="Gate Rel"
              value={parameters.gateRelease}
              min={5}
              max={2000}
              defaultValue={100}
              unit="ms"
              onChange={setGateRelease}
              isLogarithmic
              accentColor="#4caf50"
              size={knobSize}
              midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.GATE_RELEASE }}
            />
            <ParameterKnob
              label="Comp Att"
              value={parameters.compAttack}
              min={0.01}
              max={300}
              defaultValue={10}
              unit="ms"
              onChange={setCompAttack}
              isLogarithmic
              accentColor="#66bb6a"
              size={knobSize}
              midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.COMP_ATTACK }}
            />
            <ParameterKnob
              label="Comp Rel"
              value={parameters.compRelease}
              min={10}
              max={3000}
              defaultValue={100}
              unit="ms"
              onChange={setCompRelease}
              isLogarithmic
              accentColor="#66bb6a"
              size={knobSize}
              midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.COMP_RELEASE }}
            />
          </div>
          <div className="carbon-preset-row">
            {WAH_MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={`carbon-preset-btn ${parameters.wahMode === option.value ? 'active' : ''}`}
                onClick={() => setWahMode(option.value)}
                style={parameters.wahMode === option.value ? { background: '#81c784', borderColor: '#81c784' } : undefined}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'rack-modulation',
      title: 'Modulation & Harmony Detail',
      defaultOpen: false,
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="carbon-param-row">
            <ParameterControl
              descriptor={PASSIONFX_STAGES_DESCRIPTOR}
              variant="knob"
              label="Stages"
              value={parameters.phaserStages}
              onLiveChange={setPhaserStages}
              accentColor="#a5d6a7"
              size={knobSize}
              showBounds={false}
            />
            <ParameterKnob
              label="Ph Feed"
              value={parameters.phaserFeedback}
              min={-100}
              max={100}
              defaultValue={30}
              unit="%"
              onChange={setPhaserFeedback}
              accentColor="#a5d6a7"
              size={knobSize}
              midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.PHASER_FEEDBACK }}
            />
            <ParameterKnob
              label="Voices"
              value={parameters.chorusVoices}
              min={1}
              max={6}
              defaultValue={3}
              step={1}
              unit=""
              onChange={(value) => setChorusVoices(Math.round(value))}
              accentColor="#00e676"
              size={knobSize}
              midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.CHORUS_VOICES }}
            />
          </div>
          <div className="carbon-param-row">
            <ParameterKnob
              label="Harm Mix"
              value={parameters.harmMix}
              min={0}
              max={100}
              defaultValue={50}
              unit="%"
              onChange={setHarmMix}
              accentColor="#00c853"
              size={knobSize}
              midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.HARM_MIX }}
            />
            <ParameterKnob
              label="Tilt"
              value={parameters.eqTilt}
              min={-1}
              max={1}
              defaultValue={0}
              step={0.1}
              unit=""
              onChange={setEqTilt}
              accentColor="#64ffda"
              size={knobSize}
              midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.EQ_TILT }}
            />
          </div>
        </div>
      ),
    },
    {
      id: 'rack-time-space',
      title: 'Delay, Reverb & Trem Detail',
      defaultOpen: false,
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="carbon-param-row">
            <ParameterKnob
              label="Time R"
              value={parameters.delayTimeR}
              min={1}
              max={8000}
              defaultValue={500}
              unit="ms"
              onChange={setDelayTimeR}
              accentColor="#00bfa5"
              size={knobSize}
              midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.DELAY_TIME_R }}
            />
            <ParameterKnob
              label="Pitch L"
              value={parameters.delayPitchShiftL}
              min={-12}
              max={12}
              defaultValue={0}
              unit="st"
              onChange={(value) => setDelayPitchShiftL(Math.round(value))}
              accentColor="#00bfa5"
              size={knobSize}
              midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.DELAY_PITCH_L }}
            />
            <ParameterKnob
              label="Pitch R"
              value={parameters.delayPitchShiftR}
              min={-12}
              max={12}
              defaultValue={0}
              unit="st"
              onChange={(value) => setDelayPitchShiftR(Math.round(value))}
              accentColor="#00bfa5"
              size={knobSize}
              midi={{ pluginUri: PASSIONFX_URI, paramIndex: PARAM.DELAY_PITCH_R }}
            />
          </div>
          <div className="carbon-preset-row">
            {REVERB_TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={`carbon-preset-btn ${parameters.reverbType === option.value ? 'active' : ''}`}
                onClick={() => setReverbType(option.value)}
                style={parameters.reverbType === option.value ? { background: '#1de9b6', borderColor: '#1de9b6' } : undefined}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="carbon-preset-row">
            {REVERB_INTERVAL_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={`carbon-preset-btn ${parameters.reverbShimmerInterval === option.value ? 'active' : ''}`}
                onClick={() => setReverbShimmerInterval(option.value)}
                style={parameters.reverbShimmerInterval === option.value ? { background: '#1de9b6', borderColor: '#1de9b6' } : undefined}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="carbon-preset-row">
            {TREM_WAVEFORM_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={`carbon-preset-btn ${parameters.tremWaveform === option.value ? 'active' : ''}`}
                onClick={() => setTremWaveform(option.value)}
                style={parameters.tremWaveform === option.value ? { background: '#b9f6ca', borderColor: '#b9f6ca' } : undefined}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="carbon-param-row">
            <button
              className={`carbon-toggle-btn ${parameters.delayFreeze ? 'active' : ''}`}
              onClick={() => setDelayFreeze(!parameters.delayFreeze)}
              style={parameters.delayFreeze ? { background: '#00bfa5', borderColor: '#00bfa5' } : undefined}
            >
              Delay Freeze
            </button>
            <button
              className={`carbon-toggle-btn ${parameters.reverbFreeze ? 'active' : ''}`}
              onClick={() => setReverbFreeze(!parameters.reverbFreeze)}
              style={parameters.reverbFreeze ? { background: '#1de9b6', borderColor: '#1de9b6' } : undefined}
            >
              Reverb Freeze
            </button>
          </div>
        </div>
      ),
    },
  ]

  // Extra content: footer with metering
  const extraContent = (
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
  )

  return (
    <MultiEffectCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={parameters.bypass}
      onBypassToggle={() => setBypass(!parameters.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={signalChainVisualization}
      outputGain={outputSlot}
      mix={mixSlot}
      inputLevel={metering.inputLevel}
      outputLevel={metering.outputLevel}
      advancedSections={advancedSections}
      presets={presetSelector}
      extraContent={extraContent}
      cardWidth={860}
    />
  )
}

// Export base component for testing
export { PassionFXCardBase as PassionFXCard }

// Export wrapped component with MIDI dialog
export default withMidiDialog(PassionFXCardBase, PASSIONFX_URI, PASSIONFX_PARAMS)
