// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// BindingsTab — T2459-G7. Q13 (live save + 8s Undo) + Q16 (Learn
// Wizard route entry).
//
// Operator edits MIDI/HID controls in a Carbon DataTable-style grid;
// Save POSTs the new payload to /api/devices/profiles/{...}/bindings,
// the response carries an undo_token that we surface as the existing
// useUndoToast 8-second toast (matches Pin/Unpin + MPX1 A/B compare
// patterns).

import * as React from 'react'
import {
  Button,
  InlineNotification,
  StructuredListWrapper,
  StructuredListBody,
  StructuredListRow,
  StructuredListCell,
  TextInput,
  Tag,
} from '@carbon/react'
import { useNavigate } from 'react-router-dom'

import {
  postBindings,
  undoBindings,
  type DeviceProfileDetail,
  type BindingControlRow,
} from '../../../../../map2/clients/devices'
import { useUndoToast } from '../../hooks/useUndoToast'
import { useToasts } from '../../../Toasts'

import './BindingsTab.css'

export interface BindingsTabProps {
  profile: DeviceProfileDetail
}

function readControls(doc: Record<string, unknown>): BindingControlRow[] {
  const raw = doc.controls
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map((r) => ({ ...r }))
}

function readOutputs(doc: Record<string, unknown>): BindingControlRow[] {
  const raw = doc.outputs
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map((r) => ({ ...r }))
}

