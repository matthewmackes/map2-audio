import './MaschinePage.css'

import { InlineNotification, Tab, TabList, TabPanel, TabPanels, Tabs, Tag, Tile } from '@carbon/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSetShellWindow } from '../layout/useSetShellWindow'
import { MaschineConnectionPanel } from '../components/Maschine/MaschineConnectionPanel'
import { MaschineEncoderMapPanel } from '../components/Maschine/MaschineEncoderMapPanel'
import { MaschineFirmwarePanel } from '../components/Maschine/MaschineFirmwarePanel'
import { MaschineHidTrafficPanel } from '../components/Maschine/MaschineHidTrafficPanel'
import { MaschineHwTestPanel } from '../components/Maschine/MaschineHwTestPanel'
import { MaschineLcdSimulatorPanel } from '../components/Maschine/MaschineLcdSimulatorPanel'
import { MaschineLedPreviewPanel } from '../components/Maschine/MaschineLedPreviewPanel'
import { MaschineOperationsConsolePanel } from '../components/Maschine/MaschineOperationsConsolePanel'
import { MaschineTransportPanel } from '../components/Maschine/MaschineTransportPanel'
import { MaschineMidiMapEditor } from './MaschineMidiMapPage'
import { MidiServicesCrossLinkBanner } from './midi-services/MidiServicesCrossLinkBanner'
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

// T2522 — Maschine MK1 Extended GUI epic. The page shell is a Carbon
// Tabs container with five canonical tabs:
//
//   • twin         — T2522-A. Photoreal hardware mirror (live SVG/canvas).
//   • workbench    — T2522-B. T700 profile DSL workbench + dual-LCD preview.
//   • performance  — T2522-C. 4×4 pad grid, curve editor, step seq, scenes.
//   • mapping      — T2522-D. Snapshot-scoped param drag/drop + SHIFT layers.
//   • diagnostics  — Existing 6-panel engineering surface, preserved verbatim.
//
// The active tab is reflected in the URL as `?tab=<id>` so the
// "Advanced-Maschine" entry on the Hardware Catalog can deep-link
// directly to /maschine?tab=workbench (the existing legacy "Open"
// button keeps no `?tab=` and lands on the default Twin tab).
const TAB_IDS = ['twin', 'workbench', 'performance', 'mapping', 'diagnostics'] as const
type MaschineTabId = (typeof TAB_IDS)[number]
const DEFAULT_TAB: MaschineTabId = 'twin'

function tabIdFromIndex(index: number): MaschineTabId {
  return TAB_IDS[index] ?? DEFAULT_TAB
}

function indexFromTabId(id: string | null): number {
  if (!id) return TAB_IDS.indexOf(DEFAULT_TAB)
  const idx = TAB_IDS.indexOf(id as MaschineTabId)
  return idx === -1 ? TAB_IDS.indexOf(DEFAULT_TAB) : idx
}

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

// Cycle 2 — placeholder body for the four extended-GUI tabs that land
// in cycles 3-14. Subsequent cycles replace the matching component
// (HardwareTwinTab, ProfileWorkbenchTab, PerformanceTab, MappingStudioTab)
// with the real surface. Keeping the placeholder behind a Carbon Tile
// keeps the shell shape and theming stable across cycles.
function ComingSoonTab({
  title,
  subtitle,
  cycleRange,
}: {
  title: string
  subtitle: string
  cycleRange: string
}) {
  return (
    <Tile className="maschine-tab-placeholder">
      <h3 className="maschine-tab-placeholder__title">{title}</h3>
      <p className="maschine-tab-placeholder__subtitle">{subtitle}</p>
      <Tag size="sm" type="purple">{cycleRange}</Tag>
    </Tile>
  )
}

function MaschineDiagnosticsTab() {
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

  return (
    <div className="maschine-page__diagnostics">
      <MidiServicesCrossLinkBanner profileKey="native-instruments/maschine-mk1.midi" />

      {statusQuery.isError ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Maschine status could not be loaded"
          subtitle="The backend did not return a valid status payload."
        />
      ) : null}

      <MaschineOperationsConsolePanel status={status} audioGrid={status?.audio_grid ?? null} />

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
          <Tag type="blue" size="sm">/maschine canonical surface</Tag>
        </div>
        <MaschineMidiMapEditor embedded />
      </section>
    </div>
  )
}

