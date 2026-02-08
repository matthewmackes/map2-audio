import type { GearImageProps, Topology } from './types'

// VU Meter needle angle: maps gain reduction (0-20 dB) to angle (-45 to +45 degrees)
function vuNeedleAngle(gr: number): number {
  const clamped = Math.max(0, Math.min(20, gr))
  return -45 + (clamped / 20) * 90
}

// Knob rotation: maps normalized 0-1 to angle (-135 to +135 degrees)
function knobAngle(value: number, min: number, max: number): number {
  const norm = (value - min) / (max - min)
  return -135 + norm * 270
}

// ============================================================
// FET Compressor (1176LN-inspired)
// ============================================================

function FETCompressor({ params, gainReduction, width = 400, height = 200 }: GearImageProps) {
  const grAngle = vuNeedleAngle(gainReduction)
  const inputAngle = knobAngle(Math.abs(params.threshold), 0, 60)
  const outputAngle = knobAngle(params.makeupGain + 12, 0, 36)
  const attackAngle = knobAngle(params.attack, 0.1, 500)
  const releaseAngle = knobAngle(params.release, 10, 5000)

  // Which ratio button is closest
  const ratioButtons = [4, 8, 12, 20]
  const activeRatio = ratioButtons.reduce((prev, curr) =>
    Math.abs(curr - params.ratio) < Math.abs(prev - params.ratio) ? curr : prev
  )

  return (
    <svg viewBox="0 0 400 200" width={width} height={height} className="gear-image gear-fet">
      <defs>
        <linearGradient id="fetPanel" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#c8c8cc" />
          <stop offset="50%" stopColor="#b0b0b4" />
          <stop offset="100%" stopColor="#a0a0a4" />
        </linearGradient>
        <linearGradient id="fetBezel" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#2a2a2e" />
          <stop offset="100%" stopColor="#1a1a1e" />
        </linearGradient>
        <radialGradient id="fetKnob" cx="40%" cy="35%">
          <stop offset="0%" stopColor="#444" />
          <stop offset="100%" stopColor="#1a1a1a" />
        </radialGradient>
        <filter id="fetGlow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Chassis */}
      <rect x="0" y="0" width="400" height="200" rx="4" fill="url(#fetBezel)" />
      <rect x="4" y="4" width="392" height="192" rx="3" fill="url(#fetPanel)" />
      <rect x="4" y="4" width="392" height="192" rx="3" fill="none" stroke="#d8d8dc" strokeWidth="0.5" />

      {/* Brand text */}
      <text x="200" y="22" textAnchor="middle" fontSize="8" fontWeight="700" fill="#333" letterSpacing="4" fontFamily="Arial, sans-serif">UNIVERSAL AUDIO</text>
      <text x="200" y="38" textAnchor="middle" fontSize="14" fontWeight="900" fill="#222" letterSpacing="2" fontFamily="Arial, sans-serif">1176LN</text>

      {/* VU Meter */}
      <rect x="130" y="48" width="140" height="75" rx="3" fill="#1a1a1e" />
      <rect x="133" y="51" width="134" height="69" rx="2" fill="#f5f0e0" />
      {/* VU scale markings */}
      <text x="145" y="65" fontSize="5" fill="#333">-20</text>
      <text x="165" y="60" fontSize="5" fill="#333">-10</text>
      <text x="190" y="58" fontSize="5" fill="#333">-5</text>
      <text x="210" y="58" fontSize="5" fill="#333">0</text>
      <text x="230" y="60" fontSize="5" fill="#c00">+3</text>
      <text x="248" y="65" fontSize="5" fill="#c00">+6</text>
      {/* Scale arc */}
      <path d="M 150 105 Q 200 60 250 105" fill="none" stroke="#333" strokeWidth="0.5" />
      {/* Red zone arc */}
      <path d="M 220 88 Q 240 75 255 100" fill="none" stroke="#c00" strokeWidth="1" />
      {/* GR label */}
      <text x="200" y="115" textAnchor="middle" fontSize="6" fill="#666" fontWeight="600">GR</text>
      {/* Needle */}
      <g transform={`translate(200, 110) rotate(${grAngle})`}>
        <line x1="0" y1="0" x2="0" y2="-48" stroke="#111" strokeWidth="1" />
        <circle cx="0" cy="0" r="3" fill="#333" />
      </g>

      {/* Knobs row */}
      {/* Input */}
      <g transform="translate(45, 100)">
        <circle cx="0" cy="0" r="18" fill="url(#fetKnob)" />
        <line x1="0" y1="0" x2={Math.sin(inputAngle * Math.PI / 180) * 14} y2={-Math.cos(inputAngle * Math.PI / 180) * 14} stroke="#ddd" strokeWidth="2" strokeLinecap="round" />
        <text x="0" y="30" textAnchor="middle" fontSize="7" fill="#333" fontWeight="600">INPUT</text>
      </g>

      {/* Output */}
      <g transform="translate(355, 100)">
        <circle cx="0" cy="0" r="18" fill="url(#fetKnob)" />
        <line x1="0" y1="0" x2={Math.sin(outputAngle * Math.PI / 180) * 14} y2={-Math.cos(outputAngle * Math.PI / 180) * 14} stroke="#ddd" strokeWidth="2" strokeLinecap="round" />
        <text x="0" y="30" textAnchor="middle" fontSize="7" fill="#333" fontWeight="600">OUTPUT</text>
      </g>

      {/* Attack */}
      <g transform="translate(95, 160)">
        <circle cx="0" cy="0" r="12" fill="url(#fetKnob)" />
        <line x1="0" y1="0" x2={Math.sin(attackAngle * Math.PI / 180) * 9} y2={-Math.cos(attackAngle * Math.PI / 180) * 9} stroke="#ddd" strokeWidth="1.5" strokeLinecap="round" />
        <text x="0" y="20" textAnchor="middle" fontSize="6" fill="#333" fontWeight="600">ATTACK</text>
      </g>

      {/* Release */}
      <g transform="translate(305, 160)">
        <circle cx="0" cy="0" r="12" fill="url(#fetKnob)" />
        <line x1="0" y1="0" x2={Math.sin(releaseAngle * Math.PI / 180) * 9} y2={-Math.cos(releaseAngle * Math.PI / 180) * 9} stroke="#ddd" strokeWidth="1.5" strokeLinecap="round" />
        <text x="0" y="20" textAnchor="middle" fontSize="6" fill="#333" fontWeight="600">RELEASE</text>
      </g>

      {/* Ratio buttons */}
      {ratioButtons.map((r, i) => (
        <g key={r} transform={`translate(${160 + i * 25}, 160)`}>
          <rect x="-9" y="-8" width="18" height="16" rx="2"
            fill={activeRatio === r ? '#e8913a' : '#2a2a2e'}
            stroke={activeRatio === r ? '#ffb060' : '#444'}
            strokeWidth="1"
          />
          <text x="0" y="4" textAnchor="middle" fontSize="7" fontWeight="700"
            fill={activeRatio === r ? '#fff' : '#888'}
          >{r}</text>
        </g>
      ))}
      <text x="200" y="186" textAnchor="middle" fontSize="5" fill="#333">RATIO</text>
    </svg>
  )
}

