import './MaschinePage.css'

import { InlineNotification, Tab, TabList, TabPanel, TabPanels, Tabs, Tag, Tile } from '@carbon/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useSetShellWindow } from '../layout/useSetShellWindow'
import { MaschineConnectionPanel } from '../components/Maschine/MaschineConnectionPanel'
import { MaschineEncoderMapPanel } from '../components/Maschine/MaschineEncoderMapPanel'
import { MaschineFirmwarePanel } from '../components/Maschine/MaschineFirmwarePanel'
import { MaschineHardwareTwin } from '../components/Maschine/MaschineHardwareTwin'
import { MaschineMappingStudio } from '../components/Maschine/MaschineMappingStudio'
import { MaschinePerformanceTab } from '../components/Maschine/MaschinePerformanceTab'
import { MaschineProfileWorkbench } from '../components/Maschine/MaschineProfileWorkbench'
import { MaschineHidTrafficPanel } from '../components/Maschine/MaschineHidTrafficPanel'
import { MaschineHwTestPanel } from '../components/Maschine/MaschineHwTestPanel'
import { MaschineLcdSimulatorPanel } from '../components/Maschine/MaschineLcdSimulatorPanel'
import { MaschineLedPreviewPanel } from '../components/Maschine/MaschineLedPreviewPanel'
import { MaschineOperationsConsolePanel } from '../components/Maschine/MaschineOperationsConsolePanel'
import { MaschineTransportPanel } from '../components/Maschine/MaschineTransportPanel'
import { MaschineMidiMapEditor } from './MaschineMidiMapPage'
import { MidiServicesCrossLinkBanner } from './midi-services/MidiServicesCrossLinkBanner'
import { useMaschineLiveStatus } from '../hooks/useMaschineLiveStatus'
import {
  maschineApi,
  type MaschineTransportConfig,
} from '../../map2/clients/maschine'
import type {
  MaschineDaemonStatus,
  MaschineEncoderMap,
  MaschineHidEvent,
} from '../../map2/types'

// T2522 — Maschine MK1 Extended GUI epic. The page shell is a Carbon
// Tabs container with five canonical tabs (Twin · Workbench · Performance ·
// Mapping · Diagnostics). The Twin and Diagnostics tabs both consume
// the live daemon state via a single shared WS subscription owned by
// useMaschineLiveStatus(); the three placeholder tabs land in cycles
// 5-14 of the Continue run.
const TAB_IDS = ['twin', 'workbench', 'performance', 'mapping', 'diagnostics'] as const
type MaschineTabId = (typeof TAB_IDS)[number]
const DEFAULT_TAB: MaschineTabId = 'twin'

// T2522-E-F1 — operator-facing tab labels for the AppShell kicker.
// Keep in sync with the <Tab> children below; the kicker shows
// "Platform / Maschine MK1 / <Tab label>" so the breadcrumb survives
// browser back/forward and deep-link entry from the Hardware Catalog.
const TAB_LABELS: Record<MaschineTabId, string> = {
  twin: 'Hardware Twin',
  workbench: 'Profile Workbench',
  performance: 'Performance',
  mapping: 'Mapping Studio',
  diagnostics: 'Diagnostics',
}

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

interface DiagnosticsTabProps {
  status: MaschineDaemonStatus | null
  encoderMap: MaschineEncoderMap | null
  hidEvents: MaschineHidEvent[]
  isStatusError: boolean
  refetchStatus: () => void
  onPadClick: (padIndex: number) => void
}

