import React, { useState } from 'react'
import { Tag, TextInput, Tile } from '@carbon/react'
import { tesiraApi } from '../../../../../map2/api'
import { NumberInput } from '../../../ParameterControl'
import './TesiraCarbonChrome.css'

interface TesiraEQTabProps {
  deviceId: string
}

const BANDS = [
  { label: 'Low', band: 0, defaultFreq: 80 },
  { label: 'Low Mid', band: 1, defaultFreq: 250 },
  { label: 'High Mid', band: 2, defaultFreq: 2500 },
  { label: 'High', band: 3, defaultFreq: 10000 },
]

function buildEqPath(bands: Array<{ freq: number; gain: number; q: number }>, width: number, height: number) {
  const points: string[] = []
  for (let i = 0; i <= 96; i += 1) {
    const t = i / 96
    const freq = 20 * Math.pow(1000, t)
    let gain = 0
    for (const band of bands) {
      const ratio = Math.log2(Math.max(freq, 1) / Math.max(band.freq, 1))
      const spread = Math.max(0.08, 1 / Math.max(band.q, 0.1))
      gain += band.gain * Math.exp(-(ratio * ratio) / (2 * spread * spread))
    }
    const clamped = Math.max(-15, Math.min(15, gain))
    const x = t * width
    const y = ((15 - clamped) / 30) * height
    points.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
  }
  return points.join(' ')
}

export function TesiraEQTab({ deviceId }: TesiraEQTabProps) {
  const [instanceTag, setInstanceTag] = useState('EQControl1')
  const [bandState, setBandState] = useState<Array<{ freq: number; gain: number; q: number }>>(
    BANDS.map((band) => ({ freq: band.defaultFreq, gain: 0, q: 1.0 })),
  )

  function handleFreq(bandIdx: number, freq: number) {
    setBandState((state) => state.map((band, index) => (index === bandIdx ? { ...band, freq } : band)))
    tesiraApi.setEQBandFreq(deviceId, instanceTag, bandIdx, freq).catch(() => undefined)
  }

  function handleGain(bandIdx: number, gain: number) {
    setBandState((state) => state.map((band, index) => (index === bandIdx ? { ...band, gain } : band)))
    tesiraApi.setEQBandGain(deviceId, instanceTag, bandIdx, gain).catch(() => undefined)
  }

  function handleQ(bandIdx: number, q: number) {
    setBandState((state) => state.map((band, index) => (index === bandIdx ? { ...band, q } : band)))
    tesiraApi.setEQBandQ(deviceId, instanceTag, bandIdx, q).catch(() => undefined)
  }

  return (
    <div className="tesira-eq-tab">
      <Tile className="tesira-eq-tab__tile">
        <div className="tesira-eq-tab__header">
          <div>
            <p className="tesira-dashboard__eyebrow">Equalizer</p>
            <h3 className="tesira-dashboard__title">Tune a Tesira EQ block</h3>
            <p className="tesira-dashboard__summary">
              Adjust frequency, gain, and Q per band while previewing the combined response curve from the dedicated Tesira route.
            </p>
          </div>
          <div className="tesira-eq-tab__tags">
            <Tag type="cool-gray" size="sm">{instanceTag}</Tag>
            <Tag type="warm-gray" size="sm">{`${BANDS.length} bands`}</Tag>
          </div>
        </div>

        <TextInput
          id={`tesira-eq-instance-${deviceId}`}
          labelText="EQ instance tag"
          value={instanceTag}
          onChange={(event) => setInstanceTag(event.target.value)}
        />

        <div className="tesira-eq-tab__preview">
          <p className="tesira-dashboard__stat-label">EQ response preview</p>
          <svg width="100%" height="140" viewBox="0 0 720 140" preserveAspectRatio="none">
            <line x1="0" y1="70" x2="720" y2="70" stroke="var(--cds-border-subtle)" strokeDasharray="4 4" />
            <path
              d={buildEqPath(bandState, 720, 140)}
              fill="none"
              stroke="var(--cds-link-primary)"
              strokeWidth="2.2"
            />
          </svg>
        </div>
      </Tile>

      <div className="tesira-eq-tab__grid">
        {BANDS.map((band, index) => (
          <Tile key={band.band} className="tesira-eq-tab__band">
            <div className="tesira-eq-tab__band-header">
              <h4 className="tesira-levels-tab__channel-title">{band.label}</h4>
              <div className="tesira-eq-tab__tags">
                <Tag type="blue" size="sm">{`${bandState[index].freq} Hz`}</Tag>
                <Tag type="cool-gray" size="sm">{`${bandState[index].gain.toFixed(1)} dB`}</Tag>
                <Tag type="warm-gray" size="sm">{`Q ${bandState[index].q.toFixed(2)}`}</Tag>
              </div>
            </div>

            <div className="tesira-eq-tab__control">
              <span className="tesira-eq-tab__label">
                Frequency
              </span>
              <NumberInput
                label={`Frequency for ${band.label}`}
                className="tesira-eq-tab__range"
                min={20}
                max={20000}
                step={10}
                value={bandState[index].freq}
                unit="Hz"
                profile="frequency"
                precision={0}
                showLabel={false}
                showBounds={false}
                size="small"
                onChange={(value) => handleFreq(index, value)}
              />
            </div>

            <div className="tesira-eq-tab__control">
              <span className="tesira-eq-tab__label">
                Gain
              </span>
              <NumberInput
                label={`Gain for ${band.label}`}
                className="tesira-eq-tab__range"
                min={-15}
                max={15}
                step={0.5}
                value={bandState[index].gain}
                unit="dB"
                profile="gain-db"
                precision={1}
                showLabel={false}
                showBounds={false}
                size="small"
                onChange={(value) => handleGain(index, value)}
              />
            </div>

            <div className="tesira-eq-tab__control">
              <span className="tesira-eq-tab__label">
                Q
              </span>
              <NumberInput
                label={`Q for ${band.label}`}
                className="tesira-eq-tab__range"
                min={0.1}
                max={10}
                step={0.05}
                value={bandState[index].q}
                precision={2}
                showLabel={false}
                showBounds={false}
                size="small"
                onChange={(value) => handleQ(index, value)}
              />
            </div>
          </Tile>
        ))}
      </div>
    </div>
  )
}
