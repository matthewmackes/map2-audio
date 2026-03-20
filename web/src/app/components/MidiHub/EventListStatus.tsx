import { useQuery } from '@tanstack/react-query'
import { InlineNotification, Tag } from '@carbon/react'
import { midiHubApi } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'

type EventListStatusProps = {
  selectedEventListId: string
}

export function EventListStatus({ selectedEventListId }: EventListStatusProps) {
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const statusQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'event-lists', selectedEventListId, 'status'],
    queryFn: () => midiHubApi.getEventListStatus(selectedEventListId, nodeId),
    enabled: Boolean(selectedEventListId),
    refetchInterval: 1000,
  })

  const status = statusQuery.data?.status
  if (!selectedEventListId) {
    return (
      <InlineNotification
        kind="info"
        lowContrast
        hideCloseButton
        title="No event list selected"
        subtitle="Select or create an event list to inspect running status, clock source, and cursor."
      />
    )
  }

  if (!status) return null

  return (
    <div className="midi-hub-events-status-grid">
      <Tag type={status.running ? 'green' : 'warm-gray'}>{status.running ? 'Running' : 'Stopped'}</Tag>
      <Tag type="cool-gray">{`Source ${status.clock_source}`}</Tag>
      <Tag type="blue">{`FPS ${status.fps}`}</Tag>
      <Tag type="cool-gray">{`Cursor ${status.list_type === 'rtc' ? (status.current_datetime ?? 'Waiting') : status.current_timecode}`}</Tag>
      <Tag type="cool-gray">{`Fired ${status.fired_event_ids.length}`}</Tag>
    </div>
  )
}
