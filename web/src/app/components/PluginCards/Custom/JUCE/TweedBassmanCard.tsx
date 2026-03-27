/**
 * TweedBassmanCard - Fender Bassman 5F6-A Tube Amplifier Simulator
 *
 * Warm tweed aesthetic with schematic-based visualization showing
 * the complete signal path: channel mixer -> V1 -> V2A -> V2B ->
 * tone stack -> phase inverter -> push-pull power amp -> rectifier sag.
 *
 * The visualization renders a simplified circuit schematic with
 * live tube glow and signal flow animation.
 */

import {
  useTweedBassman,
  TWEED_BASSMAN_PRESETS,
  CHANNEL_MODES,
  V1_TUBE_TYPES,
  CATHODE_BIAS_MODES,
  NFB_MODES,
  POWER_TUBE_TYPES,
  BIAS_MODES,
  RECTIFIER_TYPES,
  CABINET_IRS,
} from '../../../../hooks/useTweedBassman'
import { NumberInput } from '../../../ParameterControl'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import { AmplifierCategoryLayout, type ParamSlot } from '../../Layouts/AmplifierCategoryLayout'
import type { AdvancedSection } from '../../Base/CarbonCardShell'
import type { PluginCardProps } from '../../types'

// Plugin URI for MIDI mappings
const BASSMAN_URI = 'map2://juce/amp/tweedbassman'

// Accent colors: warm tweed gold
const ACCENT = '#D4A847'
const TONE_COLOR = '#C49A3C'
const POWER_COLOR = '#B85C38'

// Parameter indices (must match juce_processors.json order)
const PARAM = {
  CHANNEL_MODE: 0,
  NORMAL_VOLUME: 1,
  BRIGHT_VOLUME: 2,
  TREBLE: 3,
  MID: 4,
  BASS: 5,
  MASTER_VOLUME: 6,
  PRESENCE: 7,
  OUTPUT_LEVEL: 8,
  BYPASS: 9,
}

// Parameter definitions for MIDI mapping dialog
const BASSMAN_PARAMS: PluginParamDef[] = [
  { index: PARAM.NORMAL_VOLUME, name: 'Normal Volume', symbol: 'normalVolume' },
  { index: PARAM.BRIGHT_VOLUME, name: 'Bright Volume', symbol: 'brightVolume' },
  { index: PARAM.TREBLE, name: 'Treble', symbol: 'treble' },
  { index: PARAM.MID, name: 'Mid', symbol: 'mid' },
  { index: PARAM.BASS, name: 'Bass', symbol: 'bass' },
  { index: PARAM.MASTER_VOLUME, name: 'Master Volume', symbol: 'masterVolume' },
  { index: PARAM.PRESENCE, name: 'Presence', symbol: 'presence' },
  { index: PARAM.OUTPUT_LEVEL, name: 'Output Level', symbol: 'outputLevel' },
]

