import { NavLink } from 'react-router-dom'
import {
  ArrowsClockwise,
  Books,
  CaretLeft,
  CaretRight,
  GitBranch,
  Lightning,
  MusicNotes,
  Power,
  Pulse,
  Sliders,
  SquaresFour,
  Waveform,
} from '@phosphor-icons/react'

import { formatMpx1ProgramNumber } from './programNumber'
import { useIsMobile } from '../../hooks/useIsMobile'
import './MPX1MegaMenu.css'

type Mpx1TileId = 'panel' | 'editor' | 'midi-map' | 'matrix' | 'library' | 'diag' | 'flow'

interface Mpx1Tile {
  id: Mpx1TileId
  to: string
  label: string
  description: string
  icon: React.ComponentType<any>
}

const TILES: Mpx1Tile[] = [
  {
    id: 'panel',
    to: '/mpx1/panel',
    label: 'Panel',
    description: 'Front panel + live controls',
    icon: SquaresFour,
  },
  {
    id: 'editor',
    to: '/mpx1/editor',
    label: 'Editor',
    description: 'Deep parameter editor',
    icon: Sliders,
  },
  {
    id: 'midi-map',
    to: '/mpx1/midi-map',
    label: 'MIDI Mapper',
    description: 'CC to SysEx routing',
    icon: MusicNotes,
  },
  {
    id: 'matrix',
    to: '/mpx1/matrix',
    label: 'Mod Matrix',
    description: 'Internal modulation grid',
    icon: Waveform,
  },
  {
    id: 'library',
    to: '/mpx1/library',
    label: 'Library',
    description: 'Programs, tags, compare',
    icon: Books,
  },
  {
    id: 'diag',
    to: '/mpx1/diag',
    label: 'Diagnostics',
    description: 'SysEx traffic + health',
    icon: Pulse,
  },
  {
    id: 'flow',
    to: '/mpx1/flow',
    label: 'Signal Flow',
    description: 'WYSIWYG routing canvas',
    icon: GitBranch,
  },
]

