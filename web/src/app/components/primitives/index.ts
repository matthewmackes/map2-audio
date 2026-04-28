// MAP2 primitives library — single import path for the canonical set
// of token-driven, Carbon-disciplined components introduced by T2474 B4.
//
// Consumers should prefer:
//
//   import { StatusChip, PageHeader, AlertPanel } from '@/app/components/primitives'
//
// instead of importing each primitive individually. New primitives added
// in later bundles must be re-exported here.
//
// The pre-existing components (EmptyState, LoadingState, DashboardCard,
// WorkspaceSectionHeader, NodeSelector) are also re-exported so callers
// only need one import path even when mixing old and new primitives.

// ── New primitives (T2474 B4) ─────────────────────────────────────────
export { StatusChip } from './StatusChip'
export type { StatusChipTone, StatusChipSize } from './StatusChip'

export { LatencyChip, bandForLatency } from './LatencyChip'
export { ClockSyncChip } from './ClockSyncChip'
export type { ClockSyncState } from './ClockSyncChip'
export { AvbStatusChip } from './AvbStatusChip'
export type { AvbStatus } from './AvbStatusChip'

export { PageHeader } from './PageHeader'
export { SectionHeader } from './SectionHeader'
export { SystemStatusBar } from './SystemStatusBar'

export { MetricCard } from './MetricCard'
export { HealthMetric, bandForHealthValue } from './HealthMetric'

export { ControlPanel } from './ControlPanel'
export { RoutingPanel } from './RoutingPanel'
export { ModuleCard } from './ModuleCard'
export { SignalChainBlock } from './SignalChainBlock'
export { DeviceNodeCard } from './DeviceNodeCard'
export type { NodeHealth, NodePresence } from './DeviceNodeCard'

export { ActionButton } from './ActionButton'
export type { ActionButtonIntent } from './ActionButton'
export { DangerButton } from './DangerButton'

export { AlertPanel } from './AlertPanel'
export type { AlertPanelSeverity } from './AlertPanel'

export { CommitPrompt } from './CommitPrompt'
export { StagedChangesIndicator } from './StagedChangesIndicator'
export { LiveStagedToggle } from './LiveStagedToggle'
export type { LiveStagedView } from './LiveStagedToggle'

export { ErrorState } from './ErrorState'
export { DrawerPanel } from './DrawerPanel'

// ── Pre-existing primitives (re-export for one-import convenience) ────
export { EmptyState } from '../shared/EmptyState'
export { LoadingState } from '../shared/LoadingState'
export { DashboardCard } from '../shared/DashboardCard'
export { WorkspaceSectionHeader } from '../shared/WorkspaceSectionHeader'
