/**
 * T2521-6d — SonoBusServicesShell.
 *
 * Operator mount for /sonobus/*. Mirrors AvbServicesShell. Renders the
 * shared workspace template + SonoBusServicesTabs + Outlet so each
 * /sonobus/<region> sub-route hangs off this shell.
 *
 * Five action-slot pills surface live values from the canonical
 * SonoBus hooks (status, bindings count, peers, groups, matrix).
 */

import { useMemo } from 'react'
import { GlobalTheme, Theme } from '@carbon/react'
import { useLocation, Outlet } from 'react-router-dom'
import { Activity, ConnectionSignal, NetworkEnterprise, Tools } from '@carbon/icons-react'

import { WorkspacePageTemplate } from '../components/layout/WorkspacePageTemplate'
import { useSetShellWindow } from '../layout/useSetShellWindow'
import type { ShellActionSlot, ShellActionStatus } from '../layout/ShellWindowContext'
import { toCarbonBaseTheme, useTheme } from '../theme'
import { SonoBusServicesTabs } from './sonobus/SonoBusServicesTabs'
import {
  useSonoBusBindingsCount,
  useSonoBusGroups,
  useSonoBusPeers,
  useSonoBusStatus,
} from './sonobus/useSonoBusBindings'
import './SonoBusServicesShell.css'

function systemStatus(authority_ok: boolean | undefined, daemon_running: boolean | undefined): ShellActionStatus {
  if (authority_ok === false) return 'error'
  if (daemon_running) return 'ok'
  return 'warn'
}

export function SonoBusServicesShell() {
  const location = useLocation()
  const { theme } = useTheme()
  const resolvedTheme = toCarbonBaseTheme(theme.carbonTheme)

  const status = useSonoBusStatus()
  const bindingsCount = useSonoBusBindingsCount()
  const peers = useSonoBusPeers()
  const groups = useSonoBusGroups()

  const systemLabel = status.data
    ? status.data.authority_ok
      ? status.data.daemon_running
        ? 'SonoBus running'
        : 'SonoBus authority ok'
      : 'SonoBus authority error'
    : 'SonoBus unknown'
  const systemTone = systemStatus(status.data?.authority_ok, status.data?.daemon_running)

  const streamCount = bindingsCount.data ?? 0
  const streamsLabel = bindingsCount.isError ? 'Bindings —' : `Bindings ${streamCount}`

  const peerCount = peers.data?.length ?? 0
  const peersLabel = peers.isError ? 'Peers —' : `Peers ${peerCount}`

  const groupCount = groups.data?.length ?? 0
  const groupsLabel = groups.isError ? 'Groups —' : `Groups ${groupCount}`

  const priorityLabel =
    status.data?.default_transport_priority?.replace('_', ' ') ?? 'priority —'

  const actions = useMemo<ShellActionSlot[]>(() => [
    {
      id: 'sonobus-system',
      label: systemLabel,
      status: systemTone,
      title: 'SonoBus authority + daemon state',
    },
    {
      id: 'sonobus-bindings',
      label: streamsLabel,
      icon: ConnectionSignal,
      status: bindingsCount.isError ? 'warn' : 'info',
      title: 'Total durable SonoBus bindings',
    },
    {
      id: 'sonobus-peers',
      label: peersLabel,
      icon: NetworkEnterprise,
      status: peers.isError ? 'warn' : 'info',
      title: 'Peers derived from binding listeners',
    },
    {
      id: 'sonobus-groups',
      label: groupsLabel,
      icon: Tools,
      status: groups.isError ? 'warn' : 'info',
      title: 'Channel-groups derived from bindings',
    },
    {
      id: 'sonobus-priority',
      label: `Default ${priorityLabel}`,
      icon: Activity,
      status: 'info',
      title: 'Default per-binding transport priority (Q18)',
    },
  ], [
    systemLabel,
    systemTone,
    streamsLabel,
    bindingsCount.isError,
    peersLabel,
    peers.isError,
    groupsLabel,
    groups.isError,
    priorityLabel,
  ])

  useSetShellWindow({
    title: 'SonoBus',
    subtitle: 'Remote-audio transport over AOO. AVB-preferred fallback per Q18.',
    kicker: 'Platform / SonoBus',
    actions,
  }, [actions])

  return (
    <GlobalTheme theme={resolvedTheme}>
      <Theme as="div" theme={resolvedTheme} className="sonobus-services-shell">
        <WorkspacePageTemplate
          className="sonobus-services-shell__template"
          windowClassName="sonobus-services-shell__frame"
          contentClassName="sonobus-services-shell__content"
          sidebar={null}
          content={(
            <section
              className="sonobus-services-shell__content-body"
              aria-label="SonoBus content"
              key={location.pathname}
            >
              <SonoBusServicesTabs />
              <Outlet />
            </section>
          )}
        />
      </Theme>
    </GlobalTheme>
  )
}

export default SonoBusServicesShell