// ============================================================
// Opto Compressor (LA-2A-inspired)
// ============================================================

function OptoCompressor({ params, gainReduction, width = 400, height = 200 }: GearImageProps) {
  const grAngle = vuNeedleAngle(gainReduction)
  const peakReductionAngle = knobAngle(Math.abs(params.threshold), 0, 60)
  const gainAngle = knobAngle(params.makeupGain + 12, 0, 36)
  const isLimiting = params.ratio > 8

  return (
    <svg viewBox="0 0 400 200" width={width} height={height} className="gear-image gear-opto">
      <defs>
        <linearGradient id="optoPanel" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#8a8a8e" />
          <stop offset="30%" stopColor="#7a7a7e" />
          <stop offset="100%" stopColor="#6a6a6e" />
        </linearGradient>
        <radialGradient id="optoKnob" cx="40%" cy="35%">
          <stop offset="0%" stopColor="#555" />
          <stop offset="100%" stopColor="#222" />
        </radialGradient>
      </defs>

      {/* Chassis - hammertone gray */}
      <rect x="0" y="0" width="400" height="200" rx="4" fill="#1a1a1e" />
      <rect x="4" y="4" width="392" height="192" rx="3" fill="url(#optoPanel)" />
      {/* Hammertone texture overlay */}
      <rect x="4" y="4" width="392" height="192" rx="3" fill="url(#optoPanel)" opacity="0.95" />

      {/* Brand */}
      <text x="200" y="20" textAnchor="middle" fontSize="7" fontWeight="600" fill="#333" letterSpacing="3">TELETRONIX</text>
      <text x="200" y="38" textAnchor="middle" fontSize="18" fontWeight="900" fill="#222" letterSpacing="3" fontFamily="Georgia, serif">LA-2A</text>

      {/* Large VU Meter */}
      <rect x="110" y="46" width="180" height="85" rx="4" fill="#1a1a1e" />
      <rect x="114" y="50" width="172" height="77" rx="3" fill="#f5f0e0" />
      {/* Scale */}
      <text x="135" y="66" fontSize="5" fill="#333">-20</text>
      <text x="160" y="60" fontSize="5" fill="#333">-10</text>
      <text x="195" y="57" fontSize="5.5" fontWeight="600" fill="#333">0</text>
      <text x="225" y="60" fontSize="5" fill="#c00">+5</text>
      <text x="255" y="66" fontSize="5" fill="#c00">+10</text>
      {/* Arc */}
      <path d="M 140 115 Q 200 55 260 115" fill="none" stroke="#333" strokeWidth="0.5" />
      <path d="M 218 82 Q 245 68 265 108" fill="none" stroke="#c00" strokeWidth="1" />
      {/* GR label */}
      <text x="200" y="122" textAnchor="middle" fontSize="6" fill="#444" fontWeight="700">GAIN REDUCTION</text>
      {/* Needle */}
      <g transform={`translate(200, 118) rotate(${grAngle})`}>
        <line x1="0" y1="0" x2="0" y2="-55" stroke="#111" strokeWidth="0.8" />
        <circle cx="0" cy="0" r="3" fill="#333" />
      </g>

      {/* Peak Reduction knob */}
      <g transform="translate(55, 100)">
        <circle cx="0" cy="0" r="22" fill="url(#optoKnob)" />
        <circle cx="0" cy="0" r="22" fill="none" stroke="#555" strokeWidth="0.5" />
        <line x1="0" y1="0" x2={Math.sin(peakReductionAngle * Math.PI / 180) * 17} y2={-Math.cos(peakReductionAngle * Math.PI / 180) * 17} stroke="#ccc" strokeWidth="2" strokeLinecap="round" />
        <text x="0" y="34" textAnchor="middle" fontSize="5.5" fill="#222" fontWeight="700">PEAK</text>
        <text x="0" y="42" textAnchor="middle" fontSize="5.5" fill="#222" fontWeight="700">REDUCTION</text>
      </g>

      {/* Gain knob */}
      <g transform="translate(345, 100)">
        <circle cx="0" cy="0" r="22" fill="url(#optoKnob)" />
        <circle cx="0" cy="0" r="22" fill="none" stroke="#555" strokeWidth="0.5" />
        <line x1="0" y1="0" x2={Math.sin(gainAngle * Math.PI / 180) * 17} y2={-Math.cos(gainAngle * Math.PI / 180) * 17} stroke="#ccc" strokeWidth="2" strokeLinecap="round" />
        <text x="0" y="34" textAnchor="middle" fontSize="5.5" fill="#222" fontWeight="700">GAIN</text>
      </g>

      {/* LIMIT / COMPRESS switch */}
      <g transform="translate(200, 165)">
        <rect x="-30" y="-10" width="60" height="20" rx="3" fill="#2a2a2e" stroke="#444" strokeWidth="0.5" />
        <rect x={isLimiting ? -28 : -2} y="-8" width="28" height="16" rx="2" fill={isLimiting ? '#c44' : '#4a9eff'} />
        <text x="-14" y="3" textAnchor="middle" fontSize="5" fill={isLimiting ? '#fff' : '#aaa'} fontWeight="600">LIMIT</text>
        <text x="14" y="3" textAnchor="middle" fontSize="5" fill={isLimiting ? '#aaa' : '#fff'} fontWeight="600">COMP</text>
      </g>

      {/* Power indicator */}
      <circle cx="50" cy="170" r="4" fill="#22c55e" opacity="0.8" />
      <text x="50" y="184" textAnchor="middle" fontSize="5" fill="#333">POWER</text>
    </svg>
  )
}

