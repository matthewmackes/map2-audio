import { Add, TrashCan } from '@carbon/icons-react'
import { Button, Checkbox, Select, SelectItem, Tag, TextInput, Tile } from '@carbon/react'
import { useEffect, useMemo, useState } from 'react'

import type { SnapshotExpressionCurve, SnapshotExpressionMapping } from '../../../map2/types'
import { NumberInput } from '../ParameterControl'
import { createDefaultSnapshotExpressionMapping, normalizeSnapshotExpressionMappings } from '../../utils/snapshotExpressionMappings'

interface SnapshotExpressionParameterOption {
  id: string
  label: string
  min: number
  max: number
  unit: string
}

interface SnapshotExpressionMappingsCardProps {
  hasActiveSnapshot: boolean
  disabled: boolean
  isPending: boolean
  mappings: SnapshotExpressionMapping[]
  availableParameters: SnapshotExpressionParameterOption[]
  onSave: (mappings: SnapshotExpressionMapping[]) => void
  onClear: () => void
}

const CURVE_OPTIONS: Array<{ value: SnapshotExpressionCurve; label: string }> = [
  { value: 'linear', label: 'Linear' },
  { value: 'logarithmic', label: 'Logarithmic' },
  { value: 'exponential', label: 'Exponential' },
  { value: 's_curve', label: 'S-Curve' },
]

function buildFallbackParameter(): SnapshotExpressionParameterOption {
  return {
    id: 'engine.reverb_mix',
    label: 'Reverb Mix',
    min: 0,
    max: 1,
    unit: '%',
  }
}

