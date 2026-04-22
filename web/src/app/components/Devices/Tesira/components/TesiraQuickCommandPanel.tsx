import React, { useMemo, useState } from 'react'
import { Code } from '@carbon/icons-react'
import { Button, InlineNotification, Tag, TextArea, TextInput, Tile } from '@carbon/react'
import { useProbeTesiraDsp, useSendTesiraCommand, useTesiraDspBlocks } from '../hooks/useTesiraApi'
import type { TesiraRawCommandResponse } from '../types'
import { EmptyState } from '../../../shared/EmptyState'
import { LoadingState } from '../../../shared/LoadingState'
import './TesiraCarbonChrome.css'

interface TesiraQuickCommandPanelProps {
  deviceId: string
}

function stringifyValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function TesiraQuickCommandPanel({ deviceId }: TesiraQuickCommandPanelProps) {
  const [command, setCommand] = useState('SESSION get aliases')
  const [search, setSearch] = useState('')
  const [response, setResponse] = useState<TesiraRawCommandResponse | null>(null)
  const dspBlocks = useTesiraDspBlocks(deviceId)
  const probeDsp = useProbeTesiraDsp(deviceId)
  const sendCommand = useSendTesiraCommand()

  const filteredBlocks = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return dspBlocks.data ?? []
    return (dspBlocks.data ?? []).filter((block) =>
      block.instance_tag.toLowerCase().includes(needle) ||
      block.block_type.toLowerCase().includes(needle) ||
      String(block.title || '').toLowerCase().includes(needle)
    )
  }, [dspBlocks.data, search])

  const handleSend = async () => {
    const trimmed = command.trim()
    if (!trimmed) return
    const result = await sendCommand.mutateAsync({ deviceId, command: trimmed })
    setResponse(result)
  }

  return (
    <div className="tesira-quick-console">
      <Tile className="tesira-quick-console__panel">
        <div className="tesira-quick-console__header">
          <div>
            <p className="tesira-dashboard__eyebrow">Quick console</p>
            <h3 className="tesira-dashboard__title">Tesira recovery and verification commands</h3>
            <p className="tesira-dashboard__summary">
              Send recovery or verification commands from the dedicated Tesira route and use discovered instance tags as a command shortcut.
            </p>
          </div>
          <div className="tesira-quick-console__tags">
            <Tag type="cool-gray" size="sm">TTP</Tag>
            <Tag type="green" size="sm">On-route</Tag>
          </div>
        </div>

        <div className="tesira-quick-console__action-row">
          <Button size="sm" kind="ghost" renderIcon={Code} onClick={() => setCommand('DEVICE get hostname')}>
            Hostname
          </Button>
          <Button size="sm" kind="ghost" renderIcon={Code} onClick={() => setCommand('SESSION get aliases')}>
            Aliases
          </Button>
          <Button
            size="sm"
            kind="secondary"
            onClick={() => {
              void probeDsp.mutateAsync(32)
            }}
            disabled={probeDsp.isPending}
          >
            {probeDsp.isPending ? 'Probing…' : 'Probe tags'}
          </Button>
        </div>

        <TextArea
          labelText="TTP command"
          rows={4}
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder="SESSION get aliases"
        />

        <div className="tesira-quick-console__action-row">
          <Button
            size="sm"
            kind="primary"
            onClick={() => {
              void handleSend()
            }}
            disabled={sendCommand.isPending}
          >
            {sendCommand.isPending ? 'Sending…' : 'Send command'}
          </Button>
        </div>

        {sendCommand.isError ? (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Command failed"
            subtitle={sendCommand.error instanceof Error ? sendCommand.error.message : 'Command failed'}
          />
        ) : null}

        <TextArea
          labelText="Latest response"
          rows={10}
          readOnly
          className="tesira-quick-console__response"
          value={
            response
              ? `${response.raw || response.message}\n${response.value != null ? `\n${stringifyValue(response.value)}` : ''}`
              : 'No command sent yet.'
          }
        />
      </Tile>

      <Tile className="tesira-quick-console__panel">
        <div className="tesira-quick-console__header">
          <div>
            <p className="tesira-dashboard__eyebrow">Instance tag browser</p>
            <h3 className="tesira-dashboard__title">Discovered DSP blocks</h3>
            <p className="tesira-dashboard__summary">
              Click a discovered instance tag to draft a `get` command for the first available parameter on that block.
            </p>
          </div>
          <div className="tesira-quick-console__tags">
            <Tag type="cool-gray" size="sm">{filteredBlocks.length} shown</Tag>
            <Tag type="warm-gray" size="sm">{(dspBlocks.data ?? []).length} total</Tag>
          </div>
        </div>

        <TextInput
          id={`tesira-command-filter-${deviceId}`}
          labelText="Filter discovered instance tags"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="LevelControl, MatrixMixer, SourceSelector…"
        />

        {dspBlocks.isLoading ? (
          <div className="tesira-quick-console__loading">
            <LoadingState description="Loading instance tags" />
          </div>
        ) : (
          <div className="tesira-quick-console__table-wrap">
            <table className="tesira-quick-console__table" aria-label="Discovered Tesira instance tags">
              <thead>
                <tr>
                  <th scope="col">Instance tag</th>
                  <th scope="col">Type</th>
                  <th scope="col">Params</th>
                </tr>
              </thead>
              <tbody>
                {filteredBlocks.map((block) => {
                  const firstParam = Object.keys(block.parameter_map || {})[0] ?? 'level'
                  return (
                    <tr key={block.instance_tag}>
                      <td>
                        <button
                          type="button"
                          className="tesira-quick-console__tag-button"
                          onClick={() => setCommand(`${block.instance_tag} get ${firstParam}`)}
                        >
                          {block.instance_tag}
                        </button>
                      </td>
                      <td>{block.title ? `${block.title} (${block.block_type})` : block.block_type}</td>
                      <td>{Object.keys(block.parameter_map || {}).length}</td>
                    </tr>
                  )
                })}
                {!filteredBlocks.length ? (
                  <tr>
                    <td colSpan={3}>
                      <EmptyState
                        className="tesira-quick-console__empty"
                        title="No instance tags are available yet"
                        description="Probe tags or open DSP Explorer after the MAP2 layout is deployed."
                        compact
                      />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </Tile>
    </div>
  )
}
