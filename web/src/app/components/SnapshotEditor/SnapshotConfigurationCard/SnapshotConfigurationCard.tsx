import { useState, type CSSProperties } from 'react'
import { Button, Tab, TabList, TabPanel, TabPanels, Tabs, Tag } from '@carbon/react'
import { Flow, Launch, SettingsAdjust } from '@carbon/icons-react'

import { MorphPad } from '../../StateAuthority/MorphPad'
import {
  RoutingDropdown,
  SegmentedToggle,
  type ActiveChannelInfo,
  type RoutingDropdownOption,
} from '../BottomWizard/PedalboardBuildWizard'

import './SnapshotConfigurationCard.css'

export interface SnapshotSummaryInfo {
  saveLabel: string
  saveTone: 'ready' | 'dirty' | 'idle'
  hostLabel: string
  hostTone: 'live' | 'idle' | 'offline'
  inputDeviceLabel: string
  outputDeviceLabel: string
  monitoringDeviceLabel: string | null
  routingModeLabel: string
  routingDetailLabel: string
}

export interface SnapshotConfigurationCardProps {
  summary?: SnapshotSummaryInfo | null
  activeChannel?: ActiveChannelInfo | null
  routingOptions?: RoutingDropdownOption[]
  routingValue?: string
  onRoutingChange?: (id: string) => void
  routingDisabled?: boolean
  onOpenRouting?: () => void
  onOpenDevices?: () => void
  onOpenPublish?: () => void
  showMorphPad?: boolean
}

