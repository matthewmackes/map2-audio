import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, ChevronDown, ChevronUp, Waves, Speaker, Loader2, Github, Building2, Radio, AlertCircle, Mountain, Music, Zap, FileMusic } from 'lucide-react'
import { irLibraryApi, soundfontApi } from '../../../map2/api'
import { LIBRARY_SOURCES, SOUNDFONT_SOURCES } from '../../types/library'
import { useDownloadProgress } from '../../hooks/useDownloadProgress'
import { useSoundFontDownloadProgress } from '../../hooks/useSoundFontDownloadProgress'
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
  // SoundFonts
  sfzinstruments: Github,
  musical_artifacts: Building2,
  freepats: FileMusic,
}

export function LibrarySources() {
  const [irExpanded, setIRExpanded] = useState(false)
  const [sfExpanded, setSFExpanded] = useState(false)
  const [downloadingSourceId, setDownloadingSourceId] = useState<string | null>(null)
  const { startDownload, isDownloading, isStarting, startError } = useDownloadProgress()
  const { startDownload: startSFDownload, isDownloading: isSFDownloading, startError: sfStartError } = useSoundFontDownloadProgress()

  const allExpanded = irExpanded && sfExpanded
  const toggleAllSources = () => {
    const newState = !allExpanded
    setIRExpanded(newState)
    setSFExpanded(newState)
  }

  const librariesQuery = useQuery({
    queryKey: ['ir', 'libraries'],
    queryFn: irLibraryApi.getLibraries,
  })

  const sfLibrariesQuery = useQuery({
    queryKey: ['soundfonts', 'libraries'],
    queryFn: soundfontApi.getLibraries,
  })

  const handleDownloadAll = () => {
    startDownload({ parallel: 4, skip_existing: true })
  }

  const handleDownloadSource = (sourceName: string) => {
    startDownload({ sources: [sourceName], parallel: 4, skip_existing: true })
  }

  const handleSFDownloadAll = () => {
    setDownloadingSourceId('all')
    startSFDownload({ parallel: 4, skip_existing: true })
  }

  const handleSFDownloadSource = (sourceName: string) => {
    setDownloadingSourceId(sourceName)
    startSFDownload({ sources: [sourceName], parallel: 4, skip_existing: true })
  }

  // Merge static source info with API counts for IRs
  const sourcesWithCounts = LIBRARY_SOURCES.map(source => {
    const apiData = librariesQuery.data?.libraries?.find(l => l.name === source.name)
    return {
      ...source,
      count: apiData?.count ?? 0,
      license: apiData?.license ?? source.license,
    }
  })

  // Merge static source info with API counts for SoundFonts
  const sfSourcesWithCounts = SOUNDFONT_SOURCES.map(source => {
    const apiData = sfLibrariesQuery.data?.libraries?.find(l => l.name === source.name)
    return {
      ...source,
      count: apiData?.count ?? 0,
      license: apiData?.license ?? source.license,
    }
  })

  const isSFDownloadingAll = isSFDownloading && downloadingSourceId === 'all'

  return (
    <div className="stack" style={{ gap: 16 }}>
      {/* Toggle All Sources Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={toggleAllSources}
          style={{ gap: 8 }}
        >
          {allExpanded ? (
            <>
              <ChevronUp size={16} />
              Hide All Sources
            </>
          ) : (
            <>
              <ChevronDown size={16} />
              Show All Sources
            </>
          )}
        </button>
      </div>

      {/* IR & NAM Library Sources */}
      <div className="card">
        <button
          className="disclosure-trigger"
          onClick={() => setIRExpanded(!irExpanded)}
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
            <span style={{ fontWeight: 600, fontSize: 16 }}>IR & NAM Library Sources</span>
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
            {irExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
        </button>

        {irExpanded && (
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
                        {source.count > 0 ? `${source.count} files available` : 'Checking...'}
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

      {/* SoundFont Library Sources */}
      <div className="card">
        <button
          className="disclosure-trigger"
          onClick={() => setSFExpanded(!sfExpanded)}
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
            <FileMusic size={20} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: 16 }}>SoundFont Sources</span>
            <span className="badge" style={{ marginLeft: 8 }}>
              {sfSourcesWithCounts.length} sources
            </span>
          </div>
          <div className="flex" style={{ gap: 12, alignItems: 'center' }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={(e) => {
                e.stopPropagation()
                handleSFDownloadAll()
              }}
              disabled={isSFDownloading}
            >
              {isSFDownloadingAll ? (
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
            {sfExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
        </button>

        {sfExpanded && (
          <div style={{ padding: '0 16px 16px' }}>
            {sfStartError && (
              <div className="card" style={{ padding: 12, marginBottom: 12, background: 'var(--danger-bg)', borderLeft: '3px solid var(--danger)' }}>
                <div className="flex" style={{ gap: 8, alignItems: 'center', color: 'var(--danger)' }}>
                  <AlertCircle size={16} />
                  <span style={{ fontSize: 13 }}>
                    Download failed: {sfStartError instanceof Error ? sfStartError.message : 'Unknown error'}
                  </span>
                </div>
              </div>
            )}

            <div className="grid" style={{ gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
              {sfSourcesWithCounts.map(source => {
                const Icon = SOURCE_ICONS[source.name] ?? FileMusic
                const isDownloadingThisSource = isSFDownloading && downloadingSourceId === source.name
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
                        {source.count > 0 ? `${source.count} SoundFonts` : 'Checking...'}
                      </span>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleSFDownloadSource(source.name)}
                        disabled={false}
                      >
                        {isDownloadingThisSource ? (
                          <>
                            <Loader2 size={14} className="spin" />
                            Downloading...
                          </>
                        ) : (
                          <>
                            <Download size={14} />
                            Download
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