// ============================================================
// VCA Compressor (dbx 160-inspired)
// ============================================================

function VCACompressor({ params, gainReduction, width = 400, height = 200 }: GearImageProps) {
  const grLevel = Math.min(20, gainReduction)
  const threshNorm = (params.threshold + 60) / 60
  const ratioNorm = (params.ratio - 1) / 19

  return (
    <svg viewBox="0 0 400 200" width={width} height={height} className="gear-image gear-vca">
      <defs>
        <linearGradient id="vcaPanel" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#2a3a5a" />
          <stop offset="50%" stopColor="#1e2e4a" />
          <stop offset="100%" stopColor="#182440" />
        </linearGradient>
        <linearGradient id="vcaSlider" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#c8c8cc" />
          <stop offset="100%" stopColor="#e0e0e4" />
        </linearGradient>
      </defs>

      {/* Chassis - blue anodized */}
      <rect x="0" y="0" width="400" height="200" rx="4" fill="#0a0a10" />
      <rect x="4" y="4" width="392" height="192" rx="3" fill="url(#vcaPanel)" />

      {/* Silver trim strips */}
      <rect x="4" y="4" width="392" height="3" fill="#888" opacity="0.5" />
      <rect x="4" y="193" width="392" height="3" fill="#888" opacity="0.3" />

      {/* Brand */}
      <text x="55" y="22" textAnchor="middle" fontSize="12" fontWeight="900" fill="#ccc" letterSpacing="1" fontFamily="Arial, sans-serif">dbx</text>
      <text x="55" y="36" textAnchor="middle" fontSize="16" fontWeight="900" fill="#e0e0e4" letterSpacing="2">160</text>

      {/* LED Bar Meter - 20 segments */}
      <g transform="translate(130, 15)">
        <text x="70" y="0" textAnchor="middle" fontSize="6" fill="#888" fontWeight="600">GAIN REDUCTION dB</text>
        {Array.from({ length: 20 }, (_, i) => {
          const isLit = i < grLevel
          const isRed = i >= 16
          const isYellow = i >= 12 && i < 16
          const color = isRed ? '#ff3333' : isYellow ? '#ffaa00' : '#22c55e'
          return (
            <rect
              key={i}
              x={i * 7}
              y="5"
              width="5"
              height="12"
              rx="1"
              fill={isLit ? color : '#1a1a2a'}
              opacity={isLit ? 0.9 : 0.3}
              stroke="#333"
              strokeWidth="0.3"
            />
          )
        })}
      </g>

      {/* Threshold slider */}
      <g transform="translate(80, 55)">
        <text x="0" y="0" textAnchor="middle" fontSize="6" fill="#aaa" fontWeight="600">THRESHOLD</text>
        <rect x="-3" y="8" width="6" height="100" rx="2" fill="#111" stroke="#444" strokeWidth="0.5" />
        <rect x="-8" y={8 + (1 - threshNorm) * 90} width="16" height="10" rx="2" fill="url(#vcaSlider)" />
        {/* Scale markings */}
        {[-60, -40, -20, 0].map((db, i) => (
          <g key={db}>
            <line x1="10" y1={8 + (1 - (db + 60) / 60) * 90 + 5} x2="16" y2={8 + (1 - (db + 60) / 60) * 90 + 5} stroke="#666" strokeWidth="0.5" />
            <text x="22" y={8 + (1 - (db + 60) / 60) * 90 + 8} fontSize="5" fill="#888">{db}</text>
          </g>
        ))}
      </g>

      {/* Ratio slider */}
      <g transform="translate(170, 55)">
        <text x="0" y="0" textAnchor="middle" fontSize="6" fill="#aaa" fontWeight="600">COMPRESSION</text>
        <rect x="-3" y="8" width="6" height="100" rx="2" fill="#111" stroke="#444" strokeWidth="0.5" />
        <rect x="-8" y={8 + (1 - ratioNorm) * 90} width="16" height="10" rx="2" fill="url(#vcaSlider)" />
        {[1, 5, 10, 20].map((r) => (
          <g key={r}>
            <line x1="10" y1={8 + (1 - (r - 1) / 19) * 90 + 5} x2="16" y2={8 + (1 - (r - 1) / 19) * 90 + 5} stroke="#666" strokeWidth="0.5" />
            <text x="22" y={8 + (1 - (r - 1) / 19) * 90 + 8} fontSize="5" fill="#888">{r}:1</text>
          </g>
        ))}
      </g>

      {/* Output level display */}
      <g transform="translate(300, 50)">
        <rect x="-40" y="0" width="80" height="50" rx="3" fill="#0a0a0a" stroke="#444" strokeWidth="0.5" />
        <text x="0" y="20" textAnchor="middle" fontSize="18" fontWeight="700" fill="#22c55e" fontFamily="monospace">{params.makeupGain > 0 ? '+' : ''}{params.makeupGain.toFixed(1)}</text>
        <text x="0" y="35" textAnchor="middle" fontSize="6" fill="#888">OUTPUT dB</text>
      </g>

      {/* Info display */}
      <g transform="translate(300, 120)">
        <rect x="-40" y="0" width="80" height="40" rx="3" fill="#0a0a0a" stroke="#444" strokeWidth="0.5" />
        <text x="0" y="14" textAnchor="middle" fontSize="6" fill="#888">ATTACK</text>
        <text x="0" y="26" textAnchor="middle" fontSize="10" fill="#4a9eff" fontFamily="monospace">{params.attack.toFixed(1)} ms</text>
        <text x="0" y="38" textAnchor="middle" fontSize="6" fill="#888">RELEASE: {params.release.toFixed(0)} ms</text>
      </g>

      {/* Model label */}
      <text x="300" y="185" textAnchor="middle" fontSize="7" fill="#666" fontWeight="600" letterSpacing="2">COMPRESSOR / LIMITER</text>
    </svg>
  )
}

