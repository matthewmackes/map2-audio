import React, { createContext, useContext, useMemo } from 'react'
import { Outlet } from 'react-router-dom'
import { EmptyState } from '../../shared/EmptyState'
import { LoadingState } from '../../shared/LoadingState'
import { useDeviceNodeContext } from '../../../hooks/useDeviceNodeContext'
import { useActiveSectionFromPath } from '../hooks/useActiveSectionFromPath'
import './LCDShell.css'

export type LCDSectionId =
  | 'displays'
  | 'events'
  | 'nodes'
  | 'alerts'
  | 'hardware'
  | 'settings'
  | 'presets'
  | 'snapshots'

export const LCD_SECTION_IDS: LCDSectionId[] = [
  'displays',
  'events',
  'nodes',
  'alerts',
  'hardware',
  'settings',
  'presets',
  'snapshots',
]

export interface LCDShellContextValue {
  activeSection: LCDSectionId
  nodeId: string | null
}

const LCDShellContext = createContext<LCDShellContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useLCDShellContext(): LCDShellContextValue {
  const context = useContext(LCDShellContext)
  if (!context) {
    throw new Error('useLCDShellContext must be used within LCDShell')
  }
  return context
}

export function LCDShell() {
  const activeSection = useActiveSectionFromPath('/devices/lcd/', LCD_SECTION_IDS, 'displays')
  const { deviceState, currentNode } = useDeviceNodeContext('lcd-console')

  const nodeId = currentNode?.nodeId ?? null

  const contextValue = useMemo<LCDShellContextValue>(
    () => ({ activeSection, nodeId }),
    [activeSection, nodeId],
  )

  if (deviceState === 'loading') {
    return (
      <div className="lcd-shell__main" style={{ padding: 24 }}>
        <LoadingState description="Checking cluster inventory for LCD console" />
      </div>
    )
  }

  if (deviceState === 'not_found') {
    return (
      <div className="lcd-shell__main" style={{ padding: 24 }}>
        <EmptyState
          title="No LCD console is currently detected on any cluster node"
          description="The LCD manager did not report a registered display on any node. Check that the backend is running and the LCD hardware (native I²C or FT232H) is connected."
          align="left"
        />
      </div>
    )
  }

  return (
    <LCDShellContext.Provider value={contextValue}>
      <div className="lcd-shell lcd-shell--embedded">
        <div className="lcd-shell__main">
          <div className="lcd-shell__content">
            <Outlet />
          </div>
        </div>
      </div>
    </LCDShellContext.Provider>
  )
}
