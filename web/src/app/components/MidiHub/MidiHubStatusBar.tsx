import { Layer, Tag } from '@carbon/react'
import { useMidiHubOverview } from './useMidiHubOverview'

type MidiHubStatusBarProps = {
  apiNodeId: string | null
  scopeKey: string
}

function toneForHealth(health: string): 'green' | 'blue' | 'warm-gray' {
  if (health === 'online') {
    return 'green'
  }
  if (health === 'degraded') {
    return 'blue'
  }
  return 'warm-gray'
}

function formatClockLabel(bpm: number | undefined, running: boolean | undefined) {
  const safeBpm = Number.isFinite(bpm) ? Math.round(bpm ?? 0) : 0
  return running ? `Clock live ${safeBpm} BPM` : `Clock stopped ${safeBpm} BPM`
}

export function MidiHubStatusBar({ apiNodeId, scopeKey }: MidiHubStatusBarProps) {
  const { clockQuery, activePresetName, routesCount, connectedDeviceCount, sessionsCount, health } =
    useMidiHubOverview(apiNodeId, scopeKey)

  const songPosition = clockQuery.data?.song_position ?? 0
  const eventListLabel =
    clockQuery.data?.running
      ? `Timeline parked @ ${songPosition}`
      : 'Event lists pending'

  return (
    <Layer className="midi-hub-status-bar">
      <div className="midi-hub-status-bar__rail">
        <Tag type={toneForHealth(health)}>{formatClockLabel(clockQuery.data?.bpm, clockQuery.data?.running)}</Tag>
        <Tag type="cool-gray">{`Preset ${activePresetName}`}</Tag>
        <Tag type="cool-gray">{eventListLabel}</Tag>
        <Tag type="blue">{`Routes ${routesCount}`}</Tag>
        <Tag type="blue">{`Devices ${connectedDeviceCount}`}</Tag>
        <Tag type="warm-gray">{`Sessions ${sessionsCount}`}</Tag>
        <Tag type={toneForHealth(health)}>{`System ${health}`}</Tag>
      </div>
    </Layer>
  )
}
