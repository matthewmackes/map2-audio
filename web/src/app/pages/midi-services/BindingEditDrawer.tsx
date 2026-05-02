/**
 * T2482 loop 11 / iter 105 — BindingEditDrawer.
 * T2482 loop 12 / iter 115 — replaced raw source/target JSON textareas
 *   with structured SourceDescriptorEditor + TargetDescriptorEditor
 *   per the iter-111 plan D1/D2/D3. The metadata field stays JSON
 *   (unlike source/target it has no spec catalogue).
 *
 * Carbon Modal that loads a single binding via GET /api/midi/bindings/{id}
 * and surfaces an editor for the PATCH-able fields.
 *
 * Per the iter-111 plan D2: unknown descriptor keys are preserved via
 * extractKnownAndUnknown / mergeForSave so round-trip edits don't
 * lose backend extensions.
 *
 * Per D3: each structured editor surfaces an Advanced (JSON) disclosure
 * for forward-compat backend-extension authoring.
 *
 * Read-only fields (audit metadata):
 *   binding_id, consumer_type, consumer_id, source_type, target_type,
 *   created_at, created_by, modified_at, modified_by, source
 *
 * Editable (PATCH-able) fields per the Pydantic MidiBindingUpdate schema:
 *   consumer_label, source_descriptor (structured), target_descriptor
 *   (structured), device_id, scope, scope_id, enabled, metadata (JSON),
 *   modified_by
 */

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Dropdown,
  FormGroup,
  InlineLoading,
  InlineNotification,
  Modal,
  TextArea,
  TextInput,
  Toggle,
} from '@carbon/react'

import {
  midiBindingsApi,
  BINDING_SCOPES,
  type BindingScope,
  type MidiBindingRead,
  type MidiBindingUpdate,
} from '../../../map2/clients/midiBindings'
import { SourceDescriptorEditor } from './SourceDescriptorEditor'
import { TargetDescriptorEditor } from './TargetDescriptorEditor'
import { extractKnownAndUnknown, mergeForSave } from './sourceDescriptors'
import { extractTargetKnownAndUnknown, mergeTargetForSave } from './targetDescriptors'
import './BindingEditDrawer.css'

interface BindingEditDrawerProps {
  bindingId: string | null
  open: boolean
  onClose: () => void
}

interface FormState {
  consumer_label: string
  // structured source descriptor (known fields only)
  source_known: Record<string, unknown>
  source_unknown: Record<string, unknown>
  // structured target descriptor (known fields only)
  target_known: Record<string, unknown>
  target_unknown: Record<string, unknown>
  device_id: string
  scope: BindingScope
  scope_id: string
  enabled: boolean
  metadata_json: string
  modified_by: string
}

function stateFromBinding(b: MidiBindingRead): FormState {
  const src = extractKnownAndUnknown(b.source_descriptor, b.source_type)
  const tgt = extractTargetKnownAndUnknown(b.target_descriptor, b.target_type)
  return {
    consumer_label: b.consumer_label,
    source_known: src.known,
    source_unknown: src.unknown,
    target_known: tgt.known,
    target_unknown: tgt.unknown,
    device_id: b.device_id ?? '',
    scope: b.scope,
    scope_id: b.scope_id ?? '',
    enabled: b.enabled,
    metadata_json: JSON.stringify(b.metadata, null, 2),
    modified_by: 'web-ui',
  }
}

interface JsonValidation {
  ok: boolean
  error: string | null
  value: Record<string, unknown> | null
}

function validateJson(raw: string): JsonValidation {
  if (raw.trim() === '') {
    return { ok: true, error: null, value: {} }
  }
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, error: 'Must be a JSON object', value: null }
    }
    return { ok: true, error: null, value: parsed as Record<string, unknown> }
  } catch (err) {
    return { ok: false, error: (err as Error).message, value: null }
  }
}

function patchFromState(state: FormState, original: MidiBindingRead): MidiBindingUpdate {
  const patch: MidiBindingUpdate = { modified_by: state.modified_by || 'web-ui' }
  if (state.consumer_label !== original.consumer_label) {
    patch.consumer_label = state.consumer_label
  }
  const mergedSource = mergeForSave(state.source_known, state.source_unknown)
  if (JSON.stringify(mergedSource) !== JSON.stringify(original.source_descriptor)) {
    patch.source_descriptor = mergedSource
  }
  const mergedTarget = mergeTargetForSave(state.target_known, state.target_unknown)
  if (JSON.stringify(mergedTarget) !== JSON.stringify(original.target_descriptor)) {
    patch.target_descriptor = mergedTarget
  }
  const deviceFromState = state.device_id || null
  if (deviceFromState !== (original.device_id ?? null)) {
    patch.device_id = deviceFromState
  }
  if (state.scope !== original.scope) patch.scope = state.scope
  const scopeIdFromState = state.scope_id || null
  if (scopeIdFromState !== (original.scope_id ?? null)) {
    patch.scope_id = scopeIdFromState
  }
  if (state.enabled !== original.enabled) patch.enabled = state.enabled
  const metaVal = validateJson(state.metadata_json)
  if (metaVal.ok && JSON.stringify(metaVal.value) !== JSON.stringify(original.metadata)) {
    patch.metadata = metaVal.value ?? {}
  }
  return patch
}

