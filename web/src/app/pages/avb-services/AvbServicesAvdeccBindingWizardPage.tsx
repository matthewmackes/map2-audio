/**
 * T2499-C wizard route mount (2026-05-10).
 *
 * Hosts `AvdeccBindingWizard` + `AvdeccSubstratePanel` + brain-slot
 * picker + binding writer at `/avb/avdecc/binding-wizard`. This is the
 * route the Sequencer Setup card now deep-links to.
 *
 * Production wiring:
 *   - Entities  → GET /api/avb/avdecc/entities (avbApi.getAvdeccEntities)
 *   - Substrate → GET /api/avb/avdecc/substrate-state
 *   - Binding   → POST /api/avb/bindings (live AVB bindings authority)
 *
 * Tests inject `dataSource`, `substrateState`, `brainSlots`, and
 * `bindingClient` directly to bypass TanStack Query + fetch.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Dropdown,
  Heading,
  InlineNotification,
  Layer,
  Section,
  Stack,
  TextInput,
} from '@carbon/react'

import {
  AvdeccBindingWizard,
  type AvdeccBindingWizardDataSource,
} from './AvdeccBindingWizard/AvdeccBindingWizard'
import {
  AvdeccSubstratePanel,
  type SubstrateState,
} from './AvdeccBindingWizard/AvdeccSubstratePanel'
import {
  submitAvdeccBrainBinding,
  type AvdeccBindingClient,
} from './AvdeccBindingWizard/avdeccBindingWriter'
import { avbApi } from '../../../map2/clients/avb'
import { useToasts } from '../../components/Toasts'
import type { AvbAvdeccEntity } from '../../components/AvbRouting/types/endpoint'

interface BrainSlotChoice {
  id: number
  label: string
}

const DEFAULT_BRAIN_SLOTS: readonly BrainSlotChoice[] = [
  { id: 0, label: '01 · Brain input 1' },
  { id: 1, label: '02 · Brain input 2' },
  { id: 2, label: '03 · Brain input 3' },
  { id: 3, label: '04 · Brain input 4' },
] as const

const DEFAULT_BINDING_CLIENT: AvdeccBindingClient = {
  list: async ({ consumer_type, consumer_id }) => {
    const params = new URLSearchParams({
      consumer_type,
      consumer_id: String(consumer_id),
    })
    const response = await fetch(`/api/avb/bindings?${params.toString()}`)
    if (!response.ok) {
      throw new Error(`Failed to list AVB bindings (HTTP ${response.status})`)
    }
    const data = await response.json()
    return Array.isArray(data?.bindings) ? data.bindings : []
  },
  create: async (payload) => {
    const response = await fetch('/api/avb/bindings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(
        `Failed to create AVB binding (HTTP ${response.status})${detail ? `: ${detail}` : ''}`,
      )
    }
    return await response.json()
  },
}

const LIVE_DATA_SOURCE: AvdeccBindingWizardDataSource = {
  useEntities: () => {
    const query = useQuery({
      queryKey: ['avdecc-binding-wizard', 'entities'],
      queryFn: () => avbApi.getAvdeccEntities(),
      staleTime: 5_000,
      refetchInterval: 10_000,
    })
    return {
      entities: query.data?.entities ?? [],
      isLoading: query.isLoading,
      error: query.error instanceof Error ? query.error : null,
      enabled: query.data?.enabled ?? true,
    }
  },
}

async function fetchSubstrateState(): Promise<SubstrateState> {
  const response = await fetch('/api/avb/avdecc/substrate-state')
  if (!response.ok) {
    throw new Error(
      `Failed to fetch substrate state (HTTP ${response.status})`,
    )
  }
  return (await response.json()) as SubstrateState
}

export interface AvbServicesAvdeccBindingWizardPageProps {
  dataSource?: AvdeccBindingWizardDataSource
  substrateState?: SubstrateState
  brainSlots?: readonly BrainSlotChoice[]
  bindingClient?: AvdeccBindingClient
}

export function AvbServicesAvdeccBindingWizardPage({
  dataSource,
  substrateState,
  brainSlots = DEFAULT_BRAIN_SLOTS,
  bindingClient = DEFAULT_BINDING_CLIENT,
}: AvbServicesAvdeccBindingWizardPageProps = {}) {
  const { pushToast } = useToasts()
  const [selectedSlotId, setSelectedSlotId] = useState<number>(brainSlots[0]?.id ?? 0)
  const [notes, setNotes] = useState<string>('')
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [lastBoundEntityId, setLastBoundEntityId] = useState<string | null>(null)

  const effectiveDataSource: AvdeccBindingWizardDataSource = dataSource ?? LIVE_DATA_SOURCE

  const liveSubstrateQuery = useQuery({
    queryKey: ['avdecc-binding-wizard', 'substrate-state'],
    queryFn: fetchSubstrateState,
    enabled: substrateState === undefined,
    staleTime: 5_000,
    refetchInterval: 15_000,
  })
  const effectiveSubstrate: SubstrateState | null =
    substrateState ?? liveSubstrateQuery.data ?? null

  const handleSelectEntity = async (entity: AvbAvdeccEntity) => {
    if (submitting) return
    setSubmitting(true)
    try {
      const result = await submitAvdeccBrainBinding(
        entity,
        selectedSlotId,
        bindingClient,
        notes.length > 0 ? { notes } : undefined,
      )
      setLastBoundEntityId(entity.entity_id)
      pushToast(
        result.duplicate
          ? `Already bound: ${entity.entity_name || entity.entity_id} → slot ${selectedSlotId + 1}`
          : `Bound ${entity.entity_name || entity.entity_id} → Brain slot ${selectedSlotId + 1}`,
        'success',
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      pushToast(`Failed to bind: ${message}`, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const slotItems = useMemo(
    () => brainSlots.map((s) => ({ id: String(s.id), text: s.label, slot: s })),
    [brainSlots],
  )

  return (
    <Section
      className="avb-services-avdecc-binding-wizard"
      data-testid="avb-services-avdecc-binding-wizard-page"
    >
      <Layer level={0}>
        <header style={{ padding: 16, borderBottom: '1px solid var(--cds-layer-accent)' }}>
          <Heading style={{ margin: 0 }}>Discover AVDECC devices</Heading>
          <p style={{ margin: 'var(--cds-spacing-03) 0 0', color: 'var(--cds-text-secondary)' }}>
            Bind an AVDECC stream to a Brain input. Set <code>MAP2_AVDECC_SIMULATOR=small</code> to
            drive the wizard against the simulator on a host without AVB hardware.
          </p>
        </header>
      </Layer>

      <Layer level={1}>
        <div style={{ padding: 16 }}>
          <Stack gap={6}>
            {effectiveSubstrate ? (
              <AvdeccSubstratePanel state={effectiveSubstrate} />
            ) : liveSubstrateQuery.error ? (
              <InlineNotification
                kind="warning"
                lowContrast
                hideCloseButton
                title="Substrate state unavailable"
                subtitle={
                  liveSubstrateQuery.error instanceof Error
                    ? liveSubstrateQuery.error.message
                    : 'Unknown error fetching /api/avb/avdecc/substrate-state'
                }
                data-testid="avdecc-wizard-substrate-error"
              />
            ) : null}

            <div
              style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}
              data-testid="avdecc-wizard-binding-controls"
            >
              <div style={{ minWidth: 240 }}>
                <Dropdown
                  id="avdecc-wizard-brain-slot"
                  titleText="Brain input slot"
                  label="Choose target slot"
                  items={slotItems}
                  itemToString={(item) => (item ? item.text : '')}
                  selectedItem={
                    slotItems.find((item) => item.slot.id === selectedSlotId) ?? null
                  }
                  onChange={({ selectedItem }) => {
                    if (selectedItem) setSelectedSlotId(selectedItem.slot.id)
                  }}
                  data-testid="avdecc-wizard-slot-dropdown"
                />
              </div>
              <div style={{ minWidth: 240 }}>
                <TextInput
                  id="avdecc-wizard-notes"
                  labelText="Notes (optional)"
                  placeholder="e.g. drum overhead pair"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  data-testid="avdecc-wizard-notes-input"
                />
              </div>
              {submitting && (
                <Button
                  kind="ghost"
                  disabled
                  data-testid="avdecc-wizard-submitting-indicator"
                >
                  Binding…
                </Button>
              )}
            </div>

            {lastBoundEntityId && (
              <InlineNotification
                kind="success"
                lowContrast
                title="Binding committed"
                subtitle={`Last bound entity: ${lastBoundEntityId} → slot ${selectedSlotId + 1}`}
                data-testid="avdecc-wizard-last-bound"
              />
            )}

            <AvdeccBindingWizard
              dataSource={effectiveDataSource}
              onSelectEntity={handleSelectEntity}
            />
          </Stack>
        </div>
      </Layer>
    </Section>
  )
}

export default AvbServicesAvdeccBindingWizardPage
