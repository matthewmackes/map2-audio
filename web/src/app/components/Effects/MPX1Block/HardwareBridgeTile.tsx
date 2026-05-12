// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// T2517-4 — Tile rendered in the snapshot-editor effects-chooser for any
// `is_hardware: true` plugin. Surfaces the per-instance affordances we
// designed for the MPX-1 (connection-type preference, singleton-in-use
// awareness, capability gating) without modifying the larger plugin
// browser machinery.

import { useMemo, useState } from 'react'
import { Button, Tag, Tile } from '@carbon/react'
import { Link as LinkIcon } from '@carbon/icons-react'

import type { Plugin } from '../../../../map2/types'
import {
  useAutoConnectionType,
  useMpx1InUseByChain,
} from './useMpx1BlockApi'
import { MPX1BlockSidePanel } from './MPX1BlockSidePanel'

export interface HardwareBridgeTileProps {
  plugin: Plugin & {
    is_hardware?: boolean
    singleton?: boolean
    connection_types?: string[]
    preferred_connection?: string
    requires_interface_capability?: string[]
  }
  currentChainId: string | null
  snapshotEditingLocked: boolean
  onAddPluginToCurrentChain: (uri: string) => void | Promise<void>
}

function isMpx1(uri: string): boolean {
  return uri === 'hardware://lexicon-mpx1' || uri === 'hardware://lexicon-mpx1-spdif'
}

export function HardwareBridgeTile({
  plugin,
  currentChainId,
  snapshotEditingLocked,
  onAddPluginToCurrentChain,
}: HardwareBridgeTileProps) {
  const inUseByChain = useMpx1InUseByChain()
  const { preferred, aesCapable, spdifCapable } = useAutoConnectionType()

  const eligibleCount = aesCapable.length + spdifCapable.length
  const hasEligibleInterface = eligibleCount > 0

  const [configOpen, setConfigOpen] = useState(false)

  const availability = useMemo(() => {
    if (!hasEligibleInterface) {
      return {
        kind: 'unavailable' as const,
        label: 'No compatible interface connected',
        helper: `Requires ${(plugin.requires_interface_capability ?? ['digital_io_stereo']).join(', ')}`,
      }
    }
    if (plugin.singleton && inUseByChain && inUseByChain !== currentChainId) {
      return {
        kind: 'in_use' as const,
        label: `Already in use by chain ${inUseByChain}`,
        helper: 'Remove it from that chain first to insert here.',
      }
    }
    return { kind: 'available' as const, label: 'Available', helper: '' }
  }, [hasEligibleInterface, inUseByChain, currentChainId, plugin])

  const handleAdd = () => {
    if (availability.kind !== 'available') return
    void onAddPluginToCurrentChain(plugin.uri)
    if (isMpx1(plugin.uri) && currentChainId) {
      setConfigOpen(true)
    }
  }

  const isMpx1Block = isMpx1(plugin.uri)

  return (
    <>
      <Tile className="juce-grid-page__browser-plugin-tile juce-grid-page__browser-plugin-tile--hardware">
        <div className="juce-grid-page__browser-plugin-header">
          <div className="juce-grid-page__browser-plugin-copy">
            <p className="juce-grid-page__browser-plugin-kicker">Hardware FX bridge</p>
            <h3 className="juce-grid-page__browser-plugin-heading">{plugin.name}</h3>
            <p>{plugin.author || 'External hardware effect'}</p>
          </div>
          <div className="juce-grid-page__browser-plugin-meta">
            <Tag type="magenta">{plugin.format_name || 'Hardware'}</Tag>
            {plugin.singleton ? <Tag type="warm-gray">Singleton</Tag> : null}
          </div>
        </div>
        <div className="juce-grid-page__browser-card-meta" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
          {(plugin.connection_types ?? []).map((ct) => (
            <Tag key={ct} type={ct === plugin.preferred_connection ? 'blue' : 'cool-gray'}>
              {ct === plugin.preferred_connection ? `${ct} (preferred)` : ct}
            </Tag>
          ))}
          {preferred ? <Tag type="green">Auto: {preferred}</Tag> : null}
          <Tag
            type={
              availability.kind === 'available'
                ? 'green'
                : availability.kind === 'in_use'
                ? 'warm-gray'
                : 'cool-gray'
            }
          >
            {availability.label}
          </Tag>
        </div>
        {availability.helper ? (
          <p className="juce-grid-page__browser-plugin-helper">{availability.helper}</p>
        ) : null}
        <div className="juce-grid-page__browser-card-actions">
          <Button
            size="sm"
            kind="primary"
            disabled={snapshotEditingLocked || availability.kind !== 'available'}
            onClick={handleAdd}
          >
            Add to chain
          </Button>
          {isMpx1Block && currentChainId ? (
            <Button
              size="sm"
              kind="ghost"
              renderIcon={LinkIcon}
              onClick={() => setConfigOpen(true)}
            >
              Configure
            </Button>
          ) : null}
        </div>
      </Tile>
      {isMpx1Block && currentChainId ? (
        <MPX1BlockSidePanel
          open={configOpen}
          chainId={currentChainId}
          onClose={() => setConfigOpen(false)}
        />
      ) : null}
    </>
  )
}

export function HardwareBridgeSection({
  hardwarePlugins,
  currentChainId,
  snapshotEditingLocked,
  onAddPluginToCurrentChain,
}: {
  hardwarePlugins: Plugin[]
  currentChainId: string | null
  snapshotEditingLocked: boolean
  onAddPluginToCurrentChain: (uri: string) => void | Promise<void>
}) {
  if (hardwarePlugins.length === 0) return null
  return (
    <section className="juce-grid-page__browser-section juce-grid-page__browser-section--hardware">
      <div className="juce-grid-page__browser-section-header">
        <div className="juce-grid-page__browser-section-title">
          <LinkIcon size={16} />
          <span className="juce-grid-page__browser-section-title-text">Hardware FX bridges</span>
        </div>
        <div className="juce-grid-page__browser-meta-tags">
          <Tag type="magenta">{hardwarePlugins.length} bridges</Tag>
        </div>
      </div>
      <div className="juce-grid-page__browser-native-grid">
        {hardwarePlugins.map((plugin) => (
          <HardwareBridgeTile
            key={plugin.uri}
            plugin={plugin as HardwareBridgeTileProps['plugin']}
            currentChainId={currentChainId}
            snapshotEditingLocked={snapshotEditingLocked}
            onAddPluginToCurrentChain={onAddPluginToCurrentChain}
          />
        ))}
      </div>
    </section>
  )
}
