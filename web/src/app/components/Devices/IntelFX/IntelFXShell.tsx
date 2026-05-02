import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Outlet } from 'react-router-dom'

import { IntelFXStatusBar } from './IntelFXStatusBar'
import { formatIntelFXProgramName, formatIntelFXProgramNumber } from './programNumber'
import { useIntelFXState, type IntelFXRegistryParam, type UseIntelFXStateResult } from '../../../../map2/intelfxApi'
import { EmptyState } from '../../shared/EmptyState'
import { LoadingState } from '../../shared/LoadingState'
import { useCluster } from '../../../contexts/useCluster'
import { useDeviceNodeContext } from '../../../hooks/useDeviceNodeContext'
import { useActiveSectionFromPath } from '../hooks/useActiveSectionFromPath'
import { MidiServicesCrossLinkBanner } from '../../../pages/midi-services/MidiServicesCrossLinkBanner'
import './IntelFXPageShell.css'

type SidebarSectionId = 'panel' | 'editor' | 'midi-map' | 'library' | 'perform' | 'diag' | 'flow'
type BypassBlock = 'HUSH' | 'COMP' | 'WAH' | 'EQ' | 'PIT' | 'CHO' | 'FLG' | 'PHA' | 'TRM' | 'DLY' | 'REV'

const SIDEBAR_SECTION_IDS: SidebarSectionId[] = [
  'panel',
  'editor',
  'midi-map',
  'library',
  'perform',
  'diag',
  'flow',
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

// eslint-disable-next-line react-refresh/only-export-components
export function useIntelFXPageContext(): IntelFXPageContextValue {
  const context = useContext(IntelFXPageContext)
  if (!context) {
    throw new Error('useIntelFXPageContext must be used within IntelFXShell context provider')
  }
  return context
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function findParamByCandidates(params: IntelFXRegistryParam[] | undefined, candidates: string[]): IntelFXRegistryParam | null {
  if (!params || params.length === 0) return null
  for (const candidate of candidates) {
    const found = params.find((param) => param.id === candidate)
    if (found) return found
  }
  return null
}

export function IntelFXShell(): ReactNode {
  const activeSection = useActiveSectionFromPath('/devices/intelfx/', SIDEBAR_SECTION_IDS, 'panel')
  const { activeNodeId, localNodeId } = useCluster()
  const { deviceState } = useDeviceNodeContext('rocktron-intelfx')
  const selectedNodeId = activeNodeId && activeNodeId !== 'all' ? activeNodeId : localNodeId
  const remoteSelected = selectedNodeId !== localNodeId
  const apiNodeId = remoteSelected ? selectedNodeId : null
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

  if (deviceState === 'loading') {
    return (
      <div className="intelfx-shell__main">
        <div className="intelfx-shell__content">
          <LoadingState description="Checking cluster MIDI inventory for the Rocktron IntelFX" />
        </div>
      </div>
    )
  }

  if (deviceState === 'not_found') {
    return (
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

  return (
    <IntelFXPageContext.Provider value={contextValue}>
      <div className="intelfx-shell intelfx-shell--embedded">
        <div className="intelfx-shell__main">
          <div className="intelfx-shell__content">
            <MidiServicesCrossLinkBanner profileKey="intel-fx/intel-fx.midi" />
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
      </div>
    </IntelFXPageContext.Provider>
  )
}

export default IntelFXShell
