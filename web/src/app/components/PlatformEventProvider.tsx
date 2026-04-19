import { createContext, useContext, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

import { getPlatformEventTransport, type PlatformEventTransport } from '../services/platformEventTransport'
import { usePlatformEventStore } from '../stores/platformEventStore'
import { ToastsPresenter } from './presenters/ToastsPresenter'
import { NodeAlertsPresenter } from './presenters/NodeAlertsPresenter'
import { DeviceBannerPresenter } from './presenters/DeviceBannerPresenter'
import { LCDFeedPresenter } from './presenters/LCDFeedPresenter'
import { BrowserNotificationsPresenter } from './presenters/BrowserNotificationsPresenter'
import { AudioBeepsPresenter } from './presenters/AudioBeepsPresenter'

const PlatformEventProviderContext = createContext<boolean>(false)

export function usePlatformEventProviderMounted() {
  return useContext(PlatformEventProviderContext)
}

let providerMounted = false

export function PlatformEventProvider({
  children,
  transport = getPlatformEventTransport(),
}: {
  children: ReactNode
  transport?: PlatformEventTransport
}) {
  const startedRef = useRef(false)
  const setSessionId = usePlatformEventStore((state) => state.setSessionId)
  const setConnected = usePlatformEventStore((state) => state.setConnected)
  const setReplayComplete = usePlatformEventStore((state) => state.setReplayComplete)
  const setReplayCursor = usePlatformEventStore((state) => state.setReplayCursor)
  const upsertEvents = usePlatformEventStore((state) => state.upsertEvents)

  useEffect(() => {
    if (providerMounted || startedRef.current) {
      return
    }
    providerMounted = true
    startedRef.current = true
    const unsubscribeTransport = transport.subscribe((update) => {
      if (update.sessionId) {
        setSessionId(update.sessionId)
      }
      if (update.connected != null) {
        setConnected(update.connected)
      }
      if (update.replayComplete != null) {
        setReplayComplete(update.replayComplete)
      }
      if (update.replayCursor !== undefined) {
        setReplayCursor(update.replayCursor)
      }
      if (update.events && update.events.length > 0) {
        upsertEvents(update.events)
      }
    })
    const stopTransport = transport.start()

    return () => {
      unsubscribeTransport()
      stopTransport()
      providerMounted = false
      startedRef.current = false
    }
  }, [setConnected, setReplayComplete, setReplayCursor, setSessionId, transport, upsertEvents])

  return (
    <PlatformEventProviderContext.Provider value>
      {children}
      <ToastsPresenter />
      <NodeAlertsPresenter />
      <DeviceBannerPresenter />
      <LCDFeedPresenter />
      <BrowserNotificationsPresenter />
      <AudioBeepsPresenter />
    </PlatformEventProviderContext.Provider>
  )
}

