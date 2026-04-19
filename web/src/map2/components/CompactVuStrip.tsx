import React from 'react'

import { AudioMeter } from '../../app/components/Visualizations/AudioMeter'
import { useVuMeters } from '../../app/hooks/useVuMeters'

import './CompactVuStrip.css'

interface CompactVuStripProps {
  nodeId?: string | null
}

export function CompactVuStrip({ nodeId }: CompactVuStripProps) {
  const { levels, peakHold, isConnected, isRunning } = useVuMeters({
    nodeId,
    pollingInterval: 33,
  })

  return (
    <section className="compact-vu-strip" aria-label="Live signal strip">
      <div className="compact-vu-strip__header">
        <div>
          <div className="compact-vu-strip__eyebrow">Realtime Metering</div>
          <h3 className="compact-vu-strip__title">Live Signal</h3>
        </div>
        <div
          className={`compact-vu-strip__status ${isRunning ? 'is-live' : 'is-standby'}`}
          aria-label={isRunning ? 'Live audio metering active' : 'Audio metering standby'}
        >
          <span
            className={`compact-vu-strip__dot ${isConnected ? 'is-connected' : 'is-polling'}`}
            aria-hidden="true"
          />
          {isRunning ? (isConnected ? 'Live' : 'Polling') : 'Standby'}
        </div>
      </div>

      <div className="compact-vu-strip__meters">
        <div className="compact-vu-strip__meter">
          <AudioMeter label="Input L" value={levels.inputLeft} peak={peakHold.inputLeft} compact />
        </div>
        <div className="compact-vu-strip__meter">
          <AudioMeter label="Input R" value={levels.inputRight} peak={peakHold.inputRight} compact />
        </div>
        <div className="compact-vu-strip__meter">
          <AudioMeter label="Output L" value={levels.outputLeft} peak={peakHold.outputLeft} compact />
        </div>
        <div className="compact-vu-strip__meter">
          <AudioMeter label="Output R" value={levels.outputRight} peak={peakHold.outputRight} compact />
        </div>
      </div>

      <p className="compact-vu-strip__caption">
        {isRunning
          ? 'Read-only input/output confirmation from the live engine metering stream.'
          : 'Start audio to confirm live input and output signal here.'}
      </p>
    </section>
  )
}

export default CompactVuStrip
