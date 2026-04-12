import { Button, Tag, TextInput, Tile } from '@carbon/react'

import { EmptyState } from '../shared/EmptyState'
import type { SnapshotFootswitchLabelMap } from '../../utils/snapshotFootswitchLabels'
import {
  SNAPSHOT_FOOTSWITCH_LABEL_COUNT,
  SNAPSHOT_FOOTSWITCH_LABEL_MAX_LENGTH,
} from '../../utils/snapshotFootswitchLabels'

interface SnapshotFootswitchLabelCardProps {
  hasActiveSnapshot: boolean
  disabled: boolean
  isPending: boolean
  labelMap: SnapshotFootswitchLabelMap
  onChange: (switchNumber: number, value: string) => void
  onSave: () => void
  onClear: () => void
  saveDisabled: boolean
}

export function SnapshotFootswitchLabelCard({
  hasActiveSnapshot,
  disabled,
  isPending,
  labelMap,
  onChange,
  onSave,
  onClear,
  saveDisabled,
}: SnapshotFootswitchLabelCardProps) {
  const configuredCount = Object.values(labelMap).filter((label) => label.trim().length > 0).length

  return (
    <Tile className="juce-grid-page__midi-block-focus-card">
      <div className="juce-grid-page__midi-tile-header">
        <div className="juce-grid-page__midi-tile-copy">
          <h3 className="juce-grid-page__dense-card-heading">Footswitch labels</h3>
          <p>Store snapshot-specific labels for hardware controllers and the MAP2 LCD companion display.</p>
        </div>
        <div className="juce-grid-page__compact-tags">
          <Tag type={configuredCount > 0 ? 'green' : 'cool-gray'}>
            {configuredCount > 0 ? `${configuredCount} configured` : 'No labels'}
          </Tag>
          <Tag type="cool-gray">{SNAPSHOT_FOOTSWITCH_LABEL_MAX_LENGTH} chars max</Tag>
        </div>
      </div>

      <div className="juce-grid-page__footswitch-label-grid">
        {Array.from({ length: SNAPSHOT_FOOTSWITCH_LABEL_COUNT }, (_, index) => {
          const switchNumber = index + 1
          return (
            <TextInput
              key={`snapshot-footswitch-label-${switchNumber}`}
              id={`snapshot-footswitch-label-${switchNumber}`}
              labelText={`Switch ${switchNumber}`}
              value={labelMap[String(switchNumber)] ?? ''}
              maxLength={SNAPSHOT_FOOTSWITCH_LABEL_MAX_LENGTH}
              disabled={disabled}
              onChange={(event) => onChange(switchNumber, event.target.value)}
            />
          )
        })}
      </div>

      <div className="juce-grid-page__midi-actions">
        <div className="juce-grid-page__compact-tags">
          {configuredCount > 0 ? (
            Object.entries(labelMap)
              .filter(([, label]) => label.trim().length > 0)
              .slice(0, 4)
              .map(([switchNumber, label]) => (
                <Tag key={`snapshot-footswitch-label-preview-${switchNumber}`} type="green">
                  S{switchNumber} {label}
                </Tag>
              ))
          ) : (
            <Tag type="cool-gray">Controller defaults stay active until you save labels here.</Tag>
          )}
        </div>
        <div className="juce-grid-page__compact-actions">
          <Button
            size="sm"
            kind="ghost"
            onClick={onClear}
            disabled={disabled || isPending || configuredCount === 0}
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
        <EmptyState
          className="juce-grid-page__empty-state"
          title="No snapshot is active"
          description="Load a snapshot to configure footswitch labels."
          compact
          align="left"
        />
      )}
    </Tile>
  )
}

export default SnapshotFootswitchLabelCard
