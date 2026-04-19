import React, { createContext, useContext, useState, useCallback } from 'react'
import type { TesiraDeviceSummary } from '../types'

interface TesiraContextValue {
  selectedDeviceId: string | null
  selectDevice: (id: string | null) => void
  selectedTab: number
  setSelectedTab: (tab: number) => void
}

const TesiraContext = createContext<TesiraContextValue>({
  selectedDeviceId: null,
  selectDevice: () => undefined,
  selectedTab: 0,
  setSelectedTab: () => undefined,
})

export function TesiraProvider({ children }: { children: React.ReactNode }) {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [selectedTab, setSelectedTab] = useState(0)

  const selectDevice = useCallback((id: string | null) => {
    setSelectedDeviceId(id)
    setSelectedTab(0)
  }, [])

  return (
    <TesiraContext.Provider value={{ selectedDeviceId, selectDevice, selectedTab, setSelectedTab }}>
      {children}
    </TesiraContext.Provider>
  )
}

export function useTesiraContext() {
  return useContext(TesiraContext)
}
