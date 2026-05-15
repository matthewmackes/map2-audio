import { Button, InlineNotification, Select, SelectItem, Tag, TextArea, Tile } from '@carbon/react'
import { useMemo, useState } from 'react'

import {
  STARTER_PROFILES,
  validateProfile,
  type MaschineProfile,
} from './profileDsl'

// T2522-B cycle 12 — Profile Workbench tab v1.
//
// Operator-facing editor for the T700 profile DSL. Cycle 12 ships:
//
//   • Profile selector with the 3 starter profiles registered in
//     `profileDsl.ts` (T1 CTRL, T5 SNAP, T11 TUNER). The full
//     25-profile T700 catalog lands by cycle 14.
//
//   • A read-only DSL inspector showing the active profile's
//     metadata (id, label, name, description) + a JSON view of
//     the full DSL document so operators can see exactly what
//     each profile encodes.
//
//   • A JSON editor (TextArea) for prototyping new profile
//     variants. Operator pastes a JSON document; the editor
//     validates against `validateProfile()` and surfaces any
//     schema error inline. Validated profiles persist to
//     localStorage (`map2_maschine_profile_drafts`) until the
//     backend `profile_registry` ships in a follow-on cycle.
//
//   • A live LCD render preview placeholder. Cycle 13 wires the
//     real layout engine that paints the dual 255×64 LCDs with
//     the profile DSL output; for now the preview shows the
//     template name + canvas dimensions for verification.

const DRAFT_KEY = 'map2_maschine_profile_drafts'

interface ProfileDraft {
  id: string
  json: string
  saved_at: number
}

function loadDrafts(): ProfileDraft[] {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

function saveDrafts(drafts: ProfileDraft[]): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts))
  } catch {
    /* swallow quota errors; the draft just won't persist this session */
  }
}

