/**
 * T2503 Set 10 — Plugins sub-area page.
 *
 * Two-pane layout: shared plugin inventory (left) + per-track plugin rack
 * (right). The inventory reuses the live `pluginInventoryApi` so live
 * engine + DAW share one scan (per locked decision A9). The rack cards
 * reuse `getPluginAccentConfig` for color so the visual language stays
 * identical to the SnapshotEditor; the bottom-sheet PluginCardRouter
 * editor lands when Set 9 wires the engine-side plugin instance state
 * through a chain-id that the SnapshotEditor adapter can consume.
 *
 * Deep-link: ?track=N&slot=M scrolls the rack to that insert (used by
 * Mixer onSelectBlock).
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  Button,
  Layer,
  NumberInput,
  Stack,
  Tag,
  TextInput,
} from '@carbon/react'
import { Add, TrashCan, Power } from '@carbon/icons-react'

import { dawApi } from '../../../map2/clients/daw'
import { pluginInventoryApi } from '../../../map2/clients/pluginInventory'
import { useDawProjectStore } from '../../stores/dawProjectStore'
import { getPluginAccentConfig } from '../../utils/pluginAccent'

export function MultiTrackPluginsPage() {
  const [searchParams] = useSearchParams()
  const tracks = useDawProjectStore((s) => s.tracks)
  const addPlugin = useDawProjectStore((s) => s.addPlugin)
  const removePlugin = useDawProjectStore((s) => s.removePlugin)
  const setPluginBypass = useDawProjectStore((s) => s.setPluginBypass)

  const initialTrackId = useMemo(() => {
    const param = searchParams.get('track')
    if (param !== null && Number.isFinite(Number(param))) {
      return Number(param)
    }
    return tracks[0]?.id ?? 0
  }, [searchParams, tracks])

  const [activeTrackId, setActiveTrackId] = useState<number>(initialTrackId)
  useEffect(() => {
    setActiveTrackId(initialTrackId)
  }, [initialTrackId])

  const activeTrack = useMemo(
    () => tracks.find((t) => t.id === activeTrackId) ?? null,
    [tracks, activeTrackId],
  )

  const [filter, setFilter] = useState('')

  const inventoryQuery = useQuery({
    queryKey: ['plugin-inventory'],
    queryFn: () => pluginInventoryApi.list(),
    staleTime: 60_000,
  })

  const filteredInventory = useMemo(() => {
    const items = inventoryQuery.data?.plugins ?? []
    const needle = filter.trim().toLowerCase()
    if (!needle) {
      return items
    }
    return items.filter((p) =>
      `${p.name} ${p.uri} ${p.category} ${p.format}`.toLowerCase().includes(needle),
    )
  }, [inventoryQuery.data, filter])

  const addMutation = useMutation({
    mutationFn: ({ trackId, uri }: { trackId: number; uri: string }) =>
      dawApi.addPluginToTrack(trackId, uri),
    onSuccess: (_data, vars) => {
      const descriptor = inventoryQuery.data?.plugins.find((p) => p.uri === vars.uri)
      addPlugin(vars.trackId, vars.uri, descriptor?.name ?? vars.uri)
    },
  })
  const removeMutation = useMutation({
    mutationFn: ({ trackId, slotIndex }: { trackId: number; slotIndex: number }) =>
      dawApi.removePluginFromTrack(trackId, slotIndex),
    onSuccess: (_data, vars) => removePlugin(vars.trackId, vars.slotIndex),
  })

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 380px) minmax(0, 1fr)',
        gap: 12,
        padding: 12,
      }}
    >
      {/* Inventory (left) */}
      <Layer>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Plugin inventory</h2>
            <Tag size="sm" type="warm-gray">
              {inventoryQuery.data?.plugins.length ?? 0} scanned
            </Tag>
          </header>
          <TextInput
            id="multitrack-plugin-filter"
            labelText="Filter"
            placeholder="reverb, lv2, eq…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            data-testid="daw-plugin-filter"
          />
          {inventoryQuery.isLoading ? (
            <p style={{ opacity: 0.6, margin: 0 }}>Loading inventory…</p>
          ) : null}
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              maxHeight: 540,
              overflowY: 'auto',
            }}
            data-testid="daw-plugin-inventory"
          >
            {filteredInventory.map((plugin) => {
              const accent = getPluginAccentConfig(plugin.uri, plugin.category)
              return (
                <li
                  key={plugin.uri}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '4px 1fr auto',
                    gap: 8,
                    padding: 8,
                    border: '1px solid var(--cds-border-subtle-01)',
                    marginBottom: 4,
                    background: 'var(--cds-layer-accent-01)',
                  }}
                >
                  <span style={{ background: accent.color, alignSelf: 'stretch' }} aria-hidden="true" />
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{plugin.name}</div>
                    <div style={{ fontSize: '0.7rem', opacity: 0.7, fontFamily: 'var(--font-mono, monospace)' }}>
                      {plugin.format} · {plugin.category}
                    </div>
                  </div>
                  <Button
                    kind="primary"
                    size="sm"
                    renderIcon={Add}
                    onClick={() => addMutation.mutate({ trackId: activeTrackId, uri: plugin.uri })}
                    disabled={!activeTrack}
                    data-testid={`daw-plugin-add-${plugin.uri}`}
                  >
                    Add
                  </Button>
                </li>
              )
            })}
            {filteredInventory.length === 0 && !inventoryQuery.isLoading ? (
              <li style={{ opacity: 0.6, fontSize: '0.85rem' }}>No matches.</li>
            ) : null}
          </ul>
        </div>
      </Layer>

      {/* Rack (right) */}
      <Layer>
        <div style={{ padding: 12 }}>
          <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Track rack</h2>
            <NumberInput
              id="multitrack-rack-track"
              label=""
              hideLabel
              min={0}
              value={activeTrackId}
              onChange={(_e, v: any) => setActiveTrackId(Number(v.value ?? activeTrackId))}
              data-testid="daw-rack-track-input"
            />
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.85rem' }}>
              {activeTrack ? `→ ${activeTrack.name} (${activeTrack.type})` : '(no track)'}
            </span>
          </header>

          {!activeTrack ? (
            <p style={{ opacity: 0.6, margin: 0 }}>Select a track to view its plugin rack.</p>
          ) : activeTrack.plugins.length === 0 ? (
            <p style={{ opacity: 0.6, margin: 0 }} data-testid="daw-rack-empty">
              No plugins on this track. Pick one from the inventory on the left.
            </p>
          ) : (
            <Stack gap={4}>
              {activeTrack.plugins.map((plugin) => {
                const accent = getPluginAccentConfig(plugin.uri, undefined)
                return (
                  <div
                    key={plugin.slot_index}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '4px 56px 1fr auto auto',
                      gap: 10,
                      padding: 10,
                      border: '1px solid var(--cds-border-subtle-01)',
                      background: 'var(--cds-layer)',
                      opacity: plugin.bypass ? 0.55 : 1,
                    }}
                    data-testid={`daw-rack-card-${plugin.slot_index}`}
                  >
                    <span style={{ background: accent.color, alignSelf: 'stretch' }} aria-hidden="true" />
                    <Tag size="sm" type="warm-gray">slot {plugin.slot_index + 1}</Tag>
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{plugin.display_name}</div>
                      <div style={{ fontSize: '0.7rem', opacity: 0.7, fontFamily: 'var(--font-mono, monospace)' }}>
                        {plugin.uri}
                      </div>
                    </div>
                    <Button
                      kind={plugin.bypass ? 'tertiary' : 'ghost'}
                      size="sm"
                      renderIcon={Power}
                      onClick={() => setPluginBypass(activeTrackId, plugin.slot_index, !plugin.bypass)}
                    >
                      {plugin.bypass ? 'Bypassed' : 'Active'}
                    </Button>
                    <Button
                      kind="ghost"
                      size="sm"
                      renderIcon={TrashCan}
                      iconDescription="Remove plugin"
                      hasIconOnly
                      onClick={() => removeMutation.mutate({ trackId: activeTrackId, slotIndex: plugin.slot_index })}
                    />
                  </div>
                )
              })}
            </Stack>
          )}
        </div>
      </Layer>
    </div>
  )
}

export default MultiTrackPluginsPage
