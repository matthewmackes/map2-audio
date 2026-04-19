/**
 * EQCard Component
 *
 * 8-band parametric EQ control panel with frequency response visualization.
 * Uses the useFilters hook for real-time updates.
 */

import { useState, useMemo, useCallback } from 'react'
import { useFilters, FilterType, EQBandParams } from '../../hooks/useFilters'
import { ParameterKnob } from '../ParameterControl'
import { ParameterControl } from '../ParameterControl'
import { requireParameterDescriptor } from '../../data/parameterSchema'

interface EQCardProps {
  accentColor?: string
  showTitle?: boolean
  nodeId?: string | null
}

const FILTER_TYPES: { value: FilterType; label: string }[] = [
  { value: 'peak', label: 'Peak' },
  { value: 'lowshelf', label: 'Low Shelf' },
  { value: 'highshelf', label: 'High Shelf' },
  { value: 'lowpass', label: 'Low Pass' },
  { value: 'highpass', label: 'High Pass' },
  { value: 'bandpass', label: 'Band Pass' },
  { value: 'notch', label: 'Notch' },
]

const EQ_FREQUENCY_DESCRIPTOR = requireParameterDescriptor('map2://juce/eq/parametric', 'bandFrequency')

// Logarithmic frequency scale for visualization
const VIS_FREQUENCIES = Array.from({ length: 256 }, (_, i) => {
  const t = i / 255
  return 20 * Math.pow(1000, t) // 20Hz to 20kHz logarithmic
})

function formatFrequency(hz: number): string {
  if (hz >= 1000) {
    return `${(hz / 1000).toFixed(1)}k`
  }
  return `${Math.round(hz)}`
}

