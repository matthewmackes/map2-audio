import { Github, ExternalLink, Terminal, Check, X, Loader2, Monitor, Plus, Trash2, Shield, Info, Music, Code2, Zap, Server, PenTool, Cpu } from 'lucide-react'
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

interface RateLimitingStatus {
  enabled: boolean
}

interface ProjectCredit {
  name: string
  description: string
  website: string
  color: string
  icon: React.ReactNode
  role: string
}

const PROJECTS: ProjectCredit[] = [
  {
    name: 'JUCE',
    description: 'Cross-platform C++ audio application framework with support for VST, VST3, AU, AUv3, LV2, and AAX plugins',
    website: 'https://juce.com/',
    color: '#1e40af',
    icon: <Music size={20} />,
    role: 'Audio Engine',
  },
  {
    name: 'Neural Amp Modeler',
    description: 'Deep learning technology for modeling guitar amplifiers, pedals, and signal chains using WaveNet architecture',
    website: 'https://www.neuralampmodeler.com/',
    color: '#7c3aed',
    icon: <Zap size={20} />,
    role: 'AI Amp Modeling',
  },
  {
    name: 'LV2',
    description: 'Extensible open standard audio plugin format specification for cross-DAW plugin compatibility',
    website: 'https://lv2plug.in/',
    color: '#059669',
    icon: <Cpu size={20} />,
    role: 'Plugin Format',
  },
  {
    name: 'FastAPI',
    description: 'Modern, high-performance Python web framework for building APIs with standard Python type hints',
    website: 'https://fastapi.tiangolo.com/',
    color: '#0ea5e9',
    icon: <Server size={20} />,
    role: 'Backend API',
  },
  {
    name: 'React',
    description: 'Open-source JavaScript library for building user interfaces with component-based architecture',
    website: 'https://react.dev/',
    color: '#61dbfb',
    icon: <Code2 size={20} />,
    role: 'UI Framework',
  },
  {
    name: 'Fedora PREEMPT_RT',
    description: 'Fedora Linux distribution with real-time kernel support for deterministic low-latency performance',
    website: 'https://fedoraproject.org/',
    color: '#0b57a4',
    icon: <PenTool size={20} />,
    role: 'Real-time OS',
  },
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
  const [rateLimiting, setRateLimiting] = useState<RateLimitingStatus | null>(null)
  const [rateLimitingLoading, setRateLimitingLoading] = useState(false)
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

    // Check rate limiting status
    fetch('/api/system/rate-limiting')
      .then(r => r.json())
      .then(setRateLimiting)
      .catch(() => setRateLimiting({ enabled: true }))

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

  const toggleRateLimiting = async () => {
    if (!rateLimiting || rateLimitingLoading) return
    setRateLimitingLoading(true)
    try {
      const response = await fetch(`/api/system/rate-limiting?enabled=${!rateLimiting.enabled}`, {
        method: 'POST'
      })
      const result = await response.json()
      if (result.success) {
        setRateLimiting({ enabled: result.enabled })
      }
    } catch (e) {
      console.error('Failed to toggle rate limiting:', e)
    } finally {
      setRateLimitingLoading(false)
    }
  }

  return (
    <div style={{
      padding: '32px',
      background: 'linear-gradient(135deg, rgba(10, 15, 25, 0.5) 0%, rgba(20, 25, 40, 0.3) 100%)',
      minHeight: '100vh'
    }}>
      {/* Header Section */}
      <header style={{
        marginBottom: 40,
        paddingBottom: 24,
        borderBottom: '2px solid rgba(59, 130, 246, 0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <Info size={36} style={{ color: '#3b82f6', marginRight: 8, flexShrink: 0 }} />
          <h1 style={{
            fontSize: 32,
            fontWeight: 800,
            color: '#f2f6ff',
            margin: 0,
            letterSpacing: '-0.5px'
          }}>
            About MAP2
          </h1>
        </div>
        <p style={{
          fontSize: 13,
          color: '#888',
          margin: '12px 0 0',
          fontWeight: 500
        }}>
          Version information, credits, and system configuration
        </p>
      </header>

      {/* Main Content Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 20,
        marginBottom: 32
      }}>
        {/* Version Info - Top Left */}
        <div style={{
          background: 'rgba(15, 20, 35, 0.6)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          borderRadius: 12,
          padding: 20,
          backdropFilter: 'blur(8px)'
        }}>
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#3b82f6',
            marginBottom: 16,
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            ℹ️ Version Information
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Version</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{versionInfo?.version || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Build Date</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{versionInfo?.build_date || '—'}</div>
            </div>
            {versionInfo?.commit && (
              <div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Commit</div>
                <div style={{ fontSize: 13, fontFamily: 'monospace', color: '#3b82f6', fontWeight: 600 }}>
                  {versionInfo.commit.slice(0, 7)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Links - Top Right */}
        <div style={{
          background: 'rgba(15, 20, 35, 0.6)',
          border: '1px solid rgba(34, 197, 94, 0.2)',
          borderRadius: 12,
          padding: 20,
          backdropFilter: 'blur(8px)'
        }}>
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#22c55e',
            marginBottom: 16,
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            🔗 Resources & Links
          </div>
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
                  padding: '8px 12px',
                  background: 'rgba(34, 197, 94, 0.05)',
                  border: '1px solid rgba(34, 197, 94, 0.2)',
                  borderRadius: 6,
                  color: '#22c55e',
                  textDecoration: 'none',
                  fontSize: 12,
                  fontWeight: 500,
                  transition: 'all 150ms',
                  cursor: 'pointer'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(34, 197, 94, 0.1)'
                  e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.4)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(34, 197, 94, 0.05)'
                  e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.2)'
                }}
              >
                <link.icon size={14} />
                {link.label}
              </a>
            ))}
          </div>
        </div>

        {/* Built With - Full Width */}
        <div style={{
          gridColumn: 'span 2',
          background: 'rgba(15, 20, 35, 0.6)',
          border: '1px solid rgba(245, 158, 11, 0.2)',
          borderRadius: 12,
          padding: 20,
          backdropFilter: 'blur(8px)'
        }}>
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#f59e0b',
            marginBottom: 16,
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            🏆 Built With Open-Source Technologies
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 12
          }}>
            {PROJECTS.map(project => (
              <a
                key={project.name}
                href={project.website}
                target="_blank"
                rel="noreferrer"
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'all 150ms'
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement
                  el.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement
                  el.style.transform = 'translateY(0)'
                }}
              >
                <div
                  style={{
                    padding: 16,
                    background: `linear-gradient(135deg, rgba(15, 20, 35, 0.8) 0%, rgba(15, 20, 35, 0.6) 100%)`,
                    border: `1px solid ${project.color}40`,
                    borderRadius: 8,
                    backdropFilter: 'blur(8px)',
                    cursor: 'pointer',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    transition: 'all 150ms'
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.borderColor = project.color
                    el.style.background = `linear-gradient(135deg, ${project.color}10 0%, ${project.color}05 100%)`
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.borderColor = `${project.color}40`
                    el.style.background = `linear-gradient(135deg, rgba(15, 20, 35, 0.8) 0%, rgba(15, 20, 35, 0.6) 100%)`
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ color: project.color }}>
                      {project.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: project.color }}>
                        {project.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#888' }}>
                        {project.role}
                      </div>
                    </div>
                  </div>
                  <p style={{
                    margin: 0,
                    fontSize: 12,
                    color: '#d4d4d8',
                    lineHeight: '1.4',
                    flex: 1
                  }}>
                    {project.description}
                  </p>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    color: project.color,
                    fontWeight: 500
                  }}>
                    Visit Project <ExternalLink size={12} />
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* System Configuration Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 20,
        marginBottom: 32
      }}>
        {/* Welcome Banner */}
        <div style={{
          background: 'rgba(15, 20, 35, 0.6)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          borderRadius: 12,
          padding: 20,
          backdropFilter: 'blur(8px)'
        }}>
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#3b82f6',
            marginBottom: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            💻 Terminal Welcome Banner
          </div>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 12, lineHeight: '1.5' }}>
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
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: bannerLoading ? 'wait' : 'pointer',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              background: welcomeBanner?.installed ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.15)',
              color: '#3b82f6',
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
                Remove
              </>
            ) : (
              <>
                <Terminal size={14} />
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

        {/* Boot Splash */}
        <div style={{
          background: 'rgba(15, 20, 35, 0.6)',
          border: '1px solid rgba(236, 72, 153, 0.2)',
          borderRadius: 12,
          padding: 20,
          backdropFilter: 'blur(8px)'
        }}>
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#ec4899',
            marginBottom: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            🎨 Boot Splash Screen
          </div>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 12, lineHeight: '1.5' }}>
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
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: splashLoading ? 'wait' : 'pointer',
              border: '1px solid rgba(236, 72, 153, 0.3)',
              background: bootSplash?.installed ? 'rgba(236, 72, 153, 0.1)' : 'rgba(236, 72, 153, 0.15)',
              color: '#ec4899',
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
                Remove
              </>
            ) : (
              <>
                <Monitor size={14} />
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
              <Check size={12} />
              Currently installed
            </div>
          )}
        </div>

        {/* Rate Limiting */}
        <div style={{
          background: 'rgba(15, 20, 35, 0.6)',
          border: '1px solid rgba(34, 197, 94, 0.2)',
          borderRadius: 12,
          padding: 20,
          backdropFilter: 'blur(8px)'
        }}>
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#22c55e',
            marginBottom: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            🛡️ API Rate Limiting
          </div>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 12, lineHeight: '1.5' }}>
            Protect endpoints from excessive requests. Limit per client per minute.
          </p>
          <button
            onClick={toggleRateLimiting}
            disabled={rateLimitingLoading || !rateLimiting}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              padding: '10px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: rateLimitingLoading ? 'wait' : 'pointer',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              background: rateLimiting?.enabled ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.05)',
              color: '#22c55e',
              opacity: rateLimitingLoading ? 0.7 : 1,
              transition: 'all 150ms',
            }}
          >
            {rateLimitingLoading ? (
              <>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                {rateLimiting?.enabled ? 'Disabling...' : 'Enabling...'}
              </>
            ) : rateLimiting?.enabled ? (
              <>
                <Shield size={14} />
                Disable
              </>
            ) : (
              <>
                <Shield size={14} />
                Enable
              </>
            )}
          </button>
          {rateLimiting?.enabled && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: '#22c55e',
              marginTop: 8
            }}>
              <Check size={12} />
              Currently enabled
            </div>
          )}
        </div>

        {/* Theme Selection - Full Width or Right Column */}
        <div style={{
          background: 'rgba(15, 20, 35, 0.6)',
          border: '1px solid rgba(168, 85, 247, 0.2)',
          borderRadius: 12,
          padding: 20,
          backdropFilter: 'blur(8px)'
        }}>
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#a855f7',
            marginBottom: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            🎭 Theme Selection
          </div>
          <select
            id="theme-selector"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              fontSize: 13,
              background: 'rgba(168, 85, 247, 0.05)',
              color: '#fff',
              border: '1px solid rgba(168, 85, 247, 0.2)',
              outline: 'none',
              cursor: 'pointer',
              marginBottom: 12
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
          <div style={{ fontSize: 11, color: '#888', marginBottom: 12, minHeight: '32px' }}>
            {getAllThemes()[currentTheme]?.description}
          </div>

          <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
            {customThemes[currentTheme] && (
              <button
                onClick={() => handleDeleteCustomTheme(currentTheme)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '8px 12px',
                  borderRadius: 8,
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
                <Trash2 size={12} />
                Delete Custom Theme
              </button>
            )}

            <button
              onClick={() => setShowThemeCreator(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                padding: '10px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                background: 'rgba(168, 85, 247, 0.1)',
                color: '#a855f7',
                transition: 'all 150ms',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(168, 85, 247, 0.15)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(168, 85, 247, 0.1)'
              }}
            >
              <Plus size={14} />
              Create Custom Theme
            </button>
          </div>
        </div>
      </div>

      {/* Theme Creator Dialog */}
      <ThemeCreatorDialog
        isOpen={showThemeCreator}
        onClose={() => setShowThemeCreator(false)}
        onSave={handleSaveTheme}
      />

      {/* Footer Info */}
      <div style={{
        marginTop: 32,
        padding: 16,
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(168, 85, 247, 0.05) 100%)',
        borderRadius: 12,
        border: '1px solid rgba(59, 130, 246, 0.15)',
        backdropFilter: 'blur(8px)',
        fontSize: 12,
        color: '#888',
        lineHeight: '1.6'
      }}>
        <strong style={{ color: '#3b82f6' }}>MAP2 Audio Platform</strong> — Professional audio processing, DSP control, and real-time monitoring for Linux-based audio workstations.
      </div>

      {/* Attribution Section */}
      <div style={{
        marginTop: 32,
        padding: 20,
        background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.08) 0%, rgba(236, 72, 153, 0.08) 100%)',
        borderRadius: 12,
        border: '1px solid rgba(168, 85, 247, 0.2)',
        backdropFilter: 'blur(8px)'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 20,
          alignItems: 'center'
        }}>
          <div>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#a855f7',
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              ✨ Platform Leadership
            </div>
            <div style={{ fontSize: 12, color: '#d4d4d8', marginBottom: 4 }}>
              <strong style={{ color: '#f2f6ff' }}>Matthew Mackes</strong> — Vibe Scrum Master & AI Taskmaster
            </div>
            <div style={{ fontSize: 11, color: '#888' }}>
              Buffalo, NY · <a href="mailto:matthewmackes@outlook.com" style={{ color: '#a855f7', textDecoration: 'none' }}>matthewmackes@outlook.com</a>
            </div>
            <p style={{
              fontSize: 11,
              color: '#888',
              margin: '12px 0 0 0',
              lineHeight: '1.5'
            }}>
              Orchestrating the vision, managing the ecosystem, and ensuring MAP2 delivers professional-grade audio processing with precision and style.
            </p>
          </div>
          <div style={{
            padding: 12,
            background: 'rgba(168, 85, 247, 0.1)',
            borderRadius: 8,
            border: '1px solid rgba(168, 85, 247, 0.2)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 24, marginBottom: 4 }}>🎵</div>
            <div style={{ fontSize: 10, color: '#a855f7', fontWeight: 600 }}>PLATFORM</div>
            <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>v2.0</div>
          </div>
        </div>
      </div>
    </div>
  )
}
