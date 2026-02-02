/**
 * LooperCard - TooB 4Looper
 *
 * 4-track looper for layered performances.
 *
 * Parameters per track:
 * - record: Record trigger
 * - play: Play/stop trigger
 * - volume: Track volume
 * - clear: Clear track
 */

import { useState } from 'react'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import type { PluginCardProps } from '../../types'

// Parameter indices for 4Looper (4 tracks with controls)
const TRACKS = 4
const PARAMS_PER_TRACK = 4

const getTrackParam = (track: number, param: 'record' | 'play' | 'volume' | 'clear') => {
  const offsets = { record: 0, play: 1, volume: 2, clear: 3 }
  return track * PARAMS_PER_TRACK + offsets[param]
}

export function LooperCard({
  plugin,
  parameterValues,
  onParameterChange,
  accentColor = '#8b5cf6',
  compact = false,
}: PluginCardProps) {
  const [selectedTrack, setSelectedTrack] = useState(0)

  const getValue = (track: number, param: 'record' | 'play' | 'volume' | 'clear', defaultVal: number) =>
    parameterValues[getTrackParam(track, param)] ?? defaultVal

  const setValue = (track: number, param: 'record' | 'play' | 'volume' | 'clear', value: number) =>
    onParameterChange(getTrackParam(track, param), value)

  // Track colors
  const TRACK_COLORS = ['#ff6b6b', '#4ecdc4', '#f59e0b', '#8b5cf6']

  const visualization = (
    <div style={{ padding: '16px' }}>
      {/* Track buttons grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '8px',
          marginBottom: '16px',
        }}
      >
        {Array.from({ length: TRACKS }, (_, i) => {
          const isRecording = getValue(i, 'record', 0) > 0.5
          const isPlaying = getValue(i, 'play', 0) > 0.5
          const volume = getValue(i, 'volume', 80)

          return (
            <div
              key={i}
              onClick={() => setSelectedTrack(i)}
              style={{
                padding: '12px 8px',
                background: selectedTrack === i ? TRACK_COLORS[i] + '30' : '#1a1a1a',
                border: `2px solid ${selectedTrack === i ? TRACK_COLORS[i] : '#333'}`,
                borderRadius: '8px',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s',
              }}
            >
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: 'bold',
                  color: TRACK_COLORS[i],
                  marginBottom: '4px',
                }}
              >
                {i + 1}
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '4px',
                }}
              >
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: isRecording ? '#ff4444' : '#333',
                    boxShadow: isRecording ? '0 0 8px #ff4444' : 'none',
                  }}
                />
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: isPlaying ? '#44ff44' : '#333',
                    boxShadow: isPlaying ? '0 0 8px #44ff44' : 'none',
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: '9px',
                  color: '#666',
                  marginTop: '4px',
                }}
              >
                {volume.toFixed(0)}%
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const trackColor = TRACK_COLORS[selectedTrack]

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={plugin.bypassed}
      visualization={visualization}
      compact={compact}
    >
      {/* Selected Track Controls */}
      <ParameterSection title={`Track ${selectedTrack + 1}`} accentColor={trackColor}>
        {/* Transport Controls */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '12px',
            marginBottom: '16px',
          }}
        >
          <button
            onClick={() => setValue(selectedTrack, 'record', getValue(selectedTrack, 'record', 0) > 0.5 ? 0 : 1)}
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              border: 'none',
              background: getValue(selectedTrack, 'record', 0) > 0.5 ? '#ff4444' : '#333',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '20px',
              boxShadow: getValue(selectedTrack, 'record', 0) > 0.5 ? '0 0 20px #ff4444' : 'none',
              transition: 'all 0.2s',
            }}
          >
            ●
          </button>
          <button
            onClick={() => setValue(selectedTrack, 'play', getValue(selectedTrack, 'play', 0) > 0.5 ? 0 : 1)}
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              border: 'none',
              background: getValue(selectedTrack, 'play', 0) > 0.5 ? '#44ff44' : '#333',
              color: getValue(selectedTrack, 'play', 0) > 0.5 ? '#000' : '#fff',
              cursor: 'pointer',
              fontSize: '20px',
              boxShadow: getValue(selectedTrack, 'play', 0) > 0.5 ? '0 0 20px #44ff44' : 'none',
              transition: 'all 0.2s',
            }}
          >
            ▶
          </button>
          <button
            onClick={() => setValue(selectedTrack, 'clear', 1)}
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              border: '2px solid #666',
              background: '#222',
              color: '#888',
              cursor: 'pointer',
              fontSize: '16px',
              transition: 'all 0.2s',
            }}
          >
            ✕
          </button>
        </div>

        {/* Volume Control */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <ParameterKnob
            label="Volume"
            value={getValue(selectedTrack, 'volume', 80)}
            min={0}
            max={100}
            defaultValue={80}
            unit="%"
            onChange={(v) => setValue(selectedTrack, 'volume', v)}
            accentColor={trackColor}
            size="large"
          />
        </div>
      </ParameterSection>

      {/* Global transport hint */}
      <div
        style={{
          textAlign: 'center',
          padding: '8px',
          fontSize: '10px',
          color: '#666',
        }}
      >
        Click track buttons to select • Record / Play / Clear
      </div>
    </PluginCardShell>
  )
}

export default LooperCard
