import { TextInput, Toggle } from '@carbon/react'

import { rgbaFromPluginAppearanceColor, resolvePluginAppearanceVariants } from '../../utils/pluginAppearanceColors'
import './PluginAppearanceControls.css'

interface PluginColorPickerProps {
  accentColor?: string | null
  darkVariant?: string | null
  lightVariant?: string | null
  onChange: (update: { accent_color?: string | null; dark_variant?: string | null; light_variant?: string | null }) => void
}

export function PluginColorPicker({
  accentColor,
  darkVariant,
  lightVariant,
  onChange,
}: PluginColorPickerProps) {
  const variants = resolvePluginAppearanceVariants(accentColor, darkVariant, lightVariant)

  return (
    <div className="plugin-appearance__color-editor">
      <div className="plugin-appearance__field-grid">
        <label className="plugin-appearance__color-field">
          <span>Accent</span>
          <div className="plugin-appearance__color-input-row">
            <input
              aria-label="Plugin accent color"
              className="plugin-appearance__native-color"
              type="color"
              value={variants.accent}
              onChange={(event) => onChange({ accent_color: event.currentTarget.value })}
            />
            <TextInput
              id="plugin-appearance-accent-color"
              labelText="Accent hex"
              value={accentColor ?? variants.accent}
              onChange={(event) => onChange({ accent_color: event.currentTarget.value })}
            />
          </div>
        </label>

        <label className="plugin-appearance__color-field">
          <span>Auto preview</span>
          <div className="plugin-appearance__variant-strip">
            <span style={{ background: variants.dark }}>Dark</span>
            <span style={{ background: variants.accent }}>Accent</span>
            <span style={{ background: variants.light }}>Light</span>
          </div>
        </label>
      </div>

      <div className="plugin-appearance__variant-grid">
        <div className="plugin-appearance__variant-card">
          <Toggle
            id="plugin-appearance-dark-override"
            labelText="Override dark variant"
            toggled={Boolean(darkVariant)}
            labelA="Auto"
            labelB="Manual"
            onToggle={(enabled) => onChange({ dark_variant: enabled ? variants.dark : null })}
          />
          {darkVariant ? (
            <TextInput
              id="plugin-appearance-dark-value"
              labelText="Dark variant"
              value={darkVariant}
              onChange={(event) => onChange({ dark_variant: event.currentTarget.value })}
            />
          ) : null}
        </div>

        <div className="plugin-appearance__variant-card">
          <Toggle
            id="plugin-appearance-light-override"
            labelText="Override light variant"
            toggled={Boolean(lightVariant)}
            labelA="Auto"
            labelB="Manual"
            onToggle={(enabled) => onChange({ light_variant: enabled ? variants.light : null })}
          />
          {lightVariant ? (
            <TextInput
              id="plugin-appearance-light-value"
              labelText="Light variant"
              value={lightVariant}
              onChange={(event) => onChange({ light_variant: event.currentTarget.value })}
            />
          ) : null}
        </div>
      </div>

      <div className="plugin-appearance__preview-card" style={{ borderColor: variants.accent, boxShadow: `0 0 0 1px ${rgbaFromPluginAppearanceColor(variants.accent, 0.25)}` }}>
        <div className="plugin-appearance__preview-chip" style={{ background: rgbaFromPluginAppearanceColor(variants.accent, 0.16), color: variants.accent, borderColor: rgbaFromPluginAppearanceColor(variants.accent, 0.35) }}>
          Plugin Accent
        </div>
        <div
          className="plugin-appearance__preview-shell"
          style={{
            background: variants.dark,
            borderColor: rgbaFromPluginAppearanceColor(variants.accent, 0.28),
            boxShadow: `inset 0 0 0 1px ${rgbaFromPluginAppearanceColor(variants.light, 0.16)}`,
          }}
        >
          <strong>Preview</strong>
          <span>Chip and card accent</span>
        </div>
      </div>
    </div>
  )
}
