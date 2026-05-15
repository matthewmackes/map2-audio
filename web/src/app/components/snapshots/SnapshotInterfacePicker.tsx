import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowsHorizontal,
  AudioConsole,
  Cloud,
  Network_3,
  Renew,
  Usb,
  WarningFilled,
} from '@carbon/icons-react'
import {
  Button,
  ClickableTile,
  ContentSwitcher,
  Search,
  Switch,
  Tag,
  Tile,
} from '@carbon/react'

import { audioApi } from '../../../map2/api'
import type {
  AudioInterfaceRecord,
  AudioInterfaceTransport,
} from '../../../map2/api'
import { EmptyState } from '../shared/EmptyState'
import { LoadingState } from '../shared/LoadingState'

import './SnapshotInterfacePicker.css'

type DirectionFilter = 'input' | 'output'

const DEFAULT_INTERFACE_VALUE = '__use_default__'

const TRANSPORT_GROUPS: Array<{
  key: AudioInterfaceTransport | 'pipewire'
  label: string
  match: (transport: AudioInterfaceTransport) => boolean
}> = [
  {
    key: 'pipewire',
    label: 'Local interfaces',
    match: (transport) =>
      transport === 'pipewire_usb'
      || transport === 'pipewire_alsa'
      || transport === 'pipewire_other',
  },
  {
    key: 'avb',
    label: 'AVB endpoints',
    match: (transport) => transport === 'avb',
  },
  {
    key: 'cluster',
    label: 'Cluster nodes',
    match: (transport) => transport === 'cluster',
  },
  // T2521-7 — SonoBus / AOO remote-audio transport. Sits below the
  // local + AVB + cluster groups since Q18 locks AVB-preferred.
  {
    key: 'sonobus',
    label: 'SonoBus peers',
    match: (transport) => transport === 'sonobus',
  },
]

const TRANSPORT_ICON: Record<AudioInterfaceTransport, ReactNode> = {
  pipewire_usb: <Usb size={16} aria-hidden="true" />,
  pipewire_alsa: <AudioConsole size={16} aria-hidden="true" />,
  pipewire_other: <AudioConsole size={16} aria-hidden="true" />,
  avb: <ArrowsHorizontal size={16} aria-hidden="true" />,
  cluster: <Network_3 size={16} aria-hidden="true" />,
  sonobus: <Cloud size={16} aria-hidden="true" />,
}

const TRANSPORT_LABEL: Record<AudioInterfaceTransport, string> = {
  pipewire_usb: 'USB',
  pipewire_alsa: 'ALSA',
  pipewire_other: 'PipeWire',
  avb: 'AVB',
  cluster: 'Cluster',
  sonobus: 'SonoBus',
}

export interface SnapshotInterfacePickerProps {
  nodeId?: string | null
  direction: DirectionFilter
  selectedInterfaceId: string | null
  onChange: (interfaceId: string | null) => void
  /** Disable selection (mutation in flight). */
  disabled?: boolean
  /** Optional title override. Default depends on `direction`. */
  title?: string
  /** Optional description override. */
  description?: string
}

/**
 * SnapshotInterfacePicker — world-class audio interface chooser for snapshot publish.
 *
 * Pulls `/api/audio/interfaces` (merged PipeWire + AVB + cluster) and renders
 * each interface as a Carbon `ClickableTile` card grouped by transport. Each
 * card carries vendor + product + port counts + live availability tag. Search
 * and transport filters narrow the grid. A leading "Use rig default" card
 * sets the binding back to `null`.
 *
 * Selection is reported as a stable `interface_id` so snapshots survive
 * PipeWire renaming and USB-port reshuffles.
 */
