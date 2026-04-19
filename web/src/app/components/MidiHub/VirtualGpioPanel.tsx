import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Tag, TextInput } from '@carbon/react'
import { midiHubApi, type VirtualGpioChannel } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'

function ChannelTile({
  channel,
  onToggle,
  onRename,
}: {
  channel: VirtualGpioChannel
  onToggle: (channelId: string) => void
  onRename: (channelId: string, label: string) => void
}) {
  const [label, setLabel] = useState(channel.label)

  return (
    <div className="midi-hub-network-gpio-tile">
      <div className="midi-hub-network-gpio-tile__header">
        <span className="midi-hub-network-gpio-tile__title">{channel.channel_id}</span>
        <Tag type={channel.state ? 'green' : 'cool-gray'}>{channel.state ? 'Closed' : 'Open'}</Tag>
      </div>
      <TextInput id={`${channel.channel_id}-label`} labelText="Label" value={label} onChange={(event) => setLabel(event.currentTarget.value)} />
      <div className="midi-hub-actions">
        <Button size="sm" kind="primary" onClick={() => onToggle(channel.channel_id)}>
          Toggle
        </Button>
        <Button size="sm" kind="ghost" onClick={() => onRename(channel.channel_id, label)}>
          Save label
        </Button>
      </div>
    </div>
  )
}

export function VirtualGpioPanel() {
  const queryClient = useQueryClient()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const { pushToast } = useToasts()

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'virtual-gpio'] })

  const gpioQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'virtual-gpio'],
    queryFn: () => midiHubApi.getVirtualGpio(nodeId),
    refetchInterval: 3000,
  })

  const toggleMutation = useMutation({
    mutationFn: async (channelId: string) => midiHubApi.toggleVirtualGpio(channelId, nodeId),
    onSuccess: async () => {
      pushToast('GPIO state updated', 'success')
      await refresh()
    },
  })

  const renameMutation = useMutation({
    mutationFn: async ({ channelId, label }: { channelId: string; label: string }) => midiHubApi.setVirtualGpioLabel(channelId, label, nodeId),
    onSuccess: async () => {
      pushToast('GPIO label saved', 'info')
      await refresh()
    },
  })

  return (
    <div className="midi-hub-network-panel">
      <div className="midi-hub-network-panel__toolbar">
        <Tag type="blue">{`Inputs ${gpioQuery.data?.input_count ?? 0}`}</Tag>
        <Tag type="cool-gray">{`Outputs ${gpioQuery.data?.output_count ?? 0}`}</Tag>
      </div>
      <div className="midi-hub-network-gpio-grid">
        {(gpioQuery.data?.inputs ?? []).map((channel) => (
          <ChannelTile
            key={channel.channel_id}
            channel={channel}
            onToggle={(channelId) => toggleMutation.mutate(channelId)}
            onRename={(channelId, label) => renameMutation.mutate({ channelId, label })}
          />
        ))}
        {(gpioQuery.data?.outputs ?? []).map((channel) => (
          <ChannelTile
            key={channel.channel_id}
            channel={channel}
            onToggle={(channelId) => toggleMutation.mutate(channelId)}
            onRename={(channelId, label) => renameMutation.mutate({ channelId, label })}
          />
        ))}
      </div>
    </div>
  )
}
