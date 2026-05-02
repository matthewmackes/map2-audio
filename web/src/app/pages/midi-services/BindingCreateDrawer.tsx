/**
 * T2482 loop 11 / iter 106 — BindingCreateDrawer.
 * T2482 loop 12 / iter 116 — replaced raw source/target JSON
 *   textareas with the iter-113/114 structured editors. When the
 *   operator picks a source_type or target_type, the descriptor
 *   slot resets to defaultDescriptorFor / defaultTargetDescriptorFor.
 *   Metadata stays JSON.
 *
 * Sister to BindingEditDrawer (iter 105). Same Carbon Modal shape,
 * but every field is editable and the required-on-create vocabulary
 * fields (consumer_type, source_type, target_type) are dropdowns.
 */

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dropdown,
  FormGroup,
  InlineNotification,
  Modal,
  TextArea,
  TextInput,
  Toggle,
} from '@carbon/react'

import {
  midiBindingsApi,
  BINDING_CONSUMER_TYPES,
  BINDING_SCOPES,
  BINDING_SOURCE_TYPES,
  BINDING_TARGET_TYPES,
  type BindingConsumerType,
  type BindingScope,
  type BindingSourceType,
  type BindingTargetType,
  type MidiBindingCreate,
} from '../../../map2/clients/midiBindings'
import { SourceDescriptorEditor } from './SourceDescriptorEditor'
import { TargetDescriptorEditor } from './TargetDescriptorEditor'
import { defaultDescriptorFor } from './sourceDescriptors'
import { defaultTargetDescriptorFor } from './targetDescriptors'
import './BindingEditDrawer.css'  // share the styles — same field shape

interface BindingCreateDrawerProps {
  open: boolean
  onClose: () => void
}

interface FormState {
  consumer_type: BindingConsumerType | ''
  consumer_id: string
  consumer_label: string
  source_type: BindingSourceType | ''
  source_descriptor: Record<string, unknown>
  target_type: BindingTargetType | ''
  target_descriptor: Record<string, unknown>
  device_id: string
  scope: BindingScope
  scope_id: string
  enabled: boolean
  metadata_json: string
  source: string
  created_by: string
}

