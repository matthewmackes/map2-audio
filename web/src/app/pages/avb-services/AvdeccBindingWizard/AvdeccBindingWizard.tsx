/**
 * T2499-C Slice 3 — AvdeccBindingWizard shell.
 *
 * Mounts the entity-list view that drives the Sequencer-context binding
 * flow (AVDECC streams → Brain inputs). This slice ships:
 *
 *  - Loading / error / empty / populated render states
 *  - Tier classification (1 = one-click, 2-9 = DataTable, 10+ = bulk)
 *  - Non-tier-1 banner declaring this is a binding wizard, not generic
 *    AVDECC routing
 *
 * Slice 3 does NOT ship:
 *  - DataTable picker for tiers 2-9 (Slice 4)
 *  - Substrate-state diagnostic panel (Slice 5)
 *  - Brain-input binding writer (Slice 6)
 *
 * The wizard reads its data from `dataSource.useEntities()` so tests
 * can mock the hook directly. Production wiring uses the existing
 * `avbApi.getAvdeccEntities()` over `/api/avb/avdecc/entities`, which
 * the entity-provider resolver from Slice 2 transparently flips to
 * the simulator when `MAP2_AVDECC_SIMULATOR=<bench>` is in env.
 */
import React from 'react'
import {
  Button,
  InlineNotification,
  Layer,
  Loading,
  Stack,
  Tag,
  Tile,
} from '@carbon/react'

import type { AvbAvdeccEntity } from '../../../components/AvbRouting/types/endpoint'
import { AvdeccDataTablePicker } from './AvdeccDataTablePicker'

// ---------------------------------------------------------------------------
// Tier classifier — locked by T2499-C Q2
// ---------------------------------------------------------------------------

export type WizardTier = 'one_click' | 'data_table' | 'bulk_import'

export function classifyTier(entityCount: number): WizardTier {
  if (entityCount <= 1) return 'one_click'
  if (entityCount <= 9) return 'data_table'
  return 'bulk_import'
}

// ---------------------------------------------------------------------------
// Data-source contract — props-injected so tests bypass TanStack Query.
// Production callers use the live `useAvdeccEntitiesDataSource()` hook
// shipped alongside.
// ---------------------------------------------------------------------------

export interface AvdeccBindingWizardDataSource {
  /** Returns the current AVDECC entity list + loading / error flags. */
  useEntities: () => {
    entities: AvbAvdeccEntity[]
    isLoading: boolean
    error: Error | null
    enabled: boolean
  }
}

export interface AvdeccBindingWizardProps {
  /** Required — every render path consults this. */
  dataSource: AvdeccBindingWizardDataSource
  /**
   * Slice 6 plugs the binding writer here. Slice 3 just records that
   * the operator clicked an entity tile so the flow can be tested.
   */
  onSelectEntity?: (entity: AvbAvdeccEntity) => void
  /**
   * Slice 5 routes "Fix it" clicks from the diagnostic panel here.
   * Stub for now.
   */
  onOpenSubstrateConfig?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AvdeccBindingWizard({
  dataSource,
  onSelectEntity,
}: AvdeccBindingWizardProps): React.ReactElement {
  const { entities, isLoading, error, enabled } = dataSource.useEntities()
  const tier = classifyTier(entities.length)

  return (
    <div className="map2-avdecc-binding-wizard" data-testid="avdecc-binding-wizard">
      <WizardHeader tier={tier} entityCount={entities.length} />
      {!enabled && <DisabledBanner />}
      <Layer>
        <div style={{ padding: 16 }}>
          {isLoading && <LoadingState />}
          {error && <ErrorState message={error.message} />}
          {!isLoading && !error && enabled && entities.length === 0 && (
            <EmptyState />
          )}
          {!isLoading && !error && enabled && tier === 'one_click' && entities.length === 1 && (
            <OneClickEntityTile
              entity={entities[0]}
              onSelect={onSelectEntity}
            />
          )}
          {!isLoading && !error && enabled &&
            (tier === 'data_table' || tier === 'bulk_import') && (
              <AvdeccDataTablePicker
                entities={entities}
                onSelectEntity={(entity) => onSelectEntity?.(entity)}
              />
            )}
        </div>
      </Layer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function WizardHeader({
  tier,
  entityCount,
}: {
  tier: WizardTier
  entityCount: number
}): React.ReactElement {
  return (
    <div
      style={{
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Discover AVDECC devices</h1>
      <Tag type="warm-gray" size="sm" data-testid="avdecc-wizard-mode">
        Sequencer binding flow
      </Tag>
      <Tag type="cyan" size="sm" data-testid="avdecc-wizard-tier">
        {tier === 'one_click' && 'Tier 1 — one-click'}
        {tier === 'data_table' && `Tier 2 — DataTable (${entityCount})`}
        {tier === 'bulk_import' && `Tier 3 — bulk import (${entityCount})`}
      </Tag>
    </div>
  )
}

function DisabledBanner(): React.ReactElement {
  return (
    <InlineNotification
      kind="warning"
      lowContrast
      hideCloseButton
      title="AVDECC unavailable"
      subtitle="The AVDECC service reports it's not enabled on this host. Use MAP2_AVDECC_SIMULATOR=<bench> to drive the wizard from the simulator while the AVB substrate is brought up."
      data-testid="avdecc-wizard-disabled"
    />
  )
}

function LoadingState(): React.ReactElement {
  return (
    <div data-testid="avdecc-wizard-loading">
      <Loading withOverlay={false} small />
      <p style={{ marginTop: 8 }}>Querying AVDECC controller…</p>
    </div>
  )
}

function ErrorState({ message }: { message: string }): React.ReactElement {
  return (
    <InlineNotification
      kind="error"
      lowContrast
      hideCloseButton
      title="Failed to load AVDECC entities"
      subtitle={message}
      data-testid="avdecc-wizard-error"
    />
  )
}

function EmptyState(): React.ReactElement {
  return (
    <div data-testid="avdecc-wizard-empty">
      <h2 style={{ marginTop: 0, fontSize: '1rem' }}>No AVDECC entities discovered</h2>
      <p style={{ margin: '8px 0' }}>
        The AVDECC controller is up, but no entities are advertising on the
        bus. Verify the AVB interface, PTP lock, and that talker / listener
        devices are powered on.
      </p>
    </div>
  )
}

function OneClickEntityTile({
  entity,
  onSelect,
}: {
  entity: AvbAvdeccEntity
  onSelect?: (entity: AvbAvdeccEntity) => void
}): React.ReactElement {
  return (
    <Tile data-testid="avdecc-wizard-one-click">
      <Stack gap={4}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>{entity.entity_name || entity.entity_id}</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {entity.capabilities.is_audio_talker && (
            <Tag size="sm" type="green">Talker × {entity.capabilities.talker_streams}</Tag>
          )}
          {entity.capabilities.is_audio_listener && (
            <Tag size="sm" type="blue">Listener × {entity.capabilities.listener_streams}</Tag>
          )}
          {entity.capabilities.gptp_supported && (
            <Tag size="sm" type="purple">gPTP</Tag>
          )}
        </div>
        <p style={{ margin: 0, fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem' }}>
          entity_id={entity.entity_id} mac={entity.mac_address}
        </p>
        <Button
          kind="primary"
          onClick={() => onSelect?.(entity)}
          data-testid="avdecc-wizard-bind"
        >
          Bind to Brain input
        </Button>
      </Stack>
    </Tile>
  )
}

export default AvdeccBindingWizard