export function SnapshotExpressionMappingsCard({
  hasActiveSnapshot,
  disabled,
  isPending,
  mappings,
  availableParameters,
  onSave,
  onClear,
}: SnapshotExpressionMappingsCardProps) {
  const parameterOptions = availableParameters.length > 0 ? availableParameters : [buildFallbackParameter()]
  const [draftMappings, setDraftMappings] = useState<SnapshotExpressionMapping[]>(() => normalizeSnapshotExpressionMappings(mappings))

  useEffect(() => {
    setDraftMappings(normalizeSnapshotExpressionMappings(mappings))
  }, [mappings])

  const totalTargets = useMemo(
    () => draftMappings.reduce((sum, mapping) => sum + mapping.targets.length, 0),
    [draftMappings],
  )
  const saveDisabled = disabled || JSON.stringify(draftMappings) === JSON.stringify(normalizeSnapshotExpressionMappings(mappings))

  const updateMapping = (mappingId: string, updater: (mapping: SnapshotExpressionMapping) => SnapshotExpressionMapping) => {
    setDraftMappings((current) => current.map((mapping) => (mapping.id === mappingId ? updater(mapping) : mapping)))
  }

  const addMapping = () => {
    setDraftMappings((current) => [
      ...current,
      createDefaultSnapshotExpressionMapping(current.length, parameterOptions[0]),
    ])
  }

  const removeMapping = (mappingId: string) => {
    setDraftMappings((current) => current.filter((mapping) => mapping.id !== mappingId))
  }

  const addTarget = (mappingId: string) => {
    updateMapping(mappingId, (mapping) => ({
      ...mapping,
      targets: [
        ...mapping.targets,
        {
          id: `${mapping.id}-target-${mapping.targets.length + 1}`,
          param_id: parameterOptions[0].id,
          param_label: parameterOptions[0].label,
          out_min: parameterOptions[0].min,
          out_max: parameterOptions[0].max,
          curve: 'linear',
          custom_curve: [],
          active: true,
        },
      ],
    }))
  }

  return (
    <Tile className="juce-grid-page__midi-block-focus-card">
      <div className="juce-grid-page__midi-tile-header">
        <div className="juce-grid-page__midi-tile-copy">
          <h3 className="juce-grid-page__dense-card-heading">Snapshot expression mappings</h3>
          <p>Store per-snapshot expression pedal maps where one CC can drive multiple parameters with independent ranges and curves.</p>
        </div>
        <div className="juce-grid-page__compact-tags">
          <Tag type={draftMappings.length > 0 ? 'green' : 'cool-gray'}>
            {draftMappings.length > 0 ? `${draftMappings.length} pedals` : 'No pedals'}
          </Tag>
          <Tag type="cool-gray">{totalTargets} targets</Tag>
        </div>
      </div>

      <div className="juce-grid-page__compact-actions">
        <Button size="sm" kind="ghost" renderIcon={Add} onClick={addMapping} disabled={disabled}>
          Add expression pedal
        </Button>
      </div>

      {draftMappings.length === 0 ? (
        <p className="juce-grid-page__empty-state-copy">
          Add a snapshot-scoped expression pedal map to drive multiple engine parameters from one CC.
        </p>
      ) : (
        <div className="juce-grid-page__midi-list">
          {draftMappings.map((mapping, mappingIndex) => (
            <Tile key={mapping.id} className="juce-grid-page__midi-block-focus-card">
              <div className="juce-grid-page__midi-tile-header">
                <div className="juce-grid-page__midi-tile-copy">
                  <h4 className="juce-grid-page__dense-card-heading">{mapping.label || `Expression ${mappingIndex + 1}`}</h4>
                  <p>{mapping.targets.length} linked parameter{mapping.targets.length === 1 ? '' : 's'}</p>
                </div>
                <div className="juce-grid-page__compact-actions">
                  <Checkbox
                    id={`snapshot-expression-active-${mapping.id}`}
                    labelText="Enabled"
                    checked={mapping.active}
                    onChange={(_, data) => updateMapping(mapping.id, (current) => ({ ...current, active: Boolean(data.checked) }))}
                    disabled={disabled}
                  />
                  <Button
                    size="sm"
                    kind="danger--ghost"
                    renderIcon={TrashCan}
                    iconDescription="Remove expression pedal"
                    hasIconOnly
                    onClick={() => removeMapping(mapping.id)}
                    disabled={disabled}
                  />
                </div>
              </div>

              <div className="juce-grid-page__midi-block-focus-grid">
                <TextInput
                  id={`snapshot-expression-label-${mapping.id}`}
                  labelText="Pedal label"
                  value={mapping.label}
                  onChange={(event) => updateMapping(mapping.id, (current) => ({ ...current, label: event.target.value }))}
                  disabled={disabled}
                />
                <NumberInput
                  label="CC number"
                  value={mapping.cc}
                  min={0}
                  max={127}
                  step={1}
                  precision={0}
                  showBounds={false}
                  disabled={disabled}
                  onChange={(nextValue) => updateMapping(mapping.id, (current) => ({ ...current, cc: Math.max(0, Math.min(127, Math.round(nextValue))) }))}
                />
                <Select
                  id={`snapshot-expression-channel-${mapping.id}`}
                  labelText="MIDI channel"
                  value={String(mapping.channel)}
                  onChange={(event) => updateMapping(mapping.id, (current) => ({ ...current, channel: Number.parseInt(event.target.value, 10) }))}
                  disabled={disabled}
                >
                  <SelectItem value="0" text="Omni" />
                  {Array.from({ length: 16 }, (_, index) => (
                    <SelectItem
                      key={`snapshot-expression-channel-${mapping.id}-${index + 1}`}
                      value={String(index + 1)}
                      text={`Channel ${index + 1}`}
                    />
                  ))}
                </Select>
                <NumberInput
                  label="CC min"
                  value={mapping.cc_min}
                  min={0}
                  max={127}
                  step={1}
                  precision={0}
                  showBounds={false}
                  disabled={disabled}
                  onChange={(nextValue) => updateMapping(mapping.id, (current) => ({ ...current, cc_min: Math.max(0, Math.min(127, Math.round(nextValue))) }))}
                />
                <NumberInput
                  label="CC max"
                  value={mapping.cc_max}
                  min={0}
                  max={127}
                  step={1}
                  precision={0}
                  showBounds={false}
                  disabled={disabled}
                  onChange={(nextValue) => updateMapping(mapping.id, (current) => ({ ...current, cc_max: Math.max(0, Math.min(127, Math.round(nextValue))) }))}
                />
              </div>

              <div className="juce-grid-page__footswitch-label-grid">
                {mapping.targets.map((target, targetIndex) => {
                  const parameterOption = parameterOptions.find((option) => option.id === target.param_id) ?? parameterOptions[0]
                  return (
                    <Tile key={target.id} className="juce-grid-page__midi-block-focus-card">
                      <div className="juce-grid-page__midi-tile-header">
                        <div className="juce-grid-page__midi-tile-copy">
                          <h5 className="juce-grid-page__dense-card-heading">Target {targetIndex + 1}</h5>
                          <p>{parameterOption.label}</p>
                        </div>
                        <div className="juce-grid-page__compact-actions">
                          <Checkbox
                            id={`snapshot-expression-target-active-${target.id}`}
                            labelText="Enabled"
                            checked={target.active}
                            onChange={(_, data) => updateMapping(mapping.id, (current) => ({
                              ...current,
                              targets: current.targets.map((entry) => (
                                entry.id === target.id ? { ...entry, active: Boolean(data.checked) } : entry
                              )),
                            }))}
                            disabled={disabled}
                          />
                          <Button
                            size="sm"
                            kind="danger--ghost"
                            renderIcon={TrashCan}
                            iconDescription="Remove target"
                            hasIconOnly
                            onClick={() => updateMapping(mapping.id, (current) => ({
                              ...current,
                              targets: current.targets.filter((entry) => entry.id !== target.id),
                            }))}
                            disabled={disabled || mapping.targets.length <= 1}
                          />
                        </div>
                      </div>

                      <div className="juce-grid-page__midi-block-focus-grid">
                        <Select
                          id={`snapshot-expression-target-param-${target.id}`}
                          labelText="Target parameter"
                          value={target.param_id}
                          onChange={(event) => {
                            const nextOption = parameterOptions.find((option) => option.id === event.target.value) ?? parameterOptions[0]
                            updateMapping(mapping.id, (current) => ({
                              ...current,
                              targets: current.targets.map((entry) => (
                                entry.id === target.id
                                  ? {
                                    ...entry,
                                    param_id: nextOption.id,
                                    param_label: nextOption.label,
                                    out_min: nextOption.min,
                                    out_max: nextOption.max,
                                  }
                                  : entry
                              )),
                            }))
                          }}
                          disabled={disabled}
                        >
                          {parameterOptions.map((option) => (
                            <SelectItem
                              key={`snapshot-expression-target-option-${target.id}-${option.id}`}
                              value={option.id}
                              text={option.label}
                            />
                          ))}
                        </Select>
                        <Select
                          id={`snapshot-expression-target-curve-${target.id}`}
                          labelText="Curve"
                          value={target.curve}
                          onChange={(event) => updateMapping(mapping.id, (current) => ({
                            ...current,
                            targets: current.targets.map((entry) => (
                              entry.id === target.id
                                ? { ...entry, curve: event.target.value as SnapshotExpressionCurve }
                                : entry
                            )),
                          }))}
                          disabled={disabled}
                        >
                          {CURVE_OPTIONS.map((option) => (
                            <SelectItem
                              key={`snapshot-expression-curve-${target.id}-${option.value}`}
                              value={option.value}
                              text={option.label}
                            />
                          ))}
                        </Select>
                        <NumberInput
                          label="Output min"
                          value={target.out_min}
                          min={-100000}
                          max={100000}
                          step={0.01}
                          precision={2}
                          showBounds={false}
                          disabled={disabled}
                          onChange={(nextValue) => updateMapping(mapping.id, (current) => ({
                            ...current,
                            targets: current.targets.map((entry) => (
                              entry.id === target.id ? { ...entry, out_min: nextValue } : entry
                            )),
                          }))}
                        />
                        <NumberInput
                          label={`Output max${parameterOption.unit ? ` (${parameterOption.unit})` : ''}`}
                          value={target.out_max}
                          min={-100000}
                          max={100000}
                          step={0.01}
                          precision={2}
                          showBounds={false}
                          disabled={disabled}
                          onChange={(nextValue) => updateMapping(mapping.id, (current) => ({
                            ...current,
                            targets: current.targets.map((entry) => (
                              entry.id === target.id ? { ...entry, out_max: nextValue } : entry
                            )),
                          }))}
                        />
                      </div>
                    </Tile>
                  )
                })}
              </div>

              <div className="juce-grid-page__midi-actions">
                <div className="juce-grid-page__compact-tags">
                  <Tag type="cool-gray">{mapping.channel === 0 ? 'Omni' : `Ch ${mapping.channel}`}</Tag>
                  <Tag type="cool-gray">CC {mapping.cc}</Tag>
                  <Tag type="cool-gray">{mapping.cc_min}-{mapping.cc_max}</Tag>
                </div>
                <div className="juce-grid-page__compact-actions">
                  <Button size="sm" kind="ghost" renderIcon={Add} onClick={() => addTarget(mapping.id)} disabled={disabled}>
                    Add target
                  </Button>
                </div>
              </div>
            </Tile>
          ))}
        </div>
      )}

      <div className="juce-grid-page__midi-actions">
        <div className="juce-grid-page__compact-tags">
          <Tag type="cool-gray">Mappings save into snapshot controls and apply on activation.</Tag>
        </div>
        <div className="juce-grid-page__compact-actions">
          <Button size="sm" kind="ghost" onClick={onClear} disabled={disabled || isPending || draftMappings.length === 0}>
            Clear
          </Button>
          <Button size="sm" kind="secondary" onClick={() => onSave(draftMappings)} disabled={saveDisabled || isPending}>
            {isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {!hasActiveSnapshot && (
        <p className="juce-grid-page__empty-state-copy">
          Load a snapshot to configure per-snapshot expression pedal mappings.
        </p>
      )}
    </Tile>
  )
}

export default SnapshotExpressionMappingsCard