export function SnapshotInterfacePicker({
  nodeId = null,
  direction,
  selectedInterfaceId,
  onChange,
  disabled = false,
  title,
  description,
}: SnapshotInterfacePickerProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [transportFilter, setTransportFilter] = useState<'all' | AudioInterfaceTransport | 'pipewire'>(
    'all',
  )

  const interfacesQuery = useQuery({
    queryKey: ['audio', 'interfaces', nodeId ?? 'local'],
    queryFn: () => audioApi.getInterfaces(nodeId),
    staleTime: 5_000,
    refetchInterval: 30_000,
  })

  const allInterfaces = useMemo(
    () => interfacesQuery.data?.interfaces ?? [],
    [interfacesQuery.data],
  )

  const directionFiltered = useMemo(
    () =>
      allInterfaces.filter((iface) => {
        if (direction === 'input') {
          return iface.input_port_count > 0 || iface.direction === 'talker'
        }
        return iface.output_port_count > 0 || iface.direction === 'listener'
      }),
    [allInterfaces, direction],
  )

  const searchFiltered = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase()
    if (!needle) return directionFiltered
    return directionFiltered.filter((iface) =>
      [iface.display_name, iface.vendor, iface.product, iface.interface_id]
        .filter((segment): segment is string => typeof segment === 'string' && segment.length > 0)
        .some((segment) => segment.toLowerCase().includes(needle)),
    )
  }, [directionFiltered, searchTerm])

  const transportFiltered = useMemo(() => {
    if (transportFilter === 'all') return searchFiltered
    if (transportFilter === 'pipewire') {
      return searchFiltered.filter((iface) =>
        iface.transport === 'pipewire_usb'
        || iface.transport === 'pipewire_alsa'
        || iface.transport === 'pipewire_other',
      )
    }
    return searchFiltered.filter((iface) => iface.transport === transportFilter)
  }, [searchFiltered, transportFilter])

  const groups = useMemo(() => {
    const result: Array<{ key: string; label: string; items: AudioInterfaceRecord[] }> = []
    for (const group of TRANSPORT_GROUPS) {
      const items = transportFiltered.filter((iface) => group.match(iface.transport))
      if (items.length === 0) continue
      result.push({ key: group.key, label: group.label, items })
    }
    return result
  }, [transportFiltered])

  const isUsingDefault = !selectedInterfaceId

  const resolvedTitle =
    title ?? (direction === 'input' ? 'Snapshot input interface' : 'Snapshot output interface')
  const resolvedDescription =
    description
    ?? (direction === 'input'
      ? 'Pick the audio interface this snapshot will capture from. The selection is stored as a stable ID so it survives PipeWire renaming and USB-port reshuffles.'
      : 'Pick the audio interface this snapshot will play through. The selection is stored as a stable ID so it survives PipeWire renaming and USB-port reshuffles.')

  const handleSelect = (interfaceId: string | null) => {
    if (disabled) return
    if (interfaceId === DEFAULT_INTERFACE_VALUE) {
      onChange(null)
      return
    }
    onChange(interfaceId)
  }

  return (
    <Tile className="snapshot-interface-picker">
      <header className="snapshot-interface-picker__header">
        <div>
          <h3 className="snapshot-interface-picker__title">{resolvedTitle}</h3>
          <p className="snapshot-interface-picker__description">{resolvedDescription}</p>
        </div>
        <div className="snapshot-interface-picker__header-actions">
          <Tag type={interfacesQuery.isFetching ? 'warm-gray' : 'cool-gray'}>
            {allInterfaces.length} discovered
          </Tag>
          <Button
            kind="ghost"
            size="sm"
            renderIcon={Renew}
            iconDescription="Refresh interfaces"
            hasIconOnly
            onClick={() => interfacesQuery.refetch()}
            disabled={interfacesQuery.isFetching}
          />
        </div>
      </header>

      <div className="snapshot-interface-picker__toolbar">
        <Search
          id={`snapshot-interface-picker-search-${direction}`}
          size="sm"
          labelText="Filter interfaces"
          placeholder="Search by name, vendor, product, ID…"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          onClear={() => setSearchTerm('')}
        />
        <ContentSwitcher
          size="sm"
          selectedIndex={
            transportFilter === 'all'
              ? 0
              : transportFilter === 'pipewire'
                ? 1
                : transportFilter === 'avb'
                  ? 2
                  : transportFilter === 'cluster'
                    ? 3
                    : 0
          }
          onChange={({ name }) => setTransportFilter(name as typeof transportFilter)}
        >
          <Switch name="all" text="All" />
          <Switch name="pipewire" text="Local" />
          <Switch name="avb" text="AVB" />
          <Switch name="cluster" text="Cluster" />
        </ContentSwitcher>
      </div>

      <ClickableTile
        className={`snapshot-interface-picker__default-tile${
          isUsingDefault ? ' snapshot-interface-picker__default-tile--selected' : ''
        }`}
        aria-pressed={isUsingDefault}
        onClick={() => handleSelect(DEFAULT_INTERFACE_VALUE)}
        disabled={disabled}
        data-testid={`snapshot-interface-default-${direction}`}
      >
        <div className="snapshot-interface-picker__default-content">
          <strong>Use rig default {direction}</strong>
          <span>Inherit the rig-level default device set in Audio Settings.</span>
        </div>
        {isUsingDefault ? <Tag type="green">Selected</Tag> : null}
      </ClickableTile>

      {interfacesQuery.isLoading ? (
        <LoadingState description="Discovering audio interfaces…" />
      ) : interfacesQuery.isError ? (
        <EmptyState
          icon={<WarningFilled size={24} />}
          title="Couldn't load interfaces"
          description="The /api/audio/interfaces endpoint did not respond. Retry, or check the backend log."
          actions={
            <Button size="sm" kind="tertiary" onClick={() => interfacesQuery.refetch()}>
              Retry
            </Button>
          }
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<AudioConsole size={24} />}
          title="No matching interfaces"
          description={
            allInterfaces.length === 0
              ? 'No audio interfaces are visible to this host yet. Confirm PipeWire is running and that USB / AVB hardware is connected.'
              : 'No interfaces match the current filters. Clear the search or pick a different transport.'
          }
        />
      ) : (
        groups.map((group) => (
          <section key={group.key} className="snapshot-interface-picker__group">
            <header className="snapshot-interface-picker__group-header">
              <h4>{group.label}</h4>
              <Tag type="cool-gray">{group.items.length}</Tag>
            </header>
            <div className="snapshot-interface-picker__grid">
              {group.items.map((iface) => {
                const isSelected = selectedInterfaceId === iface.interface_id
                const directionCount =
                  direction === 'input' ? iface.input_port_count : iface.output_port_count
                return (
                  <ClickableTile
                    key={iface.interface_id}
                    className={`snapshot-interface-picker__card${
                      isSelected ? ' snapshot-interface-picker__card--selected' : ''
                    }${iface.available ? '' : ' snapshot-interface-picker__card--unavailable'}`}
                    aria-pressed={isSelected}
                    onClick={() => handleSelect(iface.interface_id)}
                    disabled={disabled}
                    data-testid={`snapshot-interface-card-${iface.interface_id}`}
                  >
                    <div className="snapshot-interface-picker__card-header">
                      <span className="snapshot-interface-picker__card-icon">
                        {TRANSPORT_ICON[iface.transport]}
                      </span>
                      <div className="snapshot-interface-picker__card-title-row">
                        <strong className="snapshot-interface-picker__card-title">
                          {iface.display_name}
                        </strong>
                        <div className="snapshot-interface-picker__card-tags">
                          <Tag type="cool-gray" size="sm">
                            {TRANSPORT_LABEL[iface.transport]}
                          </Tag>
                          {iface.is_default ? (
                            <Tag type="blue" size="sm">
                              Default
                            </Tag>
                          ) : null}
                          {isSelected ? (
                            <Tag type="green" size="sm">
                              Selected
                            </Tag>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <dl className="snapshot-interface-picker__card-meta">
                      {iface.vendor ? (
                        <div>
                          <dt>Vendor</dt>
                          <dd>{iface.vendor}</dd>
                        </div>
                      ) : null}
                      {iface.product ? (
                        <div>
                          <dt>Product</dt>
                          <dd>{iface.product}</dd>
                        </div>
                      ) : null}
                      <div>
                        <dt>{direction === 'input' ? 'Input ports' : 'Output ports'}</dt>
                        <dd>{directionCount}</dd>
                      </div>
                      {iface.sample_rate ? (
                        <div>
                          <dt>Sample rate</dt>
                          <dd>{iface.sample_rate.toLocaleString()} Hz</dd>
                        </div>
                      ) : null}
                      {iface.node_id ? (
                        <div>
                          <dt>Node</dt>
                          <dd>{iface.node_id}</dd>
                        </div>
                      ) : null}
                    </dl>

                    <footer className="snapshot-interface-picker__card-footer">
                      <Tag type={iface.available ? 'green' : 'red'} size="sm">
                        {iface.available ? 'Available' : 'Unreachable'}
                      </Tag>
                      <code className="snapshot-interface-picker__card-id">
                        {iface.interface_id}
                      </code>
                    </footer>
                  </ClickableTile>
                )
              })}
            </div>
          </section>
        ))
      )}
    </Tile>
  )
}

export default SnapshotInterfacePicker
