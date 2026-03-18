/**
 * CompressorCard Component
 *
 * Full compressor control panel with knobs and gain reduction meter.
 * Uses the useDynamics hook for real-time updates.
 */

import { useDynamics } from '../../hooks/useDynamics'
import { ParameterKnob } from '../Controls/ParameterKnob'
import { GainReductionMeter } from './GainReductionMeter'

interface CompressorCardProps {
  accentColor?: string
  showTitle?: boolean
  nodeId?: string | null
}

export function CompressorCard({
  accentColor = '#ff6644',
  showTitle = true,
  nodeId,
}: CompressorCardProps) {
  const {
    compressor,
    setCompressorThreshold,
    setCompressorRatio,
    setCompressorAttack,
    setCompressorRelease,
    setCompressorKnee,
    setCompressorMakeupGain,
    setCompressorAutoMakeup,
    setCompressorBypass,
    isConnected
  } = useDynamics({ nodeId })

  const { parameters, metering, isLoading } = compressor

  return (
    <div className={`dynamics-card compressor-card ${parameters.bypass ? 'bypassed' : ''}`}>
      {showTitle && (
        <div className="dynamics-card-header">
          <h3 className="dynamics-card-title">Compressor</h3>
          <div className="dynamics-card-controls">
            <button
              className={`bypass-btn ${parameters.bypass ? 'active' : ''}`}
              onClick={() => setCompressorBypass(!parameters.bypass)}
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
            height={140}
            width={20}
          />
        </div>

        {/* Parameters */}
        <div className="dynamics-knobs">
          <div className="dynamics-knob-row">
            <ParameterKnob
              label="Threshold"
              value={parameters.threshold}
              min={-60}
              max={0}
              defaultValue={-12}
              step={0.5}
              unit="dB"
              onChange={setCompressorThreshold}
              accentColor={accentColor}
              size="medium"
            />
            <ParameterKnob
              label="Ratio"
              value={parameters.ratio}
              min={1}
              max={20}
              defaultValue={4}
              step={0.1}
              unit=":1"
              onChange={setCompressorRatio}
              accentColor={accentColor}
              size="medium"
              valueFormatter={(v) => v >= 20 ? 'Inf' : v.toFixed(1)}
            />
          </div>

          <div className="dynamics-knob-row">
            <ParameterKnob
              label="Attack"
              value={parameters.attack}
              min={0.1}
              max={500}
              defaultValue={10}
              step={0.1}
              unit="ms"
              onChange={setCompressorAttack}
              accentColor={accentColor}
              size="medium"
              isLogarithmic
            />
            <ParameterKnob
              label="Release"
              value={parameters.release}
              min={10}
              max={5000}
              defaultValue={100}
              step={1}
              unit="ms"
              onChange={setCompressorRelease}
              accentColor={accentColor}
              size="medium"
              isLogarithmic
            />
          </div>

          <div className="dynamics-knob-row">
            <ParameterKnob
              label="Knee"
              value={parameters.knee}
              min={0}
              max={24}
              defaultValue={6}
              step={0.5}
              unit="dB"
              onChange={setCompressorKnee}
              accentColor={accentColor}
              size="medium"
            />
            <ParameterKnob
              label="Makeup"
              value={parameters.makeupGain}
              min={-12}
              max={24}
              defaultValue={0}
              step={0.5}
              unit="dB"
              onChange={setCompressorMakeupGain}
              accentColor={accentColor}
              size="medium"
            />
          </div>
        </div>
      </div>

      {/* Auto Makeup Toggle */}
      <div className="dynamics-card-footer">
        <label className="auto-makeup-toggle">
          <input
            type="checkbox"
            checked={parameters.autoMakeup}
            onChange={(e) => setCompressorAutoMakeup(e.target.checked)}
          />
          <span>Auto Makeup</span>
        </label>

        {/* Input/Output levels */}
        <div className="dynamics-levels">
          <span className="level-label">In: {metering.inputLevel.toFixed(1)} dB</span>
          <span className="level-label">Out: {metering.outputLevel.toFixed(1)} dB</span>
        </div>
      </div>

      <style>{`
        .dynamics-card {
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 16px;
          min-width: 280px;
        }

        .dynamics-card.bypassed {
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

        .auto-makeup-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: #888;
          cursor: pointer;
        }

        .auto-makeup-toggle input {
          accent-color: ${accentColor};
        }

        .dynamics-levels {
          display: flex;
          gap: 12px;
        }

        .level-label {
          font-size: 10px;
          color: #666;
          font-family: var(--font-ui-tight);
        }
      `}</style>
    </div>
  )
}

export default CompressorCard
