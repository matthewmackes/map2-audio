/**
 * GainReductionMeter Component
 *
 * Vertical meter showing gain reduction with smooth animation.
 * Red bars grow downward from 0 dB to show compression amount.
 */

import { memo, useMemo, useRef } from 'react'
import { useResponsiveVizSize } from '../PluginCards/Visualizations/useResponsiveVizSize'

interface GainReductionMeterProps {
  gainReduction: number  // dB (positive value = reduction)
  maxReduction?: number  // Maximum dB to display
  height?: number
  width?: number
  showLabel?: boolean
  showValue?: boolean
}

function GainReductionMeterComponent({
  gainReduction,
  maxReduction = 24,
  height,
  width,
  showLabel = true,
  showValue = true
}: GainReductionMeterProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Compute responsive dimensions based on container height (tall aspect ratio)
  const dimensions = useResponsiveVizSize(containerRef, {
    width,
    height,
    aspectRatio: 24 / 120, // Original aspect ratio (tall: 0.2)
    baseOn: 'height', // Derive width from height
    defaultWidth: 24,
    defaultHeight: 120,
  })
  // Calculate bar height as percentage
  const barHeight = useMemo(() => {
    const clamped = Math.min(Math.max(gainReduction, 0), maxReduction)
    return (clamped / maxReduction) * 100
  }, [gainReduction, maxReduction])

  // Generate scale markers
  const markers = useMemo(() => {
    const steps = [0, 6, 12, 18, 24].filter(v => v <= maxReduction)
    return steps.map(db => ({
      db,
      position: (db / maxReduction) * 100
    }))
  }, [maxReduction])

  return (
    <div ref={containerRef} className="gr-meter" style={{ width: dimensions.width + 30 }}>
      {showLabel && <div className="gr-meter-label">GR</div>}

      <div className="gr-meter-container" style={{ height: dimensions.height, width: dimensions.width }}>
        {/* Scale markers */}
        <div className="gr-meter-scale">
          {markers.map(m => (
            <div
              key={m.db}
              className="gr-meter-marker"
              style={{ top: `${m.position}%` }}
            >
              <span className="gr-meter-marker-line" />
              <span className="gr-meter-marker-label">-{m.db}</span>
            </div>
          ))}
        </div>

        {/* Meter track */}
        <div className="gr-meter-track">
          {/* Reduction bar (grows downward from top) */}
          <div
            className="gr-meter-bar"
            style={{
              height: `${barHeight}%`,
              backgroundColor: gainReduction > 12 ? '#ff4444' : gainReduction > 6 ? '#ff8844' : '#ffaa44'
            }}
          />
        </div>
      </div>

      {showValue && (
        <div className="gr-meter-value">
          {gainReduction > 0.1 ? `-${gainReduction.toFixed(1)}` : '0.0'} dB
        </div>
      )}

      <style>{`
        .gr-meter {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .gr-meter-label {
          font-size: 10px;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .gr-meter-container {
          position: relative;
          display: flex;
          gap: 4px;
        }

        .gr-meter-scale {
          position: absolute;
          right: 100%;
          top: 0;
          bottom: 0;
          width: 24px;
          padding-right: 2px;
        }

        .gr-meter-marker {
          position: absolute;
          right: 0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          transform: translateY(-50%);
        }

        .gr-meter-marker-line {
          width: 4px;
          height: 1px;
          background: #444;
          margin-left: 2px;
        }

        .gr-meter-marker-label {
          font-size: 8px;
          color: #666;
          width: 18px;
          text-align: right;
        }

        .gr-meter-track {
          width: 100%;
          height: 100%;
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 2px;
          overflow: hidden;
        }

        .gr-meter-bar {
          width: 100%;
          transition: height 0.05s linear;
          box-shadow: 0 0 8px currentColor;
        }

        .gr-meter-value {
          font-size: 10px;
          color: #ccc;
          font-family: monospace;
          min-width: 50px;
          text-align: center;
        }
      `}</style>
    </div>
  )
}

export const GainReductionMeter = memo(GainReductionMeterComponent)

export default GainReductionMeter
