/**
 * GateCard Component
 *
 * Noise Gate control panel with threshold, ratio, attack/release and gain reduction meter.
 * Uses the useDynamics hook for real-time updates.
 */

import { useDynamics } from '../../hooks/useDynamics'
import { ParameterKnob } from '../Controls/ParameterKnob'
import { GainReductionMeter } from './GainReductionMeter'

interface GateCardProps {
  accentColor?: string
  showTitle?: boolean
}

export function GateCard({
  accentColor = '#44aaff',
  showTitle = true
}: GateCardProps) {
  const {
    gate,
    setGateThreshold,
    setGateRatio,
    setGateAttack,
    setGateRelease,
    setGateBypass,
    isConnected
  } = useDynamics()

  const { parameters, metering, isLoading } = gate

  // Gate shows gain reduction inverted (how much is being cut)
  const gateAttenuation = Math.abs(metering.gainReduction)

  return (
    <div className={`dynamics-card gate-card ${parameters.bypass ? 'bypassed' : ''}`}>
      {showTitle && (
        <div className="dynamics-card-header">
          <h3 className="dynamics-card-title">Noise Gate</h3>
          <div className="dynamics-card-controls">
            <button
              className={`bypass-btn ${parameters.bypass ? 'active' : ''}`}
              onClick={() => setGateBypass(!parameters.bypass)}
              title={parameters.bypass ? 'Enable' : 'Bypass'}
            >
              {parameters.bypass ? 'OFF' : 'ON'}
            </button>
            <span className={`connection-indicator ${isConnected ? 'connected' : ''}`} />
          </div>
        </div>
      )}

      <div className="dynamics-card-content">
        {/* Gate Indicator */}
        <div className="dynamics-meter-section">
          <div className="gate-indicator">
            <div
              className={`gate-status ${gateAttenuation > 1 ? 'closed' : 'open'}`}
              title={gateAttenuation > 1 ? 'Gate Closed' : 'Gate Open'}
            >
              {gateAttenuation > 1 ? 'CLOSED' : 'OPEN'}
            </div>
            <div className="gate-attenuation">
              -{gateAttenuation.toFixed(1)} dB
            </div>
          </div>
        </div>

        {/* Parameters */}
        <div className="dynamics-knobs">
          <div className="dynamics-knob-row">
            <ParameterKnob
              label="Threshold"
              value={parameters.threshold}
              min={-80}
              max={0}
              defaultValue={-40}
              step={0.5}
              unit="dB"
              onChange={setGateThreshold}
              accentColor={accentColor}
              size="medium"
            />
            <ParameterKnob
              label="Ratio"
              value={parameters.ratio}
              min={1}
              max={100}
              defaultValue={10}
              step={0.5}
              unit=":1"
              onChange={setGateRatio}
              accentColor={accentColor}
              size="medium"
              valueFormatter={(v) => v >= 100 ? 'Inf' : v.toFixed(1)}
            />
          </div>

          <div className="dynamics-knob-row">
            <ParameterKnob
              label="Attack"
              value={parameters.attack}
              min={0.01}
              max={100}
              defaultValue={1}
              step={0.01}
              unit="ms"
              onChange={setGateAttack}
              accentColor={accentColor}
              size="medium"
              isLogarithmic
            />
            <ParameterKnob
              label="Release"
              value={parameters.release}
              min={10}
              max={2000}
              defaultValue={100}
              step={1}
              unit="ms"
              onChange={setGateRelease}
              accentColor={accentColor}
              size="medium"
              isLogarithmic
            />
          </div>
        </div>
      </div>

      {/* Input/Output levels */}
      <div className="dynamics-card-footer">
        <div className="dynamics-levels">
          <span className="level-label">In: {metering.inputLevel.toFixed(1)} dB</span>
          <span className="level-label">Out: {metering.outputLevel.toFixed(1)} dB</span>
        </div>
      </div>

      <style>{`
        .gate-card {
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 16px;
          min-width: 280px;
        }

        .gate-card.bypassed {
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
        }

        .dynamics-meter-section {
          display: flex;
          align-items: center;
        }

        .gate-indicator {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          min-width: 60px;
        }

        .gate-status {
          padding: 6px 10px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          transition: all 0.1s;
        }

        .gate-status.open {
          background: #2a4a2a;
          color: #66ff66;
          border: 1px solid #44aa44;
        }

        .gate-status.closed {
          background: #4a2a2a;
          color: #ff6666;
          border: 1px solid #aa4444;
        }

        .gate-attenuation {
          font-size: 11px;
          color: #888;
          font-family: monospace;
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
          justify-content: flex-end;
          align-items: center;
          margin-top: 16px;
          padding-top: 8px;
          border-top: 1px solid #333;
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

export default GateCard
