import { Button, Select, SelectItem, Tag, Tile } from '@carbon/react'

import { NumberInput } from '../ParameterControl'
import type { SnapshotAbSwitchMidiBinding, SnapshotAbSwitchMidiMessageType } from '../../utils/snapshotAbSwitchMidi'

interface SnapshotAbSwitchMidiCardProps {
  hasActiveSnapshot: boolean
  disabled: boolean
  isPending: boolean
  binding: SnapshotAbSwitchMidiBinding | null
  draftMessageType: SnapshotAbSwitchMidiMessageType
  draftMidiChannel: string
  draftNumber: number
  onDraftMessageTypeChange: (value: SnapshotAbSwitchMidiMessageType) => void
  onDraftMidiChannelChange: (value: string) => void
  onDraftNumberChange: (value: number) => void
  onSave: () => void
  onClear: () => void
  saveDisabled: boolean
}

export function SnapshotAbSwitchMidiCard({
  hasActiveSnapshot,
  disabled,
  isPending,
  binding,
  draftMessageType,
  draftMidiChannel,
  draftNumber,
  onDraftMessageTypeChange,
  onDraftMidiChannelChange,
  onDraftNumberChange,
  onSave,
  onClear,
  saveDisabled,
}: SnapshotAbSwitchMidiCardProps) {
  const bindingSummary = binding
    ? `${binding.messageType === 'note_on' ? 'Note' : 'CC'} ${binding.number}`
    : 'Not configured'

  return (
    <Tile className="juce-grid-page__midi-block-focus-card">
      <div className="juce-grid-page__midi-tile-header">
        <div className="juce-grid-page__midi-tile-copy">
          <h3 className="juce-grid-page__dense-card-heading">A/B switch MIDI</h3>
          <p>Store a snapshot-scoped MIDI trigger that toggles the active A/B path without reloading the snapshot.</p>
        </div>
        <div className="juce-grid-page__compact-tags">
          <Tag type={binding ? 'green' : 'cool-gray'}>{bindingSummary}</Tag>
          <Tag type="cool-gray">{draftMidiChannel === 'omni' ? 'Omni' : `Ch ${draftMidiChannel}`}</Tag>
        </div>
      </div>

      <div className="juce-grid-page__midi-block-focus-grid">
        <Select
          id="juce-grid-ab-switch-message-type"
          labelText="Message type"
          value={draftMessageType}
          onChange={(event) => onDraftMessageTypeChange(event.target.value as SnapshotAbSwitchMidiMessageType)}
          disabled={disabled}
        >
          <SelectItem value="cc_toggle" text="CC toggle" />
          <SelectItem value="note_on" text="Note on" />
        </Select>
        <Select
          id="juce-grid-ab-switch-channel"
          labelText="MIDI channel"
          value={draftMidiChannel}
          onChange={(event) => onDraftMidiChannelChange(event.target.value)}
          disabled={disabled}
        >
          <SelectItem value="omni" text="Omni" />
          {Array.from({ length: 16 }, (_, index) => (
            <SelectItem
              key={`juce-grid-ab-switch-channel-${index + 1}`}
              value={String(index + 1)}
              text={`Channel ${index + 1}`}
            />
          ))}
        </Select>
        <NumberInput
          label={draftMessageType === 'note_on' ? 'Note number' : 'CC number'}
          value={draftNumber}
          min={0}
          max={127}
          step={1}
          precision={0}
          showBounds={false}
          disabled={disabled}
          onChange={(nextValue) => onDraftNumberChange(Math.max(0, Math.min(127, Math.round(nextValue))))}
        />
      </div>

      <div className="juce-grid-page__midi-actions">
        <div className="juce-grid-page__compact-tags">
          <Tag type="cool-gray">
            {draftMessageType === 'note_on' ? 'Note' : 'CC'} {draftNumber}
          </Tag>
          <Tag type="cool-gray">Action: toggle active A/B path</Tag>
        </div>
        <div className="juce-grid-page__compact-actions">
          <Button
            size="sm"
            kind="ghost"
            onClick={onClear}
            disabled={disabled || isPending || !binding}
          >
            Clear
          </Button>
          <Button
            size="sm"
            kind="secondary"
            onClick={onSave}
            disabled={saveDisabled || isPending}
          >
            {isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {!hasActiveSnapshot && (
        <p className="juce-grid-page__empty-state-copy">
          Load a snapshot to configure an A/B switch MIDI trigger.
        </p>
      )}
    </Tile>
  )
}

export default SnapshotAbSwitchMidiCard
