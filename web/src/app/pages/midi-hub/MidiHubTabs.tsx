import { NavLink, useLocation } from 'react-router-dom'
import { LayoutGroup, motion } from 'framer-motion'

import { MAP2_SPRING } from '../../styles/motionPrimitives'
import { useReducedEffectsPreference } from '../../hooks/useReducedEffectsPreference'
import './MidiHubTabs.css'

interface MidiHubTabDef {
  id: string
  label: string
  sub: string
  to: string
}

const TABS: readonly MidiHubTabDef[] = [
  { id: 'connections', label: 'Connections', sub: 'Routes · Patchbay · Traffic', to: '/midi-hub/connections' },
  { id: 'presets', label: 'Presets', sub: 'Slots · Librarian', to: '/midi-hub/presets' },
  { id: 'transport', label: 'Transport', sub: 'Clock · Scenes · Setlist', to: '/midi-hub/transport' },
  { id: 'events', label: 'Events', sub: 'Live feed · Filters', to: '/midi-hub/events' },
  { id: 'processing', label: 'Processing', sub: 'Filters · Transforms', to: '/midi-hub/processing' },
  { id: 'network', label: 'Network', sub: 'OSC · Tesira · GPIO', to: '/midi-hub/network' },
  { id: 'lab', label: 'Lab', sub: 'Experimental', to: '/midi-hub/lab' },
]

function isActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`)
}

export function MidiHubTabs() {
  const { pathname } = useLocation()
  // T2466-3: respect prefers-reduced-motion + the in-app
  // Reduced-effects toggle for the tab-indicator magic-move spring.
  const { shouldReduceEffects } = useReducedEffectsPreference()
  return (
    <nav className="midi-hub-tabs" aria-label="MIDI Hub sub-route navigation">
      <LayoutGroup id="midi-hub-tabs">
        <div className="midi-hub-tabs__rail">
          {TABS.map((tab) => {
            const active = isActive(pathname, tab.to)
            return (
              <NavLink
                key={tab.id}
                to={tab.to}
                className={`midi-hub-tabs__tab${active ? ' midi-hub-tabs__tab--active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {active ? (
                  <motion.span
                    layoutId="midi-hub-tabs__indicator"
                    className="midi-hub-tabs__indicator"
                    aria-hidden="true"
                    transition={shouldReduceEffects ? { duration: 0 } : MAP2_SPRING.tabIndicator}
                  />
                ) : null}
                <div className="midi-hub-tabs__label">{tab.label}</div>
                <div className="midi-hub-tabs__sub">{tab.sub}</div>
              </NavLink>
            )
          })}
        </div>
      </LayoutGroup>
    </nav>
  )
}