const EMPTY_FORM: FormState = {
  consumer_type: '',
  consumer_id: '',
  consumer_label: '',
  source_type: '',
  source_descriptor: {},
  target_type: '',
  target_descriptor: {},
  device_id: '',
  scope: 'global',
  scope_id: '',
  enabled: true,
  metadata_json: '{}',
  source: 'manual',
  created_by: 'web-ui',
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

function payloadFromState(state: FormState): MidiBindingCreate | null {
  if (state.consumer_type === '' || state.source_type === '' || state.target_type === '') {
    return null
  }
  if (state.consumer_id.trim() === '') return null
  const meta = validateJson(state.metadata_json)
  if (!meta.ok) return null
  return {
    consumer_type: state.consumer_type,
    consumer_id: state.consumer_id.trim(),
    consumer_label: state.consumer_label,
    source_type: state.source_type,
    source_descriptor: state.source_descriptor,
    target_type: state.target_type,
    target_descriptor: state.target_descriptor,
    device_id: state.device_id || null,
    scope: state.scope,
    scope_id: state.scope_id || null,
    enabled: state.enabled,
    source: state.source || 'manual',
    metadata: meta.value ?? {},
    created_by: state.created_by || 'web-ui',
  }
}

export function BindingCreateDrawer({ open, onClose }: BindingCreateDrawerProps) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<FormState>(EMPTY_FORM)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Reset on open so each invocation starts clean.
  useEffect(() => {
    if (open) {
      setState(EMPTY_FORM)
      setSubmitError(null)
    }
  }, [open])

  const metadataJsonValidation = useMemo(() => validateJson(state.metadata_json), [state.metadata_json])

  const payload = useMemo(() => payloadFromState(state), [state])

  const createMutation = useMutation({
    mutationFn: (p: MidiBindingCreate) => midiBindingsApi.create(p),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['midi-bindings-list'] })
      queryClient.invalidateQueries({ queryKey: ['midi-services-bindings-count'] })
      onClose()
    },
    onError: (err) => setSubmitError((err as Error).message),
  })

  const handleSubmit = () => {
    if (!payload) return
    setSubmitError(null)
    createMutation.mutate(payload)
  }

  return (
    <Modal
      open={open}
      modalHeading="Create binding"
      modalLabel="Bindings"
      primaryButtonText="Create"
      secondaryButtonText="Cancel"
      primaryButtonDisabled={!payload || createMutation.isPending}
      onRequestClose={onClose}
      onRequestSubmit={handleSubmit}
      size="lg"
    >
      <div className="bindings-edit-drawer__body">
        <section className="bindings-edit-drawer__section">
          <h4>Consumer</h4>

          <FormGroup legendText="Consumer type (required)">
            <Dropdown
              id="binding-create-consumer-type"
              titleText=""
              label="Pick a consumer type"
              items={[...BINDING_CONSUMER_TYPES]}
              selectedItem={state.consumer_type || undefined}
              onChange={({ selectedItem }) =>
                setState({ ...state, consumer_type: (selectedItem ?? '') as BindingConsumerType | '' })
              }
            />
          </FormGroup>

          <FormGroup legendText="Consumer ID (required)">
            <TextInput
              id="binding-create-consumer-id"
              labelText=""
              value={state.consumer_id}
              onChange={(e) => setState({ ...state, consumer_id: e.target.value })}
            />
          </FormGroup>

          <FormGroup legendText="Consumer label">
            <TextInput
              id="binding-create-consumer-label"
              labelText=""
              value={state.consumer_label}
              onChange={(e) => setState({ ...state, consumer_label: e.target.value })}
            />
          </FormGroup>
        </section>

        <section className="bindings-edit-drawer__section">
          <h4>Source</h4>

          <FormGroup legendText="Source type (required)">
            <Dropdown
              id="binding-create-source-type"
              titleText=""
              label="Pick a source type"
              items={[...BINDING_SOURCE_TYPES]}
              selectedItem={state.source_type || undefined}
              onChange={({ selectedItem }) => {
                const nextType = (selectedItem ?? '') as BindingSourceType | ''
                setState({
                  ...state,
                  source_type: nextType,
                  source_descriptor: nextType ? defaultDescriptorFor(nextType) : {},
                })
              }}
            />
          </FormGroup>

          {state.source_type ? (
            <SourceDescriptorEditor
              sourceType={state.source_type}
              value={state.source_descriptor}
              onChange={(next) => setState({ ...state, source_descriptor: next })}
            />
          ) : (
            <p className="midi-services-bindings__empty-row">
              Pick a source type above to author the descriptor.
            </p>
          )}
        </section>

        <section className="bindings-edit-drawer__section">
          <h4>Target</h4>

          <FormGroup legendText="Target type (required)">
            <Dropdown
              id="binding-create-target-type"
              titleText=""
              label="Pick a target type"
              items={[...BINDING_TARGET_TYPES]}
              selectedItem={state.target_type || undefined}
              onChange={({ selectedItem }) => {
                const nextType = (selectedItem ?? '') as BindingTargetType | ''
                setState({
                  ...state,
                  target_type: nextType,
                  target_descriptor: nextType ? defaultTargetDescriptorFor(nextType) : {},
                })
              }}
            />
          </FormGroup>

          {state.target_type ? (
            <TargetDescriptorEditor
              targetType={state.target_type}
              value={state.target_descriptor}
              onChange={(next) => setState({ ...state, target_descriptor: next })}
            />
          ) : (
            <p className="midi-services-bindings__empty-row">
              Pick a target type above to author the descriptor.
            </p>
          )}
        </section>

        <section className="bindings-edit-drawer__section">
          <h4>Scope + flags</h4>

          <FormGroup legendText="Device ID">
            <TextInput
              id="binding-create-device-id"
              labelText=""
              value={state.device_id}
              onChange={(e) => setState({ ...state, device_id: e.target.value })}
            />
          </FormGroup>

          <FormGroup legendText="Scope">
            <Dropdown
              id="binding-create-scope"
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
              id="binding-create-scope-id"
              labelText=""
              value={state.scope_id}
              onChange={(e) => setState({ ...state, scope_id: e.target.value })}
            />
          </FormGroup>

          <FormGroup legendText="Enabled">
            <Toggle
              id="binding-create-enabled"
              labelA="No"
              labelB="Yes"
              toggled={state.enabled}
              onToggle={(toggled) => setState({ ...state, enabled: toggled })}
            />
          </FormGroup>

          <FormGroup legendText="Metadata (JSON object)">
            <TextArea
              id="binding-create-metadata"
              labelText=""
              rows={4}
              invalid={!metadataJsonValidation.ok}
              invalidText={metadataJsonValidation.error ?? ''}
              value={state.metadata_json}
              onChange={(e) => setState({ ...state, metadata_json: e.target.value })}
            />
          </FormGroup>

          <FormGroup legendText="Source string">
            <TextInput
              id="binding-create-source"
              labelText=""
              value={state.source}
              onChange={(e) => setState({ ...state, source: e.target.value })}
            />
          </FormGroup>

          <FormGroup legendText="Created by">
            <TextInput
              id="binding-create-created-by"
              labelText=""
              value={state.created_by}
              onChange={(e) => setState({ ...state, created_by: e.target.value })}
            />
          </FormGroup>
        </section>

        {submitError ? (
          <InlineNotification
            kind="error"
            lowContrast
            onCloseButtonClick={() => setSubmitError(null)}
            title="Create failed"
            subtitle={submitError}
          />
        ) : null}
      </div>
    </Modal>
  )
}

export default BindingCreateDrawer
