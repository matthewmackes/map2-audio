import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  ComposedModal,
  Layer,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Tag,
  Toggle,
} from '@carbon/react'
import { Moon, Sun, Reset, Checkmark, PaintBrush } from '@carbon/icons-react'
import {
  CARBON_COLOR_FAMILIES,
  CARBON_FAMILY_BY_ID,
  PICKER_SHADES,
  generateThemeFromPalette,
  getSavedThemeId,
  applyTheme,
  saveCustomTheme,
  deleteCustomTheme,
  getCustomThemes,
} from '../theme'
import type { BaseShell, Theme, ThemeColors } from '../theme'
import './ThemeChooserModal.css'

// ─── Colour-slot label map ─────────────────────────────────────────────────

const COLOR_SLOT_GROUPS: { label: string; slots: (keyof ThemeColors)[] }[] = [
  {
    label: 'Surfaces',
    slots: ['bg', 'surface', 'surface-2', 'surface-3', 'surface-overlay'],
  },
  {
    label: 'Interactive',
    slots: ['interactive', 'interactive-hover', 'interactive-active', 'interactive-disabled', 'primary', 'primary-strong', 'accent', 'focus-ring'],
  },
  {
    label: 'Text',
    slots: ['text-primary', 'text-secondary', 'text-tertiary', 'text-inverse', 'muted', 'muted-2'],
  },
  {
    label: 'Borders',
    slots: ['border', 'border-strong'],
  },
  {
    label: 'Status',
    slots: ['support-success', 'support-warning', 'support-danger', 'support-info', 'success', 'warning', 'danger'],
  },
  {
    label: 'State backgrounds',
    slots: ['bg-empty', 'bg-offline', 'bg-fault', 'bg-warning'],
  },
  {
    label: 'Shadow',
    slots: ['shadow-strong', 'shadow-soft'],
  },
]

const SLOT_LABELS: Partial<Record<keyof ThemeColors, string>> = {
  bg: 'Background',
  surface: 'Surface (Layer 01)',
  'surface-2': 'Surface (Layer 02)',
  'surface-3': 'Surface (Layer 03)',
  'surface-overlay': 'Surface Overlay',
  interactive: 'Interactive',
  'interactive-hover': 'Interactive Hover',
  'interactive-active': 'Interactive Active',
  'interactive-disabled': 'Interactive Disabled',
  primary: 'Primary',
  'primary-strong': 'Primary Strong',
  accent: 'Accent / Link',
  'focus-ring': 'Focus Ring',
  'text-primary': 'Text Primary',
  'text-secondary': 'Text Secondary',
  'text-tertiary': 'Text Tertiary',
  'text-inverse': 'Text Inverse',
  muted: 'Muted',
  'muted-2': 'Muted 2',
  border: 'Border',
  'border-strong': 'Border Strong',
  'support-success': 'Support Success',
  'support-warning': 'Support Warning',
  'support-danger': 'Support Danger',
  'support-info': 'Support Info',
  success: 'Success',
  warning: 'Warning',
  danger: 'Danger',
  'bg-empty': 'Background Empty',
  'bg-offline': 'Background Offline',
  'bg-fault': 'Background Fault',
  'bg-warning': 'Background Warning',
  'shadow-strong': 'Shadow Strong',
  'shadow-soft': 'Shadow Soft',
}

// ─── Props ─────────────────────────────────────────────────────────────────

interface ThemeChooserModalProps {
  isOpen: boolean
  onClose: () => void
  onThemeChange?: (themeId: string) => void
}

// ─── Step type ─────────────────────────────────────────────────────────────

type Step = 'palette' | 'customize'

// ─── Helpers ───────────────────────────────────────────────────────────────

function isHexLike(value: string): boolean {
  return /^#[0-9a-fA-F]{3,8}$/.test(value.trim())
}

function swatch(color: string, size = 20): React.ReactElement {
  const isColor = isHexLike(color) || color.startsWith('rgb') || color.startsWith('hsl')
  return (
    <span
      className="tcm-swatch"
      style={{
        width: size,
        height: size,
        background: isColor ? color : 'transparent',
        border: isColor ? 'none' : '1px dashed var(--cds-border-strong)',
      }}
      aria-hidden="true"
    />
  )
}

// ─── Component ─────────────────────────────────────────────────────────────

