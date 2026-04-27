// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// MidiLearnWizard — Carbon component for the operator MIDI-learn flow.
//
// First cut (T2459-D4):
//   1. Operator clicks "Start" — backend opens a learn session.
//   2. Operator wiggles a hardware control. The host pushes captured
//      MIDI bytes through learnCapture(); the wizard renders the live
//      classification (kind + confidence + status/midino).
//   3. Operator picks a MAP2 engine target / JS script / fast-path
//      flag, clicks "Assign".
//   4. The backend returns a YAML row ready to append to the pack's
//      MIDI profile. Persisting the row to the YAML file lands in
//      D4-followup; for now the row is shown in the UI for the
//      operator to copy-paste.
//
// Pattern reference: Mixxx dlgcontrollerlearning.{cpp,h,ui} (549 lines,
// GPLv2-or-later) — flow inspiration; rewritten under MAP2 license.
//
// Worklist: T2459-D4.

import React, { useCallback, useEffect, useState } from 'react'
import {
  Layer,
  Tag,
  Button,
  TextInput,
  Checkbox,
  InlineNotification,
  Loading,
  CodeSnippet,
} from '@carbon/react'
import { Play, Reset, Save, Stop } from '@carbon/icons-react'

import {
  learnAssign,
  learnCancel,
  learnCapture,
  learnStart,
  type LearnClassification,
} from '../../../../map2/clients/devices'

export interface MidiLearnWizardProps {
  packId: string
  model: string
  controllerKey: string
  /** When set, the wizard polls this generator for synthesized
   *  capture bytes — used by tests to drive the flow without a real
   *  MIDI source.
   */
  testCaptureSource?: () => number[][] | Promise<number[][]>
}

export function MidiLearnWizard({
  packId,
  model,
  controllerKey,
  testCaptureSource,
}: MidiLearnWizardProps): JSX.Element {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [classification, setClassification] = useState<LearnClassification | null>(null)
  const [target, setTarget] = useState('')
  const [script, setScript] = useState('')
  const [action, setAction] = useState('set')
  const [fastPath, setFastPath] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [assignedRow, setAssignedRow] = useState<Record<string, unknown> | null>(null)

  const handleStart = useCallback(async () => {
    setBusy(true)
    setError(null)
    setAssignedRow(null)
    try {
      const result = await learnStart({ pack_id: packId, model, controller_key: controllerKey })
      setSessionId(result.session_id)
      setClassification(null)

      // If a test capture source is provided, drive the wizard with it.
      if (testCaptureSource) {
        const burst = await testCaptureSource()
        for (const bytes of burst) {
          const c = await learnCapture({ session_id: result.session_id, bytes })
          setClassification(c)
        }
      }
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc))
    } finally {
      setBusy(false)
    }
  }, [packId, model, controllerKey, testCaptureSource])

  const handleCancel = useCallback(async () => {
    if (sessionId == null) return
    await learnCancel(sessionId).catch(() => {})
    setSessionId(null)
    setClassification(null)
  }, [sessionId])

  const handleAssign = useCallback(async () => {
    if (sessionId == null) return
    setBusy(true)
    setError(null)
    try {
      const result = await learnAssign({
        session_id: sessionId,
        target: target || undefined,
        script: script || undefined,
        action: action || undefined,
        fast_path: fastPath,
      })
      setAssignedRow(result.row)
      setSessionId(null)
      setClassification(null)
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc))
    } finally {
      setBusy(false)
    }
  }, [sessionId, target, script, action, fastPath])

  // Cleanup an in-flight session on unmount so we don't leak stale
  // sessions on the backend. Wrap defensively so mock implementations
  // that return non-promises (or don't return at all) don't throw
  // inside the React commit phase.
  useEffect(() => {
    return () => {
      if (sessionId != null) {
        try {
          const r = learnCancel(sessionId) as unknown
          if (r && typeof (r as Promise<unknown>).catch === 'function') {
            ;(r as Promise<unknown>).catch(() => {})
          }
        } catch {
          /* swallow — best-effort cleanup */
        }
      }
    }
  }, [sessionId])

  return (
    <Layer level={0} data-testid="midi-learn-wizard">
      <div style={{ padding: '1rem' }}>
        <h3>MIDI Learn Wizard</h3>
        <p style={{ fontSize: '0.875rem' }}>
          Start a session, wiggle a hardware control, and the wizard will
          classify it (button / absolute knob / relative encoder / 14-bit
          encoder / pitch bend / unknown) live. When you're happy with the
          classification, set the engine target and click Assign — the
          wizard returns a YAML row ready to drop into the pack's MIDI
          profile.
        </p>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          {sessionId == null ? (
            <Button
              kind="primary"
              renderIcon={Play}
              onClick={handleStart}
              disabled={busy}
            >
              Start learn session
            </Button>
          ) : (
            <>
              <Button kind="danger--ghost" renderIcon={Stop} onClick={handleCancel}>
                Cancel
              </Button>
              <Button kind="primary" renderIcon={Save} onClick={handleAssign} disabled={busy || classification == null}>
                Assign binding
              </Button>
            </>
          )}
        </div>

        {busy && <Loading description="Working..." withOverlay={false} />}

        {error && (
          <InlineNotification
            kind="error"
            title="Learn wizard error"
            subtitle={error}
            hideCloseButton
          />
        )}

        {classification != null && (
          <div data-testid="learn-classification" style={{ marginBottom: '1rem' }}>
            <h4>Live classification</h4>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              <Tag type="cool-gray">{classification.kind}</Tag>
              <Tag type={classification.confidence >= 0.7 ? 'green' : 'warm-gray'}>
                {(classification.confidence * 100).toFixed(0)}% confidence
              </Tag>
              {classification.status != null && (
                <Tag type="purple">
                  status 0x{classification.status.toString(16).toUpperCase().padStart(2, '0')}
                </Tag>
              )}
              {classification.midino != null && (
                <Tag type="purple">midino {classification.midino}</Tag>
              )}
              {classification.channel != null && (
                <Tag type="cool-gray">ch {classification.channel}</Tag>
              )}
            </div>
            {classification.notes && (
              <p style={{ fontSize: '0.875rem', fontStyle: 'italic' }}>{classification.notes}</p>
            )}
          </div>
        )}

        {sessionId != null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            <TextInput
              id="learn-target"
              labelText="Engine target (e.g. audio.chain.1.volume)"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <TextInput
              id="learn-script"
              labelText="JS script (e.g. UA1000Mapping.masterVolume)"
              value={script}
              onChange={(e) => setScript(e.target.value)}
            />
            <TextInput
              id="learn-action"
              labelText="Action (set / toggle / increment / momentary)"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
            <Checkbox
              id="learn-fast-path"
              labelText="Fast-path C++ binding (sub-millisecond response, no JS)"
              checked={fastPath}
              onChange={(_e, { checked }) => setFastPath(!!checked)}
            />
          </div>
        )}

        {assignedRow != null && (
          <div data-testid="learn-assigned-row">
            <h4>Assigned binding row</h4>
            <p style={{ fontSize: '0.875rem' }}>
              Append this row to{' '}
              <code>device-packs/{packId}/profiles/{model}.midi.yaml</code> under{' '}
              <code>controls:</code>.
            </p>
            <CodeSnippet type="multi">
              {Object.entries(assignedRow)
                .map(([k, v]) => `  ${k}: ${typeof v === 'string' ? `'${v}'` : v}`)
                .join('\n')}
            </CodeSnippet>
          </div>
        )}
      </div>
    </Layer>
  )
}
