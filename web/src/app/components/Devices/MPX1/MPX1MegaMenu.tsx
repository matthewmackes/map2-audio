import { NavLink } from 'react-router-dom'
import {
  Activity,
  Apps,
  Book,
  Branch,
  ChevronLeft,
  ChevronRight,
  Flash,
  Music,
  Power,
  Renew,
  SettingsAdjust,
  Waveform,
  type CarbonIconType,
} from '@carbon/icons-react'
import { Button, Layer, Tag } from '@carbon/react'

import { formatMpx1ProgramNumber } from './programNumber'
import './MPX1MegaMenu.css'

type Mpx1TileId = 'panel' | 'editor' | 'midi-map' | 'matrix' | 'library' | 'diag' | 'flow'

interface Mpx1Tile {
  id: Mpx1TileId
  to: string
  label: string
  description: string
  icon: CarbonIconType
}

const TILES: Mpx1Tile[] = [
  {
    id: 'panel',
    to: '/mpx1/panel',
    label: 'Panel',
    description: 'Front panel + live controls',
    icon: Apps,
  },
  {
    id: 'editor',
    to: '/mpx1/editor',
    label: 'Editor',
    description: 'Deep parameter editor',
    icon: SettingsAdjust,
  },
  {
    id: 'midi-map',
    to: '/mpx1/midi-map',
    label: 'MIDI Mapper',
    description: 'CC to SysEx routing',
    icon: Music,
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
    icon: Book,
  },
  {
    id: 'diag',
    to: '/mpx1/diag',
    label: 'Diagnostics',
    description: 'SysEx traffic + health',
    icon: Activity,
  },
  {
    id: 'flow',
    to: '/mpx1/flow',
    label: 'Signal Flow',
    description: 'WYSIWYG routing canvas',
    icon: Branch,
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
  const safeMix = clamp01(mixMeter)
  const safeLevel = clamp01(levelMeter)


  return (
    <Layer id={menuId} className="mpx1-mega-menu" role="menu" aria-label="MPX1 menu">
      <section className="mpx1-mega-menu__header">
        <div className="mpx1-mega-menu__header-status">
          <span className={`mpx1-status-dot${connected ? ' is-online' : ''}`} aria-hidden />
          <span className="mpx1-status-label">{connected ? 'Device Online' : 'No Device Connected'}</span>
          <Tag type={connected ? 'green' : 'warm-gray'} size="sm" className="mpx1-status-tag">
            {connected ? 'Connected' : 'Offline'}
          </Tag>
        </div>

        <div className="mpx1-mega-menu__header-program">
          <Button
            type="button"
            kind="ghost"
            size="sm"
            hasIconOnly
            className="mpx1-program-step"
            onClick={() => void onProgramStep?.(-1)}
            renderIcon={ChevronLeft}
            iconDescription="Previous MPX1 program"
          />
          <div className="mpx1-program-meta">
            <div className="mpx1-program-number">P{formatMpx1ProgramNumber(currentProgram)}</div>
            <div className="mpx1-program-name" title={currentProgramName}>{currentProgramName}</div>
          </div>
          <Button
            type="button"
            kind="ghost"
            size="sm"
            hasIconOnly
            className="mpx1-program-step"
            onClick={() => void onProgramStep?.(1)}
            renderIcon={ChevronRight}
            iconDescription="Next MPX1 program"
          />
        </div>
      </section>

      <section className="mpx1-mega-menu__body">
        <Layer className="mpx1-mega-menu__sidebar" aria-label="MPX1 device controls">
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
            <Button type="button" kind="secondary" size="sm" className="mpx1-device-btn" onClick={() => void onDisconnect?.()} renderIcon={Power}>
              Disconnect
            </Button>
            <Button type="button" kind="secondary" size="sm" className="mpx1-device-btn" onClick={() => void onRescan?.()} renderIcon={Renew}>
              Rescan
            </Button>
          </div>
        </Layer>

        <Layer className="mpx1-mega-menu__content">
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
                  <TileIcon size={18} aria-hidden />
                  <div className="mpx1-mega-menu__tile-copy">
                    <div className="mpx1-mega-menu__tile-title">{tile.label}</div>
                    <div className="mpx1-mega-menu__tile-description">{tile.description}</div>
                  </div>
                </NavLink>
              )
            })}
          </div>

          <div className="mpx1-mega-menu__quick-strip" aria-label="MPX1 quick actions">
            <Button type="button" kind="ghost" size="sm" className="mpx1-quick-btn" onClick={onClose} renderIcon={Apps}>
              A/B Compare
            </Button>
            <Button type="button" kind="ghost" size="sm" className="mpx1-quick-btn" onClick={onClose} renderIcon={Flash}>
              Tap Tempo
            </Button>
            <Button type="button" kind="ghost" size="sm" className="mpx1-quick-btn" onClick={onClose} renderIcon={Power}>
              Bypass All
            </Button>
          </div>
        </Layer>
      </section>
    </Layer>
  )
}
