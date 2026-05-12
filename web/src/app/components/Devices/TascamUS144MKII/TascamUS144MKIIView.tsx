// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// TASCAM US-144MKII tier-1 Devices panel (T2515-5).
//
// Mirrors the HoToneJoGGView shape for device-context wiring + window kicker,
// then adds tier-1 surface area: status / I/O / metering / clock / S/PDIF
// bridge / diagnostics tabs with an always-visible hardware-state banner.
// All gain pots, +48 V, Hi-Z, and MON MIX are front-panel hardware-only on
// this device; the banner is the operator's reminder.

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  InlineNotification,
  Layer,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
} from '@carbon/react'

import { DeviceContextBanner } from '../../DeviceContext'
import { EmptyState } from '../../shared/EmptyState'
import { LoadingState } from '../../shared/LoadingState'
import { useDeviceNodeContext } from '../../../hooks/useDeviceNodeContext'
import { useSetShellWindow } from '../../../layout/useSetShellWindow'

import { TascamUS144MKIIHardwareBanner } from './TascamUS144MKIIHardwareBanner'
import { TascamUS144MKIIStatusTab } from './TascamUS144MKIIStatusTab'
import { TascamUS144MKIIIORoutingTab } from './TascamUS144MKIIIORoutingTab'
import { TascamUS144MKIIMeteringTab } from './TascamUS144MKIIMeteringTab'
import { TascamUS144MKIIClockTab } from './TascamUS144MKIIClockTab'
import { TascamUS144MKIIBridgeTab } from './TascamUS144MKIIBridgeTab'
import { TascamUS144MKIIDiagnosticsTab } from './TascamUS144MKIIDiagnosticsTab'

export interface TascamStatusPayload {
  module_loaded: boolean
  enumeration_stage: 'disconnected' | 'boot_mode' | 'operational'
  operational_path: string | null
  remediation_hint: string | null
  vid_pid: string
  boot_vid_pid: string
  canonical_name: string
  tier1_sample_rate_hz: number
  tier1_buffer_samples: number
}

export interface TascamCapabilitiesPayload {
  name: string
  manufacturer: string
  kernel_module: string
  input_channels: number
  output_channels: number
  format: string
  sample_rate: number
  buffer_size: number
  spdif_send_channels: number[]
  spdif_return_channels: number[]
  analog_send_channels: number[]
  analog_return_channels: number[]
}

const STATUS_REFETCH_INTERVAL_MS = 2_500

export function TascamUS144MKIIView() {
  const { deviceState } = useDeviceNodeContext('tascam-us144mkii')

  useSetShellWindow(
    {
      title: 'TASCAM US-144MKII',
      subtitle: 'USB 2.0 audio interface · 2 analog + 2 S/PDIF',
      kicker: 'Platform / Devices / TASCAM US-144MKII',
    },
    [],
  )

  const statusQuery = useQuery<TascamStatusPayload>({
    queryKey: ['tascam-us144mkii', 'status'],
    queryFn: async () => {
      const resp = await fetch('/api/v1/devices/tascam-us144mkii/status')
      if (!resp.ok) {
        throw new Error(`status query failed: HTTP ${resp.status}`)
      }
      return resp.json()
    },
    refetchInterval: STATUS_REFETCH_INTERVAL_MS,
    staleTime: 0,
  })

  const capabilitiesQuery = useQuery<TascamCapabilitiesPayload>({
    queryKey: ['tascam-us144mkii', 'capabilities'],
    queryFn: async () => {
      const resp = await fetch('/api/v1/devices/tascam-us144mkii/capabilities')
      if (!resp.ok) {
        throw new Error(`capabilities query failed: HTTP ${resp.status}`)
      }
      return resp.json()
    },
    staleTime: 60_000,
  })

  const [selectedTabIndex, setSelectedTabIndex] = useState(0)

  const status = statusQuery.data
  const capabilities = capabilitiesQuery.data

  const stageTag = useMemo(() => {
    if (!status) {
      return <Tag type="cool-gray">…</Tag>
    }
    if (status.enumeration_stage === 'operational') {
      return <Tag type="green">Operational</Tag>
    }
    if (status.enumeration_stage === 'boot_mode') {
      return <Tag type="warm-gray">Boot mode</Tag>
    }
    return <Tag type="red">Disconnected</Tag>
  }, [status])

  return (
    <div className="stack">
      <DeviceContextBanner deviceName="TASCAM US-144MKII" deviceKey="tascam-us144mkii" />

      {deviceState === 'loading' ? (
        <LoadingState description="Checking cluster hardware inventory for the TASCAM US-144MKII interface" />
      ) : null}

      {deviceState === 'not_found' ? (
        <EmptyState
          title="No TASCAM US-144MKII interface is currently detected on any cluster node"
          description="Connect the interface on a USB 2.0 (Hi-Speed) port and ensure the snd-usb-us144mkii kernel module is loaded."
          align="left"
        />
      ) : null}

      {deviceState === 'node_offline' ? (
        <EmptyState
          title="The node with the TASCAM US-144MKII interface is offline"
          description="Bring that node back online or connect the interface to the current node to manage it here."
          align="left"
        />
      ) : null}

      {deviceState === 'ready' || deviceState === 'needs_switch' ? (
        <>
          <TascamUS144MKIIHardwareBanner status={status} />

          {status?.enumeration_stage === 'boot_mode' && status.remediation_hint ? (
            <InlineNotification
              kind="warning"
              lowContrast
              title="Device in boot/loader stage"
              subtitle={status.remediation_hint}
              hideCloseButton
            />
          ) : null}

          {status?.enumeration_stage === 'disconnected' && status.remediation_hint ? (
            <InlineNotification
              kind="error"
              lowContrast
              title="Device not detected"
              subtitle={status.remediation_hint}
              hideCloseButton
            />
          ) : null}

          <Layer id="tascam-us144mkii-panel">
            <Tabs
              selectedIndex={selectedTabIndex}
              onChange={(evt: { selectedIndex: number }) =>
                setSelectedTabIndex(evt.selectedIndex)
              }
            >
              <TabList aria-label="TASCAM US-144MKII sections">
                <Tab>Status {stageTag}</Tab>
                <Tab>I/O Routing</Tab>
                <Tab>Metering</Tab>
                <Tab>Clock</Tab>
                <Tab>S/PDIF Bridge</Tab>
                <Tab>Diagnostics</Tab>
              </TabList>
              <TabPanels>
                <TabPanel>
                  <TascamUS144MKIIStatusTab status={status} loading={statusQuery.isLoading} />
                </TabPanel>
                <TabPanel>
                  <TascamUS144MKIIIORoutingTab capabilities={capabilities} />
                </TabPanel>
                <TabPanel>
                  <TascamUS144MKIIMeteringTab capabilities={capabilities} />
                </TabPanel>
                <TabPanel>
                  <TascamUS144MKIIClockTab />
                </TabPanel>
                <TabPanel>
                  <TascamUS144MKIIBridgeTab capabilities={capabilities} />
                </TabPanel>
                <TabPanel>
                  <TascamUS144MKIIDiagnosticsTab status={status} capabilities={capabilities} />
                </TabPanel>
              </TabPanels>
            </Tabs>
          </Layer>
        </>
      ) : null}
    </div>
  )
}
