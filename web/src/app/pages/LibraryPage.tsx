import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Books, Microphone, Lightning, WaveSine, MusicNote, HardDrive, CaretDown, CaretUp, Copy, Check, ArrowsClockwise, SpeakerHigh } from '@phosphor-icons/react'
import { LibrarySources } from '../components/library/LibrarySources'
import { DownloadManager } from '../components/library/DownloadManager'
import { InstalledBrowser } from '../components/library/InstalledBrowser'
import { useDownloadProgress } from '../hooks/useDownloadProgress'
import { UploadButton } from '../components/upload'
import { foldersApi } from '../../map2/api'

interface PathInfo {
  label: string
  path: string
  displayPath: string
  icon: typeof Books
  description: string
}

export function LibraryPage() {
  const [pathsExpanded, setPathsExpanded] = useState(false)
  const [copiedPath, setCopiedPath] = useState<string | null>(null)
  const { status, isDownloading } = useDownloadProgress()

  const pathsQuery = useQuery({
    queryKey: ['folders', 'display-paths'],
    queryFn: foldersApi.getDisplayPaths,
    staleTime: 60000,
  })

  const handleCopyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path)
      setCopiedPath(path)
      setTimeout(() => setCopiedPath(null), 2000)
    } catch (err) {
      console.error('Failed to copy path:', err)
    }
  }

  const handleRefreshPaths = () => {
    pathsQuery.refetch()
  }

  const paths: PathInfo[] = pathsQuery.data ? [
    {
      label: 'NAM Models',
      path: pathsQuery.data.nam_models,
      displayPath: pathsQuery.data.nam_models_display,
      icon: MusicNote,
    },
    {
      label: 'Cabinet IRs',
      path: pathsQuery.data.ir_cabinets,
      displayPath: pathsQuery.data.ir_cabinets_display,
      icon: SpeakerHigh,
      description: 'Guitar/Bass cabinet impulse responses',
    },
    {
      label: 'Reverb IRs',
      path: pathsQuery.data.ir_reverbs,
      displayPath: pathsQuery.data.ir_reverbs_display,
      icon: WaveSine,
      description: 'Reverb impulse responses (.wav, .flac)',
    },
    {
      label: 'User Uploads',
      path: pathsQuery.data.ir_user_uploads,
      displayPath: pathsQuery.data.ir_user_uploads?.replace(/^\/home\/[^/]+/, '~') || '',
      icon: MusicNote,
      description: 'Your custom imported IRs',
    },
  ] : []

  return (
    <div className="stack" style={{ gap: 24, padding: '24px 0' }}>
      {/* Header */}
      <div className="flex-between">
        <div className="flex" style={{ gap: 12, alignItems: 'center' }}>
          <Books size={28} weight="duotone" style={{ color: 'var(--primary)' }} />
          <div>
            <h1 style={{ margin: 0, fontSize: 24 }}>Library</h1>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Download and manage IRs, NAM models, and SoundFonts
            </p>
          </div>
        </div>
        <UploadButton label="Upload Assets" />
      </div>

      {/* Sound Asset Library Overview & Paths */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.1), rgba(59, 130, 246, 0.05))',
        borderColor: 'rgba(37, 99, 235, 0.4)',
        borderLeft: '6px solid #2563eb',
        padding: 32
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
          <Books size={36} weight="duotone" style={{ color: '#60a5fa', flexShrink: 0, marginTop: 4 }} />
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 22, fontWeight: 700, color: '#60a5fa', marginBottom: 12 }}>
              Sound Asset Library
            </h3>
            <p style={{ fontSize: 16, color: '#d1d5db', lineHeight: 1.7, marginBottom: 24 }}>
              High-quality impulse responses, neural amp models, and instrument samples for use with the
              <strong style={{ color: '#60a5fa' }}> ConvolutionProcessor</strong> and
              <strong style={{ color: '#60a5fa' }}> NAMProcessor</strong> native DSP modules:
            </p>

            {/* Asset Types Chart */}
            <div style={{
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: 12,
              overflow: 'hidden',
              marginBottom: 24
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
                <thead>
                  <tr style={{ background: 'rgba(37, 99, 235, 0.15)' }}>
                    <th style={{ padding: '16px 20px', textAlign: 'left', color: '#60a5fa', fontWeight: 700, fontSize: 16, borderBottom: '1px solid rgba(37, 99, 235, 0.2)' }}>Asset Type</th>
                    <th style={{ padding: '16px 20px', textAlign: 'left', color: '#60a5fa', fontWeight: 700, fontSize: 16, borderBottom: '1px solid rgba(37, 99, 235, 0.2)' }}>Description</th>
                    <th style={{ padding: '16px 20px', textAlign: 'left', color: '#60a5fa', fontWeight: 700, fontSize: 16, borderBottom: '1px solid rgba(37, 99, 235, 0.2)' }}>Formats</th>
                    <th style={{ padding: '16px 20px', textAlign: 'right', color: '#60a5fa', fontWeight: 700, fontSize: 16, borderBottom: '1px solid rgba(37, 99, 235, 0.2)' }}>Used By</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '16px 20px', color: '#60a5fa' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 500 }}>
                        <Microphone size={20} weight="duotone" /> Cabinet IRs
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', color: '#e5e7eb', fontWeight: 600, fontSize: 15 }}>Guitar & bass cabinet impulse responses</td>
                    <td style={{ padding: '16px 20px', color: '#9ca3af', fontSize: 14 }}>.wav, .flac (44.1-96kHz)</td>
                    <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                      <div style={{ fontSize: 12, color: '#60a5fa', fontWeight: 600 }}>ConvolutionProcessor</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>Zero-latency IR</div>
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '16px 20px', color: '#60a5fa' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 500 }}>
                        <Lightning size={20} weight="duotone" /> NAM Models
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', color: '#e5e7eb', fontWeight: 600, fontSize: 15 }}>Neural Amp Modeler captures</td>
                    <td style={{ padding: '16px 20px', color: '#9ca3af', fontSize: 14 }}>.nam (JSON model files)</td>
                    <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                      <div style={{ fontSize: 12, color: '#60a5fa', fontWeight: 600 }}>NAMProcessor</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>ML inference</div>
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '16px 20px', color: '#60a5fa' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 500 }}>
                        <WaveSine size={20} weight="duotone" /> Reverb IRs
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', color: '#e5e7eb', fontWeight: 600, fontSize: 15 }}>Room, hall, plate, and space impulses</td>
                    <td style={{ padding: '16px 20px', color: '#9ca3af', fontSize: 14 }}>.wav, .flac (stereo/mono)</td>
                    <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                      <div style={{ fontSize: 12, color: '#60a5fa', fontWeight: 600 }}>ConvolutionProcessor</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>Space simulation</div>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '16px 20px', color: '#22c55e' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 500 }}>
                        <MusicNote size={20} weight="duotone" /> SoundFonts
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', color: '#e5e7eb', fontWeight: 600, fontSize: 15 }}>Sampled instrument libraries</td>
                    <td style={{ padding: '16px 20px', color: '#9ca3af', fontSize: 14 }}>.sf2, .sfz (GM/GS compatible)</td>
                    <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                      <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>Sfizz / FluidSynth</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>MIDI instruments</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Library Paths Section */}
            <div style={{
              borderTop: '1px solid rgba(255,255,255,0.1)',
              paddingTop: 24,
              marginTop: 12
            }}>
              <button
                onClick={() => setPathsExpanded(!pathsExpanded)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: 'inherit',
                  marginBottom: pathsExpanded ? 12 : 0
                }}
              >
                <div className="flex" style={{ gap: 12, alignItems: 'center' }}>
                  <HardDrive size={18} weight="duotone" style={{ color: 'var(--secondary)' }} />
                  <span style={{ fontWeight: 600, fontSize: 15 }}>File Locations</span>
                </div>
                <div className="flex" style={{ gap: 8, alignItems: 'center' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRefreshPaths()
                    }}
                    title="Refresh paths"
                  >
                    <ArrowsClockwise size={14} weight="duotone" className={pathsQuery.isFetching ? 'spin' : ''} />
                  </button>
                  {pathsExpanded ? <CaretUp size={18} weight="bold" /> : <CaretDown size={18} weight="bold" />}
                </div>
              </button>

              {pathsExpanded && (
                <div>
                  <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
                    Place your files in these directories to use them in MAP2. Files are automatically detected.
                  </p>

                  {pathsQuery.isLoading ? (
                    <div className="flex" style={{ justifyContent: 'center', padding: 16 }}>
                      <span className="muted">Loading paths...</span>
                    </div>
                  ) : pathsQuery.error ? (
                    <div className="flex" style={{ justifyContent: 'center', padding: 16 }}>
                      <span style={{ color: 'var(--danger)' }}>Error loading paths</span>
                    </div>
                  ) : (
                    <div className="stack" style={{ gap: 8 }}>
                      {paths.map(({ label, path, displayPath, description }) => (
                        <div
                          key={label}
                          style={{
                            padding: '12px 16px',
                            background: 'rgba(0, 0, 0, 0.2)',
                            borderRadius: 8,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 16,
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="flex" style={{ gap: 8, alignItems: 'baseline' }}>
                              <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
                              <span className="muted" style={{ fontSize: 11 }}>{description}</span>
                            </div>
                            <code
                              style={{
                                display: 'block',
                                fontSize: 11,
                                color: 'var(--text-secondary)',
                                background: 'rgba(0, 0, 0, 0.3)',
                                padding: '4px 8px',
                                borderRadius: 4,
                                marginTop: 4,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={path}
                            >
                              {displayPath || path}
                            </code>
                          </div>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleCopyPath(path)}
                            title="Copy full path"
                            style={{ flexShrink: 0 }}
                          >
                            {copiedPath === path ? (
                              <>
                                <Check size={14} weight="bold" style={{ color: 'var(--success)' }} />
                              </>
                            ) : (
                              <>
                                <Copy size={14} weight="duotone" />
                              </>
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="muted" style={{ fontSize: 11, marginTop: 12, opacity: 0.7 }}>
                    Tip: You can also access these directories via SMB network share (see Settings).
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Installed Browser */}
      <InstalledBrowser />

      {/* Download Manager - hidden by default, shown when downloading or recently downloaded */}
      {(isDownloading || status?.stats) && (
        <DownloadManager />
      )}

      {/* Library Sources - Downloads & Source Management (hidden by default) */}
      <LibrarySources />
    </div>
  )
}
