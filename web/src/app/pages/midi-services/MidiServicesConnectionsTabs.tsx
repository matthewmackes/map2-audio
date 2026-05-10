/**
 * T2500-MV-E1 — Outer-tab strip for /midi/connections.
 *
 * Two-tab strip mounted ABOVE the existing in-page Carbon tabs (which
 * remain Port matrix / Patchbay graph). Pattern copied from
 * MidiHubTabs (NavLink + framer-motion layoutId indicator).
 */

import { NavLink, useLocation } from 'react-router-dom'
import { LayoutGroup, motion } from 'framer-motion'

import { MAP2_SPRING } from '../../styles/motionPrimitives'
import { useReducedMotionSafeTransition } from '../../styles/useReducedMotionSafeVariants'
import './MidiServicesConnectionsTabs.css'

interface ConnectionsTabDef {
  id: string
  label: string
  sub: string
  to: string
  end?: boolean
}

const TABS: readonly ConnectionsTabDef[] = [
  {
    id: 'overview',
    label: 'Overview',
    sub: 'Routes · Patchbay · Traffic',
    to: '/midi/connections',
    end: true,
  },
  {
    id: 'visualization',
    label: 'Visualization',
    sub: 'Live three-tier graph',
    to: '/midi/connections/visualization',
  },
]

function isActive(pathname: string, to: string, end?: boolean): boolean {
  if (end) return pathname === to
  return pathname === to || pathname.startsWith(`${to}/`)
}

export function MidiServicesConnectionsTabs() {
  const { pathname } = useLocation()
  const indicatorTransition = useReducedMotionSafeTransition(MAP2_SPRING.tabIndicator)
  return (
    <nav
      className="midi-services-connections-tabs"
      aria-label="MIDI Connections sub-route navigation"
    >
      <LayoutGroup id="midi-services-connections-tabs">
        <div className="midi-services-connections-tabs__rail">
          {TABS.map((tab) => {
            const active = isActive(pathname, tab.to, tab.end)
            return (
              <NavLink
                key={tab.id}
                to={tab.to}
                end={tab.end}
                className={`midi-services-connections-tabs__tab${
                  active ? ' midi-services-connections-tabs__tab--active' : ''
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {active ? (
                  <motion.span
                    layoutId="midi-services-connections-tabs__indicator"
                    className="midi-services-connections-tabs__indicator"
                    aria-hidden="true"
                    transition={indicatorTransition}
                  />
                ) : null}
                <div className="midi-services-connections-tabs__label">{tab.label}</div>
                <div className="midi-services-connections-tabs__sub">{tab.sub}</div>
              </NavLink>
            )
          })}
        </div>
      </LayoutGroup>
    </nav>
  )
}

export default MidiServicesConnectionsTabs