interface TweedBassmanCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function TweedBassmanCardBase({
  plugin,
  accentColor = ACCENT,
  compact = false,
  onOpenMidiMappings,
}: TweedBassmanCardProps) {
  const {
    parameters,
    metering,
    presets,
    currentPreset,
    setChannelMode,
    setNormalVolume,
    setBrightVolume,
    setBrightCap,
    setV1TubeType,
    setCathodeBypass,
    setCathodeBias,
    setTreble,
    setMid,
    setBass,
    setRawSwitch,
    setMasterVolume,
    setPresence,
    setNFBMode,
    setPowerTubeType,
    setBiasMode,
    setRectifierType,
    setOutputLevel,
    setCabinetEnabled,
    setCabinetIR,
    setBypass,
    setPreset,
  } = useTweedBassman()

  // Calculate tube glow intensities from parameters
  const preampIntensity = Math.min(1, (parameters.normalVolume + parameters.brightVolume) / 15)
  const v1Intensity = preampIntensity * (parameters.v1TubeType === 1 ? 1.3 : 1.0) // 12AX7 glows hotter
  const powerIntensity = Math.min(1, parameters.masterVolume / 8)
  const sagLevel = metering.supplySag

  // Schematic visualization - simplified Bassman 5F6-A circuit
  const schematicVisualization = (
    <div className="bassman-schematic">
      <svg viewBox="0 0 320 100" className="bassman-schematic-svg">
        <defs>
          <radialGradient id="bsmnTubeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFB040" stopOpacity="0.7" />
            <stop offset="60%" stopColor="#FF8800" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#FF6600" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="bsmnPowerGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FF6633" stopOpacity="0.8" />
            <stop offset="60%" stopColor="#FF4400" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#FF2200" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="bsmnMeter" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.9" />
            <stop offset="80%" stopColor={accentColor} stopOpacity="0.5" />
            <stop offset="100%" stopColor="#FF8800" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* Background */}
        <rect x="0" y="0" width="320" height="100" rx="3" fill="#0D0B08" />
        <rect x="1" y="1" width="318" height="98" rx="2" fill="none" stroke="#3A3228" strokeWidth="0.5" />

        {/* Signal flow line */}
        <path
          className="bassman-signal-line"
          d="M 15,50 L 45,50 L 55,35 L 95,35 L 105,50 L 135,50 L 145,35 L 175,35 L 185,50 L 215,50 L 230,35 L 260,35 L 270,50 L 305,50"
          fill="none"
          stroke={accentColor}
          strokeWidth="0.8"
          opacity="0.3"
        />

        {/* INPUT jack */}
        <circle cx="15" cy="50" r="4" fill="none" stroke="#8B7355" strokeWidth="1" />
        <circle cx="15" cy="50" r="1.5" fill="#8B7355" />
        <text x="15" y="62" textAnchor="middle" fontSize="5" fill="#8B7355" fontWeight="600">IN</text>

        {/* Channel Mixer block */}
        <rect x="30" y="40" width="22" height="20" rx="2" fill="none" stroke="#8B7355" strokeWidth="0.6" />
        <text x="41" y="52" textAnchor="middle" fontSize="4.5" fill="#8B7355" fontWeight="600">CH</text>
        {/* Channel mode indicator dots */}
        {[0, 1, 2].map((ch) => (
          <circle
            key={`ch${ch}`}
            cx={35 + ch * 6}
            cy="65"
            r="2"
            fill={parameters.channelMode === ch ? accentColor : '#3A3228'}
            opacity={parameters.channelMode === ch ? 1 : 0.5}
          />
        ))}

        {/* V1 - Input Tube (12AY7 stock) */}
        <g>
          <circle
            className="tube-glow"
            cx="72"
            cy="35"
            r={7 + v1Intensity * 4}
            fill="url(#bsmnTubeGlow)"
            opacity={0.3 + v1Intensity * 0.5}
          />
          <circle cx="72" cy="35" r="5" fill="none" stroke="#8B7355" strokeWidth="0.6" />
          {/* Triode symbol: grid lines */}
          <line x1="68" y1="35" x2="76" y2="35" stroke="#8B7355" strokeWidth="0.4" strokeDasharray="1.5 1" />
          <circle cx="72" cy="35" r="1.5" fill={`rgba(255, ${160 + v1Intensity * 60}, 0, ${0.4 + v1Intensity * 0.4})`} />
          <text x="72" y="48" textAnchor="middle" fontSize="5" fill="#D4A847" fontWeight="600">V1</text>
          <text x="72" y="55" textAnchor="middle" fontSize="4" fill="#8B7355">{V1_TUBE_TYPES[parameters.v1TubeType]}</text>
        </g>

        {/* Coupling cap symbol */}
        <line x1="80" y1="33" x2="80" y2="37" stroke="#8B7355" strokeWidth="0.8" />
        <line x1="82" y1="33" x2="82" y2="37" stroke="#8B7355" strokeWidth="0.8" />

        {/* Cathode resistor (R_k) */}
        <path d="M 69,42 L 69,44 L 67,45 L 71,46 L 67,47 L 71,48 L 69,49 L 69,51" fill="none" stroke="#8B7355" strokeWidth="0.4" />
        {parameters.cathodeBypass && (
          <text x="62" y="49" fontSize="4" fill={accentColor}>C</text>
        )}

        {/* V2A - Gain Stage (12AX7) */}
        <g>
          <circle
            className="tube-glow"
            cx="110"
            cy="35"
            r={7 + preampIntensity * 4}
            fill="url(#bsmnTubeGlow)"
            opacity={0.3 + preampIntensity * 0.5}
          />
          <circle cx="110" cy="35" r="5" fill="none" stroke="#8B7355" strokeWidth="0.6" />
          <line x1="106" y1="35" x2="114" y2="35" stroke="#8B7355" strokeWidth="0.4" strokeDasharray="1.5 1" />
          <circle cx="110" cy="35" r="1.5" fill={`rgba(255, ${140 + preampIntensity * 80}, 0, ${0.4 + preampIntensity * 0.5})`} />
          <text x="110" y="48" textAnchor="middle" fontSize="5" fill="#D4A847" fontWeight="600">V2A</text>
          <text x="110" y="55" textAnchor="middle" fontSize="4" fill="#8B7355">12AX7</text>
        </g>

        {/* V2B - Cathode Follower */}
        <g>
          <circle
            className="tube-glow"
            cx="145"
            cy="35"
            r={6 + preampIntensity * 3}
            fill="url(#bsmnTubeGlow)"
            opacity={0.2 + preampIntensity * 0.3}
          />
          <circle cx="145" cy="35" r="5" fill="none" stroke="#8B7355" strokeWidth="0.6" />
          <line x1="141" y1="35" x2="149" y2="35" stroke="#8B7355" strokeWidth="0.4" strokeDasharray="1.5 1" />
          <circle cx="145" cy="35" r="1.5" fill={`rgba(255, ${160 + preampIntensity * 40}, 0, ${0.3 + preampIntensity * 0.3})`} />
          <text x="145" y="48" textAnchor="middle" fontSize="5" fill="#D4A847" fontWeight="600">V2B</text>
          <text x="145" y="55" textAnchor="middle" fontSize="4" fill="#8B7355">CF</text>
        </g>

        {/* Tone Stack block */}
        <rect x="165" y="40" width="28" height="20" rx="2" fill="none" stroke={TONE_COLOR} strokeWidth="0.6" />
        <text x="179" y="48" textAnchor="middle" fontSize="4" fill={TONE_COLOR} fontWeight="600">TONE</text>
        <text x="179" y="55" textAnchor="middle" fontSize="3.5" fill="#8B7355">TMB</text>
        {parameters.rawSwitch && (
          <line x1="165" y1="40" x2="193" y2="60" stroke="#D4A847" strokeWidth="0.8" opacity="0.6" />
        )}

        {/* V3 - Phase Inverter */}
        <g>
          <circle cx="210" cy="35" r="5" fill="none" stroke="#8B7355" strokeWidth="0.6" />
          <line x1="206" y1="35" x2="214" y2="35" stroke="#8B7355" strokeWidth="0.4" strokeDasharray="1.5 1" />
          <circle cx="210" cy="35" r="1.5" fill={`rgba(255, ${160 + powerIntensity * 40}, 0, ${0.3 + powerIntensity * 0.3})`} />
          <text x="210" y="48" textAnchor="middle" fontSize="5" fill="#D4A847" fontWeight="600">V3</text>
          <text x="210" y="55" textAnchor="middle" fontSize="4" fill="#8B7355">PI</text>
          {/* Split output lines (push-pull) */}
          <line x1="215" y1="32" x2="228" y2="28" stroke="#8B7355" strokeWidth="0.4" />
          <line x1="215" y1="38" x2="228" y2="42" stroke="#8B7355" strokeWidth="0.4" />
        </g>

        {/* Power tubes V4/V5 (push-pull pair) */}
        <g>
          <circle
            className="tube-glow"
            cx="245"
            cy="28"
            r={8 + powerIntensity * 5}
            fill="url(#bsmnPowerGlow)"
            opacity={0.2 + powerIntensity * 0.4}
          />
          <circle cx="245" cy="28" r="6" fill="none" stroke="#8B7355" strokeWidth="0.6" />
          <circle cx="245" cy="28" r="2" fill={`rgba(255, ${100 + powerIntensity * 80}, 0, ${0.3 + powerIntensity * 0.5})`} />

          <circle
            className="tube-glow"
            cx="245"
            cy="52"
            r={8 + powerIntensity * 5}
            fill="url(#bsmnPowerGlow)"
            opacity={0.2 + powerIntensity * 0.4}
          />
          <circle cx="245" cy="52" r="6" fill="none" stroke="#8B7355" strokeWidth="0.6" />
          <circle cx="245" cy="52" r="2" fill={`rgba(255, ${100 + powerIntensity * 80}, 0, ${0.3 + powerIntensity * 0.5})`} />

          <text x="245" y="72" textAnchor="middle" fontSize="5" fill={POWER_COLOR} fontWeight="600">V4/V5</text>
          <text x="245" y="79" textAnchor="middle" fontSize="4" fill="#8B7355">{POWER_TUBE_TYPES[parameters.powerTubeType]}</text>
        </g>

        {/* Output Transformer symbol */}
        <g>
          <path d="M 260,35 Q 265,30 260,25 Q 255,20 260,15" fill="none" stroke="#8B7355" strokeWidth="0.6" />
          <path d="M 268,35 Q 273,30 268,25 Q 263,20 268,15" fill="none" stroke="#8B7355" strokeWidth="0.6" />
          <line x1="264" y1="13" x2="264" y2="37" stroke="#8B7355" strokeWidth="0.4" />
          <text x="264" y="11" textAnchor="middle" fontSize="3.5" fill="#8B7355">OT</text>
        </g>

        {/* Rectifier */}
        <rect x="275" y="62" width="20" height="12" rx="2" fill="none" stroke={POWER_COLOR} strokeWidth="0.5" />
        <text x="285" y="71" textAnchor="middle" fontSize="4" fill={POWER_COLOR} fontWeight="600">
          {RECTIFIER_TYPES[parameters.rectifierType].substring(0, 4)}
        </text>

        {/* Supply sag bar */}
        <rect x="275" y="78" width={20 * sagLevel} height="3" fill={accentColor} opacity="0.5" rx="1" />
        <text x="275" y="87" fontSize="3.5" fill="#8B7355">SAG</text>

        {/* NFB feedback loop (dashed line from OT back to PI) */}
        <path
          d="M 268,37 L 268,88 L 210,88 L 210,42"
          fill="none"
          stroke={accentColor}
          strokeWidth="0.5"
          strokeDasharray="2 2"
          opacity={parameters.nfbMode === 1 ? 0.1 : 0.4}
        />
        <text x="240" y="94" textAnchor="middle" fontSize="3.5" fill="#8B7355">NFB {NFB_MODES[parameters.nfbMode].split(' ')[0]}</text>

        {/* OUTPUT jack */}
        <circle cx="305" cy="50" r="4" fill="none" stroke="#8B7355" strokeWidth="1" />
        <circle cx="305" cy="50" r="1.5" fill="#8B7355" />
        <text x="305" y="62" textAnchor="middle" fontSize="5" fill="#8B7355" fontWeight="600">OUT</text>

        {/* Input level meter */}
        <rect x="6" y={85 - Math.max(0, (metering.inputLevel + 60) * 1.0)} width="3" height={Math.max(0, (metering.inputLevel + 60) * 1.0)} fill="url(#bsmnMeter)" rx="1" />

        {/* Output level meter */}
        <rect x="311" y={85 - Math.max(0, (metering.outputLevel + 60) * 1.0)} width="3" height={Math.max(0, (metering.outputLevel + 60) * 1.0)} fill="url(#bsmnMeter)" rx="1" />
      </svg>

      <div className="bassman-schematic-labels">
        <span>INPUT</span>
        <span>PREAMP</span>
        <span>TONE</span>
        <span>POWER</span>
        <span>OUTPUT</span>
      </div>
    </div>
  )

  // Map parameters to AmplifierCategoryLayout slots
  const inputGain: ParamSlot = {
    label: 'NORMAL',
    value: parameters.normalVolume,
    min: 0,
    max: 10,
    defaultValue: 5,
    step: 0.1,
    onChange: setNormalVolume,
    midi: { pluginUri: BASSMAN_URI, paramIndex: PARAM.NORMAL_VOLUME },
  }

  const bassSlot: ParamSlot = {
    label: 'BASS',
    value: parameters.bass,
    min: 0,
    max: 10,
    defaultValue: 5,
    step: 0.1,
    onChange: setBass,
    midi: { pluginUri: BASSMAN_URI, paramIndex: PARAM.BASS },
  }

  const midSlot: ParamSlot = {
    label: 'MID',
    value: parameters.mid,
    min: 0,
    max: 10,
    defaultValue: 5,
    step: 0.1,
    onChange: setMid,
    midi: { pluginUri: BASSMAN_URI, paramIndex: PARAM.MID },
  }

  const trebleSlot: ParamSlot = {
    label: 'TREBLE',
    value: parameters.treble,
    min: 0,
    max: 10,
    defaultValue: 5,
    step: 0.1,
    onChange: setTreble,
    midi: { pluginUri: BASSMAN_URI, paramIndex: PARAM.TREBLE },
  }

  const presenceSlot: ParamSlot = {
    label: 'PRESENCE',
    value: parameters.presence,
    min: 0,
    max: 10,
    defaultValue: 5,
    step: 0.1,
    onChange: setPresence,
    midi: { pluginUri: BASSMAN_URI, paramIndex: PARAM.PRESENCE },
  }

  const masterVolumeSlot: ParamSlot = {
    label: 'MASTER',
    value: parameters.masterVolume,
    min: 0,
    max: 10,
    defaultValue: 5,
    step: 0.1,
    onChange: setMasterVolume,
    midi: { pluginUri: BASSMAN_URI, paramIndex: PARAM.MASTER_VOLUME },
  }

  const outputGainSlot: ParamSlot = {
    label: 'OUTPUT',
    value: parameters.outputLevel,
    min: -24,
    max: 6,
    defaultValue: 0,
    step: 0.5,
    unit: 'dB',
    onChange: setOutputLevel,
    valueFormatter: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`,
    midi: { pluginUri: BASSMAN_URI, paramIndex: PARAM.OUTPUT_LEVEL },
  }

  // Channel selector mapped to layout's channel prop
  const channelProp = {
    value: CHANNEL_MODES[parameters.channelMode],
    options: CHANNEL_MODES,
    onChange: (v: string) => setChannelMode(CHANNEL_MODES.indexOf(v)),
  }

  // Bright cap toggle mapped to layout's bright prop
  const brightProp = {
    enabled: parameters.brightCap,
    onToggle: () => setBrightCap(!parameters.brightCap),
  }

  // Bright Volume as extra input knob in advanced
  const brightVolumeSlot: ParamSlot = {
    label: 'BRIGHT VOL',
    value: parameters.brightVolume,
    min: 0,
    max: 10,
    defaultValue: 5,
    step: 0.1,
    onChange: setBrightVolume,
    midi: { pluginUri: BASSMAN_URI, paramIndex: PARAM.BRIGHT_VOLUME },
  }

  // Circuit Mods advanced section
  const advancedSections: AdvancedSection[] = [
    {
      id: 'bright-volume',
      title: 'Bright Channel Volume',
      children: (
        <div className="carbon-param-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
            <label style={{ fontSize: '12px', color: '#c6c6c6', minWidth: '80px' }}>Bright Vol</label>
            <NumberInput
              label="Bright Vol"
              value={brightVolumeSlot.value}
              min={0}
              max={10}
              defaultValue={5}
              step={0.1}
              precision={1}
              showLabel={false}
              showBounds={false}
              size="small"
              style={{ flex: 1 }}
              onChange={brightVolumeSlot.onChange}
            />
            <span style={{ fontSize: '11px', color: '#888', minWidth: '30px' }}>{brightVolumeSlot.value.toFixed(1)}</span>
          </div>
        </div>
      ),
    },
    {
      id: 'tone-mods',
      title: 'Tone Mods',
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            className={`carbon-toggle-btn ${parameters.rawSwitch ? 'active' : ''}`}
            onClick={() => setRawSwitch(!parameters.rawSwitch)}
            style={parameters.rawSwitch ? { background: accentColor, borderColor: accentColor } : undefined}
          >
            RAW (Bypass Tone Stack)
          </button>
        </div>
      ),
    },
    {
      id: 'circuit-mods',
      title: 'Circuit Mods',
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ fontSize: '12px', color: '#c6c6c6', minWidth: '100px' }}>V1 Tube</label>
            <select
              className="carbon-select"
              value={parameters.v1TubeType}
              onChange={(e) => setV1TubeType(parseInt(e.target.value))}
            >
              {V1_TUBE_TYPES.map((type, i) => (
                <option key={i} value={i}>{type}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ fontSize: '12px', color: '#c6c6c6', minWidth: '100px' }}>Power Tubes</label>
            <select
              className="carbon-select"
              value={parameters.powerTubeType}
              onChange={(e) => setPowerTubeType(parseInt(e.target.value))}
            >
              {POWER_TUBE_TYPES.map((type, i) => (
                <option key={i} value={i}>{type}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ fontSize: '12px', color: '#c6c6c6', minWidth: '100px' }}>Cathode Bias</label>
            <select
              className="carbon-select"
              value={parameters.cathodeBias}
              onChange={(e) => setCathodeBias(parseInt(e.target.value))}
            >
              {CATHODE_BIAS_MODES.map((mode, i) => (
                <option key={i} value={i}>{mode}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ fontSize: '12px', color: '#c6c6c6', minWidth: '100px' }}>Rectifier</label>
            <select
              className="carbon-select"
              value={parameters.rectifierType}
              onChange={(e) => setRectifierType(parseInt(e.target.value))}
            >
              {RECTIFIER_TYPES.map((type, i) => (
                <option key={i} value={i}>{type}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ fontSize: '12px', color: '#c6c6c6', minWidth: '100px' }}>NFB Mode</label>
            <select
              className="carbon-select"
              value={parameters.nfbMode}
              onChange={(e) => setNFBMode(parseInt(e.target.value))}
            >
              {NFB_MODES.map((mode, i) => (
                <option key={i} value={i}>{mode}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ fontSize: '12px', color: '#c6c6c6', minWidth: '100px' }}>Bias Mode</label>
            <select
              className="carbon-select"
              value={parameters.biasMode}
              onChange={(e) => setBiasMode(parseInt(e.target.value))}
            >
              {BIAS_MODES.map((mode, i) => (
                <option key={i} value={i}>{mode}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
            <button
              className={`carbon-toggle-btn ${parameters.cathodeBypass ? 'active' : ''}`}
              onClick={() => setCathodeBypass(!parameters.cathodeBypass)}
              style={parameters.cathodeBypass ? { background: accentColor, borderColor: accentColor } : undefined}
            >
              Cathode Bypass
            </button>
          </div>
        </div>
      ),
    },
    {
      id: 'cabinet',
      title: 'Cabinet',
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            className={`carbon-toggle-btn ${parameters.cabinetEnabled ? 'active' : ''}`}
            onClick={() => setCabinetEnabled(!parameters.cabinetEnabled)}
            style={parameters.cabinetEnabled ? { background: accentColor, borderColor: accentColor } : undefined}
          >
            Cabinet Enabled
          </button>
          {parameters.cabinetEnabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ fontSize: '12px', color: '#c6c6c6', minWidth: '100px' }}>Cabinet IR</label>
              <select
                className="carbon-select"
                value={parameters.cabinetIR}
                onChange={(e) => setCabinetIR(parseInt(e.target.value))}
              >
                {CABINET_IRS.map((ir, i) => (
                  <option key={i} value={i}>{ir}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      ),
    },
  ]

  // Presets as ReactNode
  const presetsNode = (
    <>
      <div className="carbon-preset-row">
        <select
          className="carbon-select"
          value={currentPreset.id}
          onChange={(e) => setPreset(e.target.value)}
          style={{ width: '100%' }}
        >
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </div>
      {currentPreset.description && (
        <div style={{ fontSize: '11px', color: '#888', padding: '0 8px 4px', fontStyle: 'italic' }}>
          {currentPreset.description}
        </div>
      )}
      <div className="carbon-preset-row">
        {TWEED_BASSMAN_PRESETS.slice(1, 8).map((preset) => (
          <button
            key={preset.id}
            className={`carbon-preset-btn ${currentPreset.id === preset.id ? 'active' : ''}`}
            onClick={() => setPreset(preset.id)}
            title={preset.description}
            style={currentPreset.id === preset.id ? { background: accentColor, borderColor: accentColor } : undefined}
          >
            {preset.name}
          </button>
        ))}
      </div>
      <div className="carbon-preset-row">
        {TWEED_BASSMAN_PRESETS.slice(8).map((preset) => (
          <button
            key={preset.id}
            className={`carbon-preset-btn ${currentPreset.id === preset.id ? 'active' : ''}`}
            onClick={() => setPreset(preset.id)}
            title={preset.description}
            style={currentPreset.id === preset.id ? { background: accentColor, borderColor: accentColor } : undefined}
          >
            {preset.name}
          </button>
        ))}
      </div>
    </>
  )

  // Footer with sag/CPU info as extra content
  const extraContent = (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', fontSize: '10px', color: '#888' }}>
      <span>SAG: {(metering.supplySag * 100).toFixed(0)}%</span>
      <span>CPU: {metering.cpuLoad.toFixed(0)}%</span>
    </div>
  )

  return (
    <AmplifierCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={parameters.bypass}
      onBypassToggle={() => setBypass(!parameters.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={schematicVisualization}
      inputGain={inputGain}
      channel={channelProp}
      bright={brightProp}
      bass={bassSlot}
      mid={midSlot}
      treble={trebleSlot}
      presence={presenceSlot}
      masterVolume={masterVolumeSlot}
      outputGain={outputGainSlot}
      inputLevel={metering.inputLevel}
      outputLevel={metering.outputLevel}
      advancedSections={advancedSections}
      presets={presetsNode}
      extraContent={extraContent}
    />
  )
}

// Export base component for testing
export { TweedBassmanCardBase as TweedBassmanCard }

// Export wrapped component with MIDI dialog
export default withMidiDialog(TweedBassmanCardBase, BASSMAN_URI, BASSMAN_PARAMS)
