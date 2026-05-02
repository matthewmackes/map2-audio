/**
 * T2490-1 — AvbServicesTabs.
 *
 * Sub-route navigation rail for /avb/*. Mirrors MidiHubTabs visual
 * language. The 6 regions match the AVB sub-task plan:
 *   - Connections    (T2490-4)
 *   - Devices        (T2490-5 / T2490-6)
 *   - Bindings       (T2490-2 / T2490-3)
 *   - Routing        (T2490-8)
 *   - Network        (T2490-9)
 *   - Overview       (cross-link landing — kept lightweight)
 */

import { NavLink, useLocation } from 'react-router-dom'
import { LayoutGroup, motion } from 'framer-motion'

import { MAP2_SPRING } from '../../styles/motionPrimitives'
import { useReducedMotionSafeTransition } from '../../styles/useReducedMotionSafeVariants'
import './AvbServicesTabs.css'

interface AvbServicesTabDef {
  id: string
  label: string
  sub: string
  to: string
}

const TABS: readonly AvbServicesTabDef[] = [
  { id: 'overview',    label: 'Overview',    sub: 'Counts · Health',                  to: '/avb/overview' },
  { id: 'connections', label: 'Connections', sub: 'Talkers · Listeners · Streams',   to: '/avb/connections' },
  { id: 'bindings',    label: 'Bindings',    sub: 'Authority · Filter · Edit',       to: '/avb/bindings' },
  { id: 'devices',     label: 'Devices',     sub: 'AVDECC · Tesira · Profiles',      to: '/avb/devices' },
  { id: 'routing',     label: 'Routing',     sub: 'Talker × Listener matrix',         to: '/avb/routing' },
  { id: 'network',     label: 'Network',     sub: 'PTP · SRP · TSN · Cluster',       to: '/avb/network' },
]

function isActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`)
}

export function AvbServicesTabs() {
  const { pathname } = useLocation()
  const indicatorTransition = useReducedMotionSafeTransition(MAP2_SPRING.tabIndicator)
  return (
    <nav className="avb-services-tabs" aria-label="AVB Services sub-route navigation">
      <LayoutGroup id="avb-services-tabs">
        <div className="avb-services-tabs__rail">
          {TABS.map((tab) => {
            const active = isActive(pathname, tab.to)
            return (
              <NavLink
                key={tab.id}
                to={tab.to}
                className={`avb-services-tabs__tab${active ? ' avb-services-tabs__tab--active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {active ? (
                  <motion.span
                    layoutId="avb-services-tabs__indicator"
                    className="avb-services-tabs__indicator"
                    aria-hidden="true"
                    transition={indicatorTransition}
                  />
                ) : null}
                <div className="avb-services-tabs__label">{tab.label}</div>
                <div className="avb-services-tabs__sub">{tab.sub}</div>
              </NavLink>
            )
          })}
        </div>
      </LayoutGroup>
    </nav>
  )
}

export default AvbServicesTabs
