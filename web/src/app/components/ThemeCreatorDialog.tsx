import { useEffect, useMemo, useState } from 'react'
import { Button, ComposedModal, InlineLoading, ModalBody, ModalFooter, ModalHeader, RadioTile, Tag, TileGroup, Toggle } from '@carbon/react'
import { getSavedThemeId, themeOrder, themes } from '../theme'
import type { CarbonThemeId, Theme } from '../theme'
import './ThemeCreatorDialog.css'

interface WelcomeBannerStatus {
  installed: boolean
  path?: string
}

interface BootSplashStatus {
  installed: boolean
  theme_exists?: boolean
  plymouth_installed?: boolean
  current_theme?: string
  is_active?: boolean
}

interface ThemeCreatorDialogProps {
  isOpen: boolean
  onClose: () => void
  currentTheme?: string
  onThemeChange?: (themeId: string) => void
  customThemes?: Record<string, Theme>
  onDeleteCustomTheme?: (themeId: string) => void
  welcomeBanner?: WelcomeBannerStatus
  onToggleWelcomeBanner?: () => void
  bannerLoading?: boolean
  bootSplash?: BootSplashStatus
  onToggleBootSplash?: () => void
  splashLoading?: boolean
}

type ThemeDialogStep = 'overview' | 'presets' | 'legacy' | 'branding'

function carbonThemeLabel(carbonTheme: CarbonThemeId | undefined): string {
  switch (carbonTheme) {
    case 'white':
      return 'White'
    case 'g10':
      return 'Gray 10'
    case 'g90':
      return 'Gray 90'
    case 'g100':
    default:
      return 'Gray 100'
  }
}

function carbonThemeTagType(carbonTheme: CarbonThemeId | undefined): 'blue' | 'cool-gray' | 'cyan' | 'purple' {
  switch (carbonTheme) {
    case 'white':
      return 'blue'
    case 'g10':
      return 'cool-gray'
    case 'g90':
      return 'cyan'
    case 'g100':
    default:
      return 'purple'
  }
}

function statusTagType(installed: boolean): 'green' | 'warm-gray' {
  return installed ? 'green' : 'warm-gray'
}

function ThemeFlowCard({
  title,
  description,
  tag,
  actionLabel,
  onClick,
}: {
  title: string
  description: string
  tag?: React.ReactNode
  actionLabel: string
  onClick: () => void
}) {
  return (
    <button type="button" className="theme-creator-dialog__flow-card" onClick={onClick}>
      <div className="theme-creator-dialog__flow-card-copy">
        <div className="theme-creator-dialog__flow-card-header">
          <strong>{title}</strong>
          {tag}
        </div>
        <p>{description}</p>
      </div>
      <span className="theme-creator-dialog__flow-card-action">{actionLabel}</span>
    </button>
  )
}

