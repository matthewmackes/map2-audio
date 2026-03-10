import { useState, useEffect, useCallback } from 'react'
import { X, Palette, Check, ArrowCounterClockwise, FloppyDisk, Eye, CaretDown, CaretRight, SpinnerGap } from '@phosphor-icons/react'
import type { Theme, ThemeColors, ThemeWidgets } from '../theme/types'
import { applyTheme, getSavedThemeId, themes, themeOrder, getCustomThemes, deleteCustomTheme, getAllThemes } from '../theme'
import { useIsMobile } from '../hooks/useIsMobile'

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

// Material Design color palettes
const MATERIAL_PALETTES = {
  'Red': {
    '50': '#ffebee', '100': '#ffcdd2', '200': '#ef9a9a', '300': '#e57373',
    '400': '#ef5350', '500': '#f44336', '600': '#e53935', '700': '#d32f2f',
    '800': '#c62828', '900': '#b71c1c', 'A100': '#ff8a80', 'A200': '#ff5252',
    'A400': '#ff1744', 'A700': '#d50000'
  },
  'Pink': {
    '50': '#fce4ec', '100': '#f8bbd9', '200': '#f48fb1', '300': '#f06292',
    '400': '#ec407a', '500': '#e91e63', '600': '#d81b60', '700': '#c2185b',
    '800': '#ad1457', '900': '#880e4f', 'A100': '#ff80ab', 'A200': '#ff4081',
    'A400': '#f50057', 'A700': '#c51162'
  },
  'Purple': {
    '50': '#f3e5f5', '100': '#e1bee7', '200': '#ce93d8', '300': '#ba68c8',
    '400': '#ab47bc', '500': '#9c27b0', '600': '#8e24aa', '700': '#7b1fa2',
    '800': '#6a1b9a', '900': '#4a148c', 'A100': '#ea80fc', 'A200': '#e040fb',
    'A400': '#d500f9', 'A700': '#aa00ff'
  },
  'Deep Purple': {
    '50': '#ede7f6', '100': '#d1c4e9', '200': '#b39ddb', '300': '#9575cd',
    '400': '#7e57c2', '500': '#673ab7', '600': '#5e35b1', '700': '#512da8',
    '800': '#4527a0', '900': '#311b92', 'A100': '#b388ff', 'A200': '#7c4dff',
    'A400': '#651fff', 'A700': '#6200ea'
  },
  'Indigo': {
    '50': '#e8eaf6', '100': '#c5cae9', '200': '#9fa8da', '300': '#7986cb',
    '400': '#5c6bc0', '500': '#3f51b5', '600': '#3949ab', '700': '#303f9f',
    '800': '#283593', '900': '#1a237e', 'A100': '#8c9eff', 'A200': '#536dfe',
    'A400': '#3d5afe', 'A700': '#304ffe'
  },
  'Blue': {
    '50': '#e3f2fd', '100': '#bbdefb', '200': '#90caf9', '300': '#64b5f6',
    '400': '#42a5f5', '500': '#2196f3', '600': '#1e88e5', '700': '#1976d2',
    '800': '#1565c0', '900': '#0d47a1', 'A100': '#82b1ff', 'A200': '#448aff',
    'A400': '#2979ff', 'A700': '#2962ff'
  },
  'Light Blue': {
    '50': '#e1f5fe', '100': '#b3e5fc', '200': '#81d4fa', '300': '#4fc3f7',
    '400': '#29b6f6', '500': '#03a9f4', '600': '#039be5', '700': '#0288d1',
    '800': '#0277bd', '900': '#01579b', 'A100': '#80d8ff', 'A200': '#40c4ff',
    'A400': '#00b0ff', 'A700': '#0091ea'
  },
  'Cyan': {
    '50': '#e0f7fa', '100': '#b2ebf2', '200': '#80deea', '300': '#4dd0e1',
    '400': '#26c6da', '500': '#00bcd4', '600': '#00acc1', '700': '#0097a7',
    '800': '#00838f', '900': '#006064', 'A100': '#84ffff', 'A200': '#18ffff',
    'A400': '#00e5ff', 'A700': '#00b8d4'
  },
  'Teal': {
    '50': '#e0f2f1', '100': '#b2dfdb', '200': '#80cbc4', '300': '#4db6ac',
    '400': '#26a69a', '500': '#009688', '600': '#00897b', '700': '#00796b',
    '800': '#00695c', '900': '#004d40', 'A100': '#a7ffeb', 'A200': '#64ffda',
    'A400': '#1de9b6', 'A700': '#00bfa5'
  },
  'Green': {
    '50': '#e8f5e9', '100': '#c8e6c9', '200': '#a5d6a7', '300': '#81c784',
    '400': '#66bb6a', '500': '#4caf50', '600': '#43a047', '700': '#388e3c',
    '800': '#2e7d32', '900': '#1b5e20', 'A100': '#b9f6ca', 'A200': '#69f0ae',
    'A400': '#00e676', 'A700': '#00c853'
  },
  'Light Green': {
    '50': '#f1f8e9', '100': '#dcedc8', '200': '#c5e1a5', '300': '#aed581',
    '400': '#9ccc65', '500': '#8bc34a', '600': '#7cb342', '700': '#689f38',
    '800': '#558b2f', '900': '#33691e', 'A100': '#ccff90', 'A200': '#b2ff59',
    'A400': '#76ff03', 'A700': '#64dd17'
  },
  'Lime': {
    '50': '#f9fbe7', '100': '#f0f4c3', '200': '#e6ee9c', '300': '#dce775',
    '400': '#d4e157', '500': '#cddc39', '600': '#c0ca33', '700': '#afb42b',
    '800': '#9e9d24', '900': '#827717', 'A100': '#f4ff81', 'A200': '#eeff41',
    'A400': '#c6ff00', 'A700': '#aeea00'
  },
  'Yellow': {
    '50': '#fffde7', '100': '#fff9c4', '200': '#fff59d', '300': '#fff176',
    '400': '#ffee58', '500': '#ffeb3b', '600': '#fdd835', '700': '#fbc02d',
    '800': '#f9a825', '900': '#f57f17', 'A100': '#ffff8d', 'A200': '#ffff00',
    'A400': '#ffea00', 'A700': '#ffd600'
  },
  'Amber': {
    '50': '#fff8e1', '100': '#ffecb3', '200': '#ffe082', '300': '#ffd54f',
    '400': '#ffca28', '500': '#ffc107', '600': '#ffb300', '700': '#ffa000',
    '800': '#ff8f00', '900': '#ff6f00', 'A100': '#ffe57f', 'A200': '#ffd740',
    'A400': '#ffc400', 'A700': '#ffab00'
  },
  'Orange': {
    '50': '#fff3e0', '100': '#ffe0b2', '200': '#ffcc80', '300': '#ffb74d',
    '400': '#ffa726', '500': '#ff9800', '600': '#fb8c00', '700': '#f57c00',
    '800': '#ef6c00', '900': '#e65100', 'A100': '#ffd180', 'A200': '#ffab40',
    'A400': '#ff9100', 'A700': '#ff6d00'
  },
  'Deep Orange': {
    '50': '#fbe9e7', '100': '#ffccbc', '200': '#ffab91', '300': '#ff8a65',
    '400': '#ff7043', '500': '#ff5722', '600': '#f4511e', '700': '#e64a19',
    '800': '#d84315', '900': '#bf360c', 'A100': '#ff9e80', 'A200': '#ff6e40',
    'A400': '#ff3d00', 'A700': '#dd2c00'
  },
  'Brown': {
    '50': '#efebe9', '100': '#d7ccc8', '200': '#bcaaa4', '300': '#a1887f',
    '400': '#8d6e63', '500': '#795548', '600': '#6d4c41', '700': '#5d4037',
    '800': '#4e342e', '900': '#3e2723'
  },
  'Grey': {
    '50': '#fafafa', '100': '#f5f5f5', '200': '#eeeeee', '300': '#e0e0e0',
    '400': '#bdbdbd', '500': '#9e9e9e', '600': '#757575', '700': '#616161',
    '800': '#424242', '900': '#212121'
  },
  'Blue Grey': {
    '50': '#eceff1', '100': '#cfd8dc', '200': '#b0bec5', '300': '#90a4ae',
    '400': '#78909c', '500': '#607d8b', '600': '#546e7a', '700': '#455a64',
    '800': '#37474f', '900': '#263238'
  }
}

