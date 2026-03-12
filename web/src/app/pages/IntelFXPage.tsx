import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type CSSProperties,
} from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Book, Branch, ChevronLeft, ChevronRight, Dashboard, Music, Play, SettingsAdjust, Warning } from '@carbon/icons-react'
import { Button, InlineLoading, InlineNotification } from '@carbon/react'

import { formatIntelFXProgramName, formatIntelFXProgramNumber } from '../components/IntelFX/programNumber'
import { useMPX1State, type MPX1RegistryParam, type UseMPX1StateResult } from '../../map2/mpx1Api'
import { useCluster } from '../contexts/ClusterContext'
import { useDeviceLocation } from '../hooks/useDeviceLocation'
import '../components/MPX1/MPX1PageShell.css'
import './IntelFXPage.css'

type SidebarSectionId = 'panel' | 'editor' | 'midi-map' | 'library' | 'perform' | 'diag' | 'flow'
type BypassBlock = 'HUSH' | 'COMP' | 'WAH' | 'EQ' | 'PIT' | 'CHO' | 'FLG' | 'PHA' | 'TRM' | 'DLY' | 'REV'

interface SidebarSection {
  id: SidebarSectionId
  to: string
  label: string
  color: string
  icon: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>
}

const SIDEBAR_SECTIONS: SidebarSection[] = [
  { id: 'panel', to: '/intelfx/panel', label: 'Panel', color: '#38bdf8', icon: Dashboard },
  { id: 'editor', to: '/intelfx/editor', label: 'Editor', color: '#f59e0b', icon: SettingsAdjust },
  { id: 'midi-map', to: '/intelfx/midi-map', label: 'MIDI mapper', color: '#ec4899', icon: Music },
  { id: 'library', to: '/intelfx/library', label: 'Library', color: '#a78bfa', icon: Book },
  { id: 'perform', to: '/intelfx/perform', label: 'Perform', color: '#f97316', icon: Play },
  { id: 'diag', to: '/intelfx/diag', label: 'Diagnostics', color: '#14b8a6', icon: Warning },
  { id: 'flow', to: '/intelfx/flow', label: 'Signal flow', color: '#818cf8', icon: Branch },
]

const DEFAULT_BYPASS_STATE: Record<BypassBlock, boolean> = {
  HUSH: true,
  COMP: true,
  WAH: true,
  EQ: true,
  PIT: true,
  CHO: true,
  FLG: true,
  PHA: true,
  TRM: true,
  DLY: true,
  REV: true,
}

export interface IntelFXPageContextValue {
  intelfx: UseMPX1StateResult
  nodeId: string | null
  activeSection: SidebarSectionId
  currentProgramName: string
  lcdText: string
  setLcdText: (text: string) => void
  bypassState: Record<BypassBlock, boolean>
  onToggleBypass: (block: BypassBlock) => void
}

const IntelFXPageContext = createContext<IntelFXPageContextValue | null>(null)

