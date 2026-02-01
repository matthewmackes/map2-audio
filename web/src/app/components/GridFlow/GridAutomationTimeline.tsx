/**
 * GridAutomationTimeline Component
 * Grid-styled bottom panel for parameter automation
 */

import { memo, useCallback } from 'react'
import {
  Play,
  Pause,
  Square,
  Circle,
  Repeat,
  SkipBack,
  SkipForward,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'

export interface AutomationPoint {
  id: string
  time: number
  value: number
  curve: 'linear' | 'step' | 'smooth'
}

export interface AutomationLane {
  id: string
  parameterName: string
  pluginName: string
  pluginUri: string
  parameterSymbol: string
  points: AutomationPoint[]
  enabled: boolean
  armed: boolean
  color: string
}

export interface GridAutomationTimelineProps {
  lanes: AutomationLane[]
  isPlaying: boolean
  isRecording: boolean
  loopEnabled: boolean
  currentTime: number
  duration: number
  onPlay: () => void
  onStop: () => void
  onRecord: () => void
  onToggleLoop: () => void
  onSeek: (time: number) => void
  onAddLane: () => void
  onDeleteLane: (laneId: string) => void
  onToggleLaneEnabled: (laneId: string) => void
  onToggleLaneArmed: (laneId: string) => void
}

export const GridAutomationTimeline = memo(function GridAutomationTimeline({
  lanes,
  isPlaying,
  isRecording,
  loopEnabled,
  currentTime,
  duration,
  onPlay,
  onStop,
  onRecord,
  onToggleLoop,
  onSeek,
  onAddLane,
  onDeleteLane,
  onToggleLaneEnabled,
  onToggleLaneArmed,
}: GridAutomationTimelineProps) {
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 10)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`
  }, [])

  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const progress = x / rect.width
    onSeek(progress * duration)
  }, [duration, onSeek])

  return (
    <div className="grid-automation-panel">
      {/* Transport Controls */}
      <div className="grid-automation-transport">
        <div className="grid-automation-transport-left">
          {/* Skip Back */}
          <button
            className="grid-automation-btn"
            onClick={() => onSeek(0)}
            title="Go to start"
          >
            <SkipBack size={16} />
          </button>

          {/* Play/Pause */}
          <button
            className={`grid-automation-btn primary ${isPlaying ? 'active' : ''}`}
            onClick={onPlay}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>

          {/* Stop */}
          <button
            className="grid-automation-btn"
            onClick={onStop}
            title="Stop"
          >
            <Square size={16} />
          </button>

          {/* Record */}
          <button
            className={`grid-automation-btn record ${isRecording ? 'active' : ''}`}
            onClick={onRecord}
            title={isRecording ? 'Stop Recording' : 'Record'}
          >
            <Circle size={16} fill={isRecording ? '#ef4444' : 'none'} />
          </button>

          {/* Loop */}
          <button
            className={`grid-automation-btn ${loopEnabled ? 'active' : ''}`}
            onClick={onToggleLoop}
            title={loopEnabled ? 'Disable Loop' : 'Enable Loop'}
          >
            <Repeat size={16} />
          </button>

          {/* Skip Forward */}
          <button
            className="grid-automation-btn"
            onClick={() => onSeek(duration)}
            title="Go to end"
          >
            <SkipForward size={16} />
          </button>
        </div>

        {/* Time Display */}
        <div className="grid-automation-time">
          <span className="grid-automation-time-current">{formatTime(currentTime)}</span>
          <span className="grid-automation-time-separator">/</span>
          <span className="grid-automation-time-duration">{formatTime(duration)}</span>
        </div>

        {/* Add Lane */}
        <div className="grid-automation-transport-right">
          <button
            className="grid-automation-btn add"
            onClick={onAddLane}
            title="Add automation lane"
          >
            <Plus size={16} />
            <span>Add Lane</span>
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="grid-automation-timeline" onClick={handleTimelineClick}>
        {/* Time ruler */}
        <div className="grid-automation-ruler">
          {Array.from({ length: Math.ceil(duration / 10) + 1 }, (_, i) => (
            <div
              key={i}
              className="grid-automation-ruler-mark"
              style={{ left: `${(i * 10 / duration) * 100}%` }}
            >
              <span>{i * 10}s</span>
            </div>
          ))}
        </div>

        {/* Playhead */}
        <div
          className="grid-automation-playhead"
          style={{ left: `${(currentTime / duration) * 100}%` }}
        />

        {/* Lanes */}
        <div className="grid-automation-lanes">
          {lanes.length === 0 ? (
            <div className="grid-automation-lanes-empty">
              <span>No automation lanes</span>
              <button onClick={onAddLane}>Add Lane</button>
            </div>
          ) : (
            lanes.map((lane) => (
              <div
                key={lane.id}
                className={`grid-automation-lane ${!lane.enabled ? 'disabled' : ''}`}
                style={{ '--lane-color': lane.color } as React.CSSProperties}
              >
                {/* Lane Header */}
                <div className="grid-automation-lane-header">
                  <button
                    className="grid-automation-lane-toggle"
                    onClick={() => onToggleLaneEnabled(lane.id)}
                  >
                    {lane.enabled ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <div className="grid-automation-lane-info">
                    <span className="grid-automation-lane-param">{lane.parameterName}</span>
                    <span className="grid-automation-lane-plugin">{lane.pluginName}</span>
                  </div>
                  <button
                    className={`grid-automation-lane-arm ${lane.armed ? 'armed' : ''}`}
                    onClick={() => onToggleLaneArmed(lane.id)}
                    title={lane.armed ? 'Disarm' : 'Arm for recording'}
                  >
                    <Circle size={10} fill={lane.armed ? '#ef4444' : 'none'} />
                  </button>
                  <button
                    className="grid-automation-lane-delete"
                    onClick={() => onDeleteLane(lane.id)}
                    title="Delete lane"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* Lane Content (automation curve visualization) */}
                {lane.enabled && (
                  <div className="grid-automation-lane-content">
                    <svg width="100%" height="40" preserveAspectRatio="none">
                      {lane.points.length > 1 && (
                        <path
                          d={lane.points
                            .map((p, i) => {
                              const x = (p.time / duration) * 100
                              const y = 40 - (p.value * 40)
                              return i === 0 ? `M ${x}% ${y}` : `L ${x}% ${y}`
                            })
                            .join(' ')}
                          fill="none"
                          stroke={lane.color}
                          strokeWidth="2"
                        />
                      )}
                      {lane.points.map((point) => (
                        <circle
                          key={point.id}
                          cx={`${(point.time / duration) * 100}%`}
                          cy={40 - (point.value * 40)}
                          r="4"
                          fill={lane.color}
                          stroke="#fff"
                          strokeWidth="1"
                        />
                      ))}
                    </svg>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
})
