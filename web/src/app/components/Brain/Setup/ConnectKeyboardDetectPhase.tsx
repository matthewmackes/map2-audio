import { Button, InlineNotification, RadioButton, RadioButtonGroup, Tile } from '@carbon/react'
import { Renew } from '@carbon/icons-react'
import { useEffect } from 'react'

import { StatusChip } from '../../primitives'
import type { DetectionEntry } from './useKeyboardDetectionList'

interface ConnectKeyboardDetectPhaseProps {
  entries: DetectionEntry[]
  isLoading: boolean
  error: unknown
  onRescan: () => void | Promise<void>
  selectedPortName: string | null
  onSelect: (portName: string) => void
}

function entryKey(entry: DetectionEntry): string {
  return entry.port_name
}

function entryLabel(entry: DetectionEntry): string {
  if (entry.source === 'onboarded') {
    return entry.profile_name && entry.profile_name.trim() !== ''
      ? entry.profile_name
      : entry.port_name
  }
  return entry.port_name
}

export function ConnectKeyboardDetectPhase({
  entries,
  isLoading,
  error,
  onRescan,
  selectedPortName,
  onSelect,
}: ConnectKeyboardDetectPhaseProps) {
  // Auto-select if exactly one entry and nothing is currently picked.
  useEffect(() => {
    if (selectedPortName === null && entries.length === 1) {
      onSelect(entries[0]!.port_name)
    }
  }, [entries, selectedPortName, onSelect])

  const showEmpty = !isLoading && entries.length === 0
  const errorMessage = error instanceof Error ? error.message : error ? String(error) : null

  return (
    <Tile className="connect-keyboard-task__phase-body">
      <div className="connect-keyboard-task__detect-toolbar">
        <div className="connect-keyboard-task__detect-summary">
          {isLoading ? (
            <span className="connect-keyboard-task__detect-summary-text">Scanning…</span>
          ) : (
            <span className="connect-keyboard-task__detect-summary-text">
              {entries.length} device{entries.length === 1 ? '' : 's'} detected
            </span>
          )}
        </div>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Renew}
          onClick={() => void onRescan()}
          disabled={isLoading}
        >
          Rescan
        </Button>
      </div>

      {errorMessage ? (
        <InlineNotification
          kind="error"
          title="Could not query MIDI devices"
          subtitle={errorMessage}
          hideCloseButton
          lowContrast
          className="connect-keyboard-task__detect-error"
        />
      ) : null}

      {showEmpty ? (
        <InlineNotification
          kind="warning"
          title="No MIDI keyboards detected"
          subtitle={
            'Plug in your keyboard via USB or MIDI, power it on, then click Rescan. ' +
            'You can also configure devices manually in MIDI Hub.'
          }
          hideCloseButton
          lowContrast
          className="connect-keyboard-task__detect-empty"
        />
      ) : null}

      {!showEmpty && entries.length > 0 ? (
        <RadioButtonGroup
          name="connect-keyboard-detect"
          legendText="Available MIDI inputs"
          orientation="vertical"
          valueSelected={selectedPortName ?? ''}
          onChange={(value: string) => onSelect(value)}
        >
          {entries.map((entry) => {
            const value = entryKey(entry)
            const label = entryLabel(entry)
            const tag = entry.source === 'onboarded' ? (
              <StatusChip
                tone={entry.connected ? 'live' : 'neutral'}
                size="sm"
                label={entry.connected ? 'Onboarded · Connected' : 'Onboarded'}
              />
            ) : (
              <StatusChip tone="info" size="sm" label="New" />
            )

            const subline = entry.source === 'onboarded'
              ? `Port: ${entry.port_name}${entry.vendor_id && entry.product_id ? ` · ${entry.vendor_id}:${entry.product_id}` : ''}`
              : 'Press Continue to give this device a name.'

            return (
              <RadioButton
                key={value}
                value={value}
                labelText={
                  <span className="connect-keyboard-task__detect-row">
                    <span className="connect-keyboard-task__detect-row-text">
                      <span className="connect-keyboard-task__detect-row-title">{label}</span>
                      <span className="connect-keyboard-task__detect-row-sub">{subline}</span>
                    </span>
                    <span className="connect-keyboard-task__detect-row-tag">{tag}</span>
                  </span>
                }
              />
            )
          })}
        </RadioButtonGroup>
      ) : null}
    </Tile>
  )
}