const DEFAULT_COLORS: ThemeColors = {
  'bg': '#161616',
  'surface': '#262626',
  'surface-2': '#333333',
  'surface-3': '#3d3d3d',
  'surface-overlay': '#262626',
  'interactive': '#0f62fe',
  'interactive-hover': '#0353e9',
  'interactive-active': '#002d9c',
  'interactive-disabled': '#525252',
  'primary': '#0f62fe',
  'primary-strong': '#002d9c',
  'accent': '#78a9ff',
  'text-primary': '#f4f4f4',
  'text-secondary': '#c6c6c6',
  'text-tertiary': '#8d8d8d',
  'text-inverse': '#161616',
  'muted': '#c6c6c6',
  'muted-2': '#8d8d8d',
  'border': '#525252',
  'border-strong': '#8d8d8d',
  'support-success': '#24a148',
  'support-warning': '#f1c21b',
  'support-danger': '#da1e28',
  'support-info': '#4589ff',
  'success': '#24a148',
  'danger': '#da1e28',
  'warning': '#f1c21b',
  'bg-empty': '#262626',
  'bg-offline': 'rgba(218, 30, 40, 0.12)',
  'bg-fault': 'rgba(218, 30, 40, 0.2)',
  'bg-warning': 'rgba(241, 194, 27, 0.16)',
  'focus-ring': '#0f62fe',
  'shadow-strong': 'none',
  'shadow-soft': 'none',
  'color-scheme': 'dark'
}

