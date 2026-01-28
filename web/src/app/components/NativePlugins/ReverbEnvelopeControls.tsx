import { ParameterSlider } from '../Controls/ParameterSlider'

interface ReverbEnvelopeControlsProps {
  attack: number
  decay: number
  sustain: number
  release: number
  onAttackChange?: (value: number) => void
  onDecayChange?: (value: number) => void
  onSustainChange?: (value: number) => void
  onReleaseChange?: (value: number) => void
}

export function ReverbEnvelopeControls({
  attack,
  decay,
  sustain,
  release,
  onAttackChange,
  onDecayChange,
  onSustainChange,
  onReleaseChange
}: ReverbEnvelopeControlsProps) {
  return (
    <div style={{ paddingBottom: 16, borderBottom: '1px solid rgba(168, 85, 247, 0.2)' }}>
      <h5 style={{
        fontSize: 11,
        fontWeight: 700,
        color: '#a855f7',
        textTransform: 'uppercase',
        marginBottom: 10,
        letterSpacing: 0.5
      }}>
        Envelope
      </h5>

      {/* ADSR Visualization */}
      <div style={{
        height: 60,
        background: 'linear-gradient(180deg, rgba(168, 85, 247, 0.1) 0%, rgba(0,0,0,0.2) 100%)',
        borderRadius: 6,
        border: '1px solid rgba(168, 85, 247, 0.2)',
        marginBottom: 12,
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* ADSR Curve Visualization */}
        <svg width="100%" height="60" style={{ position: 'absolute', top: 0, left: 0 }}>
          <defs>
            <linearGradient id="adsrGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#a855f7" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#a855f7" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          {/* Attack line */}
          <line x1="5%" y1="55" x2={`${5 + 15 * (attack / 100)}%`} y2="10" stroke="#a855f7" strokeWidth="2" />
          {/* Decay line */}
          <line
            x1={`${5 + 15 * (attack / 100)}%`}
            y1="10"
            x2={`${20 + 15 * (decay / 100)}%`}
            y2={`${55 - sustain * 0.45}`}
            stroke="#a855f7"
            strokeWidth="2"
          />
          {/* Sustain line */}
          <line
            x1={`${20 + 15 * (decay / 100)}%`}
            y1={`${55 - sustain * 0.45}`}
            x2={`${75 + 10 * (release / 100)}%`}
            y2={`${55 - sustain * 0.45}`}
            stroke="#a855f7"
            strokeWidth="2"
            strokeDasharray="5,3"
          />
          {/* Release line */}
          <line
            x1={`${75 + 10 * (release / 100)}%`}
            y1={`${55 - sustain * 0.45}`}
            x2="95%"
            y2="55"
            stroke="#a855f7"
            strokeWidth="2"
          />
          {/* Labels */}
          <text x="10" y="12" fontSize="9" fill="#a855f7" fontWeight="600">A</text>
          <text x="35" y="12" fontSize="9" fill="#a855f7" fontWeight="600">D</text>
          <text x="60" y="12" fontSize="9" fill="#a855f7" fontWeight="600">S</text>
          <text x="85" y="12" fontSize="9" fill="#a855f7" fontWeight="600">R</text>
        </svg>
      </div>

      {/* ADSR Sliders */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <ParameterSlider
            label="Attack"
            value={attack}
            min={0}
            max={500}
            unit="ms"
            onChange={onAttackChange}
          />
        </div>
        <div>
          <ParameterSlider
            label="Decay"
            value={decay}
            min={0}
            max={500}
            unit="ms"
            onChange={onDecayChange}
          />
        </div>
        <div>
          <ParameterSlider
            label="Sustain"
            value={sustain}
            min={0}
            max={100}
            unit="%"
            onChange={onSustainChange}
          />
        </div>
        <div>
          <ParameterSlider
            label="Release"
            value={release}
            min={0}
            max={500}
            unit="ms"
            onChange={onReleaseChange}
          />
        </div>
      </div>
    </div>
  )
}
