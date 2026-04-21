import { useEffect, useState, useCallback } from 'react'
import { Button, InlineNotification, TextInput, TextArea } from '@carbon/react'
import { Reset, Save } from '@carbon/icons-react'

import { useBranding } from '../../branding/BrandingContext'
import {
  applyBrandOs,
  fetchBrandOsStatus,
  type BrandManifest,
  type BrandPalette,
  type BrandCopy,
  type BrandOsStatus,
  type ApplyOsResult,
} from '../../branding/brandingApi'
import './BrandingTab.css'

type IdentityDraft = {
  productName: string
  shortName: string
  tagline: string
  vendor: string
  homepage: string
}

function identityFromBrand(b: BrandManifest): IdentityDraft {
  return {
    productName: b.productName ?? '',
    shortName: b.shortName ?? '',
    tagline: b.tagline ?? '',
    vendor: b.vendor ?? '',
    homepage: b.homepage ?? '',
  }
}

const PALETTE_SLOTS: Array<{ key: keyof BrandPalette; label: string; description: string }> = [
  { key: 'primary', label: 'Primary', description: 'Brand accent for links, primary actions, brand marks.' },
  { key: 'primarySoft', label: 'Primary (soft)', description: 'Secondary tone for subtle highlights.' },
  { key: 'onPrimary', label: 'On primary', description: 'Foreground over primary.' },
  { key: 'background', label: 'Background', description: 'Deepest shell background.' },
  { key: 'surface', label: 'Surface', description: 'Card / panel surface tone.' },
  { key: 'accent', label: 'Accent', description: 'Secondary accent for decorative elements.' },
]

const COPY_SLOTS: Array<{ key: keyof BrandCopy; label: string; description: string; multiline?: boolean }> = [
  { key: 'welcomeHeadline', label: 'Welcome headline', description: 'Shown on login / welcome screens.' },
  { key: 'welcomeSubline', label: 'Welcome subline', description: 'Secondary welcome text.' },
  { key: 'loginBanner', label: 'Login banner', description: 'Terminal banner (supports {hostname}).', multiline: true },
  { key: 'systemdPrefix', label: 'Systemd prefix', description: 'Prefix applied to systemd Description lines.' },
]