// Lightweight wrapper around the diagnostics tab so the shell can read
// the daemon's connection state for the AppShell action chip without
// owning the WS lifecycle. The shell-level chip needs status; the
// detail panels need WS events. The diagnostics tab owns the WS, but
// the shell still needs *some* status. This second query is OK — both
// queries hit the same React Query cache (`['maschine', 'status']`)
// and resolve to one network call per refetch interval.
function useShellStatus(): MaschineDaemonStatus | null {
  const statusQuery = useQuery({
    queryKey: ['maschine', 'status'],
    queryFn: () => maschineApi.getStatus(),
    refetchInterval: 2000,
  })
  return statusQuery.data?.state ?? null
}

export function MaschinePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const selectedIndex = indexFromTabId(tabParam)

  const handleTabChange = useCallback(
    ({ selectedIndex: nextIndex }: { selectedIndex: number }) => {
      const nextId = tabIdFromIndex(nextIndex)
      const next = new URLSearchParams(searchParams)
      if (nextId === DEFAULT_TAB) {
        next.delete('tab')
      } else {
        next.set('tab', nextId)
      }
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const status = useShellStatus()

  const subtitle = useMemo(
    () => 'NI Maschine MK1 — extended GUI · 16 12-bit pressure pads · 11 encoders · dual 255×64 LCDs · 62 LEDs.',
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
      {
        id: 'status',
        label: pageStatusLabel(status),
        status: (pageStatusTone(status) === 'green' ? 'ok' : pageStatusTone(status) === 'red' ? 'error' : 'warn') as
          | 'ok'
          | 'warn'
          | 'error'
          | 'info',
        disabled: true,
      },
    ],
  }, [subtitle, handleScrollToHardware, status])

  return (
    <div className="maschine-page">
      <Tabs selectedIndex={selectedIndex} onChange={handleTabChange}>
        <TabList aria-label="Maschine MK1 extended GUI" contained>
          <Tab>Hardware Twin</Tab>
          <Tab>Profile Workbench</Tab>
          <Tab>Performance</Tab>
          <Tab>Mapping Studio</Tab>
          <Tab>Diagnostics</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            <ComingSoonTab
              title="Hardware Twin"
              subtitle="Photoreal SVG mirror of the MK1: 16 pads light up live with velocity/pressure, 11 encoders show ring values, 8 group buttons reflect snapshot bank, dual 255×64 LCDs render the live framebuffer."
              cycleRange="T2522-A · cycles 3-4"
            />
          </TabPanel>
          <TabPanel>
            <ComingSoonTab
              title="Profile Workbench"
              subtitle="Edit and preview the 25 T700 profiles (CTRL · STEP · BRWS · SMPL · SNAP · AUTO · Effect Chain Editor · Quad Morph · Brain Seq · Tuner · Admin Console …) using the JSON+flexbox profile DSL with live LCD render preview."
              cycleRange="T2522-B · cycles 12-14"
            />
          </TabPanel>
          <TabPanel>
            <ComingSoonTab
              title="Performance"
              subtitle="Player surface: 4×4 pad grid with per-pad sample/note assignment, velocity/pressure curves over the existing pad calibrator + curve fitter, step sequencer, scene/pattern banks, kit browser, Quad Morph XY pad."
              cycleRange="T2522-C · cycles 5-8"
            />
          </TabPanel>
          <TabPanel>
            <ComingSoonTab
              title="Mapping Studio"
              subtitle="Full mapping editor scoped to the active snapshot: drag any plugin/chain parameter onto any encoder/pad/button, see SHIFT-layer overlays, define per-snapshot LED choreography, drive macro recording via the AutomationEngine lane, with State Authority phase visibility (VALIDATING → STAGING → APPLYING → VERIFYING → LIVE)."
              cycleRange="T2522-D · cycles 9-11"
            />
          </TabPanel>
          <TabPanel>
            <MaschineDiagnosticsTab />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  )
}

export default MaschinePage
