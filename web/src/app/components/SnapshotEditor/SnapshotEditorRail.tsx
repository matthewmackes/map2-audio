import type { ComponentType } from 'react'
import { ChartLine, Flow, Folder, Help, SettingsAdjust, Time } from '@carbon/icons-react'

export type SnapshotEditorRailItemId =
  | 'signal-grid'
  | 'directory'
  | 'parameters'
  | 'automation'
  | 'version-history'
  | 'help'

interface SnapshotEditorRailProps {
  activeItemId: SnapshotEditorRailItemId
  onOpenSignalGrid: () => void
  onOpenDirectory: () => void
  directoryDisabled?: boolean
  onOpenParameters: () => void
  parametersDisabled?: boolean
  onOpenAutomation: () => void
  automationActive?: boolean
  onOpenVersionHistory: () => void
  versionHistoryDisabled?: boolean
  onOpenHelp: () => void
}

interface SnapshotEditorRailItem {
  id: SnapshotEditorRailItemId
  label: string
  icon: ComponentType<{ size?: number }>
  onClick: () => void
  disabled?: boolean
}

export function SnapshotEditorRail({
  activeItemId,
  onOpenSignalGrid,
  onOpenDirectory,
  directoryDisabled = false,
  onOpenParameters,
  parametersDisabled = false,
  onOpenAutomation,
  automationActive = false,
  onOpenVersionHistory,
  versionHistoryDisabled = false,
  onOpenHelp,
}: SnapshotEditorRailProps) {
  const primaryItems: SnapshotEditorRailItem[] = [
    {
      id: 'signal-grid',
      label: 'Signal Grid',
      icon: Flow,
      onClick: onOpenSignalGrid,
    },
    {
      id: 'directory',
      label: 'Directory',
      icon: Folder,
      onClick: onOpenDirectory,
      disabled: directoryDisabled,
    },
    {
      id: 'parameters',
      label: 'Parameters',
      icon: SettingsAdjust,
      onClick: onOpenParameters,
      disabled: parametersDisabled,
    },
    {
      id: 'automation',
      label: 'Automation',
      icon: ChartLine,
      onClick: onOpenAutomation,
    },
    {
      id: 'version-history',
      label: 'Version History',
      icon: Time,
      onClick: onOpenVersionHistory,
      disabled: versionHistoryDisabled,
    },
  ]

  const helpItem: SnapshotEditorRailItem = {
    id: 'help',
    label: 'Help',
    icon: Help,
    onClick: onOpenHelp,
  }

  const renderItem = (item: SnapshotEditorRailItem) => {
    const Icon = item.icon
    const active = activeItemId === item.id || (item.id === 'automation' && automationActive)

    return (
      <button
        key={item.id}
        type="button"
        className={`snapshot-editor-rail__item${active ? ' is-active' : ''}`}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
        title={item.label}
        disabled={item.disabled}
        data-rail-item={item.id}
        onClick={item.onClick}
      >
        <Icon size={18} />
      </button>
    )
  }

  return (
    <nav className="snapshot-editor-rail" aria-label="Snapshot navigation">
      {primaryItems.map(renderItem)}
      <div className="snapshot-editor-rail__spacer" />
      {renderItem(helpItem)}
    </nav>
  )
}

export default SnapshotEditorRail
