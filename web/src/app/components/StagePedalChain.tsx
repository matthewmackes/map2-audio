import { Fragment, useEffect, useState } from 'react'
export { getPedalKindIcon, getPedalKindIconSpec } from './icons/effectIcons'
import { getPedalKindIcon } from './icons/effectIcons'

export type PedalKind =
  | 'tuner' | 'comp' | 'overdrive' | 'distortion' | 'fuzz' | 'eq' | 'wah'
  | 'chorus' | 'phaser' | 'flanger' | 'tremolo' | 'pitch' | 'delay' | 'reverb' | 'looper'
  | 'amp' | 'cab' | 'gate' | 'modulation' | 'utility'

export interface PedalSpec {
  model: string
  name: string
  body: string
  plate: string
  knobs: number
  ink: string
}

export const PEDAL_SPECS: Record<PedalKind, PedalSpec> = {
  tuner:      { model: 'TU-3', name: 'CHROMATIC TUNER', body: '#d1d1d1', plate: '#d4342b', knobs: 2, ink: '#111' },
  comp:       { model: 'CS-3', name: 'COMPRESSION',     body: '#b9d7e8', plate: '#b9d7e8', knobs: 4, ink: '#0a1b27' },
  overdrive:  { model: 'SD-1', name: 'SUPER OVERDRIVE', body: '#f3c633', plate: '#f3c633', knobs: 3, ink: '#2a2208' },
  distortion: { model: 'DS-1', name: 'DISTORTION',      body: '#f48024', plate: '#f48024', knobs: 3, ink: '#2a1606' },
  fuzz:       { model: 'FZ-5', name: 'FUZZ',            body: '#9aa0a6', plate: '#9aa0a6', knobs: 3, ink: '#1a1c20' },
  eq:         { model: 'GE-7', name: 'EQUALIZER',       body: '#e9e9e6', plate: '#e9e9e6', knobs: 7, ink: '#111' },
  wah:        { model: 'AW-3', name: 'AUTO WAH',        body: '#111',    plate: '#111',    knobs: 4, ink: '#f0f0f0' },
  chorus:     { model: 'CE-2', name: 'CHORUS',          body: '#3b8fd1', plate: '#3b8fd1', knobs: 2, ink: '#06192a' },
  phaser:     { model: 'PH-3', name: 'PHASE SHIFTER',   body: '#7b5cc7', plate: '#7b5cc7', knobs: 4, ink: '#1a1130' },
  flanger:    { model: 'BF-3', name: 'FLANGER',         body: '#c6b8e3', plate: '#c6b8e3', knobs: 4, ink: '#1f1733' },
  tremolo:    { model: 'TR-2', name: 'TREMOLO',         body: '#8a8f3e', plate: '#8a8f3e', knobs: 3, ink: '#1f2008' },
  pitch:      { model: 'OC-5', name: 'OCTAVE',          body: '#d98cb4', plate: '#d98cb4', knobs: 4, ink: '#2a0d1d' },
  delay:      { model: 'DD-7', name: 'DIGITAL DELAY',   body: '#2fa36b', plate: '#2fa36b', knobs: 4, ink: '#071a10' },
  reverb:     { model: 'RV-6', name: 'REVERB',          body: '#2fb7b4', plate: '#2fb7b4', knobs: 4, ink: '#07201f' },
  looper:     { model: 'RC-5', name: 'LOOP STATION',    body: '#e9e9e6', plate: '#2fa36b', knobs: 3, ink: '#111' },
  amp:        { model: 'AMP',  name: 'AMP MODELER',     body: '#7a3b3b', plate: '#7a3b3b', knobs: 4, ink: '#f5e9d6' },
  cab:        { model: 'CAB',  name: 'CABINET IR',      body: '#5a4a2e', plate: '#5a4a2e', knobs: 3, ink: '#f5e9d6' },
  gate:       { model: 'NS-2', name: 'NOISE GATE',      body: '#cdd2d6', plate: '#cdd2d6', knobs: 2, ink: '#111' },
  modulation: { model: 'MOD',  name: 'MODULATION',      body: '#5b6dc4', plate: '#5b6dc4', knobs: 4, ink: '#f0f0f0' },
  utility:    { model: 'UTL',  name: 'UTILITY',         body: '#3a3a3a', plate: '#3a3a3a', knobs: 2, ink: '#f0f0f0' },
}