export function EQCard({
  accentColor = '#44aaff',
  showTitle = true,
  nodeId,
}: EQCardProps) {
  const {
    bands,
    outputGain,
    bypass,
    frequencyResponse,
    isLoading,
    isUpdating,
    setBandFrequency,
    setBandGain,
    setBandQ,
    setBandType,
    setBandEnabled,
    setOutputGain,
    setBypass
  } = useFilters({ nodeId })

  const [selectedBand, setSelectedBand] = useState<number | null>(null)
  const [expandedView, setExpandedView] = useState(false)

  // Generate frequency response SVG path
  const responsePath = useMemo(() => {
    if (!frequencyResponse.frequencies.length || !frequencyResponse.response.length) {
      return ''
    }

    const width = 600
    const height = 180
    const padding = { left: 40, right: 20, top: 20, bottom: 30 }
    const graphWidth = width - padding.left - padding.right
    const graphHeight = height - padding.top - padding.bottom

    // Map frequencies to x positions (logarithmic)
    const freqToX = (freq: number): number => {
      const minLog = Math.log10(20)
      const maxLog = Math.log10(20000)
      const t = (Math.log10(Math.max(20, Math.min(20000, freq))) - minLog) / (maxLog - minLog)
      return padding.left + t * graphWidth
    }

    // Map dB to y position
    const dbToY = (db: number): number => {
      const clampedDb = Math.max(-24, Math.min(24, db))
      const t = (clampedDb + 24) / 48 // -24 to +24 dB range
      return padding.top + graphHeight - t * graphHeight
    }

    // Build SVG path
    let pathData = ''
    const freqs = frequencyResponse.frequencies
    const response = frequencyResponse.response

    for (let i = 0; i < freqs.length; i++) {
      const x = freqToX(freqs[i])
      const y = dbToY(response[i])
      if (i === 0) {
        pathData = `M ${x} ${y}`
      } else {
        pathData += ` L ${x} ${y}`
      }
    }

    return pathData
  }, [frequencyResponse])

  // Calculate band marker positions
  const bandMarkers = useMemo(() => {
    const width = 600
    const height = 180
    const padding = { left: 40, right: 20, top: 20, bottom: 30 }
    const graphWidth = width - padding.left - padding.right
    const graphHeight = height - padding.top - padding.bottom

    return bands.map((band, index) => {
      const minLog = Math.log10(20)
      const maxLog = Math.log10(20000)
      const t = (Math.log10(Math.max(20, Math.min(20000, band.frequency))) - minLog) / (maxLog - minLog)
      const x = padding.left + t * graphWidth
      const clampedGain = Math.max(-24, Math.min(24, band.gain))
      const gainT = (clampedGain + 24) / 48
      const y = padding.top + graphHeight - gainT * graphHeight

      return { x, y, band, index }
    })
  }, [bands])

  const handleBandClick = useCallback((index: number) => {
    setSelectedBand(selectedBand === index ? null : index)
  }, [selectedBand])

  const selectedBandData = selectedBand !== null ? bands[selectedBand] : null

  return (
    <div className={`eq-card ${bypass ? 'bypassed' : ''}`}>
      {showTitle && (
        <div className="eq-card-header">
          <h3 className="eq-card-title">Parametric EQ</h3>
          <div className="eq-card-controls">
            <button
              className="expand-btn"
              onClick={() => setExpandedView(!expandedView)}
              title={expandedView ? 'Compact view' : 'Expanded view'}
            >
              {expandedView ? '−' : '+'}
            </button>
            <button
              className={`bypass-btn ${bypass ? 'active' : ''}`}
              onClick={() => setBypass(!bypass)}
              title={bypass ? 'Enable EQ' : 'Bypass EQ'}
            >
              {bypass ? 'OFF' : 'ON'}
            </button>
          </div>
        </div>
      )}

      {/* Frequency Response Graph */}
      <div className="eq-graph-container">
        <svg
          className="eq-graph"
          viewBox="0 0 600 180"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Grid lines */}
          <defs>
            <pattern id="eqGrid" width="1" height="1" patternUnits="userSpaceOnUse"
              patternTransform="translate(40, 20)">
              <line x1="0" y1="0" x2="0" y2="130" stroke="#2a2a2a" strokeWidth="1" />
            </pattern>
          </defs>

          {/* Horizontal grid lines (dB) */}
          {[-24, -18, -12, -6, 0, 6, 12, 18, 24].map((db) => {
            const y = 20 + 130 - ((db + 24) / 48) * 130
            return (
              <g key={db}>
                <line
                  x1="40"
                  y1={y}
                  x2="580"
                  y2={y}
                  stroke={db === 0 ? '#444' : '#2a2a2a'}
                  strokeWidth={db === 0 ? 1.5 : 1}
                />
                <text x="35" y={y + 4} className="eq-axis-label" textAnchor="end">
                  {db > 0 ? `+${db}` : db}
                </text>
              </g>
            )
          })}

          {/* Vertical grid lines (frequency) */}
          {[20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].map((freq) => {
            const minLog = Math.log10(20)
            const maxLog = Math.log10(20000)
            const t = (Math.log10(freq) - minLog) / (maxLog - minLog)
            const x = 40 + t * 540
            return (
              <g key={freq}>
                <line
                  x1={x}
                  y1="20"
                  x2={x}
                  y2="150"
                  stroke="#2a2a2a"
                  strokeWidth="1"
                />
                <text x={x} y="165" className="eq-axis-label" textAnchor="middle">
                  {formatFrequency(freq)}
                </text>
              </g>
            )
          })}

          {/* Response curve */}
          {responsePath && (
            <path
              d={responsePath}
              fill="none"
              stroke={accentColor}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={bypass ? 0.3 : 0.8}
            />
          )}

          {/* Band markers */}
          {bandMarkers.map(({ x, y, band, index }) => (
            <g
              key={index}
              className={`eq-band-marker ${selectedBand === index ? 'selected' : ''} ${!band.enabled ? 'disabled' : ''}`}
              onClick={() => handleBandClick(index)}
              style={{ cursor: 'pointer' }}
            >
              <circle
                cx={x}
                cy={y}
                r={selectedBand === index ? 10 : 8}
                fill={band.enabled ? accentColor : '#555'}
                stroke={selectedBand === index ? '#fff' : 'transparent'}
                strokeWidth="2"
                opacity={band.enabled ? 1 : 0.5}
              />
              <text
                x={x}
                y={y + 4}
                className="eq-band-number"
                textAnchor="middle"
              >
                {index + 1}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* Band Quick Controls */}
      <div className="eq-bands-strip">
        {bands.map((band, index) => (
          <div
            key={index}
            className={`eq-band-chip ${selectedBand === index ? 'selected' : ''} ${!band.enabled ? 'disabled' : ''}`}
            onClick={() => handleBandClick(index)}
          >
            <span className="eq-band-chip-freq">{formatFrequency(band.frequency)}</span>
            <span className="eq-band-chip-gain">
              {band.gain >= 0 ? '+' : ''}{band.gain.toFixed(1)}
            </span>
            <button
              className={`eq-band-enable ${band.enabled ? 'on' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setBandEnabled(index, !band.enabled)
              }}
            />
          </div>
        ))}
      </div>

      {/* Selected Band Controls */}
      {selectedBand !== null && selectedBandData && (
        <div className="eq-band-editor">
          <div className="eq-band-editor-header">
            <span>Band {selectedBand + 1}</span>
            <select
              value={selectedBandData.type}
              onChange={(e) => setBandType(selectedBand, e.target.value as FilterType)}
              className="eq-type-select"
            >
              {FILTER_TYPES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className="eq-band-knobs">
            <ParameterControl
              descriptor={EQ_FREQUENCY_DESCRIPTOR}
              variant="knob"
              label="Frequency"
              value={selectedBandData.frequency}
              onLiveChange={(value) => setBandFrequency(selectedBand, value)}
              accentColor={accentColor}
              size="medium"
              showBounds={false}
              valueFormatter={formatFrequency}
            />
            <ParameterKnob
              label="Gain"
              value={selectedBandData.gain}
              min={-24}
              max={24}
              defaultValue={0}
              step={0.5}
              unit="dB"
              onChange={(v) => setBandGain(selectedBand, v)}
              accentColor={accentColor}
              size="medium"
              valueFormatter={(v) => v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1)}
            />
            <ParameterKnob
              label="Q"
              value={selectedBandData.q}
              min={0.1}
              max={10}
              defaultValue={1}
              step={0.1}
              onChange={(v) => setBandQ(selectedBand, v)}
              accentColor={accentColor}
              size="medium"
              isLogarithmic
            />
          </div>
        </div>
      )}

      {/* Expanded View: All Bands */}
      {expandedView && (
        <div className="eq-expanded-bands">
          {bands.map((band, index) => (
            <div key={index} className={`eq-expanded-band ${!band.enabled ? 'disabled' : ''}`}>
              <div className="eq-expanded-band-header">
                <span className="eq-band-label">Band {index + 1}</span>
                <button
                  className={`eq-band-toggle ${band.enabled ? 'on' : ''}`}
                  onClick={() => setBandEnabled(index, !band.enabled)}
                >
                  {band.enabled ? 'ON' : 'OFF'}
                </button>
              </div>
              <div className="eq-expanded-band-knobs">
                <ParameterControl
                  descriptor={EQ_FREQUENCY_DESCRIPTOR}
                  variant="knob"
                  label="Freq"
                  value={band.frequency}
                  onLiveChange={(value) => setBandFrequency(index, value)}
                  accentColor={accentColor}
                  size="small"
                  showBounds={false}
                  valueFormatter={formatFrequency}
                />
                <ParameterKnob
                  label="Gain"
                  value={band.gain}
                  min={-24}
                  max={24}
                  step={0.5}
                  unit="dB"
                  onChange={(v) => setBandGain(index, v)}
                  accentColor={accentColor}
                  size="small"
                  valueFormatter={(v) => v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1)}
                />
                <ParameterKnob
                  label="Q"
                  value={band.q}
                  min={0.1}
                  max={10}
                  step={0.1}
                  onChange={(v) => setBandQ(index, v)}
                  accentColor={accentColor}
                  size="small"
                  isLogarithmic
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Output Controls */}
      <div className="eq-output-section">
        <ParameterKnob
          label="Output"
          value={outputGain}
          min={-12}
          max={12}
          defaultValue={0}
          step={0.5}
          unit="dB"
          onChange={setOutputGain}
          accentColor={accentColor}
          size="medium"
          valueFormatter={(v) => v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1)}
        />
      </div>

      <style>{`
        .eq-card {
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 16px;
          min-width: 400px;
        }

        .eq-card.bypassed {
          opacity: 0.6;
        }

        .eq-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid #333;
        }

        .eq-card-title {
          margin: 0;
          font-size: var(--cds-heading-01-font-size);
          line-height: var(--cds-heading-01-line-height);
          font-weight: 600;
          color: #fff;
          letter-spacing: 0.16px;
        }

        .eq-card-controls {
          display: flex;
          gap: 8px;
        }

        .expand-btn,
        .bypass-btn {
          background: #333;
          border: 1px solid #555;
          border-radius: 4px;
          color: #888;
          font-size: var(--cds-body-compact-01-font-size, 0.875rem);
          padding: 4px 10px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .expand-btn:hover,
        .bypass-btn:hover {
          background: #444;
        }

        .bypass-btn.active {
          background: #ff4444;
          border-color: #ff4444;
          color: #fff;
        }

        .eq-graph-container {
          background: #111;
          border-radius: 6px;
          padding: 8px;
          margin-bottom: 12px;
        }

        .eq-graph {
          width: 100%;
          height: auto;
          max-height: 180px;
        }

        .eq-axis-label {
          fill: #666;
          font-size: var(--cds-helper-text-01-font-size, 0.75rem);
          font-family: var(--font-ui-tight);
        }

        .eq-band-number {
          fill: #fff;
          font-size: var(--cds-helper-text-01-font-size, 0.75rem);
          font-weight: 600;
          pointer-events: none;
        }

        .eq-band-marker.disabled circle {
          opacity: 0.3;
        }

        .eq-band-marker.selected circle {
          filter: drop-shadow(0 0 6px ${accentColor});
        }

        .eq-bands-strip {
          display: flex;
          gap: 6px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }

        .eq-band-chip {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 6px 10px;
          background: #252525;
          border: 1px solid #333;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          min-width: 50px;
        }

        .eq-band-chip:hover {
          background: #2a2a2a;
          border-color: #444;
        }

        .eq-band-chip.selected {
          border-color: ${accentColor};
          background: rgba(68, 170, 255, 0.1);
        }

        .eq-band-chip.disabled {
          opacity: 0.4;
        }

        .eq-band-chip-freq {
          font-size: var(--cds-helper-text-01-font-size, 0.75rem);
          color: #aaa;
          font-family: var(--font-ui-tight);
        }

        .eq-band-chip-gain {
          font-size: var(--cds-helper-text-01-font-size, 0.75rem);
          color: #666;
          font-family: var(--font-ui-tight);
        }

        .eq-band-enable {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          border: none;
          background: #444;
          margin-top: 4px;
          cursor: pointer;
        }

        .eq-band-enable.on {
          background: ${accentColor};
          box-shadow: 0 0 4px ${accentColor};
        }

        .eq-band-editor {
          background: #222;
          border-radius: 6px;
          padding: 12px;
          margin-bottom: 12px;
        }

        .eq-band-editor-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          color: #fff;
          font-size: var(--cds-body-compact-01-font-size, 0.875rem);
          font-weight: 600;
        }

        .eq-type-select {
          background: #333;
          border: 1px solid #444;
          border-radius: 4px;
          color: #fff;
          padding: 4px 8px;
          font-size: var(--cds-helper-text-01-font-size, 0.75rem);
          cursor: pointer;
        }

        .eq-band-knobs {
          display: flex;
          justify-content: space-around;
          gap: 12px;
        }

        .eq-expanded-bands {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 12px;
        }

        .eq-expanded-band {
          background: #222;
          border-radius: 6px;
          padding: 'var(--cds-spacing-04, 0.75rem)';
        }

        .eq-expanded-band.disabled {
          opacity: 0.4;
        }

        .eq-expanded-band-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .eq-band-label {
          font-size: var(--cds-label-01-font-size);
          line-height: var(--cds-label-01-line-height);
          color: #888;
          letter-spacing: var(--cds-label-01-letter-spacing);
        }

        .eq-band-toggle {
          background: #333;
          border: 1px solid #444;
          border-radius: 3px;
          color: #666;
          font-size: var(--cds-helper-text-01-font-size, 0.75rem);
          padding: 2px 6px;
          cursor: pointer;
        }

        .eq-band-toggle.on {
          background: ${accentColor};
          border-color: ${accentColor};
          color: #fff;
        }

        .eq-expanded-band-knobs {
          display: flex;
          justify-content: space-around;
          gap: 4px;
        }

        .eq-output-section {
          display: flex;
          justify-content: center;
          padding-top: 12px;
          border-top: 1px solid #333;
        }

        /* Param knob styles */
        .param-knob {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .param-knob.disabled {
          opacity: 0.4;
          pointer-events: none;
        }

        .param-knob-label {
          color: #888;
          font-size: var(--cds-label-01-font-size);
          line-height: var(--cds-label-01-line-height);
          letter-spacing: var(--cds-label-01-letter-spacing);
        }

        .param-knob-dial {
          cursor: grab;
          user-select: none;
        }

        .param-knob-dial:active {
          cursor: grabbing;
        }

        .param-knob-value {
          color: #fff;
          font-family: var(--font-ui-tight);
        }

        @media (max-width: 600px) {
          .eq-expanded-bands {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </div>
  )
}

export default EQCard