// ============================================================
// Vari-Mu Compressor (Fairchild 670-inspired)
// ============================================================

function VariMuCompressor({ params, gainReduction, width = 400, height = 200 }: GearImageProps) {
  const grAngleL = vuNeedleAngle(gainReduction)
  const grAngleR = vuNeedleAngle(gainReduction * 0.95)
  const inputAngle = knobAngle(Math.abs(params.threshold), 0, 60)

  // Time constant position (1-6, mapped from release)
  const tcPositions = [200, 500, 1000, 2000, 4000, 5000]
  const tcIndex = tcPositions.reduce((best, tc, i) =>
    Math.abs(tc - params.release) < Math.abs(tcPositions[best] - params.release) ? i : best, 0)

  return (
    <svg viewBox="0 0 400 200" width={width} height={height} className="gear-image gear-varimu">
      <defs>
        <linearGradient id="varimuPanel" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#d4c8a8" />
          <stop offset="50%" stopColor="#c8bc98" />
          <stop offset="100%" stopColor="#b8ac88" />
        </linearGradient>
        <radialGradient id="varimuKnob" cx="40%" cy="35%">
          <stop offset="0%" stopColor="#665544" />
          <stop offset="100%" stopColor="#332211" />
        </radialGradient>
        <radialGradient id="tubeGlow670" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff6622" stopOpacity="0.4" />
          <stop offset="60%" stopColor="#ff4400" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#ff4400" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Chassis - cream/ivory */}
      <rect x="0" y="0" width="400" height="200" rx="4" fill="#2a2218" />
      <rect x="4" y="4" width="392" height="192" rx="3" fill="url(#varimuPanel)" />

      {/* Decorative lines */}
      <line x1="10" y1="44" x2="390" y2="44" stroke="#a09878" strokeWidth="0.5" />

      {/* Brand */}
      <text x="200" y="18" textAnchor="middle" fontSize="6" fontWeight="600" fill="#5a4a30" letterSpacing="3">FAIRCHILD RECORDING</text>
      <text x="200" y="36" textAnchor="middle" fontSize="16" fontWeight="900" fill="#3a2a10" letterSpacing="4" fontFamily="Georgia, serif">670</text>

      {/* Dual VU Meters */}
      {[120, 280].map((cx, i) => (
        <g key={i} transform={`translate(${cx}, 50)`}>
          <rect x="-45" y="0" width="90" height="55" rx="3" fill="#1a1a1e" />
          <rect x="-42" y="3" width="84" height="49" rx="2" fill="#f0ead8" />
          {/* Mini arc */}
          <path d={`M -30 42 Q 0 10 30 42`} fill="none" stroke="#444" strokeWidth="0.4" />
          <path d={`M 15 35 Q 25 28 32 42`} fill="none" stroke="#c00" strokeWidth="0.6" />
          {/* Scale text */}
          <text x="-28" y="22" fontSize="4" fill="#444">-20</text>
          <text x="0" y="14" fontSize="4" fill="#444">0</text>
          <text x="24" y="22" fontSize="4" fill="#c00">+5</text>
          {/* Needle */}
          <g transform={`translate(0, 45) rotate(${i === 0 ? grAngleL : grAngleR})`}>
            <line x1="0" y1="0" x2="0" y2="-32" stroke="#111" strokeWidth="0.6" />
            <circle cx="0" cy="0" r="2" fill="#333" />
          </g>
          <text x="0" y="52" textAnchor="middle" fontSize="4" fill="#666">CH {i + 1}</text>
        </g>
      ))}

      {/* Input Gain knobs */}
      {[50, 350].map((cx, i) => (
        <g key={i} transform={`translate(${cx}, 80)`}>
          <circle cx="0" cy="0" r="14" fill="url(#varimuKnob)" />
          <line x1="0" y1="0" x2={Math.sin(inputAngle * Math.PI / 180) * 10} y2={-Math.cos(inputAngle * Math.PI / 180) * 10} stroke="#c8b888" strokeWidth="1.5" strokeLinecap="round" />
          <text x="0" y="24" textAnchor="middle" fontSize="5" fill="#3a2a10" fontWeight="600">INPUT {i + 1}</text>
        </g>
      ))}

      {/* Time Constant selector (6-position) */}
      <g transform="translate(200, 140)">
        <circle cx="0" cy="0" r="18" fill="url(#varimuKnob)" />
        {/* Position dots */}
        {[0, 1, 2, 3, 4, 5].map(pos => {
          const angle = (-135 + pos * 54) * Math.PI / 180
          const dotR = 24
          return (
            <g key={pos}>
              <circle
                cx={Math.sin(angle) * dotR}
                cy={-Math.cos(angle) * dotR}
                r={pos === tcIndex ? 3 : 2}
                fill={pos === tcIndex ? '#a855f7' : '#5a4a30'}
              />
              <text
                x={Math.sin(angle) * (dotR + 8)}
                y={-Math.cos(angle) * (dotR + 8) + 2}
                textAnchor="middle" fontSize="5" fill="#5a4a30"
              >{pos + 1}</text>
            </g>
          )
        })}
        {/* Pointer */}
        {(() => {
          const angle = (-135 + tcIndex * 54) * Math.PI / 180
          return <line x1="0" y1="0" x2={Math.sin(angle) * 13} y2={-Math.cos(angle) * 13} stroke="#c8b888" strokeWidth="1.5" strokeLinecap="round" />
        })()}
        <text x="0" y="34" textAnchor="middle" fontSize="5" fill="#3a2a10" fontWeight="700">TIME CONST</text>
      </g>

      {/* Tube glow indicators */}
      {[80, 120, 160, 240, 280, 320].map((cx, i) => (
        <g key={i}>
          <circle cx={cx} cy="175" r={6} fill="url(#tubeGlow670)" />
          <circle cx={cx} cy="175" r="2" fill="#663300" opacity="0.5" />
        </g>
      ))}
      <text x="200" y="192" textAnchor="middle" fontSize="4" fill="#5a4a30">6386 REMOTE CUTOFF TUBES</text>
    </svg>
  )
}