export function BindingEditDrawer({ bindingId, open, onClose }: BindingEditDrawerProps) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<FormState | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['midi-binding', bindingId],
    queryFn: () => midiBindingsApi.get(bindingId!),
    enabled: open && bindingId !== null,
    staleTime: 0,
  })

  // Reset form state when a new binding is loaded.
  useEffect(() => {
    if (query.data) {
      setState(stateFromBinding(query.data))
      setSubmitError(null)
    }
  }, [query.data])

  // Reset on close so reopening the drawer doesn't show stale state.
  useEffect(() => {
    if (!open) {
      setState(null)
      setSubmitError(null)
    }
  }, [open])

  const metadataJsonValidation = useMemo(
    () => (state ? validateJson(state.metadata_json) : { ok: true, error: null, value: null }),
    [state],
  )

  const allJsonValid = metadataJsonValidation.ok

  const updateMutation = useMutation({
    mutationFn: (patch: MidiBindingUpdate) => midiBindingsApi.update(bindingId!, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['midi-bindings-list'] })
      queryClient.invalidateQueries({ queryKey: ['midi-binding', bindingId] })
      queryClient.invalidateQueries({ queryKey: ['midi-services-bindings-count'] })
      onClose()
    },
    onError: (err) => setSubmitError((err as Error).message),
  })

  const handleSubmit = () => {
    if (!state || !query.data || !allJsonValid) return
    setSubmitError(null)
    const patch = patchFromState(state, query.data)
    updateMutation.mutate(patch)
  }

  return (
    <Modal
      open={open}
      modalHeading="Edit binding"
      modalLabel="Bindings"
      primaryButtonText="Save"
      secondaryButtonText="Cancel"
      primaryButtonDisabled={
        !state || !query.data || !allJsonValid || updateMutation.isPending
      }
      onRequestClose={onClose}
      onRequestSubmit={handleSubmit}
      size="lg"
    >
      {query.isLoading ? (
        <InlineLoading description="Loading binding…" />
      ) : query.isError ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Failed to load binding"
          subtitle={(query.error as Error).message}
        />
      ) : state && query.data ? (
        <div className="bindings-edit-drawer__body">
          <section className="bindings-edit-drawer__section">
            <h4>Identity</h4>
            <dl className="bindings-edit-drawer__readonly">
              <dt>Binding ID</dt>
              <dd><code>{query.data.binding_id}</code></dd>
              <dt>Consumer</dt>
              <dd>{query.data.consumer_type}:{query.data.consumer_id}</dd>
              <dt>Source type</dt>
              <dd>{query.data.source_type}</dd>
              <dt>Target type</dt>
              <dd>{query.data.target_type}</dd>
              <dt>Created</dt>
              <dd>{query.data.created_at} by {query.data.created_by}</dd>
              <dt>Modified</dt>
              <dd>{query.data.modified_at} by {query.data.modified_by}</dd>
            </dl>
          </section>

          <section className="bindings-edit-drawer__section">
            <h4>Editable fields</h4>

            <FormGroup legendText="Consumer label">
              <TextInput
                id="binding-edit-consumer-label"
                labelText=""
                value={state.consumer_label}
                onChange={(e) => setState({ ...state, consumer_label: e.target.value })}
              />
            </FormGroup>

            <FormGroup legendText="Device ID">
              <TextInput
                id="binding-edit-device-id"
                labelText=""
                value={state.device_id}
                onChange={(e) => setState({ ...state, device_id: e.target.value })}
              />
            </FormGroup>

            <FormGroup legendText="Scope">
              <Dropdown
                id="binding-edit-scope"
                titleText=""
                label="Pick a scope"
                items={[...BINDING_SCOPES]}
                selectedItem={state.scope}
                onChange={({ selectedItem }) =>
                  setState({ ...state, scope: (selectedItem ?? 'global') as BindingScope })
                }
              />
            </FormGroup>

            <FormGroup legendText="Scope ID">
              <TextInput
                id="binding-edit-scope-id"
                labelText=""
                value={state.scope_id}
                onChange={(e) => setState({ ...state, scope_id: e.target.value })}
              />
            </FormGroup>

            <FormGroup legendText="Enabled">
              <Toggle
                id="binding-edit-enabled"
                labelA="No"
                labelB="Yes"
                toggled={state.enabled}
                onToggle={(toggled) => setState({ ...state, enabled: toggled })}
              />
            </FormGroup>

          </section>

          <section className="bindings-edit-drawer__section">
            <h4>Source descriptor ({query.data.source_type})</h4>
            <SourceDescriptorEditor
              sourceType={query.data.source_type}
              value={state.source_known}
              onChange={(next) => setState({ ...state, source_known: next })}
              unknownExtras={state.source_unknown}
            />
          </section>

          <section className="bindings-edit-drawer__section">
            <h4>Target descriptor ({query.data.target_type})</h4>
            <TargetDescriptorEditor
              targetType={query.data.target_type}
              value={state.target_known}
              onChange={(next) => setState({ ...state, target_known: next })}
              unknownExtras={state.target_unknown}
            />
          </section>

          <section className="bindings-edit-drawer__section">
            <h4>Metadata + audit</h4>

            <FormGroup legendText="Metadata (JSON object)">
              <TextArea
                id="binding-edit-metadata"
                labelText=""
                rows={4}
                invalid={!metadataJsonValidation.ok}
                invalidText={metadataJsonValidation.error ?? ''}
                value={state.metadata_json}
                onChange={(e) => setState({ ...state, metadata_json: e.target.value })}
              />
            </FormGroup>

            <FormGroup legendText="Modified by">
              <TextInput
                id="binding-edit-modified-by"
                labelText=""
                value={state.modified_by}
                onChange={(e) => setState({ ...state, modified_by: e.target.value })}
              />
            </FormGroup>
          </section>

          {submitError ? (
            <InlineNotification
              kind="error"
              lowContrast
              onCloseButtonClick={() => setSubmitError(null)}
              title="Save failed"
              subtitle={submitError}
            />
          ) : null}
        </div>
      ) : null}
    </Modal>
  )
}

export default BindingEditDrawer