function MaschineDiagnosticsTab({
  status,
  encoderMap,
  hidEvents,
  isStatusError,
  refetchStatus,
  onPadClick,
}: DiagnosticsTabProps) {
  const transportConfigQuery = useQuery({
    queryKey: ['maschine', 'transport-config'],
    queryFn: () => maschineApi.getTransportConfig(),
    refetchInterval: 4000,
  })

  const updateTransportConfigMutation = useMutation({
    mutationFn: (payload: Partial<Pick<MaschineTransportConfig, 'transport_preference' | 'allow_kernel_detach'>>) =>
      maschineApi.updateTransportConfig(payload),
    onSuccess: () => {
      void transportConfigQuery.refetch()
      refetchStatus()
    },
  })

  const resolvedTransportConfig = transportConfigQuery.data?.config ?? null
  const lcdState = status?.lcd ?? null
  const ledArray = status?.led_array ?? status?.led_state?.led_array ?? null
  const isDeviceConnected = Boolean(status?.connected && status?.transport?.connected)

  return (
    <div className="maschine-page__diagnostics">
      <MidiServicesCrossLinkBanner profileKey="native-instruments/maschine-mk1.midi" />

      {isStatusError ? (
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
            refetchStatus()
          }}
        />
        <MaschineEncoderMapPanel encoderMap={encoderMap} />
        <MaschineFirmwarePanel status={status} onRefresh={refetchStatus} />
        <MaschineLedPreviewPanel
          ledState={status?.led_state ?? null}
          ledArray={ledArray}
          onPadClick={onPadClick}
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

  // Single shared WS + polling subscription owned by the page so the
  // Twin and Diagnostics tabs paint from the same live frame stream.
  const live = useMaschineLiveStatus()

  // Cycle 4 — page-scope pad-select. Both the Twin (when an audio-grid
  // block is mounted on a clicked pad) and the Diagnostics LED preview
  // panel call this. POST /api/maschine/audio-grid/select tells the
  // daemon to focus the matching block; the next WS frame reflects the
  // new selection.
  const selectBlockMutation = useMutation({
    mutationFn: (blockId: string) =>
      fetch(`/api/maschine/audio-grid/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block_id: blockId }),
      }).then((r) => r.json()),
  })

  const handlePadClick = useCallback(
    (padIndex: number) => {
      const blocks = live.status?.audio_grid?.blocks ?? []
      const block = blocks.find((b) => b.pad_index === padIndex)
      if (block) {
        selectBlockMutation.mutate(block.block_id)
      }
    },
    [live.status, selectBlockMutation],
  )

  const subtitle = useMemo(
    () => 'NI Maschine MK1 — extended GUI · 16 12-bit pressure pads · 11 encoders · dual 255×64 LCDs · 62 LEDs.',
    [],
  )

  const handleScrollToHardware = useCallback(
    () => document.getElementById('hardware-layout')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    [],
  )

  // T2522-E cycle 15 — only show the "Hardware Layout" action on the
  // Diagnostics tab, where the #hardware-layout scroll-target lives.
  // On other tabs the click was a silent no-op.
  const isDiagnosticsTab = tabIdFromIndex(selectedIndex) === 'diagnostics'
  const shellActions: Array<{ id: string; label: string; onClick?: () => void; status?: 'ok' | 'warn' | 'error' | 'info'; disabled?: boolean }> = []
  if (isDiagnosticsTab) {
    shellActions.push({ id: 'hardware-layout', label: 'Hardware Layout', onClick: handleScrollToHardware })
  }
  shellActions.push({
    id: 'status',
    label: pageStatusLabel(live.status),
    status: (pageStatusTone(live.status) === 'green' ? 'ok' : pageStatusTone(live.status) === 'red' ? 'error' : 'warn') as
      | 'ok'
      | 'warn'
      | 'error'
      | 'info',
    disabled: true,
  })

  // T2522-E-F1 — kicker carries the active tab name so the breadcrumb
  // tracks tab transitions (deep-link entry, browser back/forward).
  const activeTabLabel = TAB_LABELS[tabIdFromIndex(selectedIndex)]
  useSetShellWindow({
    title: 'Maschine MK1',
    subtitle,
    kicker: `Platform / Maschine MK1 / ${activeTabLabel}`,
    actions: shellActions,
  }, [subtitle, handleScrollToHardware, live.status, isDiagnosticsTab, activeTabLabel])

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
            <MaschineHardwareTwin
              status={live.status}
              encoderMap={live.encoderMap}
              hidEvents={live.hidEvents}
              onPadClick={handlePadClick}
            />
          </TabPanel>
          <TabPanel>
            <MaschineProfileWorkbench />
          </TabPanel>
          <TabPanel>
            <MaschinePerformanceTab
              status={live.status}
              encoderMap={live.encoderMap}
              hidEvents={live.hidEvents}
              onPadClick={handlePadClick}
            />
          </TabPanel>
          <TabPanel>
            <MaschineMappingStudio
              status={live.status}
              encoderMap={live.encoderMap}
              refetchStatus={live.refetchStatus}
            />
          </TabPanel>
          <TabPanel>
            <MaschineDiagnosticsTab
              status={live.status}
              encoderMap={live.encoderMap}
              hidEvents={live.hidEvents}
              isStatusError={live.isStatusError}
              refetchStatus={live.refetchStatus}
              onPadClick={handlePadClick}
            />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  )
}

export default MaschinePage
