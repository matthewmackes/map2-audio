import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Book, Branch, Dashboard, Music, Play, SettingsAdjust, Warning } from '@carbon/icons-react'
import { Button, InlineLoading, InlineNotification } from '@carbon/react'

import { IntelFXStatusBar } from '../components/IntelFX/IntelFXStatusBar'
import { UnifiedWorkspaceSideNav, type UnifiedWorkspaceSideNavItem } from '../components/navigation/UnifiedWorkspaceSideNav'
import { formatIntelFXProgramName, formatIntelFXProgramNumber } from '../components/IntelFX/programNumber'
import { useIntelFXState, type IntelFXRegistryParam, type UseIntelFXStateResult } from '../../map2/intelfxApi'
import { EmptyState } from '../components/shared/EmptyState'
import { LoadingState } from '../components/shared/LoadingState'
import { ShellWindowTitleStrip } from '../components/shared/ShellWindowTitleStrip'
import { useCluster } from '../contexts/useCluster'
import { useDeviceLocation } from '../hooks/useDeviceLocation'
import '../components/IntelFX/IntelFXPageShell.css'
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
  intelfx: UseIntelFXStateResult
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

function findParamByCandidates(params: IntelFXRegistryParam[] | undefined, candidates: string[]): IntelFXRegistryParam | null {
  if (!params || params.length === 0) return null
  for (const candidate of candidates) {
    const found = params.find((param) => param.id === candidate)
    if (found) return found
  }
  return null
}

/* -------------------------------------------------------------------------- */
/*  Main IntelFX Page                                                         */
/* -------------------------------------------------------------------------- */

export function IntelFXPage() {
  const location = useLocation()
  const navigate = useNavigate()
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
  const intelfx = useIntelFXState({
    nodeId: apiNodeId,
    autoConnectWs: !apiNodeId,
    pollIntervalMs: apiNodeId ? 5000 : 0,
  })

  const [lcdText, setLcdText] = useState('INTELFX READY')
  const [tapTempoBpm, setTapTempoBpm] = useState(120)
  const [lastTapAtMs, setLastTapAtMs] = useState<number | null>(null)
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

  const handleTapTempo = useCallback(() => {
    const now = Date.now()
    setLastTapAtMs((previous) => {
      if (previous) {
        const delta = now - previous
        if (delta > 120 && delta < 2000) {
          const bpm = Math.round(60000 / delta)
          const normalized = Math.min(260, Math.max(40, bpm))
          setTapTempoBpm(normalized)
          setLcdText(`TAP TEMPO ${normalized} BPM`)
        }
      }
      return now
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

  const navigationItems = useMemo<UnifiedWorkspaceSideNavItem[]>(
    () => SIDEBAR_SECTIONS.map((section) => ({
      key: section.id,
      label: section.label,
      description: `IntelFX ${section.label.toLowerCase()} workspace for the current rack program and routing state.`,
      to: section.to,
      icon: section.icon,
      active: activeSection === section.id,
      onOpen: () => navigate(section.to),
      meta: activeSection === section.id ? 'Current' : undefined,
    })),
    [activeSection, navigate],
  )

  const renderShell = (content: ReactNode) => (
    <>
      <ShellWindowTitleStrip />
      <div className="intelfx-shell">
        {content}
      </div>
    </>
  )

  if (locationLoading) {
    return renderShell(
      <div className="intelfx-shell__main">
        <div className="intelfx-shell__content">
          <LoadingState description="Checking cluster MIDI inventory for the Rocktron IntelFX" />
        </div>
      </div>
    )
  }

  if (!deviceLocation) {
    return renderShell(
      <div className="intelfx-shell__main">
        <div className="intelfx-shell__content">
          <EmptyState
            title="IntelFX not detected"
            description="No Rocktron IntelFX MIDI interface is currently detected on any cluster node."
            align="left"
          />
        </div>
      </div>
    )
  }

  if (needsSwitch) {
    const locationLabel = deviceLocation.hostname ?? deviceLocation.nodeId
    return renderShell(
      <div className="intelfx-shell__main">
        <div className="intelfx-shell__content">
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
    )
  }

  if (locationOffline) {
    return renderShell(
      <div className="intelfx-shell__main">
        <div className="intelfx-shell__content">
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="Assigned node offline"
            subtitle={`Rocktron IntelFX is assigned to ${deviceLocation.hostname ?? deviceLocation.nodeId}, but that peer is currently offline.`}
          />
        </div>
      </div>
    )
  }

  return (
    <IntelFXPageContext.Provider value={contextValue}>
      {renderShell(
        <>
          <UnifiedWorkspaceSideNav
            ariaLabel="IntelFX section navigation"
            className="intelfx-shell__sidebar"
            eyebrow="Rack editor"
            title="Rocktron IntelFX"
            description="One tree for panel control, deep editing, MIDI mapping, libraries, live performance, diagnostics, and signal flow."
            items={navigationItems}
            metaBlocks={[
              { key: 'intelfx-node', label: 'Node', value: selectedNode?.hostname ?? selectedNodeId },
              { key: 'intelfx-program', label: 'Program', value: `${formatIntelFXProgramNumber(currentProgram)} ${currentProgramName}` },
              { key: 'intelfx-link', label: 'Connection', value: intelfx.state?.connected ? 'Online' : 'Offline' },
            ]}
            callout={{
              kind: remoteSelected ? 'warning' : 'info',
              text: remoteSelected
                ? `Control is proxied to ${selectedNode?.hostname ?? selectedNodeId}.`
                : 'Direct local control path is active for the IntelFX rack.',
            }}
            storageKey="intelfx-rack"
          />

          <div className="intelfx-shell__main">
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
            <div className="intelfx-shell__content">
              <Outlet />
            </div>

            <IntelFXStatusBar
              deviceName="INTELFX"
              connected={Boolean(intelfx.state?.connected)}
              programNumber={currentProgram}
              programName={currentProgramName}
              lcdText={lcdText}
              mixValue={mixValue}
              tapTempoBpm={tapTempoBpm}
              bypassState={bypassState}
              onProgramStep={handleProgramStep}
              onMixChange={handleMixChange}
              onTapTempo={handleTapTempo}
              onToggleBypass={(block) => handleToggleBypass(block as BypassBlock)}
            />
          </div>
        </>
      )}
    </IntelFXPageContext.Provider>
  )
}

export default IntelFXPage