export const PEDAL_LED: Record<PedalKind, string> = {
  tuner: '#ff4444', comp: '#7ec9e8', overdrive: '#ffd64a', distortion: '#ff9a3c',
  fuzz: '#d0d0d0', eq: '#ffffff', wah: '#ff6a00', chorus: '#5ca8ff',
  phaser: '#b48cff', flanger: '#d9cfff', tremolo: '#c9d050', pitch: '#ff9ac6',
  delay: '#3fdb8a', reverb: '#4ff0ed', looper: '#3fdb8a',
  amp: '#ff8a3c', cab: '#d9b774', gate: '#7ec9e8', modulation: '#7aa3ff', utility: '#cccccc',
}

export interface PedalStage {
  kind: PedalKind
  on: boolean
}

export const DEFAULT_PEDAL_CHAIN: PedalStage[] = [
  { kind: 'tuner',     on: false },
  { kind: 'comp',      on: true },
  { kind: 'overdrive', on: true },
  { kind: 'delay',     on: true },
  { kind: 'reverb',    on: true },
]

function pluginNameToPedalKind(name: string, uri: string): PedalKind {
  const s = `${name} ${uri}`.toLowerCase()
  if (/\b(?:gate|noise.gate|ns-?[0-9]|dynamics\/gate)\b/.test(s)) return 'gate'
  if (/tun(?:er|ing)|chromatic/.test(s))         return 'tuner'
  if (/compres|sustain|cs-?3/.test(s))           return 'comp'
  if (/overdrive|sd-?1|tube\s*scream/.test(s))   return 'overdrive'
  if (/distort|ds-?1|metal/.test(s))             return 'distortion'
  if (/fuzz|fz-?[0-9]/.test(s))                  return 'fuzz'
  if (/\b(?:equaliz(?:er|ation)?|eq|ge-?7)\b/.test(s)) return 'eq'
  if (/wah|auto.?wah|aw-?3/.test(s))             return 'wah'
  if (/chorus|ce-?[0-9]/.test(s))                return 'chorus'
  if (/phase|ph-?3/.test(s))                     return 'phaser'
  if (/flange|bf-?3/.test(s))                    return 'flanger'
  if (/tremolo|tr-?2/.test(s))                   return 'tremolo'
  if (/pitch|octave|oc-?[0-9]/.test(s))          return 'pitch'
  if (/delay|dd-?[0-9]|echo/.test(s))            return 'delay'
  if (/reverb|rv-?[0-9]|hall|room|plate/.test(s)) return 'reverb'
  if (/loop|looper|rc-?[0-9]/.test(s))           return 'looper'
  if (/\bnam\b|neural\s*amp/.test(s))            return 'amp'
  if (/peavey|5150|marshall|mesa|fender|tweed|bassman|jcm|amp\b/.test(s)) return 'amp'
  if (/cabinet|\bcab\b|\bir\b|impulse|convolution/.test(s)) return 'cab'
  if (/modulation|intellifx|lex|h3000|effect/.test(s)) return 'modulation'
  return 'utility'
}

export interface RawPlugin { uri: string; name?: string | null; bypass: boolean }

export function deriveChainFromPlugins(plugins: RawPlugin[]): PedalStage[] {
  if (plugins.length === 0) return DEFAULT_PEDAL_CHAIN
  return plugins.map((p) => ({
    kind: pluginNameToPedalKind(p.name ?? '', p.uri),
    on: !p.bypass,
  }))
}

interface PedalProps {
  kind: PedalKind
  on?: boolean
  width?: number
  label?: string
  reducedMotion?: boolean
}

