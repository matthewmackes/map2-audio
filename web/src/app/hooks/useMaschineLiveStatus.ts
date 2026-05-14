import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  maschineApi,
  type MaschineWebSocketWelcome,
} from '../../map2/clients/maschine'
import { getWsBaseUrl } from '../../map2/transport'
import type {
  MaschineDaemonStatus,
  MaschineEncoderMap,
  MaschineHidEvent,
} from '../../map2/types'

// T2522 — shared Maschine live-status hook. Owns the single WS
// subscription to /api/maschine/ws plus the four polling queries
// (status, encoder-map, lcd-render, transport-config) that the
// daemon's REST surface exposes. Lifted from MaschinePage so the
// Hardware Twin tab and the Diagnostics tab can both consume the
// same live frames without opening duplicate sockets.
//
// The hook returns the most recent live snapshot (WS welcome wins
// over the first poll, then live `maschine:status` frames overlay
// the welcome). HID traffic is windowed to the last 200 frames to
// keep memory bounded; the diagnostics HID-traffic panel renders
// the same window.
const HID_HISTORY_WINDOW = 200

export interface MaschineLiveStatus {
  status: MaschineDaemonStatus | null
  encoderMap: MaschineEncoderMap | null
  hidEvents: MaschineHidEvent[]
  isStatusLoading: boolean
  isStatusError: boolean
  refetchStatus: () => void
}

export function useMaschineLiveStatus(): MaschineLiveStatus {
  const [liveStatus, setLiveStatus] = useState<MaschineDaemonStatus | null>(null)
  const [liveEncoderMap, setLiveEncoderMap] = useState<MaschineEncoderMap | null>(null)
  const [hidEvents, setHidEvents] = useState<MaschineHidEvent[]>([])

  const statusQuery = useQuery({
    queryKey: ['maschine', 'status'],
    queryFn: () => maschineApi.getStatus(),
    refetchInterval: 2000,
  })

  const encoderMapQuery = useQuery({
    queryKey: ['maschine', 'encoder-map'],
    queryFn: () => maschineApi.getEncoderMap(),
    refetchInterval: 2000,
  })

  const lcdRenderQuery = useQuery({
    queryKey: ['maschine', 'lcd-render', 'audio-grid'],
    queryFn: () => maschineApi.renderLcd('audio_grid'),
    refetchInterval: 2000,
  })

  useEffect(() => {
    const socket = new WebSocket(`${getWsBaseUrl()}/api/maschine/ws`)

    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data ?? '{}')) as {
        type?: string
        data?: unknown
      }
      if (message.type === 'maschine:welcome' && message.data && typeof message.data === 'object') {
        const welcome = message.data as MaschineWebSocketWelcome
        setLiveStatus(welcome.state ?? null)
        setLiveEncoderMap(welcome.encoder_map ?? null)
        setHidEvents(Array.isArray(welcome.hid_history) ? welcome.hid_history : [])
        return
      }
      if (message.type === 'maschine:status' && message.data && typeof message.data === 'object') {
        setLiveStatus(message.data as MaschineDaemonStatus)
        return
      }
      if (message.type === 'maschine:hid_traffic' && message.data && typeof message.data === 'object') {
        setHidEvents((previous) => [...previous, message.data as MaschineHidEvent].slice(-HID_HISTORY_WINDOW))
      }
    }

    return () => {
      socket.close()
    }
  }, [])

  // The polled query data is the fallback for the "before WS welcome
  // arrives" first frame; once the welcome lands, liveStatus takes
  // over. lcdRenderQuery is consumed via the resolved status.lcd
  // because the daemon embeds the latest render in every tick.
  const status = liveStatus ?? statusQuery.data?.state ?? null
  const encoderMap = liveEncoderMap ?? encoderMapQuery.data?.encoder_map ?? null

  // Surface lcdRender as a fallback when the status payload doesn't
  // already carry a fresh frame. The diagnostics LCD simulator and
  // the Twin LCDs both read `status.lcd ?? lcdRenderFallback`; here
  // we fold the fallback into status so callers don't need to know
  // about it.
  const statusWithLcdFallback: MaschineDaemonStatus | null = status
    ? {
        ...status,
        lcd: status.lcd ?? lcdRenderQuery.data?.lcd ?? null,
      }
    : null

  return {
    status: statusWithLcdFallback,
    encoderMap,
    hidEvents,
    isStatusLoading: statusQuery.isLoading,
    isStatusError: statusQuery.isError,
    refetchStatus: () => {
      void statusQuery.refetch()
      void encoderMapQuery.refetch()
      void lcdRenderQuery.refetch()
    },
  }
}