export function ThemeCreatorDialog({
  isOpen,
  onClose,
  currentTheme: propCurrentTheme,
  onThemeChange,
  customThemes: propCustomThemes = {},
  onDeleteCustomTheme,
  welcomeBanner,
  onToggleWelcomeBanner,
  bannerLoading = false,
  bootSplash,
  onToggleBootSplash,
  splashLoading = false,
}: ThemeCreatorDialogProps) {
  const [selectedThemeId, setSelectedThemeId] = useState(propCurrentTheme || getSavedThemeId())
  const [step, setStep] = useState<ThemeDialogStep>('overview')

  useEffect(() => {
    if (!isOpen) return
    setSelectedThemeId(propCurrentTheme || getSavedThemeId())
    setStep('overview')
  }, [isOpen, propCurrentTheme])

  const availableThemes = useMemo(() => ({ ...themes, ...propCustomThemes }), [propCustomThemes])
  const selectedTheme = availableThemes[selectedThemeId] ?? themes.default
  const customThemeEntries = Object.values(propCustomThemes)
  const hasBrandingControls = Boolean(welcomeBanner || bootSplash)

  const handleApply = () => {
    onThemeChange?.(selectedThemeId)
    onClose()
  }

  const handleDeleteTheme = (themeId: string) => {
    onDeleteCustomTheme?.(themeId)
    if (selectedThemeId === themeId) {
      setSelectedThemeId('default')
    }
  }

  const renderOverview = () => (
    <div className="theme-creator-dialog">
      <section className="theme-creator-dialog__intro">
        <p className="theme-creator-dialog__intro-copy">
          Move through a short set of focused dialogs instead of one long theme page. Choose the area you want to update
          and apply the selected theme when you are ready.
        </p>
        <div className="theme-creator-dialog__summary">
          <Tag type="blue" size="sm">
            {selectedTheme.name}
          </Tag>
          <Tag type={carbonThemeTagType(selectedTheme.carbonTheme)} size="sm">
            {carbonThemeLabel(selectedTheme.carbonTheme)}
          </Tag>
          {propCustomThemes[selectedTheme.id] && (
            <Tag type="warm-gray" size="sm">
              Legacy custom theme
            </Tag>
          )}
        </div>
        <p className="theme-creator-dialog__description">{selectedTheme.description}</p>
      </section>

      <section className="theme-creator-dialog__flow-grid" aria-label="Theme settings sections">
        <ThemeFlowCard
          title="Carbon presets"
          description="Browse the standardized shell themes and pick the one you want to apply."
          tag={
            <Tag type="cool-gray" size="sm">
              {themeOrder.length} presets
            </Tag>
          }
          actionLabel="Open preset modal"
          onClick={() => setStep('presets')}
        />

        {customThemeEntries.length > 0 && (
          <ThemeFlowCard
            title="Legacy custom themes"
            description="Review older saved themes, reuse one, or delete entries you no longer need."
            tag={
              <Tag type="warm-gray" size="sm">
                {customThemeEntries.length} saved
              </Tag>
            }
            actionLabel="Open legacy modal"
            onClick={() => setStep('legacy')}
          />
        )}

        {hasBrandingControls && (
          <ThemeFlowCard
            title="System branding"
            description="Adjust terminal and boot branding without digging through the theme selection surfaces."
            tag={
              <Tag type="cool-gray" size="sm">
                Optional
              </Tag>
            }
            actionLabel="Open branding modal"
            onClick={() => setStep('branding')}
          />
        )}
      </section>
    </div>
  )

  const renderPresets = () => (
    <div className="theme-creator-dialog">
      <section className="theme-creator-dialog__section">
        <div className="theme-creator-dialog__section-header">
          <h3>Carbon presets</h3>
          <Tag type={carbonThemeTagType(selectedTheme.carbonTheme)} size="sm">
            {carbonThemeLabel(selectedTheme.carbonTheme)}
          </Tag>
        </div>
        <p className="theme-creator-dialog__description">
          Pick a standardized Carbon shell and apply it as the active GUI theme.
        </p>
        <TileGroup
          className="theme-creator-dialog__preset-grid"
          name="map2-carbon-theme"
          legend="Carbon presets"
          valueSelected={selectedThemeId}
          onChange={(value) => setSelectedThemeId(String(value))}
        >
          {themeOrder.map((themeId) => {
            const theme = themes[themeId]

            return (
              <RadioTile
                key={themeId}
                id={`theme-preset-${themeId}`}
                value={themeId}
                className="theme-creator-dialog__preset-tile"
              >
                <div className="theme-creator-dialog__preset-copy">
                  <div className="theme-creator-dialog__preset-header">
                    <strong>{theme.name}</strong>
                    <Tag type={carbonThemeTagType(theme.carbonTheme)} size="sm">
                      {carbonThemeLabel(theme.carbonTheme)}
                    </Tag>
                  </div>
                  <p>{theme.description}</p>
                </div>
                <div
                  className={`theme-creator-dialog__preset-swatch theme-creator-dialog__preset-swatch--${theme.carbonTheme ?? 'g100'}`}
                  aria-hidden="true"
                />
              </RadioTile>
            )
          })}
        </TileGroup>
      </section>
    </div>
  )

  const renderLegacyThemes = () => (
    <div className="theme-creator-dialog">
      <section className="theme-creator-dialog__section">
        <div className="theme-creator-dialog__section-header">
          <h3>Legacy custom themes</h3>
          <Tag type="warm-gray" size="sm">
            Retained
          </Tag>
        </div>
        <p className="theme-creator-dialog__description">
          Older browser-saved themes remain available here until you delete them.
        </p>
        <div className="theme-creator-dialog__legacy-list">
          {customThemeEntries.map((theme) => (
            <div key={theme.id} className="theme-creator-dialog__legacy-card">
              <div className="theme-creator-dialog__legacy-copy">
                <div className="theme-creator-dialog__legacy-header">
                  <strong>{theme.name}</strong>
                  <Tag type={carbonThemeTagType(theme.carbonTheme)} size="sm">
                    {carbonThemeLabel(theme.carbonTheme)}
                  </Tag>
                </div>
                <p>{theme.description}</p>
                {selectedThemeId === theme.id && (
                  <div className="theme-creator-dialog__summary">
                    <Tag type="blue" size="sm">
                      Selected
                    </Tag>
                  </div>
                )}
              </div>
              <div className="theme-creator-dialog__legacy-actions">
                <Button kind="ghost" size="sm" onClick={() => setSelectedThemeId(theme.id)}>
                  Use theme
                </Button>
                <Button kind="danger--ghost" size="sm" onClick={() => handleDeleteTheme(theme.id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )

  const renderBranding = () => (
    <div className="theme-creator-dialog">
      <section className="theme-creator-dialog__section">
        <div className="theme-creator-dialog__section-header">
          <h3>System branding</h3>
          <Tag type="cool-gray" size="sm">
            Optional
          </Tag>
        </div>
        <p className="theme-creator-dialog__description">
          These controls update system-level branding directly and stay separate from theme selection.
        </p>

        {welcomeBanner && (
          <div className="theme-creator-dialog__system-card">
            <div className="theme-creator-dialog__system-header">
              <div className="theme-creator-dialog__system-copy">
                <strong>Terminal welcome banner</strong>
                <p>Show the MAP2 shell banner when a new terminal session opens.</p>
              </div>
              <Toggle
                id="theme-dialog-welcome-banner"
                labelText="Terminal welcome banner"
                hideLabel
                labelA="Off"
                labelB="On"
                toggled={welcomeBanner.installed}
                disabled={bannerLoading}
                onToggle={() => onToggleWelcomeBanner?.()}
              />
            </div>
            <div className="theme-creator-dialog__system-status">
              {bannerLoading ? (
                <InlineLoading status="active" description="Updating terminal banner" />
              ) : (
                <Tag type={statusTagType(welcomeBanner.installed)} size="sm">
                  {welcomeBanner.installed ? 'Installed' : 'Not installed'}
                </Tag>
              )}
            </div>
          </div>
        )}

        {bootSplash && (
          <div className="theme-creator-dialog__system-card">
            <div className="theme-creator-dialog__system-header">
              <div className="theme-creator-dialog__system-copy">
                <strong>Boot splash</strong>
                <p>Show the MAP2 branded splash screen during system startup.</p>
              </div>
              <Toggle
                id="theme-dialog-boot-splash"
                labelText="Boot splash"
                hideLabel
                labelA="Off"
                labelB="On"
                toggled={bootSplash.installed}
                disabled={splashLoading}
                onToggle={() => onToggleBootSplash?.()}
              />
            </div>
            <div className="theme-creator-dialog__system-status">
              {splashLoading ? (
                <InlineLoading status="active" description="Updating boot splash" />
              ) : (
                <Tag type={statusTagType(bootSplash.installed)} size="sm">
                  {bootSplash.installed ? 'Installed' : 'Not installed'}
                </Tag>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )

  const modalHeading =
    step === 'overview'
      ? 'Theme settings'
      : step === 'presets'
        ? 'Choose a preset theme'
        : step === 'legacy'
          ? 'Legacy custom themes'
          : 'System branding'

  const modalLabel =
    step === 'overview'
      ? 'Carbon theme management'
      : step === 'presets'
        ? 'Theme modal 1 of 3'
        : step === 'legacy'
          ? 'Theme modal 2 of 3'
          : 'Theme modal 3 of 3'

  if (!isOpen) return null

  return (
    <ComposedModal open={isOpen} size="lg" onClose={onClose}>
      <ModalHeader title={modalHeading} label={modalLabel} closeModal={onClose} />
      <ModalBody hasScrollingContent>
        {step === 'overview' && renderOverview()}
        {step === 'presets' && renderPresets()}
        {step === 'legacy' && renderLegacyThemes()}
        {step === 'branding' && renderBranding()}
      </ModalBody>
      <ModalFooter>
        {step === 'overview' ? (
          <>
            <Button kind="secondary" onClick={onClose}>
              Close
            </Button>
            <Button onClick={() => setStep('presets')}>Start theme flow</Button>
          </>
        ) : (
          <>
            <Button kind="secondary" onClick={() => setStep('overview')}>
              Back
            </Button>
            {step === 'branding' ? (
              <Button onClick={onClose}>Done</Button>
            ) : (
              <Button onClick={handleApply}>Apply theme</Button>
            )}
          </>
        )}
      </ModalFooter>
    </ComposedModal>
  )
}
