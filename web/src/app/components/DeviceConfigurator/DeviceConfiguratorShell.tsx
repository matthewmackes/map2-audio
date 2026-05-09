/**
 * T2499-A slice 2 — Carbon shell for the Configurator framework.
 *
 * Mounts a single device-pack descriptor and renders:
 *   - title + summary
 *   - status card (driven by the pack's `fetchStatus`)
 *   - tab navigator hosting per-device tabs
 *
 * Subsequent slices fill in tabs (device-pack picker, MIDI Learn,
 * deep-config). The shell itself is device-agnostic.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Heading,
  InlineLoading,
  InlineNotification,
  Layer,
  Section,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tile,
} from '@carbon/react'

import { ApiError } from '../../../map2/http'
import { DeviceConfiguratorStatusCard } from './DeviceConfiguratorStatusCard'
import type {
  ConfiguratorPackDescriptor,
  ConfiguratorTabContext,
  ConfiguratorTabDescriptor,
  DeviceDetectionStatus,
} from './types'
import './DeviceConfiguratorShell.css'

const STATUS_POLL_MS = 2500

interface DeviceConfiguratorShellProps {
  pack: ConfiguratorPackDescriptor
  /**
   * Override the status poll interval. Set to `false` to disable
   * polling (useful for tests).
   */
  statusPollMs?: number | false
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const detail =
      typeof error.body === 'object' && error.body !== null && 'detail' in error.body
        ? (error.body as { detail?: unknown }).detail
        : undefined
    if (typeof detail === 'string' && detail.trim().length > 0) {
      return detail
    }
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return fallback
}

function visibleTabs(
  tabs: ConfiguratorTabDescriptor[],
  status: DeviceDetectionStatus | null,
): ConfiguratorTabDescriptor[] {
  return [...tabs]
    .filter((tab) => {
      if (!tab.visibleFor || tab.visibleFor.length === 0) return true
      if (!status) return false
      return tab.visibleFor.includes(status.presence)
    })
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))
}

export function DeviceConfiguratorShell({
  pack,
  statusPollMs = STATUS_POLL_MS,
}: DeviceConfiguratorShellProps) {
  const statusQuery = useQuery<DeviceDetectionStatus>({
    queryKey: ['device-configurator', 'status', pack.packId],
    queryFn: () => pack.fetchStatus(),
    refetchInterval: statusPollMs === false ? false : statusPollMs,
    refetchIntervalInBackground: false,
  })

  const tabs = useMemo(
    () => visibleTabs(pack.tabs, statusQuery.data ?? null),
    [pack.tabs, statusQuery.data],
  )

  const tabContext: ConfiguratorTabContext = useMemo(
    () => ({
      status: statusQuery.data ?? null,
      metadata: pack.metadata ?? {},
      refetchStatus: () => statusQuery.refetch(),
    }),
    [pack.metadata, statusQuery.data, statusQuery.refetch],
  )

  return (
    <Section
      className="device-configurator"
      data-testid="device-configurator"
      data-pack-id={pack.packId}
    >
      <Layer level={0}>
        <header className="device-configurator__header">
          <Heading className="device-configurator__title">
            {pack.displayName}
          </Heading>
          {pack.summary ? (
            <p className="device-configurator__subtitle">{pack.summary}</p>
          ) : null}
          {pack.vendorName ? (
            <p className="device-configurator__vendor">by {pack.vendorName}</p>
          ) : null}
        </header>
      </Layer>

      {statusQuery.isLoading ? (
        <Tile className="device-configurator__loading">
          <InlineLoading description={`Detecting ${pack.displayName}…`} />
        </Tile>
      ) : null}

      {statusQuery.isError ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Could not detect device"
          subtitle={getErrorMessage(
            statusQuery.error,
            `Detection failed for ${pack.displayName}. Refresh and try again.`,
          )}
        />
      ) : null}

      {statusQuery.data ? (
        <DeviceConfiguratorStatusCard pack={pack} status={statusQuery.data} />
      ) : null}

      {tabs.length > 0 ? (
        <Tabs>
          <TabList aria-label={`${pack.displayName} configurator tabs`}>
            {tabs.map((tab) => (
              <Tab key={tab.id}>{tab.label}</Tab>
            ))}
          </TabList>
          <TabPanels>
            {tabs.map((tab) => (
              <TabPanel key={tab.id}>{tab.render(tabContext)}</TabPanel>
            ))}
          </TabPanels>
        </Tabs>
      ) : null}
    </Section>
  )
}
