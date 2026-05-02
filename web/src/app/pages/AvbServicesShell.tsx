/**
 * T2490-1 — AvbServicesShell.
 *
 * Operator mount scaffold for /avb/* — sibling of MidiServicesShell.
 * Renders the shared workspace template + AvbServicesTabs + Outlet so
 * each /avb/<region> sub-route hangs off this shell. No backend
 * wiring yet; T2490-2 + T2490-3 land the canonical AvbBindingAuthority
 * data model + REST surface, then T2490-4..T2490-9 fill out the
 * region content.
 */

import { useMemo, useState } from 'react'
import { GlobalTheme, Theme } from '@carbon/react'
import { useLocation, Outlet } from 'react-router-dom'
import { ConnectionSignal, NetworkEnterprise, Time, Tools } from '@carbon/icons-react'

import { WorkspacePageTemplate } from '../components/layout/WorkspacePageTemplate'
import { useSetShellWindow } from '../layout/useSetShellWindow'
import type { ShellActionSlot } from '../layout/ShellWindowContext'
import { toCarbonBaseTheme, useTheme } from '../theme'
import { AvbServicesTabs } from './avb-services/AvbServicesTabs'
import './AvbServicesShell.css'

export function AvbServicesShell() {
  const location = useLocation()
  const { theme } = useTheme()
  const resolvedTheme = toCarbonBaseTheme(theme.carbonTheme)
  const [healthDrawerOpen, setHealthDrawerOpen] = useState(false)

  const actions = useMemo<ShellActionSlot[]>(() => [
    {
      id: 'avb-services-system',
      label: 'AVB scaffold',
      status: 'info',
      onClick: () => setHealthDrawerOpen(open => !open),
      title: 'AVB Services scaffold (T2490-1)',
    },
    {
      id: 'avb-services-ptp',
      label: 'PTP —',
      icon: Time,
      disabled: true,
    },
    {
      id: 'avb-services-streams',
      label: 'Streams —',
      icon: ConnectionSignal,
      disabled: true,
    },
    {
      id: 'avb-services-devices',
      label: 'Devices —',
      icon: Tools,
      disabled: true,
    },
    {
      id: 'avb-services-cluster',
      label: 'Cluster —',
      icon: NetworkEnterprise,
      disabled: true,
    },
  ], [])

  useSetShellWindow({
    title: 'AVB Services',
    subtitle: 'Streams, devices, routing, network, and cluster workflows for AVB / IEEE 1722.1.',
    kicker: 'Platform / AVB Services',
    actions,
  }, [actions])

  // healthDrawerOpen reserved for T2490-9 (network onboarding modal).
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