export function SnapshotConfigurationCard({
  summary,
  activeChannel,
  routingOptions,
  routingValue,
  onRoutingChange,
  routingDisabled,
  onOpenRouting,
  onOpenDevices,
  onOpenPublish,
  showMorphPad,
}: SnapshotConfigurationCardProps) {
  const hasContent =
    Boolean(summary) ||
    Boolean(activeChannel) ||
    (routingOptions && routingOptions.length > 0)
  const [activeTab, setActiveTab] = useState<number>(0)

  if (!hasContent && !showMorphPad) return null

  const channelToneClass = activeChannel?.muted
    ? 'is-muted'
    : activeChannel?.solo
      ? 'is-solo'
      : activeChannel?.stateLive
        ? 'is-live'
        : 'is-idle'

  return (
    <article
      className="snapshot-configuration-card"
      aria-label="Snapshot configuration"
    >
      <header className="snapshot-configuration-card__header">
        <span className="snapshot-configuration-card__eyebrow">Snapshot configuration</span>
        {onOpenPublish ? (
          <Button
            kind="ghost"
            size="sm"
            renderIcon={Launch}
            onClick={onOpenPublish}
            className="snapshot-configuration-card__publish"
          >
            Open in Publish
          </Button>
        ) : null}
      </header>

      <Tabs
        selectedIndex={activeTab}
        onChange={({ selectedIndex }) => setActiveTab(selectedIndex)}
      >
        <TabList aria-label="Snapshot configuration views" contained>
          <Tab>Configuration</Tab>
          {showMorphPad ? <Tab>Morph pad</Tab> : null}
        </TabList>
        <TabPanels>
          <TabPanel>
            <div className="snapshot-configuration-card__panel">
              {summary ? (
                <ul
                  className="snapshot-configuration-card__summary"
                  aria-label="Publish summary"
                >
                  <SummaryRow
                    label="Save"
                    value={summary.saveLabel}
                    toneTag={
                      summary.saveTone === 'ready'
                        ? { type: 'green', label: 'Saved' }
                        : summary.saveTone === 'dirty'
                          ? { type: 'magenta', label: 'Unsaved' }
                          : null
                    }
                  />
                  <SummaryRow
                    label="Host"
                    value={summary.hostLabel}
                    toneTag={
                      summary.hostTone === 'live'
                        ? { type: 'green', label: 'Live' }
                        : summary.hostTone === 'offline'
                          ? { type: 'red', label: 'Offline' }
                          : null
                    }
                  />
                  <SummaryRow
                    label="Sound"
                    value={
                      summary.monitoringDeviceLabel
                        ? `IN ${summary.inputDeviceLabel}  ·  OUT ${summary.outputDeviceLabel}  ·  MON ${summary.monitoringDeviceLabel}`
                        : `IN ${summary.inputDeviceLabel}  ·  OUT ${summary.outputDeviceLabel}`
                    }
                    toneTag={null}
                  />
                  <SummaryRow
                    label="Routing"
                    value={`${summary.routingModeLabel}  ·  ${summary.routingDetailLabel}`}
                    toneTag={null}
                  />
                </ul>
              ) : null}

              {activeChannel ? (
                <div className="snapshot-configuration-card__channel">
                  <div className="snapshot-configuration-card__channel-id">
                    <span
                      className={`snapshot-configuration-card__channel-letter ${channelToneClass}`}
                      style={
                        activeChannel.accentColor
                          ? ({ '--scc-channel-accent': activeChannel.accentColor } as CSSProperties)
                          : undefined
                      }
                    >
                      {activeChannel.channelLabel}
                    </span>
                    <div className="snapshot-configuration-card__channel-text">
                      <span className="snapshot-configuration-card__channel-name">
                        {activeChannel.chainLabel}
                      </span>
                      <span className="snapshot-configuration-card__channel-sub">
                        {activeChannel.blockSummary}
                      </span>
                    </div>
                  </div>
                  <div className="snapshot-configuration-card__channel-tags">
                    <Tag type={activeChannel.stateLive ? 'green' : 'cool-gray'} size="sm">
                      {activeChannel.stateLabel}
                    </Tag>
                    <Tag type="blue" size="sm">
                      {activeChannel.blendLabel}
                    </Tag>
                    <Tag type={activeChannel.muted ? 'red' : 'cool-gray'} size="sm">
                      {activeChannel.muted ? 'Mute' : 'M'}
                    </Tag>
                    <Tag type={activeChannel.solo ? 'warm-gray' : 'cool-gray'} size="sm">
                      {activeChannel.solo ? 'Solo' : 'S'}
                    </Tag>
                  </div>
                  {routingOptions && routingOptions.length > 0 ? (
                    <RoutingDropdown
                      options={routingOptions}
                      value={routingValue}
                      onChange={onRoutingChange}
                      disabled={routingDisabled}
                    />
                  ) : null}
                  <div className="snapshot-configuration-card__channel-toggles">
                    <SegmentedToggle
                      ariaLabel="Mute / solo"
                      options={[
                        {
                          id: 'm',
                          label: 'M',
                          on: activeChannel.muted,
                          tone: activeChannel.muted ? 'error' : undefined,
                        },
                        {
                          id: 's',
                          label: 'S',
                          on: activeChannel.solo,
                          tone: activeChannel.solo ? 'warn' : undefined,
                        },
                      ]}
                    />
                    <SegmentedToggle
                      ariaLabel="Channel clip status"
                      options={[
                        {
                          id: 'in',
                          label: 'IN',
                          on: activeChannel.inputClipActive,
                          tone: activeChannel.inputClipActive ? 'error' : undefined,
                        },
                        {
                          id: 'out',
                          label: 'OUT',
                          on: activeChannel.outputClipActive,
                          tone: activeChannel.outputClipActive ? 'error' : undefined,
                        },
                        {
                          id: 'clip',
                          label: 'CLIP',
                          on: activeChannel.clipActive,
                          tone: activeChannel.clipActive ? 'error' : undefined,
                        },
                      ]}
                    />
                    <Button
                      size="sm"
                      kind="ghost"
                      renderIcon={Flow}
                      onClick={onOpenRouting}
                      disabled={!onOpenRouting}
                    >
                      Routing
                    </Button>
                    <Button
                      size="sm"
                      kind="ghost"
                      renderIcon={SettingsAdjust}
                      onClick={onOpenDevices}
                      disabled={!onOpenDevices}
                    >
                      Devices
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </TabPanel>
          {showMorphPad ? (
            <TabPanel>
              <div className="snapshot-configuration-card__morph">
                <MorphPad size={180} />
              </div>
            </TabPanel>
          ) : null}
        </TabPanels>
      </Tabs>
    </article>
  )
}

function SummaryRow({
  label,
  value,
  toneTag,
}: {
  label: string
  value: string
  toneTag: { type: 'green' | 'magenta' | 'red'; label: string } | null
}) {
  return (
    <li className="snapshot-configuration-card__summary-row">
      <span className="snapshot-configuration-card__summary-label">{label}</span>
      <span className="snapshot-configuration-card__summary-value" title={value}>
        {value}
      </span>
      {toneTag ? (
        <Tag type={toneTag.type} size="sm">
          {toneTag.label}
        </Tag>
      ) : null}
    </li>
  )
}