export function MaschineProfileWorkbench() {
  const profiles = STARTER_PROFILES
  const [selectedId, setSelectedId] = useState<string>(profiles[0]?.id ?? 'T1')
  const [draftJson, setDraftJson] = useState<string>(() => JSON.stringify(profiles[0], null, 2))
  const [validationError, setValidationError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<ProfileDraft[]>(() => loadDrafts())

  const selectedProfile: MaschineProfile | null = useMemo(
    () => profiles.find((p) => p.id === selectedId) ?? null,
    [profiles, selectedId],
  )

  const handleSelectProfile = (id: string) => {
    setSelectedId(id)
    const next = profiles.find((p) => p.id === id)
    if (next) {
      setDraftJson(JSON.stringify(next, null, 2))
      setValidationError(null)
    }
  }

  const handleValidate = () => {
    try {
      const parsed = JSON.parse(draftJson)
      validateProfile(parsed)
      setValidationError(null)
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleSaveDraft = () => {
    try {
      const parsed = JSON.parse(draftJson)
      validateProfile(parsed)
      const next: ProfileDraft = {
        id: parsed.id,
        json: draftJson,
        saved_at: Date.now(),
      }
      const updated = [...drafts.filter((d) => d.id !== parsed.id), next]
      setDrafts(updated)
      saveDrafts(updated)
      setValidationError(null)
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleDeleteDraft = (id: string) => {
    const updated = drafts.filter((d) => d.id !== id)
    setDrafts(updated)
    saveDrafts(updated)
  }

  return (
    <div className="maschine-workbench">
      <Tile className="maschine-workbench__header">
        <div>
          <h3>Profile Workbench</h3>
          <p className="maschine-mapping__sub">
            Edit the T700 profile DSL — the schema that drives every MK1 LCD layout, pad LED palette,
            and encoder assignment per profile. Cycle 12 ships 3 starter profiles (T1 CTRL, T5 SNAP, T11
            TUNER) and the validation framework. Live LCD render preview lands in cycle 13; the full
            25-profile catalog in cycle 14.
          </p>
        </div>
        <div className="maschine-mapping__header-actions">
          <Tag size="md" type="cyan">{profiles.length} starter profiles</Tag>
          {drafts.length > 0 ? (
            <Tag size="md" type="purple">{drafts.length} draft{drafts.length === 1 ? '' : 's'}</Tag>
          ) : null}
        </div>
      </Tile>

      <div className="maschine-workbench__body">
        <Tile className="maschine-workbench__inspector">
          <div className="maschine-workbench__inspector-head">
            <Select
              id="workbench-profile"
              labelText="Active profile"
              size="sm"
              value={selectedId}
              onChange={(e) => handleSelectProfile(e.target.value)}
            >
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id} text={`${p.id} — ${p.label} (${p.name})`} />
              ))}
            </Select>
          </div>

          {selectedProfile ? (
            <>
              <dl className="maschine-workbench__meta">
                <div>
                  <dt>ID</dt>
                  <dd>{selectedProfile.id}</dd>
                </div>
                <div>
                  <dt>Label</dt>
                  <dd>{selectedProfile.label}</dd>
                </div>
                <div>
                  <dt>Name</dt>
                  <dd>{selectedProfile.name}</dd>
                </div>
                <div>
                  <dt>LCD templates</dt>
                  <dd>
                    L: {selectedProfile.lcd_left.template} · R: {selectedProfile.lcd_right.template}
                  </dd>
                </div>
                <div>
                  <dt>Encoder bindings</dt>
                  <dd>{selectedProfile.encoders.length} of 11</dd>
                </div>
              </dl>
              <p className="maschine-workbench__description">{selectedProfile.description}</p>
            </>
          ) : null}

          <div className="maschine-workbench__preview">
            <h4 className="maschine-mapping__pane-title">LCD render preview</h4>
            <p className="maschine-mapping__sub" style={{ marginTop: '0.25rem' }}>
              Cycle 13 wires the live JSON+flexbox layout engine + dual-LCD canvas render here. For now
              the preview surfaces the template + block summary so the DSL shape is verifiable end-to-end.
            </p>
            {selectedProfile ? (
              <div className="maschine-workbench__preview-grid">
                {(['lcd_left', 'lcd_right'] as const).map((side) => {
                  const spec = selectedProfile[side]
                  return (
                    <div key={side} className="maschine-workbench__lcd-card">
                      <div className="maschine-workbench__lcd-card-head">
                        <Tag size="sm" type="cyan">{side === 'lcd_left' ? 'Left LCD' : 'Right LCD'}</Tag>
                        <Tag size="sm" type="cool-gray">{spec.template}</Tag>
                      </div>
                      <div className="maschine-workbench__lcd-card-body">
                        {spec.blocks.top?.text ? (
                          <div className="maschine-workbench__lcd-band maschine-workbench__lcd-band--top">{spec.blocks.top.text}</div>
                        ) : null}
                        <div className="maschine-workbench__lcd-band maschine-workbench__lcd-band--canvas">
                          {spec.blocks.canvas.kind} · {JSON.stringify(spec.blocks.canvas.data ?? {})}
                        </div>
                        {spec.blocks.bottom?.text ? (
                          <div className="maschine-workbench__lcd-band maschine-workbench__lcd-band--bottom">{spec.blocks.bottom.text}</div>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        </Tile>

        <Tile className="maschine-workbench__editor">
          <div className="maschine-workbench__editor-head">
            <h4 className="maschine-mapping__pane-title">DSL JSON editor</h4>
            <div className="maschine-workbench__editor-actions">
              <Button kind="ghost" size="sm" onClick={handleValidate}>Validate</Button>
              <Button kind="primary" size="sm" onClick={handleSaveDraft}>Save draft</Button>
            </div>
          </div>
          <TextArea
            id="workbench-dsl-json"
            labelText=""
            hideLabel
            rows={20}
            value={draftJson}
            onChange={(e) => {
              setDraftJson(e.target.value)
              setValidationError(null)
            }}
          />
          {validationError ? (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title="Profile validation failed"
              subtitle={validationError}
            />
          ) : null}

          {drafts.length > 0 ? (
            <div className="maschine-workbench__drafts">
              <h5 className="maschine-workbench__drafts-title">Saved drafts (localStorage)</h5>
              <ul className="maschine-workbench__drafts-list">
                {drafts.map((d) => (
                  <li key={d.id} className="maschine-workbench__draft-row">
                    <Tag size="sm" type="purple">{d.id}</Tag>
                    <span className="maschine-workbench__draft-time">
                      saved {new Date(d.saved_at).toLocaleTimeString()}
                    </span>
                    <Button
                      kind="ghost"
                      size="sm"
                      onClick={() => {
                        setDraftJson(d.json)
                        setValidationError(null)
                      }}
                    >
                      Load
                    </Button>
                    <Button
                      kind="danger--ghost"
                      size="sm"
                      onClick={() => handleDeleteDraft(d.id)}
                    >
                      Delete
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Tile>
      </div>
    </div>
  )
}