function fmtField(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

interface EditableRowProps {
  row: BindingControlRow
  index: number
  onChange: (field: keyof BindingControlRow, value: string) => void
  onRemove: () => void
  readonly?: boolean
}

function EditableRow({ row, index, onChange, onRemove, readonly }: EditableRowProps): React.JSX.Element {
  return (
    <StructuredListRow>
      <StructuredListCell>
        <TextInput
          id={`binding-status-${index}`}
          labelText=""
          hideLabel
          size="sm"
          value={fmtField(row.status)}
          readOnly={readonly}
          onChange={(e) => onChange('status', e.target.value)}
        />
      </StructuredListCell>
      <StructuredListCell>
        <TextInput
          id={`binding-midino-${index}`}
          labelText=""
          hideLabel
          size="sm"
          value={fmtField(row.midino)}
          readOnly={readonly}
          onChange={(e) => onChange('midino', e.target.value)}
        />
      </StructuredListCell>
      <StructuredListCell>
        <TextInput
          id={`binding-target-${index}`}
          labelText=""
          hideLabel
          size="sm"
          value={fmtField(row.target)}
          readOnly={readonly}
          onChange={(e) => onChange('target', e.target.value)}
        />
      </StructuredListCell>
      <StructuredListCell>
        <TextInput
          id={`binding-action-${index}`}
          labelText=""
          hideLabel
          size="sm"
          value={fmtField(row.action ?? row.script)}
          readOnly={readonly}
          onChange={(e) => onChange(row.script ? 'script' : 'action', e.target.value)}
        />
      </StructuredListCell>
      <StructuredListCell>
        {readonly ? null : (
          <Button kind="danger--ghost" size="sm" onClick={onRemove}>
            Remove
          </Button>
        )}
      </StructuredListCell>
    </StructuredListRow>
  )
}

function parseField(name: keyof BindingControlRow, value: string): unknown {
  if (value === '') return undefined
  if (name === 'status' || name === 'midino' || name === 'channel') {
    if (/^0x/i.test(value.trim())) {
      const n = parseInt(value, 16)
      return Number.isNaN(n) ? value : n
    }
    const n = Number(value)
    return Number.isFinite(n) ? n : value
  }
  return value
}

export function BindingsTab({ profile }: BindingsTabProps): React.JSX.Element {
  const navigate = useNavigate()
  const { showUndo } = useUndoToast()
  const { pushToast } = useToasts()

  const initialControls = React.useMemo(() => readControls(profile.document), [profile.document])
  const initialOutputs = React.useMemo(() => readOutputs(profile.document), [profile.document])
  const [controls, setControls] = React.useState<BindingControlRow[]>(initialControls)
  const [outputs] = React.useState<BindingControlRow[]>(initialOutputs)
  const [isSaving, setIsSaving] = React.useState(false)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)
  const [savedRevision, setSavedRevision] = React.useState<string | null>(null)

  const dirty = React.useMemo(() => {
    if (controls.length !== initialControls.length) return true
    return JSON.stringify(controls) !== JSON.stringify(initialControls)
  }, [controls, initialControls])

  const onCellChange = React.useCallback(
    (index: number, field: keyof BindingControlRow, value: string) => {
      setControls((prev) => {
        const next = prev.slice()
        next[index] = { ...next[index], [field]: parseField(field, value) }
        // Drop undefined keys so the YAML write stays clean.
        if (next[index][field] === undefined) {
          delete next[index][field]
        }
        return next
      })
    },
    [],
  )

  const onRemoveRow = React.useCallback((index: number) => {
    setControls((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const onAddRow = React.useCallback(() => {
    setControls((prev) => [
      ...prev,
      { status: 0xB0, midino: 0, channel: 1, target: '', action: 'set' },
    ])
  }, [])

  const onSave = React.useCallback(async () => {
    if (profile.kind !== 'midi' && profile.kind !== 'hid') return
    setIsSaving(true)
    setErrorMsg(null)
    try {
      const result = await postBindings(profile.pack_id, profile.model, profile.kind, {
        controls,
      })
      setSavedRevision(result.revision)
      showUndo({
        message: `Saved bindings for ${profile.model}.`,
        onUndo: async () => {
          try {
            await undoBindings(profile.pack_id, profile.model, profile.kind as 'midi' | 'hid', result.undo_token)
            // Roll local UI back to the original state.
            setControls(initialControls)
            pushToast(`Reverted bindings for ${profile.model}.`, 'info', { durationMs: 4000 })
          } catch (err) {
            pushToast(
              `Undo failed: ${(err as Error).message ?? 'unknown error'}`,
              'error',
              { durationMs: 6000 },
            )
          }
        },
      })
    } catch (err) {
      const msg = (err as Error).message ?? 'Save failed.'
      setErrorMsg(msg)
      pushToast(`Could not save bindings: ${msg}`, 'error', { durationMs: 6000 })
    } finally {
      setIsSaving(false)
    }
  }, [
    profile.kind, profile.pack_id, profile.model, profile.model,
    controls, initialControls, showUndo, pushToast,
  ])

  if (profile.kind !== 'midi' && profile.kind !== 'hid') {
    return (
      <div className="bindings-tab">
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title="No bindings on audio profiles"
          subtitle="MIDI/HID bindings live on midi/hid profiles. Switch kind via the Hardware Store catalogue."
        />
      </div>
    )
  }

  return (
    <div className="bindings-tab">
      <header className="bindings-tab__head">
        <Button
          kind="primary"
          onClick={() =>
            navigate(
              `/devices/profile/${encodeURIComponent(profile.pack_id)}/${encodeURIComponent(profile.model)}/learn`,
            )
          }
        >
          Open Learn Wizard
        </Button>
        <Button kind="tertiary" onClick={onAddRow}>Add row</Button>
        <Button
          kind="primary"
          onClick={onSave}
          disabled={!dirty || isSaving}
        >
          {isSaving ? 'Saving…' : 'Save bindings'}
        </Button>
        {savedRevision ? (
          <Tag size="sm" type="green">Revision {savedRevision.slice(0, 8)}</Tag>
        ) : null}
        {dirty && !isSaving ? <Tag size="sm" type="warm-gray">Unsaved changes</Tag> : null}
      </header>

      {errorMsg ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Could not save bindings"
          subtitle={errorMsg}
        />
      ) : null}

      <section className="bindings-tab__section">
        <h3>Controls ({controls.length})</h3>
        <StructuredListWrapper aria-label="Bindings — controls">
          <StructuredListBody>
            <StructuredListRow head>
              <StructuredListCell head>Status</StructuredListCell>
              <StructuredListCell head>CC / midino</StructuredListCell>
              <StructuredListCell head>Target</StructuredListCell>
              <StructuredListCell head>Action / Script</StructuredListCell>
              <StructuredListCell head>{/* remove */}</StructuredListCell>
            </StructuredListRow>
            {controls.length === 0 ? (
              <StructuredListRow>
                <StructuredListCell>—</StructuredListCell>
                <StructuredListCell>—</StructuredListCell>
                <StructuredListCell>(empty — Add row, or run the Learn Wizard)</StructuredListCell>
                <StructuredListCell>—</StructuredListCell>
                <StructuredListCell>—</StructuredListCell>
              </StructuredListRow>
            ) : (
              controls.map((row, i) => (
                <EditableRow
                  key={`ctrl-${i}`}
                  row={row}
                  index={i}
                  onChange={(field, value) => onCellChange(i, field, value)}
                  onRemove={() => onRemoveRow(i)}
                />
              ))
            )}
          </StructuredListBody>
        </StructuredListWrapper>
      </section>

      {outputs.length > 0 ? (
        <section className="bindings-tab__section">
          <h3>Outputs ({outputs.length})</h3>
          <p className="bindings-tab__readonly-note">
            Output rows are read-only in this build. Edit them via the
            Learn Wizard or directly in the YAML.
          </p>
          <StructuredListWrapper aria-label="Bindings — outputs">
            <StructuredListBody>
              <StructuredListRow head>
                <StructuredListCell head>Status</StructuredListCell>
                <StructuredListCell head>CC / midino</StructuredListCell>
                <StructuredListCell head>Target</StructuredListCell>
                <StructuredListCell head>Action</StructuredListCell>
                <StructuredListCell head />
              </StructuredListRow>
              {outputs.map((row, i) => (
                <EditableRow
                  key={`out-${i}`}
                  row={row}
                  index={i + controls.length}
                  onChange={() => undefined}
                  onRemove={() => undefined}
                  readonly
                />
              ))}
            </StructuredListBody>
          </StructuredListWrapper>
        </section>
      ) : null}
    </div>
  )
}
