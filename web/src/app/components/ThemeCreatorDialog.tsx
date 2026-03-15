import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  InlineLoading,
  Modal,
  RadioTile,
  Tag,
  TileGroup,
  Toggle,
} from '@carbon/react'
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

  useEffect(() => {
    if (!isOpen) return
    setSelectedThemeId(propCurrentTheme || getSavedThemeId())
  }, [isOpen, propCurrentTheme])

  const availableThemes = useMemo(
    () => ({ ...themes, ...propCustomThemes }),
    [propCustomThemes],
  )

  const selectedTheme = availableThemes[selectedThemeId] ?? themes.default
  const customThemeEntries = Object.values(propCustomThemes)

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

  if (!isOpen) return null

  return (
    <Modal
      open={isOpen}
      size="lg"
      modalLabel="Carbon theme management"
      modalHeading="Theme settings"
      primaryButtonText="Apply theme"
      secondaryButtonText="Cancel"
      onRequestClose={onClose}
      onSecondarySubmit={onClose}
      onRequestSubmit={handleApply}
      hasScrollingContent
    >
      <div className="theme-creator-dialog">
        <section className="theme-creator-dialog__intro">
          <p className="theme-creator-dialog__intro-copy">
            Manage Carbon theme zones for the app shell and retain access to any legacy custom themes already saved in
            this browser.
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

        <section className="theme-creator-dialog__section">
          <div className="theme-creator-dialog__section-header">
            <h3>Carbon presets</h3>
            <Tag type="cool-gray" size="sm">
              Standardized
            </Tag>
          </div>
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

        {customThemeEntries.length > 0 && (
          <section className="theme-creator-dialog__section">
            <div className="theme-creator-dialog__section-header">
              <h3>Legacy custom themes</h3>
              <Tag type="warm-gray" size="sm">
                Retained
              </Tag>
            </div>
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
        )}

        {(welcomeBanner || bootSplash) && (
          <section className="theme-creator-dialog__section">
            <div className="theme-creator-dialog__section-header">
              <h3>System branding</h3>
              <Tag type="cool-gray" size="sm">
                Optional
              </Tag>
            </div>

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
        )}
      </div>
    </Modal>
  )
}