const DEFAULT_WIDGETS: ThemeWidgets = {
  'border-radius-sm': '0px',
  'border-radius-md': '0px',
  'border-radius-lg': '4px',
  'border-width': '1px',
  'surface-gradient': 'none',
  'glow-intensity': '0',
  'transition-speed': '0.12s'
}

interface ThemeCreatorDialogProps {
  isOpen: boolean
  onClose: () => void
  onSave: (theme: Theme) => void
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

export function ThemeCreatorDialog({
  isOpen,
  onClose,
  onSave,
  currentTheme: propCurrentTheme,
  onThemeChange,
  customThemes: propCustomThemes = {},
  onDeleteCustomTheme,
  welcomeBanner,
  onToggleWelcomeBanner,
  bannerLoading = false,
  bootSplash,
  onToggleBootSplash,
  splashLoading = false
}: ThemeCreatorDialogProps) {
  const isMobile = useIsMobile()
  const [themeName, setThemeName] = useState('My Custom Theme')
  const [themeDescription, setThemeDescription] = useState('A custom theme created with the theme editor')
  const [colors, setColors] = useState<ThemeColors>({ ...DEFAULT_COLORS })
  const [widgets, setWidgets] = useState<ThemeWidgets>({ ...DEFAULT_WIDGETS })
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'colors': true,
    'widgets': false,
    'palette': true,
    'theme-selector': true,
    'system-config': false
  })
  const [selectedPalette, setSelectedPalette] = useState<string | null>(null)
  const [activeColorPicker, setActiveColorPicker] = useState<string | null>(null)
  const [previousTheme, setPreviousTheme] = useState<string>('')
  const [currentTheme, setCurrentTheme] = useState(propCurrentTheme || getSavedThemeId())
  const [customThemes, setCustomThemes] = useState<Record<string, Theme>>(propCustomThemes)

  useEffect(() => {
    if (isOpen) {
      setPreviousTheme(getSavedThemeId())
      setCurrentTheme(propCurrentTheme || getSavedThemeId())
      setCustomThemes(propCustomThemes)
    }
  }, [isOpen, propCurrentTheme, propCustomThemes])

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const updateColor = useCallback((key: keyof ThemeColors, value: string) => {
    setColors(prev => ({ ...prev, [key]: value }))
  }, [])

  const previewTheme = useCallback(() => {
    const root = document.documentElement
    Object.entries(colors).forEach(([key, value]) => {
      if (key === 'color-scheme') {
        root.style.colorScheme = value
      } else {
        root.style.setProperty(`--${key}`, value)
      }
    })
    Object.entries(widgets).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value)
    })
  }, [colors, widgets])

  useEffect(() => {
    if (isOpen) {
      previewTheme()
    }
  }, [colors, widgets, isOpen, previewTheme])

  const handleClose = () => {
    // Restore previous theme
    if (previousTheme) {
      applyTheme(previousTheme)
    }
    onClose()
  }

  const handleSave = () => {
    const themeId = `custom-${Date.now()}`
    const newTheme: Theme = {
      id: themeId,
      name: themeName,
      description: themeDescription,
      colors,
      widgets
    }
    onSave(newTheme)
    onClose()
  }

  const handleReset = () => {
    setColors({ ...DEFAULT_COLORS })
    setWidgets({ ...DEFAULT_WIDGETS })
  }

  const applyPaletteColor = (color: string, target: keyof ThemeColors) => {
    updateColor(target, color)
    setActiveColorPicker(null)
  }

  const handleThemeChange = (themeId: string) => {
    applyTheme(themeId)
    setCurrentTheme(themeId)
    onThemeChange?.(themeId)
  }

  const handleDeleteCustomTheme = (themeId: string) => {
    if (currentTheme === themeId) {
      applyTheme('default')
      setCurrentTheme('default')
    }
    onDeleteCustomTheme?.(themeId)
    setCustomThemes(prev => {
      const updated = { ...prev }
      delete updated[themeId]
      return updated
    })
  }

  if (!isOpen) return null

  const colorFields: { key: keyof ThemeColors; label: string; type: 'color' | 'text' }[] = [
    { key: 'bg', label: 'Background', type: 'color' },
    { key: 'surface', label: 'Surface', type: 'color' },
    { key: 'surface-2', label: 'Surface 2', type: 'color' },
    { key: 'surface-3', label: 'Surface 3', type: 'color' },
    { key: 'primary', label: 'Primary', type: 'color' },
    { key: 'primary-strong', label: 'Primary Strong', type: 'color' },
    { key: 'accent', label: 'Accent', type: 'color' },
    { key: 'muted', label: 'Muted Text', type: 'color' },
    { key: 'muted-2', label: 'Muted Text 2', type: 'color' },
    { key: 'border', label: 'Border', type: 'text' },
    { key: 'success', label: 'Success', type: 'color' },
    { key: 'danger', label: 'Danger', type: 'color' },
    { key: 'warning', label: 'Warning', type: 'color' },
    { key: 'shadow-strong', label: 'Shadow Strong', type: 'text' },
    { key: 'shadow-soft', label: 'Shadow Soft', type: 'text' },
  ]

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: isMobile ? 'stretch' : 'center',
        zIndex: 10000,
        backdropFilter: 'blur(4px)'
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: isMobile ? 0 : 'var(--border-radius-md)',
          border: '1px solid var(--border)',
          width: isMobile ? '100vw' : '90%',
          maxWidth: isMobile ? '100vw' : 700,
          maxHeight: isMobile ? '100vh' : '90vh',
          minHeight: isMobile ? '100vh' : undefined,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Palette size={20} weight="duotone" style={{ color: 'var(--primary)' }} />
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Create Theme</h2>
          </div>
          <button
            onClick={handleClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 6,
              display: 'flex',
              color: 'var(--muted)'
            }}
          >
            <X size={20} weight="bold" />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {/* Theme Selector Section */}
          <div style={{ marginBottom: 20 }}>
            <button
              onClick={() => toggleSection('theme-selector')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 0',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'inherit',
                fontSize: 14,
                fontWeight: 600
              }}
            >
              {expandedSections['theme-selector'] ? <CaretDown size={16} weight="bold" /> : <CaretRight size={16} weight="bold" />}
              Theme Selection
            </button>
            {expandedSections['theme-selector'] && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <select
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--border-radius-sm)',
                    fontSize: 13,
                    background: 'var(--bg)',
                    color: 'inherit',
                    border: '1px solid var(--border)',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                  onChange={e => handleThemeChange(e.target.value)}
                  value={currentTheme}
                >
                  <optgroup label="Built-in Themes">
                    {themeOrder.map(id => (
                      <option key={id} value={id}>{themes[id].name}</option>
                    ))}
                  </optgroup>
                  {Object.keys(customThemes).length > 0 && (
                    <optgroup label="Custom Themes">
                      {Object.values(customThemes).map(theme => (
                        <option key={theme.id} value={theme.id}>{theme.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <div style={{ fontSize: 11, color: 'var(--muted)', minHeight: '32px' }}>
                  {getAllThemes()[currentTheme]?.description}
                </div>
                {customThemes[currentTheme] && (
                  <button
                    onClick={() => handleDeleteCustomTheme(currentTheme)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '8px 12px',
                      borderRadius: 'var(--border-radius-sm)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      background: 'rgba(239, 68, 68, 0.05)',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 500,
                      transition: 'all 150ms'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'
                      e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.05)'
                      e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)'
                    }}
                  >
                    Delete Custom Theme
                  </button>
                )}
              </div>
            )}
          </div>

          {/* System Configuration Section */}
          {(welcomeBanner || bootSplash) && (
            <div style={{ marginBottom: 20 }}>
              <button
                onClick={() => toggleSection('system-config')}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 0',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'inherit',
                  fontSize: 14,
                  fontWeight: 600
                }}
              >
                {expandedSections['system-config'] ? <CaretDown size={16} weight="bold" /> : <CaretRight size={16} weight="bold" />}
                System Configuration
              </button>
              {expandedSections['system-config'] && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {welcomeBanner && (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Terminal Welcome Banner</div>
                      <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, lineHeight: '1.4' }}>
                        Show a branded welcome message when opening new terminal sessions.
                      </p>
                      <button
                        onClick={onToggleWelcomeBanner}
                        disabled={bannerLoading || !welcomeBanner}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          width: '100%',
                          padding: '10px 16px',
                          borderRadius: 'var(--border-radius-sm)',
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: bannerLoading ? 'wait' : 'pointer',
                          border: '1px solid rgba(59, 130, 246, 0.3)',
                          background: welcomeBanner?.installed ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.15)',
                          color: '#3b82f6',
                          opacity: bannerLoading ? 0.7 : 1,
                          transition: 'all 150ms'
                        }}
                      >
                        {bannerLoading ? (
                          <>
                            <SpinnerGap size={14} weight="duotone" style={{ animation: 'spin 1s linear infinite' }} />
                            {welcomeBanner?.installed ? 'Removing...' : 'Installing...'}
                          </>
                        ) : welcomeBanner?.installed ? (
                          <>
                            <X size={14} weight="bold" />
                            Remove
                          </>
                        ) : (
                          <>
                            <Check size={14} weight="bold" />
                            Install
                          </>
                        )}
                      </button>
                      {welcomeBanner?.installed && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 11,
                          color: '#22c55e',
                          marginTop: 8
                        }}>
                          <Check size={12} />
                          Currently installed
                        </div>
                      )}
                    </div>
                  )}
                  {bootSplash && (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Boot Splash Screen</div>
                      <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, lineHeight: '1.4' }}>
                        Show a branded splash screen during system boot.
                      </p>
                      <button
                        onClick={onToggleBootSplash}
                        disabled={splashLoading || !bootSplash}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          width: '100%',
                          padding: '10px 16px',
                          borderRadius: 'var(--border-radius-sm)',
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: splashLoading ? 'wait' : 'pointer',
                          border: '1px solid rgba(236, 72, 153, 0.3)',
                          background: bootSplash?.installed ? 'rgba(236, 72, 153, 0.1)' : 'rgba(236, 72, 153, 0.15)',
                          color: '#ec4899',
                          opacity: splashLoading ? 0.7 : 1,
                          transition: 'all 150ms'
                        }}
                      >
                        {splashLoading ? (
                          <>
                            <SpinnerGap size={14} weight="duotone" style={{ animation: 'spin 1s linear infinite' }} />
                            {bootSplash?.installed ? 'Removing...' : 'Installing...'}
                          </>
                        ) : bootSplash?.installed ? (
                          <>
                            <X size={14} weight="bold" />
                            Remove
                          </>
                        ) : (
                          <>
                            <Check size={14} weight="bold" />
                            Install
                          </>
                        )}
                      </button>
                      {bootSplash?.installed && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 11,
                          color: '#22c55e',
                          marginTop: 8
                        }}>
                          <Check size={12} weight="bold" />
                          Currently installed
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Theme Name & Description */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
              Theme Name
            </label>
            <input
              type="text"
              value={themeName}
              onChange={e => setThemeName(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--border-radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'inherit',
                fontSize: 14,
                outline: 'none'
              }}
            />
            <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 6, marginTop: 12 }}>
              Description
            </label>
            <input
              type="text"
              value={themeDescription}
              onChange={e => setThemeDescription(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--border-radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'inherit',
                fontSize: 14,
                outline: 'none'
              }}
            />
          </div>

          {/* Material Palettes Section */}
          <div style={{ marginBottom: 16 }}>
            <button
              onClick={() => toggleSection('palette')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 0',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'inherit',
                fontSize: 14,
                fontWeight: 600
              }}
            >
              {expandedSections.palette ? <CaretDown size={16} weight="bold" /> : <CaretRight size={16} weight="bold" />}
              Material Design Palettes
            </button>
            {expandedSections.palette && (
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', 
                gap: 8,
                marginTop: 8
              }}>
                {Object.entries(MATERIAL_PALETTES).map(([name, shades]) => (
                  <button
                    key={name}
                    onClick={() => setSelectedPalette(selectedPalette === name ? null : name)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      padding: 8,
                      borderRadius: 'var(--border-radius-sm)',
                      border: selectedPalette === name ? '2px solid var(--primary)' : '1px solid var(--border)',
                      background: 'var(--bg)',
                      cursor: 'pointer',
                      transition: 'all 150ms'
                    }}
                  >
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: 4,
                      background: shades['500'],
                      marginBottom: 4
                    }} />
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>{name}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedPalette && expandedSections.palette && (
              <div style={{ 
                marginTop: 12,
                padding: 12,
                background: 'var(--bg)',
                borderRadius: 'var(--border-radius-sm)',
                border: '1px solid var(--border)'
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{selectedPalette} Shades</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {Object.entries(MATERIAL_PALETTES[selectedPalette as keyof typeof MATERIAL_PALETTES]).map(([shade, color]) => (
                    <button
                      key={shade}
                      onClick={() => {
                        if (activeColorPicker) {
                          applyPaletteColor(color, activeColorPicker as keyof ThemeColors)
                        }
                      }}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 4,
                        background: color,
                        border: activeColorPicker ? '2px solid var(--primary)' : '1px solid rgba(0,0,0,0.2)',
                        cursor: activeColorPicker ? 'pointer' : 'default',
                        opacity: activeColorPicker ? 1 : 0.8,
                        transition: 'all 150ms'
                      }}
                      title={`${shade}: ${color}`}
                    />
                  ))}
                </div>
                {activeColorPicker && (
                  <div style={{ fontSize: 11, color: 'var(--primary)', marginTop: 8 }}>
                    Click a color to apply it to: {activeColorPicker}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Colors Section */}
          <div style={{ marginBottom: 16 }}>
            <button
              onClick={() => toggleSection('colors')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 0',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'inherit',
                fontSize: 14,
                fontWeight: 600
              }}
            >
              {expandedSections.colors ? <CaretDown size={16} weight="bold" /> : <CaretRight size={16} weight="bold" />}
              Colors
            </button>
            {expandedSections.colors && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
                {colorFields.map(({ key, label, type }) => (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {type === 'color' && (
                        <input
                          type="color"
                          value={colors[key].startsWith('#') ? colors[key] : '#000000'}
                          onChange={e => updateColor(key, e.target.value)}
                          style={{
                            width: 36,
                            height: 36,
                            padding: 0,
                            border: '1px solid var(--border)',
                            borderRadius: 4,
                            cursor: 'pointer',
                            background: 'transparent'
                          }}
                        />
                      )}
                      <input
                        type="text"
                        value={colors[key]}
                        onChange={e => updateColor(key, e.target.value)}
                        style={{
                          flex: 1,
                          padding: '8px 10px',
                          borderRadius: 'var(--border-radius-sm)',
                          border: '1px solid var(--border)',
                          background: 'var(--bg)',
                          color: 'inherit',
                          fontSize: 12,
                          fontFamily: 'monospace',
                          outline: 'none'
                        }}
                      />
                      {type === 'color' && (
                        <button
                          onClick={() => setActiveColorPicker(activeColorPicker === key ? null : key)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 'var(--border-radius-sm)',
                            border: activeColorPicker === key ? '2px solid var(--primary)' : '1px solid var(--border)',
                            background: activeColorPicker === key ? 'var(--primary)' : 'var(--bg)',
                            color: activeColorPicker === key ? 'white' : 'var(--muted)',
                            cursor: 'pointer',
                            fontSize: 10
                          }}
                          title="Pick from palette"
                        >
                          <Palette size={14} weight="duotone" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {/* Color Scheme */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)' }}>Color Scheme</label>
                  <select
                    value={colors['color-scheme']}
                    onChange={e => updateColor('color-scheme', e.target.value as 'dark' | 'light')}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--border-radius-sm)',
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      color: 'inherit',
                      fontSize: 12,
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Widget Styles Section */}
          <div>
            <button
              onClick={() => toggleSection('widgets')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 0',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'inherit',
                fontSize: 14,
                fontWeight: 600
              }}
            >
              {expandedSections.widgets ? <CaretDown size={16} weight="bold" /> : <CaretRight size={16} weight="bold" />}
              Widget Styles
            </button>
            {expandedSections.widgets && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)' }}>Border Radius Small</label>
                  <input
                    type="text"
                    value={widgets['border-radius-sm']}
                    onChange={e => setWidgets(prev => ({ ...prev, 'border-radius-sm': e.target.value }))}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 'var(--border-radius-sm)',
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      color: 'inherit',
                      fontSize: 12,
                      outline: 'none'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)' }}>Border Radius Medium</label>
                  <input
                    type="text"
                    value={widgets['border-radius-md']}
                    onChange={e => setWidgets(prev => ({ ...prev, 'border-radius-md': e.target.value }))}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 'var(--border-radius-sm)',
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      color: 'inherit',
                      fontSize: 12,
                      outline: 'none'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)' }}>Border Radius Large</label>
                  <input
                    type="text"
                    value={widgets['border-radius-lg']}
                    onChange={e => setWidgets(prev => ({ ...prev, 'border-radius-lg': e.target.value }))}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 'var(--border-radius-sm)',
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      color: 'inherit',
                      fontSize: 12,
                      outline: 'none'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)' }}>Border Width</label>
                  <input
                    type="text"
                    value={widgets['border-width']}
                    onChange={e => setWidgets(prev => ({ ...prev, 'border-width': e.target.value }))}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 'var(--border-radius-sm)',
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      color: 'inherit',
                      fontSize: 12,
                      outline: 'none'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)' }}>Surface Gradient</label>
                  <input
                    type="text"
                    value={widgets['surface-gradient']}
                    onChange={e => setWidgets(prev => ({ ...prev, 'surface-gradient': e.target.value }))}
                    placeholder="none or linear-gradient(...)"
                    style={{
                      padding: '8px 10px',
                      borderRadius: 'var(--border-radius-sm)',
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      color: 'inherit',
                      fontSize: 12,
                      outline: 'none'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)' }}>Glow Intensity (0-3)</label>
                  <input
                    type="range"
                    min="0"
                    max="3"
                    step="0.5"
                    value={widgets['glow-intensity']}
                    onChange={e => setWidgets(prev => ({ ...prev, 'glow-intensity': e.target.value }))}
                    style={{ width: '100%' }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>{widgets['glow-intensity']}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)' }}>Transition Speed</label>
                  <input
                    type="text"
                    value={widgets['transition-speed']}
                    onChange={e => setWidgets(prev => ({ ...prev, 'transition-speed': e.target.value }))}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 'var(--border-radius-sm)',
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      color: 'inherit',
                      fontSize: 12,
                      outline: 'none'
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: isMobile ? '12px 16px' : '16px 20px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: 10,
          justifyContent: 'space-between',
          position: isMobile ? 'sticky' : 'static',
          bottom: 0,
          background: isMobile ? 'var(--surface)' : 'transparent',
        }}>
          <button
            onClick={handleReset}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 16px',
              borderRadius: 'var(--border-radius-sm)',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--muted)',
              cursor: 'pointer',
              fontSize: 13
            }}
          >
            <ArrowCounterClockwise size={14} weight="duotone" />
            Reset
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={previewTheme}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 16px',
                borderRadius: 'var(--border-radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--surface-2)',
                color: 'inherit',
                cursor: 'pointer',
                fontSize: 13
              }}
            >
              <Eye size={14} weight="duotone" />
              Preview
            </button>
            <button
              onClick={handleSave}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 20px',
                borderRadius: 'var(--border-radius-sm)',
                border: 'none',
                background: 'var(--primary)',
                color: 'white',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500
              }}
            >
              <FloppyDisk size={14} weight="duotone" />
              Save Theme
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
