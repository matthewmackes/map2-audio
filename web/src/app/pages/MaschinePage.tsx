import './MaschinePage.css'

import { InlineNotification, Tag } from '@carbon/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { MaschineConnectionPanel } from '../components/Maschine/MaschineConnectionPanel'
import { MaschineEncoderMapPanel } from '../components/Maschine/MaschineEncoderMapPanel'
import { MaschineFirmwarePanel } from '../components/Maschine/MaschineFirmwarePanel'
import { MaschineHidTrafficPanel } from '../components/Maschine/MaschineHidTrafficPanel'
import { MaschineLcdSimulatorPanel } from '../components/Maschine/MaschineLcdSimulatorPanel'
import { MaschineLedPreviewPanel } from '../components/Maschine/MaschineLedPreviewPanel'
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

function pageStatusTone(status: MaschineDaemonStatus | null): 'green' | 'red' | 'warm-gray' {
  if (!status) return 'warm-gray'
  if (status.connected && status.websocket_connected) return 'green'
  if (status.connected) return 'warm-gray'
  return 'red'
}

function pageStatusLabel(status: MaschineDaemonStatus | null): string {
  if (!status) return 'Reconnecting'
  if (status.connected && status.websocket_connected) return 'Connected'
  if (status.connected) return 'Reconnecting'
  return 'Disconnected'
}

export function MaschinePage() {
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
        setHidEvents((previous) => [...previous, message.data as MaschineHidEvent].slice(-200))
      }
    }

    return () => {
      socket.close()
    }
  }, [])

  const status = liveStatus ?? statusQuery.data?.state ?? null
  const encoderMap = liveEncoderMap ?? encoderMapQuery.data?.encoder_map ?? null
  const lcdState = status?.lcd ?? lcdRenderQuery.data?.lcd ?? null

  const subtitle = useMemo(
    () => 'Dedicated Carbon workstation for Maschine daemon state, encoder ownership, LED preview, LCD simulation, HID traffic, and firmware diagnostics.',
    [],
  )

  return (
    <div className="maschine-page">
      <PageHeader
        title="Maschine MK1"
        subtitle={subtitle}
        actions={<Tag type={pageStatusTone(status)}>{pageStatusLabel(status)}</Tag>}
      />

      {statusQuery.isError ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Maschine status could not be loaded"
          subtitle="The dedicated route is present, but the backend did not return a valid Maschine status payload."
        />
      ) : null}

      <div className="maschine-page__grid">
        <MaschineConnectionPanel status={status} />
        <MaschineEncoderMapPanel encoderMap={encoderMap} />
        <MaschineLedPreviewPanel ledState={status?.led_state ?? null} />
        <MaschineLcdSimulatorPanel left={lcdState?.left ?? null} right={lcdState?.right ?? null} />
        <MaschineHidTrafficPanel events={hidEvents} />
        <MaschineFirmwarePanel status={status} onRefresh={() => void statusQuery.refetch()} />
      </div>
    </div>
  )
}

export default MaschinePage