// ============================================================
// Brickwall Limiter (Modern-inspired)
// ============================================================

function LimiterUnit({ params, gainReduction, width = 400, height = 200 }: GearImageProps) {
  const grLevel = Math.min(20, gainReduction)
  const grSegments = Math.ceil(grLevel)

  return (
    <svg viewBox="0 0 400 200" width={width} height={height} className="gear-image gear-limiter">
      <defs>
        <linearGradient id="limiterPanel" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1a1a1e" />
          <stop offset="100%" stopColor="#111114" />
        </linearGradient>
        <filter id="limiterGlow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Chassis - matte black */}
      <rect x="0" y="0" width="400" height="200" rx="4" fill="#080808" />
      <rect x="4" y="4" width="392" height="192" rx="3" fill="url(#limiterPanel)" />
      <rect x="4" y="4" width="392" height="1" fill="#333" opacity="0.5" />

      {/* Brand */}
      <text x="200" y="22" textAnchor="middle" fontSize="8" fontWeight="800" fill="#ef4444" letterSpacing="6">BRICKWALL</text>
      <text x="200" y="36" textAnchor="middle" fontSize="10" fontWeight="400" fill="#666" letterSpacing="4">LIMITER</text>

      {/* Large ceiling display */}
      <g transform="translate(200, 80)">
        <rect x="-80" y="-25" width="160" height="50" rx="4" fill="#0a0a0a" stroke="#333" strokeWidth="0.5" />
        <text x="0" y="-5" textAnchor="middle" fontSize="6" fill="#666">CEILING</text>
        <text x="0" y="18" textAnchor="middle" fontSize="24" fontWeight="700" fill="#ef4444" fontFamily="monospace" filter="url(#limiterGlow)">{params.threshold.toFixed(1)}</text>
        <text x="50" y="18" textAnchor="start" fontSize="8" fill="#888">dB</text>
      </g>

      {/* Gain Reduction LED bar */}
      <g transform="translate(60, 120)">
        <text x="0" y="-5" fontSize="6" fill="#888" fontWeight="600">GR</text>
        {Array.from({ length: 20 }, (_, i) => {
          const isLit = i < grSegments
          const color = i < 6 ? '#22c55e' : i < 12 ? '#ffaa00' : '#ef4444'
          return (
            <rect
              key={i}
              x={i * 14}
              y="0"
              width="12"
              height="8"
              rx="1"
              fill={isLit ? color : '#1a1a1e'}
              opacity={isLit ? 0.9 : 0.2}
              stroke="#222"
              strokeWidth="0.3"
            />
          )
        })}
        <text x="280" y="7" fontSize="8" fill="#ef4444" fontFamily="monospace">{gainReduction.toFixed(1)} dB</text>
      </g>

      {/* Parameters display */}
      <g transform="translate(60, 155)">
        {[
          { label: 'ATTACK', value: `${params.attack.toFixed(1)} ms` },
          { label: 'RELEASE', value: `${params.release.toFixed(0)} ms` },
          { label: 'RATIO', value: params.ratio >= 20 ? '∞:1' : `${params.ratio.toFixed(0)}:1` },
          { label: 'KNEE', value: `${params.knee.toFixed(0)} dB` },
        ].map((p, i) => (
          <g key={p.label} transform={`translate(${i * 80}, 0)`}>
            <text x="0" y="0" fontSize="5" fill="#666" fontWeight="600">{p.label}</text>
            <text x="0" y="14" fontSize="9" fill="#ef4444" fontFamily="monospace" opacity="0.8">{p.value}</text>
          </g>
        ))}
      </g>

      {/* Power LED */}
      <circle cx="380" y="12" r="3" fill="#ef4444" opacity="0.7" />
    </svg>
  )
}

// ============================================================
// Gear Image Switcher
// ============================================================

export function GearImage(props: GearImageProps) {
  const { topology, ...rest } = props

  switch (topology) {
    case 'fet':
      return <FETCompressor {...props} />
    case 'opto':
      return <OptoCompressor {...props} />
    case 'vca':
      return <VCACompressor {...props} />
    case 'varimu':
      return <VariMuCompressor {...props} />
    case 'limiter':
      return <LimiterUnit {...props} />
    default:
      return <FETCompressor {...props} />
  }
}

export { FETCompressor, OptoCompressor, VCACompressor, VariMuCompressor, LimiterUnit }
