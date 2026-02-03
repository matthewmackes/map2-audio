import { Github, ExternalLink, Terminal, Check, X, Loader2, Monitor, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'
import { themes, themeOrder, applyTheme, getSavedThemeId, saveCustomTheme, getCustomThemes, deleteCustomTheme, getAllThemes } from '../theme'
import type { Theme } from '../theme'
import { ThemeCreatorDialog } from '../components/ThemeCreatorDialog'

interface VersionInfo {
  version?: string
  build_date?: string
  commit?: string
}

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

const CREDITS = [
  'JUCE - Audio engine',
  'Neural Amp Modeler - AI amp modeling',
  'LV2 - Plugin format',
  'FastAPI - Backend API',
  'React - UI framework',
  'Fedora PREEMPT_RT - Real-time Linux',
]

const LINKS = [
  { label: 'GitHub', url: 'https://github.com', icon: Github },
  { label: 'JUCE', url: 'https://juce.com', icon: ExternalLink },
  { label: 'NAM', url: 'https://www.neuralampmodeler.com', icon: ExternalLink },
  { label: 'LV2', url: 'https://lv2plug.in', icon: ExternalLink },
]

export function AboutPage() {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)
  const [welcomeBanner, setWelcomeBanner] = useState<WelcomeBannerStatus | null>(null)
  const [bannerLoading, setBannerLoading] = useState(false)
  const [bootSplash, setBootSplash] = useState<BootSplashStatus | null>(null)
  const [splashLoading, setSplashLoading] = useState(false)
  const [showThemeCreator, setShowThemeCreator] = useState(false)
  const [customThemes, setCustomThemes] = useState<Record<string, Theme>>({})
  const [currentTheme, setCurrentTheme] = useState(getSavedThemeId())

  const refreshCustomThemes = useCallback(() => {
    setCustomThemes(getCustomThemes())
  }, [])

  useEffect(() => {
    fetch('/api/version')
      .then(r => r.json())
      .then(setVersionInfo)
      .catch(() => setVersionInfo({ version: '2.0.0', build_date: 'Feb 2025' }))

    // Check welcome banner status
    fetch('/api/system/welcome-banner')
      .then(r => r.json())
      .then(setWelcomeBanner)
      .catch(() => setWelcomeBanner({ installed: false }))

    // Check boot splash status
    fetch('/api/system/boot-splash')
      .then(r => r.json())
      .then(setBootSplash)
      .catch(() => setBootSplash({ installed: false }))

    // Load custom themes
    refreshCustomThemes()
  }, [refreshCustomThemes])

  const handleSaveTheme = (theme: Theme) => {
    saveCustomTheme(theme)
    applyTheme(theme.id)
    setCurrentTheme(theme.id)
    refreshCustomThemes()
  }

  const handleDeleteCustomTheme = (themeId: string) => {
    if (currentTheme === themeId) {
      applyTheme('default')
      setCurrentTheme('default')
    }
    deleteCustomTheme(themeId)
    refreshCustomThemes()
  }

  const handleThemeChange = (themeId: string) => {
    applyTheme(themeId)
    setCurrentTheme(themeId)
  }

  const toggleWelcomeBanner = async () => {
    if (!welcomeBanner || bannerLoading) return
    setBannerLoading(true)
    try {
      const response = await fetch(`/api/system/welcome-banner?install=${!welcomeBanner.installed}`, {
        method: 'POST'
      })
      const result = await response.json()
      if (result.success) {
        setWelcomeBanner({ installed: result.installed })
      }
    } catch (e) {
      console.error('Failed to toggle welcome banner:', e)
    } finally {
      setBannerLoading(false)
    }
  }

  const toggleBootSplash = async () => {
    if (!bootSplash || splashLoading) return
    setSplashLoading(true)
    try {
      const response = await fetch(`/api/system/boot-splash?install=${!bootSplash.installed}`, {
        method: 'POST'
      })
      const result = await response.json()
      if (result.success) {
        setBootSplash({ ...bootSplash, installed: result.installed })
      }
    } catch (e) {
      console.error('Failed to toggle boot splash:', e)
    } finally {
      setSplashLoading(false)
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 500, margin: '0 auto' }}>
      {/* Version Info */}
      <div className="card">
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          Version
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted)' }}>Version</span>
            <span style={{ fontWeight: 500 }}>{versionInfo?.version || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted)' }}>Build</span>
            <span style={{ fontWeight: 500 }}>{versionInfo?.build_date || '—'}</span>
          </div>
          {versionInfo?.commit && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Commit</span>
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                {versionInfo.commit.slice(0, 7)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Links */}
      <div className="card">
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'inherit' }}>
          Links
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {LINKS.map(link => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--border-radius-sm)',
                color: 'inherit',
                textDecoration: 'none',
                fontSize: 13,
                transition: 'border-color 150ms',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <link.icon size={14} />
              {link.label}
            </a>
          ))}
        </div>
      </div>

      {/* Credits */}
      <div className="card">
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'inherit' }}>
          Credits
        </h3>
        <ul style={{
          margin: 0,
          padding: 0,
          listStyle: 'none',
          fontSize: 13,
          color: 'var(--muted)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4
        }}>
          {CREDITS.map(credit => (
            <li key={credit}>{credit}</li>
          ))}
        </ul>
      </div>

      {/* Theme Selection */}
      <div className="card">
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'inherit' }}>
          Theme
        </h3>
        <select
          id="theme-selector"
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 'var(--border-radius-sm)',
            fontSize: 14,
            background: 'var(--surface)',
            color: 'inherit',
            border: '1px solid var(--border)',
            outline: 'none',
            cursor: 'pointer',
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
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
          {getAllThemes()[currentTheme]?.description}
        </div>

        {/* Custom Theme Actions */}
        {customThemes[currentTheme] && (
          <button
            onClick={() => handleDeleteCustomTheme(currentTheme)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 10,
              padding: '6px 12px',
              borderRadius: 'var(--border-radius-sm)',
              border: '1px solid var(--danger)',
              background: 'transparent',
              color: 'var(--danger)',
              cursor: 'pointer',
              fontSize: 12
            }}
          >
            <Trash2 size={12} />
            Delete Custom Theme
          </button>
        )}

        {/* Create Theme Button */}
        <button
          onClick={() => setShowThemeCreator(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            marginTop: 12,
            padding: '10px 16px',
            borderRadius: 'var(--border-radius-sm)',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            border: '1px solid var(--primary)',
            background: 'transparent',
            color: 'var(--primary)',
            transition: 'all 150ms',
          }}
        >
          <Plus size={14} />
          Create Custom Theme
        </button>
      </div>

      {/* Theme Creator Dialog */}
      <ThemeCreatorDialog
        isOpen={showThemeCreator}
        onClose={() => setShowThemeCreator(false)}
        onSave={handleSaveTheme}
      />

      {/* Welcome Banner */}
      <div className="card">
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'inherit' }}>
          Terminal Welcome Banner
        </h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          Show a branded welcome message when opening new terminal sessions.
        </p>
        <button
          onClick={toggleWelcomeBanner}
          disabled={bannerLoading || !welcomeBanner}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            padding: '10px 16px',
            borderRadius: 'var(--border-radius-sm)',
            fontSize: 13,
            fontWeight: 500,
            cursor: bannerLoading ? 'wait' : 'pointer',
            border: '1px solid var(--border)',
            background: welcomeBanner?.installed ? 'var(--surface)' : 'var(--primary)',
            color: welcomeBanner?.installed ? 'inherit' : 'white',
            opacity: bannerLoading ? 0.7 : 1,
            transition: 'all 150ms',
          }}
        >
          {bannerLoading ? (
            <>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              {welcomeBanner?.installed ? 'Removing...' : 'Installing...'}
            </>
          ) : welcomeBanner?.installed ? (
            <>
              <X size={14} />
              Remove Welcome Banner
            </>
          ) : (
            <>
              <Terminal size={14} />
              Install Welcome Banner
            </>
          )}
        </button>
        {welcomeBanner?.installed && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 6, 
            fontSize: 11, 
            color: 'var(--success)', 
            marginTop: 8 
          }}>
            <Check size={12} />
            Currently installed
          </div>
        )}
      </div>

      {/* Boot Splash */}
      <div className="card">
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'inherit' }}>
          Boot Splash Screen
        </h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          Show a branded splash screen during system boot.
        </p>
        <button
          onClick={toggleBootSplash}
          disabled={splashLoading || !bootSplash}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            padding: '10px 16px',
            borderRadius: 'var(--border-radius-sm)',
            fontSize: 13,
            fontWeight: 500,
            cursor: splashLoading ? 'wait' : 'pointer',
            border: '1px solid var(--border)',
            background: bootSplash?.installed ? 'var(--surface)' : 'var(--primary)',
            color: bootSplash?.installed ? 'inherit' : 'white',
            opacity: splashLoading ? 0.7 : 1,
            transition: 'all 150ms',
          }}
        >
          {splashLoading ? (
            <>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              {bootSplash?.installed ? 'Removing...' : 'Installing...'}
            </>
          ) : bootSplash?.installed ? (
            <>
              <X size={14} />
              Remove Boot Splash
            </>
          ) : (
            <>
              <Monitor size={14} />
              Install Boot Splash
            </>
          )}
        </button>
        {bootSplash?.installed && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 6, 
            fontSize: 11, 
            color: 'var(--success)', 
            marginTop: 8 
          }}>
            <Check size={12} />
            Currently installed (reboot to see)
          </div>
        )}
      </div>
    </div>
  )
}
