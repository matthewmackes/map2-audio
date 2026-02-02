import { Github, ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { themes, themeOrder, applyTheme, getSavedThemeId } from '../theme'

interface VersionInfo {
  version?: string
  build_date?: string
  commit?: string
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

  useEffect(() => {
    fetch('/api/version')
      .then(r => r.json())
      .then(setVersionInfo)
      .catch(() => setVersionInfo({ version: '2.0.0', build_date: 'Feb 2025' }))
  }, [])

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
          onChange={e => applyTheme(e.target.value)}
          defaultValue={getSavedThemeId()}
        >
          {themeOrder.map(id => (
            <option key={id} value={id}>{themes[id].name}</option>
          ))}
        </select>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
          {themes[getSavedThemeId()]?.description}
        </div>
      </div>
    </div>
  )
}
