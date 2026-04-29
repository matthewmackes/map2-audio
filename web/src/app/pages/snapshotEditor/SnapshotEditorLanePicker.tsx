// SnapshotEditor automation-lane picker modal (T2473 part 2).
// Pure presentational sub-component extracted from the page
// monolith. Lets the operator pick a parameter from any plugin
// in the active flow's chain to spawn a new AutomationLane.

import { Button, Modal, Tag, Tile } from '@carbon/react'
import { getDisplayPluginName } from '../../../map2/displayNames'
import type { AutomationLane } from '../../grid/shared'

const LANE_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD']

// Minimal chain shape this component depends on. Avoids leaking
// the full editor chain type through the prop boundary.
export interface LanePickerChainPlugin {
  uri: string
  name: string
  parameters?: Record<string, unknown>
}

export interface LanePickerChain {
  plugins: LanePickerChainPlugin[]
}

export interface SnapshotEditorLanePickerProps {
  open: boolean
  currentChain: LanePickerChain | null | undefined
  existingLaneCount: number
  onClose: () => void
  onAddLane: (lane: AutomationLane) => void
}

export function SnapshotEditorLanePicker({
  open,
  currentChain,
  existingLaneCount,
  onClose,
  onAddLane,
}: SnapshotEditorLanePickerProps) {
  if (!open) return null
  return (
    <Modal
      open
      size="md"
      modalHeading="Add automation lane"
      primaryButtonText="Close"
      onRequestClose={onClose}
      onRequestSubmit={onClose}
    >
      <div className="juce-grid-page__lane-picker">
        <p className="juce-grid-page__modal-copy">
          Select a parameter to automate from the active flow.
        </p>
        {currentChain?.plugins && currentChain.plugins.length > 0 ? (
          <div className="juce-grid-page__lane-picker-grid">
            {currentChain.plugins.map((plugin) => (
              <Tile key={plugin.uri} className="juce-grid-page__lane-picker-tile">
                <div className="juce-grid-page__lane-picker-header">
                  <div className="juce-grid-page__lane-picker-copy">
                    <p className="juce-grid-page__dense-card-kicker">Processor</p>
                    <h3 className="juce-grid-page__dense-card-heading">
                      {getDisplayPluginName(plugin.name, plugin.uri)}
                    </h3>
                  </div>
                  <Tag type="cool-gray">
                    {Object.keys(plugin.parameters || {}).length} params
                  </Tag>
                </div>
                <div className="juce-grid-page__lane-picker-params">
                  {Object.entries(plugin.parameters || {}).map(([symbol]) => (
                    <Button
                      key={symbol}
                      size="sm"
                      kind="ghost"
                      onClick={() => {
                        onAddLane({
                          id: `${plugin.uri}:${symbol}`,
                          parameterName: symbol,
                          pluginName: getDisplayPluginName(plugin.name, plugin.uri),
                          pluginUri: plugin.uri,
                          parameterSymbol: symbol,
                          points: [],
                          enabled: true,
                          armed: false,
                          color: LANE_COLORS[existingLaneCount % LANE_COLORS.length],
                        })
                        onClose()
                      }}
                    >
                      {symbol}
                    </Button>
                  ))}
                </div>
              </Tile>
            ))}
          </div>
        ) : (
          <p className="juce-grid-page__empty-state-copy">
            No plugins in the active flow. Add plugins first to create automation lanes.
          </p>
        )}
      </div>
    </Modal>
  )
}
