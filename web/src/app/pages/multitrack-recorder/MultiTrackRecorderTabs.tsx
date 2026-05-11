/**
 * T2503 Set 10 — MultiTrack Recorder tabs.
 *
 * Same shape as MidiHubTabs (LayoutGroup + magic-move indicator + Framer
 * Motion spring). Eight tabs map 1:1 to the eight sub-area routes mounted
 * under /multitrack-recorder.
 */
import { NavLink, useLocation } from 'react-router-dom'
import { LayoutGroup, motion } from 'framer-motion'

import { MAP2_SPRING } from '../../styles/motionPrimitives'
import { useReducedMotionSafeTransition } from '../../styles/useReducedMotionSafeVariants'
import './MultiTrackRecorderTabs.css'

interface TabDef {
  id: string
  label: string
  sub: string
  to: string
}

const TABS: readonly TabDef[] = [
  { id: 'transport', label: 'Transport', sub: 'Play · Stop · Record · Seek', to: '/multitrack-recorder/transport' },
  { id: 'tracks', label: 'Tracks', sub: 'Arm · Mute · Solo · Type', to: '/multitrack-recorder/tracks' },
  { id: 'mixer', label: 'Mixer', sub: 'Channel strip · Meters · Inserts', to: '/multitrack-recorder/mixer' },
  { id: 'clips', label: 'Clips', sub: 'Launcher · Slots · Cues', to: '/multitrack-recorder/clips' },
  { id: 'plugins', label: 'Plugins', sub: 'Inventory · Insert · Edit', to: '/multitrack-recorder/plugins' },
  { id: 'automation', label: 'Automation', sub: 'Lanes · Points · Curves', to: '/multitrack-recorder/automation' },
  { id: 'sessions', label: 'Sessions', sub: 'Projects · Save · Load', to: '/multitrack-recorder/sessions' },
  { id: 'export', label: 'Export', sub: 'Render · Bounce · Stem', to: '/multitrack-recorder/export' },
]

function isActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`)
}

export function MultiTrackRecorderTabs() {
  const { pathname } = useLocation()
  const indicatorTransition = useReducedMotionSafeTransition(MAP2_SPRING.tabIndicator)
  return (
    <nav className="multitrack-recorder-tabs" aria-label="MultiTrack Recorder sub-route navigation">
      <LayoutGroup id="multitrack-recorder-tabs">
        <div className="multitrack-recorder-tabs__rail">
          {TABS.map((tab) => {
            const active = isActive(pathname, tab.to)
            return (
              <NavLink
                key={tab.id}
                to={tab.to}
                className={`multitrack-recorder-tabs__tab${active ? ' multitrack-recorder-tabs__tab--active' : ''}`}
                aria-current={active ? 'page' : undefined}
                data-testid={`multitrack-tab-${tab.id}`}
              >
                {active ? (
                  <motion.span
                    layoutId="multitrack-recorder-tabs__indicator"
                    className="multitrack-recorder-tabs__indicator"
                    aria-hidden="true"
                    transition={indicatorTransition}
                  />
                ) : null}
                <div className="multitrack-recorder-tabs__label">{tab.label}</div>
                <div className="multitrack-recorder-tabs__sub">{tab.sub}</div>
              </NavLink>
            )
          })}
        </div>
      </LayoutGroup>
    </nav>
  )
}
