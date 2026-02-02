/**
 * LimiterCard Component
 *
 * Limiter control panel with ceiling threshold and gain reduction meter.
 * Uses the useDynamics hook for real-time updates.
 */

import { useDynamics } from '../../hooks/useDynamics'
import { ParameterKnob } from '../Controls/ParameterKnob'
import { GainReductionMeter } from './GainReductionMeter'

interface LimiterCardProps {
  accentColor?: string
  showTitle?: boolean
}

export function LimiterCard({
  accentColor = '#ff4488',
  showTitle = true
}: LimiterCardProps) {
  const {
    limiter,
    setLimiterThreshold,
    setLimiterRelease,
    setLimiterBypass,
    isConnected
  } = useDynamics()

  const { parameters, metering, isLoading } = limiter

  return (
    <div className={`dynamics-card limiter-card ${parameters.bypass ? 'bypassed' : ''}`}>
      {showTitle && (
        <div className="dynamics-card-header">
          <h3 className="dynamics-card-title">Limiter</h3>
          <div className="dynamics-card-controls">
            <button
              className={`bypass-btn ${parameters.bypass ? 'active' : ''}`}
              onClick={() => setLimiterBypass(!parameters.bypass)}
              title={parameters.bypass ? 'Enable' : 'Bypass'}
            >
              {parameters.bypass ? 'OFF' : 'ON'}
            </button>
            <span className={`connection-indicator ${isConnected ? 'connected' : ''}`} />
          </div>
        </div>
      )}

      <div className="dynamics-card-content">
        {/* Gain Reduction Meter */}
        <div className="dynamics-meter-section">
          <GainReductionMeter
            gainReduction={metering.gainReduction}
            height={100}
            width={20}
          />
        </div>

        {/* Parameters */}
        <div className="dynamics-knobs">
          <div className="dynamics-knob-row">
            <ParameterKnob
              label="Ceiling"
              value={parameters.threshold}
              min={-12}
              max={0}
              defaultValue={-1}
              step={0.1}
              unit="dB"
              onChange={setLimiterThreshold}
              accentColor={accentColor}
              size="medium"
            />
            <ParameterKnob
              label="Release"
              value={parameters.release}
              min={10}
              max={1000}
              defaultValue={100}
              step={1}
              unit="ms"
              onChange={setLimiterRelease}
              accentColor={accentColor}
              size="medium"
              isLogarithmic
            />
          </div>
        </div>
      </div>

      {/* Input/Output levels */}
      <div className="dynamics-card-footer">
        <div className="limiter-info">
          <span className="info-label">Brick-wall limiting</span>
        </div>
        <div className="dynamics-levels">
          <span className="level-label">In: {metering.inputLevel.toFixed(1)} dB</span>
          <span className="level-label">Out: {metering.outputLevel.toFixed(1)} dB</span>
        </div>
      </div>

      <style>{`
        .limiter-card {
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 16px;
          min-width: 220px;
        }

        .limiter-card.bypassed {
          opacity: 0.6;
        }

        .dynamics-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          padding-bottom: 8px;
          border-bottom: 1px solid #333;
        }

        .dynamics-card-title {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          color: #fff;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .dynamics-card-controls {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .bypass-btn {
          background: #333;
          border: 1px solid #555;
          border-radius: 4px;
          color: #888;
          font-size: 10px;
          padding: 4px 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .bypass-btn:hover {
          background: #444;
        }

        .bypass-btn.active {
          background: #ff4444;
          border-color: #ff4444;
          color: #fff;
        }

        .connection-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #444;
        }

        .connection-indicator.connected {
          background: #44ff44;
          box-shadow: 0 0 4px #44ff44;
        }

        .dynamics-card-content {
          display: flex;
          gap: 16px;
          align-items: center;
        }

        .dynamics-meter-section {
          display: flex;
          align-items: center;
        }

        .dynamics-knobs {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .dynamics-knob-row {
          display: flex;
          justify-content: space-around;
          gap: 8px;
        }

        .dynamics-card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 16px;
          padding-top: 8px;
          border-top: 1px solid #333;
        }

        .limiter-info {
          display: flex;
          align-items: center;
        }

        .info-label {
          font-size: 10px;
          color: #666;
          font-style: italic;
        }

        .dynamics-levels {
          display: flex;
          gap: 12px;
        }

        .level-label {
          font-size: 10px;
          color: #666;
          font-family: monospace;
        }
      `}</style>
    </div>
  )
}

export default LimiterCard
