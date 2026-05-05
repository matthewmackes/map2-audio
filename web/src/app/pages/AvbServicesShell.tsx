/**
 * AvbServicesShell.
 *
 * Operator mount for /avb/* — sibling of MidiServicesShell. Renders the
 * shared workspace template + AvbServicesTabs + Outlet so each
 * /avb/<region> sub-route hangs off this shell. The five action-slot
 * pills surface live values from the canonical AVB hooks:
 *   - AVB system (tone tracks /api/avb/status: green operational /
 *     red degraded / warm-gray configured-not-operational)
 *   - PTP (state from /api/avb/ptp/status)
 *   - Streams (binding count from /api/avb/bindings/count)
 *   - Devices (discovered nodes + AVDECC entities)
 *   - Cluster (peer count from /api/avb/cluster/bindings/matrix)
 */

import { useMemo, useState } from 'react'
import { GlobalTheme, Theme } from '@carbon/react'
import { useLocation, Outlet } from 'react-router-dom'
import { ConnectionSignal, NetworkEnterprise, Time, Tools } from '@carbon/icons-react'

import { WorkspacePageTemplate } from '../components/layout/WorkspacePageTemplate'
import { useSetShellWindow } from '../layout/useSetShellWindow'
import type { ShellActionSlot, ShellActionStatus } from '../layout/ShellWindowContext'
import { toCarbonBaseTheme, useTheme } from '../theme'
import { AvbServicesTabs } from './avb-services/AvbServicesTabs'
import {
  useAvbBindingsCount,
  useAvbClusterMatrix,
} from './avb-services/useAvbBindings'
import { useAvbDiscovery, useAvdeccEntities } from './avb-services/useAvbDevices'
import { useAvbPtpStatus, useAvbStatus } from './avb-services/useAvbNetwork'
import './AvbServicesShell.css'

function systemStatus(
  operational: boolean | undefined,
  degraded: boolean | undefined,
): ShellActionStatus {
  if (degraded) return 'error'
  if (operational) return 'ok'
  return 'warn'
}

function ptpStatus(state: string | undefined): ShellActionStatus {
  switch (state) {
    case 'SLAVE':
    case 'MASTER':
    case 'PASSIVE':
      return 'ok'
    case 'FAULTY':
      return 'error'
    case 'UNCALIBRATED':
      return 'warn'
    default:
      return 'info'
  }
}

export function AvbServicesShell() {
  const location = useLocation()
  const { theme } = useTheme()
  const resolvedTheme = toCarbonBaseTheme(theme.carbonTheme)
  const [healthDrawerOpen, setHealthDrawerOpen] = useState(false)

  const status = useAvbStatus()
  const ptp = useAvbPtpStatus()
  const bindingsCount = useAvbBindingsCount()
  const discovery = useAvbDiscovery()
  const entities = useAvdeccEntities()
  const cluster = useAvbClusterMatrix()

  const overall = status.data
  const overallLabel = overall?.state
    ? `AVB ${overall.state}`
    : 'AVB unknown'
  const overallTone = systemStatus(overall?.operational, overall?.degraded)

  const ptpLabel = ptp.data?.state ? `PTP ${ptp.data.state}` : 'PTP —'
  const ptpTone = ptpStatus(ptp.data?.state)

  const streamCount = bindingsCount.data ?? 0
  const streamsLabel = bindingsCount.isError
    ? 'Streams —'
    : `Streams ${streamCount}`

  const deviceCount =
    (discovery.data?.total_discovered ?? 0) +
    (entities.data?.entities.length ?? 0)
  const devicesLabel =
    discovery.isError && entities.isError
      ? 'Devices —'
      : `Devices ${deviceCount}`

  const peerCount = cluster.data?.peers.length ?? 0
  const clusterLabel = cluster.isError ? 'Cluster —' : `Cluster ${peerCount}`

  const actions = useMemo<ShellActionSlot[]>(() => [
    {
      id: 'avb-services-system',
      label: overallLabel,
      status: overallTone,
      onClick: () => setHealthDrawerOpen(open => !open),
      title: 'AVB Services system status',
    },
    {
      id: 'avb-services-ptp',
      label: ptpLabel,
      icon: Time,
      status: ptpTone,
      title: 'PTP / gPTP grandmaster state',
    },
    {
      id: 'avb-services-streams',
      label: streamsLabel,
      icon: ConnectionSignal,
      status: bindingsCount.isError ? 'warn' : 'info',
      title: 'Total AVB bindings (streams + presets + cluster routes)',
    },
    {
      id: 'avb-services-devices',
      label: devicesLabel,
      icon: Tools,
      status: discovery.isError && entities.isError ? 'warn' : 'info',
      title: 'Discovered AVB nodes + AVDECC entities',
    },
    {
      id: 'avb-services-cluster',
      label: clusterLabel,
      icon: NetworkEnterprise,
      status: cluster.isError ? 'warn' : 'info',
      title: 'AVB cluster peer count',
    },
  ], [
    overallLabel,
    overallTone,
    ptpLabel,
    ptpTone,
    streamsLabel,
    bindingsCount.isError,
    devicesLabel,
    discovery.isError,
    entities.isError,
    clusterLabel,
    cluster.isError,
  ])

  useSetShellWindow({
    title: 'AVB Services',
    subtitle: 'Streams, devices, routing, network, and cluster workflows for AVB / IEEE 1722.1.',
    kicker: 'Platform / AVB Services',
    actions,
  }, [actions])

  // healthDrawerOpen reserved for the T2496-7 cluster auto-connect modal.
  void healthDrawerOpen

  return (
    <GlobalTheme theme={resolvedTheme}>
      <Theme as="div" theme={resolvedTheme} className="avb-services-shell">
        <WorkspacePageTemplate
          className="avb-services-shell__template"
          windowClassName="avb-services-shell__frame"
          contentClassName="avb-services-shell__content"
          sidebar={null}
          content={(
            <section
              className="avb-services-shell__content-body"
              aria-label="AVB Services content"
              key={location.pathname}
            >
              <AvbServicesTabs />
              <Outlet />
            </section>
          )}
        />
      </Theme>
    </GlobalTheme>
  )
}

export default AvbServicesShell
