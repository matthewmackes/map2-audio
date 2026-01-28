import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, ChevronDown, ChevronUp, Waves, Speaker, Loader2, Github, Building2, Radio, AlertCircle, Mountain, Music, Zap, Key } from 'lucide-react'
import { irLibraryApi } from '../../../map2/api'
import { LIBRARY_SOURCES } from '../../types/library'
import { useDownloadProgress } from '../../hooks/useDownloadProgress'
import { Tone3000Config } from './Tone3000Config'

const SOURCE_ICONS: Record<string, typeof Waves> = {
  // Reverb IRs
  conners: Waves,
  voxengo: Building2,
  samplicity: Waves,
  signaltonoize: Radio,
  echothief: Mountain,
  lexicon: Music,
  // Cabinet IRs
  djammincabs: Radio,
  overdriven: Speaker,
  // NAM Models
  nam_github: Github,
  tone3000: Zap,
}

export function LibrarySources() {
  const [expanded, setExpanded] = useState(true)
  const { startDownload, isDownloading, isStarting, startError } = useDownloadProgress()

  const librariesQuery = useQuery({
    queryKey: ['ir', 'libraries'],
    queryFn: irLibraryApi.getLibraries,
  })

  const handleDownloadAll = () => {
    startDownload({ parallel: 4, skip_existing: true })
  }

  const handleDownloadSource = (sourceName: string) => {
    startDownload({ sources: [sourceName], parallel: 4, skip_existing: true })
  }

  // Merge static source info with API counts
  const sourcesWithCounts = LIBRARY_SOURCES.map(source => {
    const apiData = librariesQuery.data?.libraries?.find(l => l.name === source.name)
    return {
      ...source,
      count: apiData?.count ?? 0,
      license: apiData?.license ?? source.license,
    }
  })

  return (
    <div className="card">
      <button
        className="disclosure-trigger"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'none',
          border: 'none',
          padding: '16px',
          cursor: 'pointer',
          color: 'inherit',
        }}
      >
        <div className="flex" style={{ gap: 12, alignItems: 'center' }}>
          <Download size={20} style={{ color: 'var(--primary)' }} />
          <span style={{ fontWeight: 600, fontSize: 16 }}>IR Library Sources</span>
          <span className="badge" style={{ marginLeft: 8 }}>
            {sourcesWithCounts.length} sources
          </span>
        </div>
        <div className="flex" style={{ gap: 12, alignItems: 'center' }}>
          {!isDownloading && (
            <button
              className="btn btn-primary btn-sm"
              onClick={(e) => {
                e.stopPropagation()
                handleDownloadAll()
              }}
              disabled={isStarting || isDownloading}
            >
              {isStarting ? (
                <>
                  <Loader2 size={14} className="spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Download size={14} />
                  Download All
                </>
              )}
            </button>
          )}
          {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
      </button>

      {expanded && (
        <div style={{ padding: '0 16px 16px' }}>
          {startError && (
            <div className="card" style={{ padding: 12, marginBottom: 12, background: 'var(--danger-bg)', borderLeft: '3px solid var(--danger)' }}>
              <div className="flex" style={{ gap: 8, alignItems: 'center', color: 'var(--danger)' }}>
                <AlertCircle size={16} />
                <span style={{ fontSize: 13 }}>
                  Download failed: {startError instanceof Error ? startError.message : 'Unknown error'}
                </span>
              </div>
            </div>
          )}

          {/* TONE3000 Configuration - requires API key */}
          <div style={{ marginBottom: 16 }}>
            <Tone3000Config />
          </div>

          <div className="grid" style={{ gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {sourcesWithCounts.map(source => {
              const Icon = SOURCE_ICONS[source.name] ?? Waves
              return (
                <div
                  key={source.name}
                  className="card"
                  style={{
                    padding: 16,
                    background: 'var(--bg-secondary)',
                    borderLeft: `3px solid ${source.iconColor}`,
                  }}
                >
                  <div className="flex-between" style={{ marginBottom: 8 }}>
                    <div className="flex" style={{ gap: 10, alignItems: 'center' }}>
                      <Icon size={20} style={{ color: source.iconColor }} />
                      <span style={{ fontWeight: 600 }}>{source.displayName}</span>
                    </div>
                    <span className="pill" style={{ fontSize: 11 }}>{source.license}</span>
                  </div>
                  <p className="muted" style={{ fontSize: 13, margin: '8px 0 12px' }}>
                    {source.description}
                  </p>
                  <div className="flex-between">
                    <span className="muted" style={{ fontSize: 12 }}>
                      {source.count > 0 ? `${source.count} IRs available` : 'Checking...'}
                    </span>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleDownloadSource(source.name)}
                      disabled={isDownloading || isStarting}
                    >
                      <Download size={14} />
                      Download
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