// This file intentionally exports a hook and page component together for route context.
// eslint-disable-next-line react-refresh/only-export-components
export function useIntelFXPageContext(): IntelFXPageContextValue {
  const context = useContext(IntelFXPageContext)
  if (!context) {
    throw new Error('useIntelFXPageContext must be used within IntelFXPage context provider')
  }
  return context
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function sectionFromPath(pathname: string): SidebarSectionId {
  for (const section of SIDEBAR_SECTIONS) {
    if (pathname === section.to || pathname.startsWith(`${section.to}/`)) {
      return section.id
    }
  }
  return 'panel'
}

function findParamByCandidates(params: MPX1RegistryParam[] | undefined, candidates: string[]): MPX1RegistryParam | null {
  if (!params || params.length === 0) return null
  for (const candidate of candidates) {
    const found = params.find((param) => param.id === candidate)
    if (found) return found
  }
  return null
}

/* -------------------------------------------------------------------------- */
/*  IntelFX Status Bar (inline component)                                     */
/* -------------------------------------------------------------------------- */

interface IntelFXStatusBarProps {
  connected: boolean
  programNumber: number
  programName: string
  lcdText: string
  mixValue: number
  bypassState: Record<BypassBlock, boolean>
  onProgramStep: (delta: number) => void
  onMixChange: (value: number) => void
  onToggleBypass: (block: BypassBlock) => void
}

function IntelFXStatusBar({
  connected,
  programNumber,
  programName,
  lcdText,
  mixValue,
  bypassState,
  onProgramStep,
  onMixChange,
  onToggleBypass,
}: IntelFXStatusBarProps) {
  return (
    <div className="mpx1-statusbar">
      <div className="mpx1-statusbar__left">
        <span className={`mpx1-statusbar__dot${connected ? ' is-online' : ''}`} />
        <span className="mpx1-statusbar__device">INTELFX</span>
      </div>

      <div className="mpx1-statusbar__program">
        <button
          type="button"
          className="mpx1-statusbar__prog-btn"
          onClick={() => onProgramStep(-1)}
          aria-label="Previous program"
        >
          <ChevronLeft size={12} aria-hidden />
        </button>
        <span className="mpx1-statusbar__prog-number">
          {formatIntelFXProgramNumber(programNumber)}
        </span>
        <span className="mpx1-statusbar__prog-name">{programName}</span>
        <button
          type="button"
          className="mpx1-statusbar__prog-btn"
          onClick={() => onProgramStep(1)}
          aria-label="Next program"
        >
          <ChevronRight size={12} aria-hidden />
        </button>
      </div>

      <div className="mpx1-statusbar__lcd">
        <span className="mpx1-statusbar__lcd-track">{lcdText}</span>
      </div>

      <div className="mpx1-statusbar__mix">
        <span className="mpx1-statusbar__mix-label">MIX</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={mixValue}
          onChange={(event) => onMixChange(Number(event.target.value))}
          aria-label="Mix level"
        />
      </div>

      <div className="mpx1-statusbar__bypass">
        {(Object.keys(bypassState) as BypassBlock[]).map((block) => (
          <button
            key={block}
            type="button"
            className={`mpx1-statusbar__pill${bypassState[block] ? '' : ' is-bypassed'}`}
            onClick={() => onToggleBypass(block)}
            title={`${block}: ${bypassState[block] ? 'Engaged' : 'Bypassed'}`}
          >
            {block}
          </button>
        ))}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Main IntelFX Page                                                         */
/* -------------------------------------------------------------------------- */

export function IntelFXPage() {
  const location = useLocation()
  const activeSection = sectionFromPath(location.pathname)
  const { activeNodeId, localNodeId, nodes, setActiveNode } = useCluster()
  const { location: deviceLocation, isLoading: locationLoading } = useDeviceLocation('rocktron-intelfx')
  const selectedNodeId = activeNodeId && activeNodeId !== 'all' ? activeNodeId : localNodeId
  const selectedNode = nodes.find((node) => node.nodeId === selectedNodeId)
  const locationNode = deviceLocation ? nodes.find((node) => node.nodeId === deviceLocation.nodeId) : null
  const remoteSelected = selectedNodeId !== localNodeId
  const apiNodeId = remoteSelected ? selectedNodeId : null
  const needsSwitch = Boolean(deviceLocation && selectedNodeId !== deviceLocation.nodeId)
  const locationOffline = Boolean(locationNode && locationNode.nodeId !== localNodeId && !locationNode.isOnline)
  const intelfx = useMPX1State({
    nodeId: apiNodeId,
    autoConnectWs: !apiNodeId,
    pollIntervalMs: apiNodeId ? 5000 : 0,
  })

  const [lcdText, setLcdText] = useState('INTELFX READY')
  const [bypassState, setBypassState] = useState(DEFAULT_BYPASS_STATE)

  const currentProgram = intelfx.state?.current_program ?? 0
  const currentProgramEntry = intelfx.programs.find((program) => program.program === currentProgram)
  const currentProgramName = formatIntelFXProgramName(currentProgram, currentProgramEntry?.name)

  const maxProgramSlots = 256

  const mixParam = useMemo(
    () =>
      findParamByCandidates(intelfx.registry?.params, [
        'program.mix',
        'program.output_level',
      ]),
    [intelfx.registry?.params]
  )

  const mixMin = mixParam?.range?.min ?? 0
  const mixMax = mixParam?.range?.max ?? 127
  const mixRaw = mixParam ? Number(intelfx.shadow[mixParam.id] ?? mixParam.default ?? mixMin) : mixMin
  const mixValue = clamp01((mixRaw - mixMin) / Math.max(1, mixMax - mixMin))

  useEffect(() => {
    const connectivity = intelfx.state?.connected ? 'ONLINE' : 'OFFLINE'
    setLcdText(`PROGRAM ${formatIntelFXProgramNumber(currentProgram)} • ${currentProgramName} • ${connectivity}`)
  }, [currentProgram, currentProgramName, intelfx.state?.connected])

  const handleProgramStep = useCallback((delta: number) => {
    const nextProgram = Math.min(maxProgramSlots - 1, Math.max(0, currentProgram + delta))
    void intelfx.setProgram(nextProgram).catch((err) => {
      console.error('Failed to set IntelFX program:', err)
    })
  }, [currentProgram, maxProgramSlots, intelfx])

  const handleMixChange = useCallback((nextValue: number) => {
    if (!mixParam) {
      return
    }

    const scaled = mixMin + clamp01(nextValue) * (mixMax - mixMin)
    void intelfx.setParam(mixParam.id, scaled).catch((err) => {
      console.error('Failed to set IntelFX mix parameter:', err)
    })
  }, [mixMax, mixMin, mixParam, intelfx])

  const handleToggleBypass = useCallback((block: BypassBlock) => {
    setBypassState((prev) => {
      const next = { ...prev, [block]: !prev[block] }
      const stateLabel = next[block] ? 'ENGAGED' : 'BYPASSED'
      setLcdText(`${block} ${stateLabel}`)
      return next
    })
  }, [])

  const contextValue = useMemo<IntelFXPageContextValue>(() => ({
    intelfx,
    nodeId: apiNodeId,
    activeSection,
    currentProgramName,
    lcdText,
    setLcdText,
    bypassState,
    onToggleBypass: handleToggleBypass,
  }), [activeSection, apiNodeId, currentProgramName, lcdText, intelfx, bypassState, handleToggleBypass])

  if (locationLoading) {
    return (
      <div className="mpx1-shell">
        <div className="mpx1-shell__main">
          <div className="mpx1-shell__content">
            <InlineLoading status="active" description="Checking cluster MIDI inventory for the Rocktron IntelFX." />
          </div>
        </div>
      </div>
    )
  }

  if (!deviceLocation) {
    return (
      <div className="mpx1-shell">
        <div className="mpx1-shell__main">
          <div className="mpx1-shell__content">
            <InlineNotification
              kind="warning"
              lowContrast
              hideCloseButton
              title="IntelFX not detected"
              subtitle="No Rocktron IntelFX MIDI interface is currently detected on any cluster node."
            />
          </div>
        </div>
      </div>
    )
  }

  if (needsSwitch) {
    const locationLabel = deviceLocation.hostname ?? deviceLocation.nodeId
    return (
      <div className="mpx1-shell">
        <div className="mpx1-shell__main">
          <div className="mpx1-shell__content">
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              title="Switch cluster node"
              subtitle={`Rocktron IntelFX is connected to ${locationLabel}. Select that node to manage the rack.`}
            />
            <Button
              size="sm"
              kind="tertiary"
              className="intelfx-page__notice-action"
              onClick={() => setActiveNode(deviceLocation.nodeId === localNodeId ? null : deviceLocation.nodeId)}
            >
              Switch to {locationLabel}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (locationOffline) {
    return (
      <div className="mpx1-shell">
        <div className="mpx1-shell__main">
          <div className="mpx1-shell__content">
            <InlineNotification
              kind="warning"
              lowContrast
              hideCloseButton
              title="Assigned node offline"
              subtitle={`Rocktron IntelFX is assigned to ${deviceLocation.hostname ?? deviceLocation.nodeId}, but that peer is currently offline.`}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <IntelFXPageContext.Provider value={contextValue}>
      <div className="mpx1-shell">
        <aside className="mpx1-shell__sidebar" aria-label="IntelFX section navigation">
          {SIDEBAR_SECTIONS.map((section) => {
            const SectionIcon = section.icon
            return (
              <NavLink
                key={section.id}
                to={section.to}
                title={section.label}
                aria-label={section.label}
                className={({ isActive }) => `mpx1-shell__sidebar-btn${isActive ? ' is-active active' : ''}`}
                style={{ '--section-accent': section.color } as CSSProperties}
              >
                <SectionIcon size={18} aria-hidden />
              </NavLink>
            )
          })}
        </aside>

        <div className="mpx1-shell__main">
          {remoteSelected ? (
            <div className="intelfx-page__proxy-notice">
              <InlineNotification
                kind="info"
                lowContrast
                hideCloseButton
                title="Remote control proxy active"
                subtitle={`IntelFX control is proxied to ${selectedNode?.hostname ?? selectedNodeId}.`}
              />
            </div>
          ) : null}
          <div className="mpx1-shell__content">
            <Outlet />
          </div>

          <IntelFXStatusBar
            connected={Boolean(intelfx.state?.connected)}
            programNumber={currentProgram}
            programName={currentProgramName}
            lcdText={lcdText}
            mixValue={mixValue}
            bypassState={bypassState}
            onProgramStep={handleProgramStep}
            onMixChange={handleMixChange}
            onToggleBypass={handleToggleBypass}
          />
        </div>
      </div>
    </IntelFXPageContext.Provider>
  )
}

export default IntelFXPage