export function BrandingTab() {
  const { brand, loading, error, patch, reset } = useBranding()
  const [identity, setIdentity] = useState<IdentityDraft>(() => identityFromBrand(brand))
  const [palette, setPalette] = useState<BrandPalette>(() => ({ ...(brand.palette ?? {}) }))
  const [copy, setCopy] = useState<BrandCopy>(() => ({ ...(brand.copy ?? {}) }))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedNotice, setSavedNotice] = useState<string | null>(null)
  const [osStatus, setOsStatus] = useState<BrandOsStatus | null>(null)
  const [osStatusError, setOsStatusError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<ApplyOsResult | null>(null)

  const refreshOsStatus = useCallback(async () => {
    setOsStatusError(null)
    try {
      setOsStatus(await fetchBrandOsStatus())
    } catch (err) {
      setOsStatusError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void refreshOsStatus()
  }, [refreshOsStatus])

  const handleApplyOs = useCallback(
    async (dryRun: boolean) => {
      setApplying(true)
      setApplyResult(null)
      setSaveError(null)
      try {
        const result = await applyBrandOs({ dryRun, applyTemplates: true, applySystemd: true })
        setApplyResult(result)
        await refreshOsStatus()
        setSavedNotice(dryRun ? 'OS branding dry-run complete.' : 'OS branding applied.')
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : String(err))
      } finally {
        setApplying(false)
      }
    },
    [refreshOsStatus],
  )

  useEffect(() => {
    setIdentity(identityFromBrand(brand))
    setPalette({ ...(brand.palette ?? {}) })
    setCopy({ ...(brand.copy ?? {}) })
  }, [brand])

  const handleSaveIdentity = useCallback(async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await patch({
        productName: identity.productName.trim(),
        shortName: identity.shortName.trim(),
        tagline: identity.tagline.trim(),
        vendor: identity.vendor.trim() || undefined,
        homepage: identity.homepage.trim() || undefined,
      })
      setSavedNotice('Identity saved.')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [identity, patch])

  const handleSavePalette = useCallback(async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await patch({ palette })
      setSavedNotice('Palette saved.')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [palette, patch])

  const handleSaveCopy = useCallback(async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await patch({ copy })
      setSavedNotice('Copy saved.')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [copy, patch])

  const handleResetAll = useCallback(async () => {
    if (!window.confirm('Reset all branding to the on-disk manifest defaults? This clears any runtime overrides.')) {
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await reset()
      setSavedNotice('Branding reset to factory manifest.')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [reset])

  return (
    <section
      id="theme-branding-panel"
      aria-labelledby="theme-branding-tab"
      role="tabpanel"
      className="branding-tab"
    >
      <header className="branding-tab__header">
        <div>
          <h2>Branding</h2>
          <p className="branding-tab__lede">
            Single source of truth for the platform brand. Changes here layer as runtime overrides on top of
            <code> branding/brand.manifest.json</code>; use “Reset to factory” to revert.
          </p>
        </div>
        <div className="branding-tab__header-actions">
          <Button kind="ghost" size="sm" renderIcon={Reset} onClick={handleResetAll} disabled={saving || loading}>
            Reset to factory
          </Button>
        </div>
      </header>

      {error ? (
        <InlineNotification kind="error" lowContrast title="Failed to load branding" subtitle={error} hideCloseButton />
      ) : null}
      {saveError ? (
        <InlineNotification
          kind="error"
          lowContrast
          title="Save failed"
          subtitle={saveError}
          onCloseButtonClick={() => setSaveError(null)}
        />
      ) : null}
      {savedNotice ? (
        <InlineNotification
          kind="success"
          lowContrast
          title={savedNotice}
          onCloseButtonClick={() => setSavedNotice(null)}
        />
      ) : null}

      <div className="branding-tab__grid">
        <article className="branding-card">
          <header className="branding-card__header">
            <h3>Identity</h3>
            <p>Product name, tagline, vendor, homepage.</p>
          </header>
          <div className="branding-card__body branding-card__body--stack">
            <TextInput
              id="branding-productName"
              labelText="Product name"
              value={identity.productName}
              onChange={(e) => setIdentity((d) => ({ ...d, productName: e.target.value }))}
            />
            <TextInput
              id="branding-shortName"
              labelText="Short name"
              helperText="Used in headers and compact labels."
              value={identity.shortName}
              onChange={(e) => setIdentity((d) => ({ ...d, shortName: e.target.value }))}
            />
            <TextInput
              id="branding-tagline"
              labelText="Tagline"
              value={identity.tagline}
              onChange={(e) => setIdentity((d) => ({ ...d, tagline: e.target.value }))}
            />
            <TextInput
              id="branding-vendor"
              labelText="Vendor"
              value={identity.vendor}
              onChange={(e) => setIdentity((d) => ({ ...d, vendor: e.target.value }))}
            />
            <TextInput
              id="branding-homepage"
              labelText="Homepage"
              value={identity.homepage}
              onChange={(e) => setIdentity((d) => ({ ...d, homepage: e.target.value }))}
            />
          </div>
          <footer className="branding-card__footer">
            <Button size="sm" renderIcon={Save} onClick={handleSaveIdentity} disabled={saving || loading}>
              Save identity
            </Button>
          </footer>
        </article>

        <article className="branding-card">
          <header className="branding-card__header">
            <h3>Palette</h3>
            <p>Brand colors consumed by the web UI and downstream assets.</p>
          </header>
          <div className="branding-card__body branding-card__palette-grid">
            {PALETTE_SLOTS.map(({ key, label, description }) => (
              <label key={key} className="branding-swatch">
                <span className="branding-swatch__label">{label}</span>
                <span className="branding-swatch__row">
                  <input
                    type="color"
                    value={palette[key] ?? '#000000'}
                    onChange={(e) => setPalette((p) => ({ ...p, [key]: e.target.value }))}
                    aria-label={`${label} color`}
                  />
                  <TextInput
                    id={`branding-palette-${key}`}
                    labelText=""
                    hideLabel
                    size="sm"
                    value={palette[key] ?? ''}
                    onChange={(e) => setPalette((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder="#000000"
                  />
                </span>
                <span className="branding-swatch__desc">{description}</span>
              </label>
            ))}
          </div>
          <footer className="branding-card__footer">
            <Button size="sm" renderIcon={Save} onClick={handleSavePalette} disabled={saving || loading}>
              Save palette
            </Button>
          </footer>
        </article>

        <article className="branding-card">
          <header className="branding-card__header">
            <h3>Copy &amp; messaging</h3>
            <p>Welcome text, login banner template, systemd Description prefix.</p>
          </header>
          <div className="branding-card__body branding-card__body--stack">
            {COPY_SLOTS.map(({ key, label, description, multiline }) =>
              multiline ? (
                <TextArea
                  key={key}
                  id={`branding-copy-${key}`}
                  labelText={label}
                  helperText={description}
                  rows={2}
                  value={copy[key] ?? ''}
                  onChange={(e) => setCopy((c) => ({ ...c, [key]: e.target.value }))}
                />
              ) : (
                <TextInput
                  key={key}
                  id={`branding-copy-${key}`}
                  labelText={label}
                  helperText={description}
                  value={copy[key] ?? ''}
                  onChange={(e) => setCopy((c) => ({ ...c, [key]: e.target.value }))}
                />
              ),
            )}
          </div>
          <footer className="branding-card__footer">
            <Button size="sm" renderIcon={Save} onClick={handleSaveCopy} disabled={saving || loading}>
              Save copy
            </Button>
          </footer>
        </article>

        <article className="branding-card">
          <header className="branding-card__header">
            <h3>Live preview</h3>
            <p>Reflects the current saved manifest — changes apply across the app after saving.</p>
          </header>
          <div className="branding-card__body branding-preview">
            <div
              className="branding-preview__chip"
              style={{
                background: brand.palette?.surface ?? '#0E0E0E',
                color: brand.palette?.onPrimary ?? '#FFFFFF',
                borderColor: brand.palette?.primary ?? '#4DA6FF',
              }}
            >
              <span className="branding-preview__dot" style={{ background: brand.palette?.primary ?? '#4DA6FF' }} />
              <span className="branding-preview__short">{brand.shortName}</span>
              <span className="branding-preview__name">{brand.productName}</span>
            </div>
            <p className="branding-preview__tagline">{brand.tagline}</p>
            <dl className="branding-preview__meta">
              <dt>vendor</dt>
              <dd>{brand.vendor ?? '—'}</dd>
              <dt>homepage</dt>
              <dd>{brand.homepage ?? '—'}</dd>
              <dt>welcome</dt>
              <dd>{brand.copy?.welcomeHeadline ?? '—'}</dd>
            </dl>
          </div>
        </article>

        <article className="branding-card branding-card--wide">
          <header className="branding-card__header">
            <h3>OS branding</h3>
            <p>Render templates and rewrite systemd Description lines from the manifest. Privileged install steps (Plymouth, /etc/issue.d) still run via the installer script.</p>
          </header>
          <div className="branding-card__body">
            {osStatusError ? (
              <InlineNotification kind="error" lowContrast title="Failed to read OS status" subtitle={osStatusError} hideCloseButton />
            ) : null}
            <dl className="branding-os-status">
              <dt>Plymouth theme</dt>
              <dd>{osStatus?.plymouthInstalled ? 'installed' : 'not installed'}</dd>
              <dt>Login banner</dt>
              <dd>{osStatus?.loginBannerInstalled ? 'installed' : 'not installed'}</dd>
              <dt>Terminal welcome</dt>
              <dd>{osStatus?.welcomeInstalled ? 'installed' : 'not installed'}</dd>
              <dt>Generated env file</dt>
              <dd>{osStatus?.generatedEnvExists ? 'present' : 'missing'}</dd>
            </dl>
            {applyResult ? (
              <pre className="branding-apply-output">
                {applyResult.steps
                  .map((s) => `# ${s.step} (rc=${s.returncode})\n${s.stdout}${s.stderr ? `\n[stderr] ${s.stderr}` : ''}`)
                  .join('\n\n')}
              </pre>
            ) : null}
          </div>
          <footer className="branding-card__footer">
            <Button kind="tertiary" size="sm" onClick={() => handleApplyOs(true)} disabled={applying}>
              Dry-run apply
            </Button>
            <Button size="sm" onClick={() => handleApplyOs(false)} disabled={applying}>
              Apply to OS
            </Button>
          </footer>
        </article>
      </div>
    </section>
  )
}