interface MPX1MegaMenuProps {
  menuId?: string
  connected: boolean
  currentProgram: number
  currentProgramName: string
  mixMeter: number
  levelMeter: number
  hasMidiMappings: boolean
  onClose: () => void
  onRescan?: () => void | Promise<void>
  onDisconnect?: () => void | Promise<void>
  onProgramStep?: (delta: number) => void | Promise<void>
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function MPX1MegaMenu({
  menuId = 'mpx1-mega-menu',
  connected,
  currentProgram,
  currentProgramName,
  mixMeter,
  levelMeter,
  hasMidiMappings,
  onClose,
  onRescan,
  onDisconnect,
  onProgramStep,
}: MPX1MegaMenuProps) {
  const isMobile = useIsMobile()
  const safeMix = clamp01(mixMeter)
  const safeLevel = clamp01(levelMeter)

  if (isMobile) {
    return (
      <div id={menuId} className="mpx1-mega-menu-mobile-root" role="menu" aria-label="MPX1 menu">
        <button
          type="button"
          className="mpx1-mega-menu-mobile-backdrop"
          onClick={onClose}
          aria-label="Close MPX1 menu"
        />
        <section className="mpx1-mega-menu-mobile-sheet">
          <div className="mpx1-mega-menu-mobile-header">
            <div className="mpx1-mega-menu-mobile-status">
              <span className={`mpx1-status-dot${connected ? ' is-online' : ''}`} aria-hidden />
              <span className="mpx1-status-label">{connected ? 'Device Online' : 'No Device Connected'}</span>
            </div>
            <button type="button" className="mpx1-mega-menu-mobile-close" onClick={onClose} aria-label="Dismiss menu">
              Close
            </button>
          </div>

          <div className="mpx1-mega-menu-mobile-program-readout">
            <div className="mpx1-mega-menu-mobile-program-number">P{formatMpx1ProgramNumber(currentProgram)}</div>
            <div className="mpx1-mega-menu-mobile-program-name" title={currentProgramName}>
              {currentProgramName}
            </div>
          </div>

          <div className="mpx1-mega-menu-mobile-meter">
            <div className="mpx1-mega-menu-mobile-meter-label">Mix</div>
            <div
              className="mpx1-mega-menu-mobile-meter-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(safeMix * 100)}
            >
              <span className="mpx1-mega-menu-mobile-meter-fill" style={{ width: `${safeMix * 100}%` }} />
            </div>
            <div className="mpx1-mega-menu-mobile-meter-value">{Math.round(safeMix * 100)}%</div>
          </div>

          <div className="mpx1-mega-menu-mobile-meter">
            <div className="mpx1-mega-menu-mobile-meter-label">Level</div>
            <div
              className="mpx1-mega-menu-mobile-meter-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(safeLevel * 100)}
            >
              <span className="mpx1-mega-menu-mobile-meter-fill" style={{ width: `${safeLevel * 100}%` }} />
            </div>
            <div className="mpx1-mega-menu-mobile-meter-value">{Math.round(safeLevel * 100)}%</div>
          </div>

          <div className="mpx1-mega-menu-mobile-program-controls">
            <button
              type="button"
              className="mpx1-mega-menu-mobile-step"
              onClick={() => void onProgramStep?.(-1)}
              aria-label="Previous MPX1 program"
            >
              <CaretLeft size={16} weight="bold" aria-hidden />
              Prev Program
            </button>
            <button
              type="button"
              className="mpx1-mega-menu-mobile-step"
              onClick={() => void onProgramStep?.(1)}
              aria-label="Next MPX1 program"
            >
              <CaretRight size={16} weight="bold" aria-hidden />
              Next Program
            </button>
          </div>

          <div className="mpx1-mega-menu-mobile-links" role="list">
            {TILES.map((tile) => {
              const TileIcon = tile.icon
              return (
                <NavLink key={tile.id} to={tile.to} className="mpx1-mega-menu-mobile-link" onClick={onClose}>
                  <TileIcon size={16} weight="duotone" aria-hidden />
                  <span>{tile.label}</span>
                </NavLink>
              )
            })}
          </div>
        </section>
      </div>
    )
  }

  return (
    <div id={menuId} className="mpx1-mega-menu" role="menu" aria-label="MPX1 menu">
      <section className="mpx1-mega-menu__header">
        <div className="mpx1-mega-menu__header-status">
          <span className={`mpx1-status-dot${connected ? ' is-online' : ''}`} aria-hidden />
          <span className="mpx1-status-label">{connected ? 'Device Online' : 'No Device Connected'}</span>
        </div>

        <div className="mpx1-mega-menu__header-program">
          <button
            type="button"
            className="mpx1-program-step"
            onClick={() => void onProgramStep?.(-1)}
            aria-label="Previous MPX1 program"
          >
            <CaretLeft size={14} weight="bold" aria-hidden />
          </button>
          <div className="mpx1-program-meta">
            <div className="mpx1-program-number">P{formatMpx1ProgramNumber(currentProgram)}</div>
            <div className="mpx1-program-name" title={currentProgramName}>{currentProgramName}</div>
          </div>
          <button
            type="button"
            className="mpx1-program-step"
            onClick={() => void onProgramStep?.(1)}
            aria-label="Next MPX1 program"
          >
            <CaretRight size={14} weight="bold" aria-hidden />
          </button>
        </div>
      </section>

      <section className="mpx1-mega-menu__body">
        <aside className="mpx1-mega-menu__sidebar" aria-label="MPX1 device controls">
          <div className="mpx1-mega-menu__sidebar-title">Device</div>

          <div className="mpx1-mini-meter">
            <div className="mpx1-mini-meter__label">Mix</div>
            <div className="mpx1-mini-meter__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(safeMix * 100)}>
              <span className="mpx1-mini-meter__fill" style={{ width: `${safeMix * 100}%` }} />
            </div>
            <div className="mpx1-mini-meter__value">{Math.round(safeMix * 100)}%</div>
          </div>

          <div className="mpx1-mini-meter">
            <div className="mpx1-mini-meter__label">Level</div>
            <div className="mpx1-mini-meter__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(safeLevel * 100)}>
              <span className="mpx1-mini-meter__fill" style={{ width: `${safeLevel * 100}%` }} />
            </div>
            <div className="mpx1-mini-meter__value">{Math.round(safeLevel * 100)}%</div>
          </div>

          <div className="mpx1-device-actions">
            <button type="button" className="mpx1-device-btn" onClick={() => void onDisconnect?.()}>
              <Power size={14} weight="bold" aria-hidden />
              Disconnect
            </button>
            <button type="button" className="mpx1-device-btn" onClick={() => void onRescan?.()}>
              <ArrowsClockwise size={14} weight="bold" aria-hidden />
              Rescan
            </button>
          </div>
        </aside>

        <div className="mpx1-mega-menu__content">
          <div className="mpx1-mega-menu__tiles" role="list">
            {TILES.map((tile) => {
              const TileIcon = tile.icon
              const isMapper = tile.id === 'midi-map'
              const highlightMapper = isMapper && !hasMidiMappings

              return (
                <NavLink
                  key={tile.id}
                  to={tile.to}
                  className={({ isActive }) =>
                    [
                      'mpx1-mega-menu__tile',
                      isActive ? 'is-active' : '',
                      highlightMapper ? 'mpx1-mega-menu__tile--highlight' : '',
                    ].filter(Boolean).join(' ')
                  }
                  onClick={onClose}
                >
                  <TileIcon size={18} weight="duotone" aria-hidden />
                  <div className="mpx1-mega-menu__tile-copy">
                    <div className="mpx1-mega-menu__tile-title">{tile.label}</div>
                    <div className="mpx1-mega-menu__tile-description">{tile.description}</div>
                  </div>
                </NavLink>
              )
            })}
          </div>

          <div className="mpx1-mega-menu__quick-strip" aria-label="MPX1 quick actions">
            <button type="button" className="mpx1-quick-btn" onClick={onClose}>
              <SquaresFour size={14} weight="bold" aria-hidden />
              A/B Compare
            </button>
            <button type="button" className="mpx1-quick-btn" onClick={onClose}>
              <Lightning size={14} weight="bold" aria-hidden />
              Tap Tempo
            </button>
            <button type="button" className="mpx1-quick-btn" onClick={onClose}>
              <Power size={14} weight="bold" aria-hidden />
              Bypass All
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
