import React, { useState } from 'react'
import { Add, PlayFilled, TrashCan } from '@carbon/icons-react'
import { Button, InlineLoading, InlineNotification, Tag, TextInput, Tile } from '@carbon/react'
import {
  useTesiraPresets,
  useRecallPreset,
  usePresetInterlockRules,
  useAddInterlockRule,
  useDeleteInterlockRule,
} from '../hooks/useTesiraApi'
import { useTesiraReversePresetSync } from '../hooks/useTesiraWebSocket'
import type { TesiraReversePresetSyncEvent } from '../types'
import './TesiraCarbonChrome.css'

interface TesiraPresetsTabProps {
  deviceId: string
}

function normalizeIntegerInput(value: string): string {
  return value.replace(/[^0-9]/g, '')
}

export function TesiraPresetsTab({ deviceId }: TesiraPresetsTabProps) {
  const { data: presets, isLoading } = useTesiraPresets(deviceId)
  const recallPreset = useRecallPreset()
  const { data: rules } = usePresetInterlockRules()
  const addRule = useAddInterlockRule()
  const deleteRule = useDeleteInterlockRule()

  const [newMap2Id, setNewMap2Id] = useState('')
  const [newPresetIdx, setNewPresetIdx] = useState('')
  const [latestReverse, setLatestReverse] = useState<TesiraReversePresetSyncEvent | null>(null)

  useTesiraReversePresetSync((event) => {
    if (event.device_id === deviceId) {
      setLatestReverse(event)
    }
  })

  const deviceRules = (rules ?? []).filter((rule) => rule.tesira_device_id === deviceId)

  function handleAddRule() {
    const map2PresetId = Number.parseInt(newMap2Id, 10)
    const tesiraPresetIndex = Number.parseInt(newPresetIdx, 10)

    if (Number.isNaN(map2PresetId) || Number.isNaN(tesiraPresetIndex)) return

    addRule.mutate({
      map2_preset_id: map2PresetId,
      tesira_device_id: deviceId,
      tesira_preset_index: tesiraPresetIndex,
    })
    setNewMap2Id('')
    setNewPresetIdx('')
  }

  return (
    <div className="tesira-presets-tab">
      <div className="tesira-presets-tab__grid">
        <Tile className="tesira-presets-tab__tile">
          <div className="tesira-presets-tab__header">
            <div>
              <p className="tesira-dashboard__eyebrow">Device presets</p>
              <h3 className="tesira-dashboard__title">Recall stored Tesira presets</h3>
              <p className="tesira-dashboard__summary">
                Use the Tesira route to trigger preset recalls on the connected unit without leaving the Carbon workflow.
              </p>
            </div>
            <div className="tesira-presets-tab__tags">
              <Tag type="cool-gray" size="sm">{presets?.length ?? 0} presets</Tag>
            </div>
          </div>

          {isLoading ? (
            <InlineLoading description="Loading device presets" />
          ) : !presets || presets.length === 0 ? (
            <p className="tesira-presets-tab__empty">No presets found.</p>
          ) : (
            <div className="tesira-presets-tab__list">
              {presets.map((preset) => (
                <div key={preset.index} className="tesira-presets-tab__preset-row">
                  <div className="tesira-presets-tab__preset-copy">
                    <h4 className="tesira-presets-tab__preset-title">{preset.name || `Preset ${preset.index}`}</h4>
                    <p className="tesira-presets-tab__preset-meta">Index {preset.index}</p>
                  </div>
                  <Button
                    size="sm"
                    kind="secondary"
                    renderIcon={PlayFilled}
                    onClick={() => recallPreset.mutate({ deviceId, presetIndex: preset.index })}
                    disabled={recallPreset.isPending}
                  >
                    Recall
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Tile>

        <Tile className="tesira-presets-tab__tile">
          <div className="tesira-presets-tab__header">
            <div>
              <p className="tesira-dashboard__eyebrow">Preset interlock rules</p>
              <h3 className="tesira-dashboard__title">Map Tesira presets to MAP2 presets</h3>
              <p className="tesira-dashboard__summary">
                When a MAP2 preset is recalled, MAP2 can automatically recall the mapped Tesira preset on this device.
              </p>
            </div>
            <div className="tesira-presets-tab__tags">
              <Tag type="warm-gray" size="sm">{deviceRules.length} mapped</Tag>
            </div>
          </div>

          {latestReverse ? (
            <InlineNotification
              kind={latestReverse.matched ? 'info' : 'warning'}
              lowContrast
              hideCloseButton
              title={`Tesira preset ${latestReverse.preset_index} changed on-device`}
              subtitle={
                latestReverse.matched
                  ? `Mapped MAP2 preset IDs: ${latestReverse.map2_preset_ids.join(', ')}.`
                  : 'No MAP2 interlock mapping found for this preset.'
              }
            />
          ) : null}

          {deviceRules.length > 0 ? (
            <div className="tesira-presets-tab__table-wrap">
              <table className="tesira-quick-console__table" aria-label="Tesira preset interlock rules">
                <thead>
                  <tr>
                    <th scope="col">MAP2 Preset ID</th>
                    <th scope="col">Tesira Preset</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {deviceRules.map((rule) => (
                    <tr key={rule.id}>
                      <td>{rule.map2_preset_id}</td>
                      <td>{rule.tesira_preset_index}</td>
                      <td>
                        <Button
                          kind="ghost"
                          size="sm"
                          hasIconOnly
                          renderIcon={TrashCan}
                          iconDescription={`Delete interlock rule ${rule.id}`}
                          onClick={() => deleteRule.mutate(rule.id)}
                          disabled={deleteRule.isPending}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="tesira-presets-tab__empty">No interlock rules.</p>
          )}

          <div className="tesira-presets-tab__form">
            <TextInput
              id="tesira-preset-map2-id"
              labelText="MAP2 Preset ID"
              value={newMap2Id}
              onChange={(event) => setNewMap2Id(normalizeIntegerInput(event.target.value))}
              inputMode="numeric"
            />
            <TextInput
              id="tesira-preset-device-id"
              labelText="Tesira Preset #"
              value={newPresetIdx}
              onChange={(event) => setNewPresetIdx(normalizeIntegerInput(event.target.value))}
              inputMode="numeric"
            />
            <Button
              size="sm"
              kind="secondary"
              renderIcon={Add}
              onClick={handleAddRule}
              disabled={!newMap2Id || !newPresetIdx || addRule.isPending}
            >
              Add rule
            </Button>
          </div>

          {addRule.isError ? (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title="Failed to add interlock rule"
              subtitle="Check the preset identifiers and try again."
            />
          ) : null}
        </Tile>
      </div>
    </div>
  )
}