export function ThemeChooserModal({ isOpen, onClose, onThemeChange }: ThemeChooserModalProps) {
  // Which step we're on
  const [step, setStep] = useState<Step>('palette')

  // Palette selections
  const [selectedFamily, setSelectedFamily] = useState('blue')
  const [isDark, setIsDark] = useState(true)
  const [darkBase, setDarkBase] = useState<'g100' | 'g90'>('g100')
  const [lightBase, setLightBase] = useState<'white' | 'g10'>('g10')

  // Per-slot overrides applied on top of generated colors
  const [overrides, setOverrides] = useState<Partial<ThemeColors>>({})

  // Currently open slot picker
  const [activeSlot, setActiveSlot] = useState<keyof ThemeColors | null>(null)
  const [activeFamily, setActiveFamily] = useState('blue')

  // Name for saved theme
  const [themeName, setThemeName] = useState('')

  // Live preview: apply generated theme to page while modal is open
  const base: BaseShell = isDark ? darkBase : lightBase

  const generatedTheme = useMemo(
    () => generateThemeFromPalette(selectedFamily, base, overrides),
    [selectedFamily, base, overrides],
  )

  // Preview the generated theme live
  useEffect(() => {
    if (!isOpen) return
    // Build a preview theme (don't save to localStorage yet)
    const root = document.documentElement
    const prev: Record<string, string> = {}
    // Save current CSS vars to restore on cancel
    Object.keys(generatedTheme.colors).forEach((k) => {
      if (k !== 'color-scheme') {
        prev[k] = root.style.getPropertyValue(`--${k}`)
      }
    })
    // Apply preview
    Object.entries(generatedTheme.colors).forEach(([k, v]) => {
      if (k === 'color-scheme') root.style.colorScheme = v
      else root.style.setProperty(`--${k}`, v)
    })
    // Apply carbon class
    const carbonCls = `cds--${generatedTheme.carbonTheme ?? 'g100'}`
    const all = ['cds--white', 'cds--g10', 'cds--g90', 'cds--g100']
    ;[document.documentElement, document.body].forEach((el) => {
      el.classList.remove(...all)
      el.classList.add(carbonCls)
    })
  }, [isOpen, generatedTheme])

  // Reset state when modal opens
  useEffect(() => {
    if (!isOpen) return
    setStep('palette')
    setOverrides({})
    setActiveSlot(null)
    const currentId = getSavedThemeId()
    const cthemes = getCustomThemes()
    const saved = cthemes[currentId]
    if (saved) {
      setThemeName(saved.name)
    } else {
      setThemeName('')
    }
  }, [isOpen])

  const handleCancel = useCallback(() => {
    // Restore the previously applied theme
    applyTheme(getSavedThemeId())
    onClose()
  }, [onClose])

  const handleApply = useCallback(() => {
    const id = `custom-${selectedFamily}-${base}-${Date.now()}`
    const name = themeName.trim() || generatedTheme.name
    const theme: Theme = {
      ...generatedTheme,
      id,
      name,
    }
    saveCustomTheme(theme)
    applyTheme(id)
    onThemeChange?.(id)
    onClose()
  }, [generatedTheme, selectedFamily, base, themeName, onThemeChange, onClose])

  const handleSlotOverride = useCallback(
    (slot: keyof ThemeColors, color: string) => {
      setOverrides((prev) => ({ ...prev, [slot]: color }))
    },
    [],
  )

  const handleResetSlot = useCallback((slot: keyof ThemeColors) => {
    setOverrides((prev) => {
      const next = { ...prev }
      delete next[slot]
      return next
    })
  }, [])

  const handleResetAll = useCallback(() => {
    setOverrides({})
  }, [])

  const family = CARBON_FAMILY_BY_ID[selectedFamily]

  const currentColors = generatedTheme.colors

  if (!isOpen) return null

  return (
    <ComposedModal
      open={isOpen}
      size="lg"
      onClose={handleCancel}
      className="tcm-modal"
    >
      <ModalHeader
        title="Theme Chooser"
        label="Carbon Design System"
        closeModal={handleCancel}
      />

      <ModalBody hasScrollingContent className="tcm-body">
        {/* ── Step indicator ── */}
        <div className="tcm-steps">
          <Layer className="tcm-step-layer">
            <button
              type="button"
              className={`tcm-step ${step === 'palette' ? 'tcm-step--active' : 'tcm-step--done'}`}
              onClick={() => setStep('palette')}
            >
              <Layer className="tcm-step__num-layer">
                <span className="tcm-step__num">1</span>
              </Layer>
              <span>Choose palette</span>
            </button>
          </Layer>
          <span className="tcm-step__sep" aria-hidden="true" />
          <Layer className="tcm-step-layer">
            <button
              type="button"
              className={`tcm-step ${step === 'customize' ? 'tcm-step--active' : ''}`}
              onClick={() => setStep('customize')}
            >
              <Layer className="tcm-step__num-layer">
                <span className="tcm-step__num">2</span>
              </Layer>
              <span>Customize</span>
            </button>
          </Layer>
        </div>

        {/* ═══════════════════ STEP 1: Palette ═══════════════════ */}
        {step === 'palette' && (
          <div className="tcm-step-content">

            {/* Dark / Light toggle */}
            <section className="tcm-section">
              <div className="tcm-section__header">
                <h3>Base shell</h3>
                <Tag type="cool-gray" size="sm">Carbon tokens</Tag>
              </div>
              <div className="tcm-base-toggle-row">
                <Toggle
                  id="tcm-dark-light-toggle"
                  labelText="Color mode"
                  hideLabel
                  labelA="Light"
                  labelB="Dark"
                  toggled={isDark}
                  onToggle={(v) => setIsDark(v)}
                />
                <span className="tcm-base-toggle-label">
                  {isDark ? <Moon size={16} /> : <Sun size={16} />}
                  {isDark ? 'Dark mode' : 'Light mode'}
                </span>
              </div>

              {/* Sub-variants */}
              <div className="tcm-base-variants">
                {isDark ? (
                  <>
                    <Layer className="tcm-base-chip-layer">
                      <button
                        type="button"
                        className={`tcm-base-chip ${darkBase === 'g100' ? 'tcm-base-chip--selected' : ''}`}
                        onClick={() => setDarkBase('g100')}
                      >
                        <span className="tcm-base-chip__swatch tcm-base-chip__swatch--g100" />
                        <span>Gray 100</span>
                        {darkBase === 'g100' && <Checkmark size={14} />}
                      </button>
                    </Layer>
                    <Layer className="tcm-base-chip-layer">
                      <button
                        type="button"
                        className={`tcm-base-chip ${darkBase === 'g90' ? 'tcm-base-chip--selected' : ''}`}
                        onClick={() => setDarkBase('g90')}
                      >
                        <span className="tcm-base-chip__swatch tcm-base-chip__swatch--g90" />
                        <span>Gray 90</span>
                        {darkBase === 'g90' && <Checkmark size={14} />}
                      </button>
                    </Layer>
                  </>
                ) : (
                  <>
                    <Layer className="tcm-base-chip-layer">
                      <button
                        type="button"
                        className={`tcm-base-chip ${lightBase === 'g10' ? 'tcm-base-chip--selected' : ''}`}
                        onClick={() => setLightBase('g10')}
                      >
                        <span className="tcm-base-chip__swatch tcm-base-chip__swatch--g10" />
                        <span>Gray 10</span>
                        {lightBase === 'g10' && <Checkmark size={14} />}
                      </button>
                    </Layer>
                    <Layer className="tcm-base-chip-layer">
                      <button
                        type="button"
                        className={`tcm-base-chip ${lightBase === 'white' ? 'tcm-base-chip--selected' : ''}`}
                        onClick={() => setLightBase('white')}
                      >
                        <span className="tcm-base-chip__swatch tcm-base-chip__swatch--white" />
                        <span>White</span>
                        {lightBase === 'white' && <Checkmark size={14} />}
                      </button>
                    </Layer>
                  </>
                )}
              </div>
            </section>

            {/* Color family grid */}
            <section className="tcm-section">
              <div className="tcm-section__header">
                <h3>Primary color</h3>
                <Tag type="cool-gray" size="sm">{CARBON_COLOR_FAMILIES.length} families</Tag>
              </div>
              <div className="tcm-family-grid">
                {CARBON_COLOR_FAMILIES.map((f) => {
                  const previewShade = isDark ? 50 : 60
                  const hex = f.shades[previewShade]
                  const isSelected = selectedFamily === f.id
                  return (
                    <Layer key={f.id} className="tcm-family-card-layer">
                      <button
                        type="button"
                        className={`tcm-family-card ${isSelected ? 'tcm-family-card--selected' : ''}`}
                        onClick={() => setSelectedFamily(f.id)}
                        aria-pressed={isSelected}
                      >
                        {/* Gradient band showing all shades */}
                        <span
                          className="tcm-family-card__band"
                          style={{
                            background: `linear-gradient(to right, ${Object.values(f.shades).join(', ')})`,
                          }}
                          aria-hidden="true"
                        />
                        <span className="tcm-family-card__body">
                          <span
                            className="tcm-family-card__dot"
                            style={{ background: hex }}
                            aria-hidden="true"
                          />
                          <span className="tcm-family-card__name">{f.name}</span>
                          {isSelected && <Checkmark size={14} className="tcm-family-card__check" />}
                        </span>
                      </button>
                    </Layer>
                  )
                })}
              </div>
            </section>

            {/* Live preview strip */}
            <section className="tcm-section">
              <div className="tcm-section__header">
                <h3>Preview</h3>
                <Tag type="blue" size="sm">{family?.name} / {base}</Tag>
              </div>
              <ThemePreviewStrip theme={generatedTheme} />
            </section>

          </div>
        )}

        {/* ═══════════════════ STEP 2: Customize ═══════════════════ */}
        {step === 'customize' && (
          <div className="tcm-step-content">
            <div className="tcm-customize-header">
              <div>
                <p className="tcm-customize-desc">
                  Click any color slot to pick a replacement from the Carbon palette.
                  Changes layer on top of the generated theme — reset any slot to restore the generated value.
                </p>
                {Object.keys(overrides).length > 0 && (
                  <Tag type="warm-gray" size="sm">{Object.keys(overrides).length} override{Object.keys(overrides).length !== 1 ? 's' : ''}</Tag>
                )}
              </div>
              <Button kind="ghost" size="sm" renderIcon={Reset} onClick={handleResetAll}>
                Reset all
              </Button>
            </div>

            {COLOR_SLOT_GROUPS.map((group) => (
              <section key={group.label} className="tcm-section">
                <div className="tcm-section__header">
                  <h4>{group.label}</h4>
                </div>
                <div className="tcm-slot-grid">
                  {group.slots.map((slot) => {
                    const value = (currentColors as unknown as Record<string, string>)[slot as string] ?? ''
                    const isOverridden = slot in overrides
                    const isActive = activeSlot === slot
                    return (
                      <div key={slot} className={`tcm-slot ${isActive ? 'tcm-slot--active' : ''} ${isOverridden ? 'tcm-slot--overridden' : ''}`}>
                        <Layer className="tcm-slot__btn-layer">
                          <button
                            type="button"
                            className="tcm-slot__btn"
                            onClick={() => setActiveSlot(isActive ? null : slot)}
                          >
                            {swatch(value, 22)}
                            <span className="tcm-slot__label">{SLOT_LABELS[slot] ?? slot}</span>
                            {isOverridden && <Tag type="warm-gray" size="sm">edited</Tag>}
                          </button>
                        </Layer>
                        {isOverridden && (
                          <button
                            type="button"
                            className="tcm-slot__reset"
                            title="Reset to generated value"
                            onClick={() => handleResetSlot(slot)}
                          >
                            <Reset size={14} />
                          </button>
                        )}

                        {/* Inline palette picker */}
                        {isActive && (
                          <SlotPalettePicker
                            slot={slot}
                            currentValue={value}
                            onPick={(color) => {
                              handleSlotOverride(slot, color)
                              setActiveSlot(null)
                            }}
                            onClose={() => setActiveSlot(null)}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}

            {/* Theme name input */}
            <section className="tcm-section">
              <div className="tcm-section__header">
                <h4>Theme name</h4>
              </div>
              <input
                type="text"
                className="tcm-name-input"
                placeholder={generatedTheme.name}
                value={themeName}
                onChange={(e) => setThemeName(e.target.value)}
                maxLength={60}
              />
            </section>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <div className="tcm-footer">
          <div className="tcm-footer__nav">
            {step === 'palette' && (
              <Button kind="secondary" onClick={() => setStep('customize')} renderIcon={PaintBrush}>
                Customize colors
              </Button>
            )}
            {step === 'customize' && (
              <Button kind="ghost" onClick={() => setStep('palette')}>
                ← Back to palette
              </Button>
            )}
          </div>
          <div className="tcm-footer__actions">
            <Button kind="secondary" onClick={handleCancel}>Cancel</Button>
            <Button kind="primary" onClick={handleApply} renderIcon={Checkmark}>
              Apply &amp; save
            </Button>
          </div>
        </div>
      </ModalFooter>
    </ComposedModal>
  )
}

// ─── Preview Strip ──────────────────────────────────────────────────────────

function ThemePreviewStrip({ theme }: { theme: Theme }) {
  const c = theme.colors as unknown as Record<string, string>
  return (
    <div className="tcm-preview" style={{ background: c['bg'], color: c['text-primary'] }}>
      <div className="tcm-preview__surfaces">
        {(['surface', 'surface-2', 'surface-3'] as const).map((s) => (
          <div key={s} className="tcm-preview__surface-box" style={{ background: c[s], border: `1px solid ${c['border']}` }}>
            <span style={{ color: c['text-secondary'], fontSize: 11 }}>{s}</span>
          </div>
        ))}
      </div>
      <div className="tcm-preview__row">
        <span className="tcm-preview__btn" style={{ background: c['interactive'], color: '#fff' }}>Button</span>
        <span className="tcm-preview__btn tcm-preview__btn--ghost" style={{ color: c['accent'], border: `1px solid ${c['border-strong']}` }}>Ghost</span>
        <span className="tcm-preview__text" style={{ color: c['text-primary'] }}>Primary text</span>
        <span className="tcm-preview__text" style={{ color: c['text-secondary'] }}>Secondary text</span>
      </div>
      <div className="tcm-preview__row">
        <span className="tcm-preview__status" style={{ color: c['success'] }}>● Success</span>
        <span className="tcm-preview__status" style={{ color: c['warning'] }}>● Warning</span>
        <span className="tcm-preview__status" style={{ color: c['danger'] }}>● Danger</span>
        <span className="tcm-preview__status" style={{ color: c['support-info'] }}>● Info</span>
      </div>
    </div>
  )
}

// ─── Slot Palette Picker ────────────────────────────────────────────────────

interface SlotPalettePickerProps {
  slot: keyof ThemeColors
  currentValue: string
  onPick: (color: string) => void
  onClose: () => void
}

function SlotPalettePicker({ slot: _slot, currentValue, onPick, onClose }: SlotPalettePickerProps) {
  const [selectedFamilyId, setSelectedFamilyId] = useState(() => {
    // Try to guess family from current value
    for (const f of CARBON_COLOR_FAMILIES) {
      if (Object.values(f.shades).includes(currentValue)) return f.id
    }
    return 'blue'
  })

  const family = CARBON_FAMILY_BY_ID[selectedFamilyId]

  return (
    <Layer className="tcm-slot-picker">
      {/* Family selector row */}
      <div className="tcm-slot-picker__families">
        {CARBON_COLOR_FAMILIES.map((f) => {
          const hex = f.shades[50]
          return (
            <button
              key={f.id}
              type="button"
              className={`tcm-slot-picker__fam-btn ${selectedFamilyId === f.id ? 'tcm-slot-picker__fam-btn--active' : ''}`}
              title={f.name}
              style={{ background: hex }}
              onClick={() => setSelectedFamilyId(f.id)}
            />
          )
        })}
      </div>

      {/* Shade grid */}
      <div className="tcm-slot-picker__shades">
        {PICKER_SHADES.map((shade) => {
          const hex = family.shades[shade]
          const isActive = hex === currentValue
          return (
            <button
              key={shade}
              type="button"
              className={`tcm-slot-picker__shade ${isActive ? 'tcm-slot-picker__shade--active' : ''}`}
              style={{ background: hex }}
              title={`${family.name} ${shade} — ${hex}`}
              onClick={() => onPick(hex)}
            >
              {isActive && <Checkmark size={12} style={{ color: shade <= 50 ? '#161616' : '#f4f4f4' }} />}
            </button>
          )
        })}
        <span className="tcm-slot-picker__shade-labels">
          {PICKER_SHADES.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </span>
      </div>

      <div className="tcm-slot-picker__footer">
        <code className="tcm-slot-picker__hex">{currentValue}</code>
        <Button kind="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>
    </Layer>
  )
}
