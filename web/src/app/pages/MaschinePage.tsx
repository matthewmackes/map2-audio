import './MaschinePage.css'

import { Button, InlineNotification, Tag } from '@carbon/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSetShellWindow } from '../layout/useSetShellWindow'
import { MaschineConnectionPanel } from '../components/Maschine/MaschineConnectionPanel'
import { MaschineEncoderMapPanel } from '../components/Maschine/MaschineEncoderMapPanel'
import { MaschineFirmwarePanel } from '../components/Maschine/MaschineFirmwarePanel'
import { MaschineHidTrafficPanel } from '../components/Maschine/MaschineHidTrafficPanel'
import { MaschineHwTestPanel } from '../components/Maschine/MaschineHwTestPanel'
import { MaschineLcdSimulatorPanel } from '../components/Maschine/MaschineLcdSimulatorPanel'
import { MaschineLedPreviewPanel } from '../components/Maschine/MaschineLedPreviewPanel'
import { MaschineTransportPanel } from '../components/Maschine/MaschineTransportPanel'
import { MaschineMidiMapEditor } from './MaschineMidiMapPage'
import {
  maschineApi,
  type MaschineTransportConfig,
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
  const [transportConfig, setTransportConfig] = useState<MaschineTransportConfig | null>(null)

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

  const transportConfigQuery = useQuery({
    queryKey: ['maschine', 'transport-config'],
    queryFn: () => maschineApi.getTransportConfig(),
    refetchInterval: 4000,
  })

  const updateTransportConfigMutation = useMutation({
    mutationFn: (payload: Partial<Pick<MaschineTransportConfig, 'transport_preference' | 'allow_kernel_detach'>>) =>
      maschineApi.updateTransportConfig(payload),
    onSuccess: (response) => {
      setTransportConfig(response.config)
      void statusQuery.refetch()
    },
  })

  const selectBlockMutation = useMutation({
    mutationFn: (blockId: string) =>
      maschineApi.getAudioGrid().then(() =>
        fetch(`/api/maschine/audio-grid/select`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ block_id: blockId }),
        }).then((r) => r.json()),
      ),
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
  const resolvedTransportConfig = transportConfig ?? transportConfigQuery.data?.config ?? null
  const ledArray = status?.led_array ?? status?.led_state?.led_array ?? null
  const isDeviceConnected = Boolean(status?.connected && status?.transport?.connected)

  const handlePadClick = useCallback(
    (padIndex: number) => {
      const blocks = status?.audio_grid?.blocks ?? []
      const block = blocks.find((b) => b.pad_index === padIndex)
      if (block) {
        selectBlockMutation.mutate(block.block_id)
      }
    },
    [status, selectBlockMutation],
  )

  const subtitle = useMemo(
    () => 'NI Maschine MK1 control surface — cabl-derived USB bulk protocol, 62 LED slots, 255\u00d764 dual LCD, 16-pad 12-bit pressure input.',
    [],
  )

  const handleScrollToHardware = useCallback(
    () => document.getElementById('hardware-layout')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    [],
  )

  useSetShellWindow({
    title: 'Maschine MK1',
    subtitle,
    kicker: 'Platform / Maschine MK1',
    actions: [
      { id: 'hardware-layout', label: 'Hardware Layout', onClick: handleScrollToHardware },
      { id: 'status', label: pageStatusLabel(status), status: (pageStatusTone(status) === 'green' ? 'ok' : pageStatusTone(status) === 'red' ? 'error' : 'warn') as 'ok' | 'warn' | 'error' | 'info', disabled: true },
    ],
  }, [subtitle, handleScrollToHardware, status])


  return (
    <div className="maschine-page">

      {statusQuery.isError ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Maschine status could not be loaded"
          subtitle="The backend did not return a valid status payload."
        />
      ) : null}

      <div className="maschine-page__grid">
        <MaschineConnectionPanel status={status} />
        <MaschineTransportPanel
          status={status}
          config={resolvedTransportConfig}
          isSaving={updateTransportConfigMutation.isPending}
          onToggleKernelDetach={(value) => updateTransportConfigMutation.mutate({ allow_kernel_detach: value })}
          onRefresh={() => {
            void transportConfigQuery.refetch()
            void statusQuery.refetch()
          }}
        />
        <MaschineEncoderMapPanel encoderMap={encoderMap} />
        <MaschineFirmwarePanel status={status} onRefresh={() => void statusQuery.refetch()} />
        <MaschineLedPreviewPanel
          ledState={status?.led_state ?? null}
          ledArray={ledArray}
          onPadClick={handlePadClick}
        />
        <MaschineLcdSimulatorPanel left={lcdState?.left ?? null} right={lcdState?.right ?? null} />
        <MaschineHwTestPanel isConnected={isDeviceConnected} />
        <MaschineHidTrafficPanel events={hidEvents} />
      </div>

      <section id="hardware-layout" className="maschine-page__embedded-map">
        <div className="maschine-page__panel-head">
          <h2>Hardware Layout + MIDI Map</h2>
          <Tag type="blue">/maschine canonical surface</Tag>
        </div>
        <p className="maschine-page__panel-copy">
          Phase 1 merges the physical layout editor into the main Maschine workspace. The legacy `/maschine/midi-map` route now redirects here.
        </p>
        <MaschineMidiMapEditor embedded />
      </section>
    </div>
  )
}

export default MaschinePage
