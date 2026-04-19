/**
 * LooperCard - TooB 4Looper
 *
 * Uses InstrumentCategoryLayout for Carbon-compliant structure.
 * 4-track looper with transport controls in advancedSections.
 */

import { useState } from 'react'
import { Recording, PlayFilled, TrashCan } from '@carbon/icons-react'
import { InstrumentCategoryLayout, type ParamSlot } from '../../Layouts/InstrumentCategoryLayout'
import type { PluginCardProps } from '../../types'
import { resolvePluginAccentColor } from '../../../../utils/pluginAccent'
import type { AdvancedSection } from '../../Base/CarbonCardShell'

const TRACKS = 4
const PARAMS_PER_TRACK = 4

const getTrackParam = (track: number, param: 'record' | 'play' | 'volume' | 'clear') => {
  const offsets = { record: 0, play: 1, volume: 2, clear: 3 }
  return track * PARAMS_PER_TRACK + offsets[param]
}

const TRACK_COLORS = ['#ff6b6b', '#4ecdc4', '#f59e0b', '#8b5cf6']

function LooperCardBase({
  plugin,
  parameterValues,
  onParameterChange,
  accentColor: providedAccent,
  compact = false,
}: PluginCardProps) {
  const accentColor = resolvePluginAccentColor(providedAccent, plugin.uri, plugin.category)
  const [selectedTrack, setSelectedTrack] = useState(0)

  const getValue = (track: number, param: 'record' | 'play' | 'volume' | 'clear', defaultVal: number) =>
    parameterValues[getTrackParam(track, param)] ?? defaultVal

  const setValue = (track: number, param: 'record' | 'play' | 'volume' | 'clear', value: number) =>
    onParameterChange(getTrackParam(track, param), value)

  const visualization = (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {Array.from({ length: TRACKS }, (_, i) => {
          const isRecording = getValue(i, 'record', 0) > 0.5
          const isPlaying = getValue(i, 'play', 0) > 0.5
          const volume = getValue(i, 'volume', 80)
          return (
            <div
              key={i}
              onClick={() => setSelectedTrack(i)}
              style={{
                padding: '17px 11px', textAlign: 'center', cursor: 'pointer',
                background: selectedTrack === i ? TRACK_COLORS[i] + '30' : '#1a1a1a',
                border: `2px solid ${selectedTrack === i ? TRACK_COLORS[i] : '#333'}`,
                borderRadius: 8, transition: 'all 0.2s',
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 'bold', color: TRACK_COLORS[i], marginBottom: 4 }}>{i + 1}</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: isRecording ? '#ff4444' : '#333', boxShadow: isRecording ? '0 0 8px #ff4444' : 'none' }} />
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: isPlaying ? '#44ff44' : '#333', boxShadow: isPlaying ? '0 0 8px #44ff44' : 'none' }} />
              </div>
              <div style={{ fontSize: 9, color: '#666', marginTop: 4 }}>{volume.toFixed(0)}%</div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const trackColor = TRACK_COLORS[selectedTrack]

  const performanceParams: ParamSlot[] = [
    {
      label: `T${selectedTrack + 1} Volume`,
      value: getValue(selectedTrack, 'volume', 80),
      min: 0, max: 100, defaultValue: 80, unit: '%',
      onChange: (v) => setValue(selectedTrack, 'volume', v),
    },
  ]

  const transportContent = (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
      <button
        onClick={() => setValue(selectedTrack, 'record', getValue(selectedTrack, 'record', 0) > 0.5 ? 0 : 1)}
        className={`carbon-toggle-btn ${getValue(selectedTrack, 'record', 0) > 0.5 ? 'active' : ''}`}
        style={getValue(selectedTrack, 'record', 0) > 0.5 ? { background: '#ff4444', borderColor: '#ff4444' } : undefined}
      >
        <Recording size={14} /> Rec
      </button>
      <button
        onClick={() => setValue(selectedTrack, 'play', getValue(selectedTrack, 'play', 0) > 0.5 ? 0 : 1)}
        className={`carbon-toggle-btn ${getValue(selectedTrack, 'play', 0) > 0.5 ? 'active' : ''}`}
        style={getValue(selectedTrack, 'play', 0) > 0.5 ? { background: '#44ff44', borderColor: '#44ff44', color: '#000' } : undefined}
      >
        <PlayFilled size={14} /> Play
      </button>
      <button
        onClick={() => setValue(selectedTrack, 'clear', 1)}
        className="carbon-toggle-btn"
      >
        <TrashCan size={14} /> Clear
      </button>
    </div>
  )

  const advancedSections: AdvancedSection[] = [
    {
      id: 'track-transport',
      title: `Track ${selectedTrack + 1} Transport`,
      icon: <Recording size={14} />,
      defaultOpen: true,
      children: transportContent,
    },
  ]

  return (
    <InstrumentCategoryLayout
      plugin={plugin}
      accentColor={trackColor}
      compact={compact}
      visualization={visualization}
      performanceParams={performanceParams}
      advancedSections={advancedSections}
      extraContent={
        <div style={{ textAlign: 'center', padding: 8, fontSize: 10, color: '#666' }}>
          Click track buttons to select
        </div>
      }
    />
  )
}

export { LooperCardBase as LooperCard }
export default LooperCardBase