export function Pedal({ kind, on = true, width = 50, label, reducedMotion = false }: PedalProps) {
  const spec = PEDAL_SPECS[kind]
  if (!spec) return null
  const h = Math.round(width * 1.55)
  const led = PEDAL_LED[kind]

  const plateY = Math.round(width * 0.22)
  const plateH = Math.round(width * 0.40)
  const knobY = Math.round(width * 0.12)
  const knobR = Math.max(3, Math.round(width * 0.075))
  const nK = spec.knobs
  const knobPositions: { x: number; y: number }[] = []
  if (nK <= 4) {
    const pad = width * 0.18
    const usable = width - pad * 2
    const step = nK > 1 ? usable / (nK - 1) : 0
    for (let i = 0; i < nK; i++) {
      knobPositions.push({ x: pad + step * i, y: knobY + knobR })
    }
  }

  const fsY = h - Math.round(width * 0.38)
  const fsR = Math.round(width * 0.14)
  const ledY = plateY + plateH + Math.round(width * 0.13)
  const gradId = `fsGrad-${kind}-${width}`

  return (
    <div
      className={`stage-pedal ${on ? 'stage-pedal--on' : 'stage-pedal--off'}`}
      style={{ width, height: h }}
      aria-label={`${spec.model} ${spec.name} ${on ? 'active' : 'bypassed'}`}
    >
      <svg viewBox={`0 0 ${width} ${h}`} width={width} height={h} style={{ display: 'block' }}>
        <rect x="0.5" y="0.5" width={width - 1} height={h - 1} fill={spec.body} stroke="#000" strokeWidth="1" rx="2" />
        <rect x="2" y="2" width={width - 4} height={h - 4} fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="0.5" rx="1.5" />
        {[[4, 4], [width - 4, 4], [4, h - 4], [width - 4, h - 4]].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="1.2" fill="rgba(0,0,0,0.55)" />
        ))}

        {nK <= 4 ? knobPositions.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={knobR} fill="#1a1a1a" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
            <circle cx={p.x} cy={p.y} r={knobR - 1.5} fill="#2a2a2a" />
            <line
              x1={p.x} y1={p.y}
              x2={p.x + Math.cos(i * 0.7 - 1.2) * (knobR - 1)}
              y2={p.y + Math.sin(i * 0.7 - 1.2) * (knobR - 1)}
              stroke="#f0f0f0" strokeWidth="0.8" strokeLinecap="round"
            />
          </g>
        )) : (
          <g>
            {Array.from({ length: nK }).map((_, i) => {
              const pad = width * 0.12
              const usable = width - pad * 2
              const step = usable / (nK - 1)
              const x = pad + step * i
              const slotTop = knobY
              const slotBot = knobY + knobR * 2 + 4
              const pos = slotTop + (slotBot - slotTop) * (0.3 + Math.abs(Math.sin(i * 1.3)) * 0.5)
              return (
                <g key={i}>
                  <line x1={x} y1={slotTop} x2={x} y2={slotBot} stroke="#1a1a1a" strokeWidth="1" />
                  <rect x={x - 2} y={pos - 1.5} width="4" height="3" fill="#f0f0f0" />
                </g>
              )
            })}
          </g>
        )}

        <rect x={width * 0.08} y={plateY} width={width * 0.84} height={plateH} fill={spec.plate} stroke="rgba(0,0,0,0.3)" strokeWidth="0.5" />
        <text x={width / 2} y={plateY + plateH * 0.32} fontFamily="var(--font-ui, 'IBM Plex Sans', sans-serif)" fontSize={width * 0.11} fontWeight="700" fill={spec.ink} textAnchor="middle" letterSpacing="0.5">BOSS</text>
        <text x={width / 2} y={plateY + plateH * 0.58} fontFamily="var(--font-ui, 'IBM Plex Sans', sans-serif)" fontSize={width * 0.095} fontWeight="600" fill={spec.ink} textAnchor="middle" letterSpacing="0.4">{spec.model}</text>
        <text x={width / 2} y={plateY + plateH * 0.86} fontFamily="var(--font-mono, 'IBM Plex Mono', monospace)" fontSize={width * 0.075} fill={spec.ink} textAnchor="middle" letterSpacing="0.4" opacity="0.78">{spec.name}</text>

        <circle cx={width / 2} cy={ledY} r={width * 0.055} fill={on ? led : '#2a2a2a'} stroke="rgba(0,0,0,0.6)" strokeWidth="0.5" />
        {on && !reducedMotion && (
          <circle cx={width / 2} cy={ledY} r={width * 0.055} fill={led} opacity="0.55">
            <animate attributeName="r" values={`${width * 0.055};${width * 0.11};${width * 0.055}`} dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.55;0;0.55" dur="1.8s" repeatCount="indefinite" />
          </circle>
        )}

        <circle cx={width / 2} cy={fsY} r={fsR + 2} fill="#0a0a0a" stroke="rgba(0,0,0,0.6)" strokeWidth="0.5" />
        <circle cx={width / 2} cy={fsY} r={fsR} fill={`url(#${gradId})`} />
        <circle cx={width / 2} cy={fsY} r={fsR * 0.55} fill="#1a1a1a" />
        <defs>
          <radialGradient id={gradId} cx="0.35" cy="0.35">
            <stop offset="0%" stopColor="#555" />
            <stop offset="60%" stopColor="#2a2a2a" />
            <stop offset="100%" stopColor="#111" />
          </radialGradient>
        </defs>

        <circle cx={3} cy={h / 2} r="1.5" fill="#111" />
        <circle cx={width - 3} cy={h / 2} r="1.5" fill="#111" />
      </svg>

      {label ? <span className="stage-pedal__label">{label}</span> : null}
    </div>
  )
}

