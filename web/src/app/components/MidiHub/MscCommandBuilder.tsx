import { useMutation } from '@tanstack/react-query'
import { Button, CodeSnippet, FormGroup, NumberInput, Select, SelectItem, TextInput } from '@carbon/react'
import { useState } from 'react'
import { midiHubApi } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'

export function MscCommandBuilder() {
  const { pushToast } = useToasts()
  const { nodeId } = useMidiHubNodeScope()
  const [destinationPort, setDestinationPort] = useState('dst')
  const [deviceId, setDeviceId] = useState(0)
  const [commandFormat, setCommandFormat] = useState(0)
  const [command, setCommand] = useState('go')
  const [cueNumber, setCueNumber] = useState('1')
  const [listNumber, setListNumber] = useState('')
  const [lastHex, setLastHex] = useState('')

  const parseNumberValue = (event: { currentTarget?: { value?: string } }, fallback: number) => {
    const nextValue = Number(event.currentTarget?.value ?? fallback)
    return Number.isFinite(nextValue) ? nextValue : fallback
  }

  const sendMutation = useMutation({
    mutationFn: async () =>
      midiHubApi.sendMscMessage(
        {
          destination_port: destinationPort,
          device_id: deviceId,
          command_format: commandFormat,
          command,
          cue_number: cueNumber,
          list_number: listNumber.trim() || null,
        },
        nodeId,
      ),
    onSuccess: (payload) => {
      setLastHex(payload.message_hex)
      pushToast('MSC message sent', 'success')
    },
    onError: () => pushToast('Failed to send MSC message', 'error'),
  })

  return (
    <div className="midi-hub-events-stack">
      <FormGroup legendText="MSC Command Builder" className="midi-hub-events-stack">
        <div className="midi-hub-events-form-grid">
          <TextInput id="msc-destination-port" labelText="Destination port" value={destinationPort} onChange={(event) => setDestinationPort(event.currentTarget.value)} />
          <Select id="msc-command" labelText="Command" value={command} onChange={(event) => setCommand(event.currentTarget.value)}>
            <SelectItem value="go" text="Go" />
            <SelectItem value="stop" text="Stop" />
            <SelectItem value="resume" text="Resume" />
            <SelectItem value="timed_go" text="Timed Go" />
            <SelectItem value="set" text="Set" />
            <SelectItem value="fire" text="Fire" />
            <SelectItem value="all_off" text="All Off" />
          </Select>
          <TextInput id="msc-cue-number" labelText="Cue number" value={cueNumber} onChange={(event) => setCueNumber(event.currentTarget.value)} />
          <TextInput id="msc-list-number" labelText="List number" value={listNumber} onChange={(event) => setListNumber(event.currentTarget.value)} />
          <NumberInput id="msc-device-id" label="Device ID" min={0} max={127} value={deviceId} onChange={(event) => setDeviceId(parseNumberValue(event, deviceId))} />
          <NumberInput id="msc-command-format" label="Command format" min={0} max={127} value={commandFormat} onChange={(event) => setCommandFormat(parseNumberValue(event, commandFormat))} />
        </div>
      </FormGroup>
      <div className="midi-hub-events-toolbar">
        <Button size="sm" kind="primary" onClick={() => sendMutation.mutate()}>
          Send MSC
        </Button>
      </div>
      {lastHex ? (
        <CodeSnippet className="midi-hub-events-code-block" type="multi">
          {lastHex}
        </CodeSnippet>
      ) : null}
    </div>
  )
}
