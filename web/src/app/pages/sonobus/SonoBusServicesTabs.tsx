/**
 * T2521-6d — SonoBusServicesTabs.
 *
 * Sub-route navigation rail for /sonobus/*. Mirrors AvbServicesTabs
 * visually. Six regions matching the SonoBus sub-task plan:
 *   - Overview      (T2521-6 first slice)
 *   - Connections   (T2521-6b)
 *   - Peers         (T2521-6c)
 *   - Groups        (T2521-6c)
 *   - Network       (T2521-6c)
 *   - Diagnostics   (T2521-6c)
 */

import { NavLink, useLocation } from 'react-router-dom'
import { LayoutGroup, motion } from 'framer-motion'

import { MAP2_SPRING } from '../../styles/motionPrimitives'
import { useReducedMotionSafeTransition } from '../../styles/useReducedMotionSafeVariants'
import './SonoBusServicesTabs.css'

interface SonoBusServicesTabDef {
  id: string
  label: string
  sub: string
  to: string
}

const TABS: readonly SonoBusServicesTabDef[] = [
  { id: 'overview', label: 'Overview', sub: 'Counts · Daemon · Priority', to: '/sonobus' },
  { id: 'connections', label: 'Connections', sub: 'Bindings · Routes', to: '/sonobus/connections' },
  { id: 'peers', label: 'Peers', sub: 'Listeners · Capabilities', to: '/sonobus/peers' },
  { id: 'groups', label: 'Groups', sub: 'Channel-groups · Sessions', to: '/sonobus/groups' },
  // T2521-7 — Routing region; talker × listener matrix mirror of /avb/routing.
  { id: 'routing', label: 'Routing', sub: 'Talker × Listener · Priority', to: '/sonobus/routing' },
  { id: 'network', label: 'Network', sub: 'Server · Ports · mDNS', to: '/sonobus/network' },
  { id: 'profiles', label: 'Profiles', sub: 'Codec · Jitter · Resend', to: '/sonobus/profiles' },
  { id: 'diagnostics', label: 'Diagnostics', sub: 'Authority · Gates · Metrics', to: '/sonobus/diagnostics' },
]

function isActive(pathname: string, to: string): boolean {
  if (to === '/sonobus') {
    return pathname === '/sonobus'
  }
  return pathname === to || pathname.startsWith(`${to}/`)
}

export function SonoBusServicesTabs() {
  const { pathname } = useLocation()
  const indicatorTransition = useReducedMotionSafeTransition(MAP2_SPRING.tabIndicator)
  return (
    <nav
      className="sonobus-services-tabs"
      aria-label="SonoBus sub-route navigation"
      data-testid="sonobus-services-tabs"
    >
      <LayoutGroup id="sonobus-services-tabs">
        <div className="sonobus-services-tabs__rail">
          {TABS.map((tab) => {
            const active = isActive(pathname, tab.to)
            const endMatch = tab.to === '/sonobus'
            return (
              <NavLink
                key={tab.id}
                to={tab.to}
                end={endMatch}
                className={`sonobus-services-tabs__tab${active ? ' sonobus-services-tabs__tab--active' : ''}`}
                aria-current={active ? 'page' : undefined}
                data-testid={`sonobus-tab-${tab.id}`}
              >
                {active ? (
                  <motion.span
                    layoutId="sonobus-services-tabs__indicator"
                    className="sonobus-services-tabs__indicator"
                    aria-hidden="true"
                    transition={indicatorTransition}
                  />
                ) : null}
                <div className="sonobus-services-tabs__label">{tab.label}</div>
                <div className="sonobus-services-tabs__sub">{tab.sub}</div>
              </NavLink>
            )
          })}
        </div>
      </LayoutGroup>
    </nav>
  )
}

export default SonoBusServicesTabs