export function PatchArrow({ active = true }: { active?: boolean }) {
  return (
    <svg width="22" height="16" viewBox="0 0 22 16" style={{ flexShrink: 0, opacity: active ? 1 : 0.35 }} aria-hidden="true">
      <path
        d="M1 8h16M13 4l5 4-5 4"
        fill="none"
        stroke={active ? 'var(--text-secondary, #c6c6c6)' : 'var(--g70, #525252)'}
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function BlueprintChainTile({ kind, on, active }: { kind: PedalKind; on: boolean; active: boolean }) {
  const spec = PEDAL_SPECS[kind]
  const Icon = getPedalKindIcon(kind)
  return (
    <div
      className={[
        'stage-blueprint-tile',
        on ? '' : 'stage-blueprint-tile--off',
        active ? 'stage-blueprint-tile--active' : '',
      ].filter(Boolean).join(' ')}
      aria-label={`${spec.model} ${spec.name} ${on ? 'active' : 'bypassed'}`}
    >
      <span className="stage-blueprint-tile__icon">
        <Icon width={22} height={22} aria-hidden="true" />
      </span>
      <span className="stage-blueprint-tile__label">{spec.model}</span>
      <span className="stage-blueprint-tile__sub">{spec.name.split(' ')[0]}</span>
    </div>
  )
}

interface SignalChainProps {
  chain?: PedalStage[]
  pedalWidth?: number
  reducedMotion?: boolean
  mode?: 'pedal' | 'blueprint'
}

export function StagePedalSignalChain({ chain = DEFAULT_PEDAL_CHAIN, pedalWidth = 46, reducedMotion = false, mode = 'blueprint' }: SignalChainProps) {
  const [pulseIdx, setPulseIdx] = useState(0)

  useEffect(() => {
    if (reducedMotion || chain.length === 0) return
    const iv = window.setInterval(() => {
      setPulseIdx((current) => (current + 1) % chain.length)
    }, 2800)
    return () => window.clearInterval(iv)
  }, [chain.length, reducedMotion])

  return (
    <div className="stage-pedal-chain" aria-label="Signal chain">
      {chain.map((p, i) => (
        <Fragment key={`${p.kind}-${i}`}>
          <div
            className={`stage-pedal-chain__slot${pulseIdx === i && !reducedMotion ? ' stage-pedal-chain__slot--active' : ''}`}
          >
            {mode === 'blueprint' ? (
              <BlueprintChainTile kind={p.kind} on={p.on} active={pulseIdx === i && !reducedMotion} />
            ) : (
              <Pedal kind={p.kind} on={p.on} width={pedalWidth} label={PEDAL_SPECS[p.kind].model} reducedMotion={reducedMotion} />
            )}
          </div>
          {i < chain.length - 1 ? (
            <PatchArrow active={(p.on && chain[i + 1].on) || pulseIdx === i} />
          ) : null}
        </Fragment>
      ))}
    </div>
  )
}
