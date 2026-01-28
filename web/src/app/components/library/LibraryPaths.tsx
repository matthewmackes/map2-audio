import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FolderOpen, ChevronDown, ChevronUp, Copy, Check, HardDrive, Music, Speaker, Waves, RefreshCw } from 'lucide-react'
import { foldersApi } from '../../../map2/api'

interface PathInfo {
  label: string
  path: string
  displayPath: string
  icon: typeof FolderOpen
  description: string
}

export function LibraryPaths() {
  const [expanded, setExpanded] = useState(false)
  const [copiedPath, setCopiedPath] = useState<string | null>(null)

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

  const handleRefresh = () => {
    pathsQuery.refetch()
  }

  // Build path info from API response
  const paths: PathInfo[] = pathsQuery.data ? [
    {
      label: 'NAM Models',
      path: pathsQuery.data.nam_models,
      displayPath: pathsQuery.data.nam_models_display,
      icon: Music,
      description: 'Neural Amp Models (.nam files)',
    },
    {
      label: 'Cabinet IRs',
      path: pathsQuery.data.ir_cabinets,
      displayPath: pathsQuery.data.ir_cabinets_display,
      icon: Speaker,
      description: 'Guitar/Bass cabinet impulse responses',
    },
    {
      label: 'Reverb IRs',
      path: pathsQuery.data.ir_reverbs,
      displayPath: pathsQuery.data.ir_reverbs_display,
      icon: Waves,
      description: 'Reverb impulse responses (.wav, .flac)',
    },
    {
      label: 'User Uploads',
      path: pathsQuery.data.ir_user_uploads,
      displayPath: pathsQuery.data.ir_user_uploads?.replace(/^\/home\/[^/]+/, '~') || '',
      icon: FolderOpen,
      description: 'Your custom imported IRs',
    },
  ] : []

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
          <HardDrive size={20} style={{ color: 'var(--secondary)' }} />
          <span style={{ fontWeight: 600, fontSize: 16 }}>Library Paths</span>
          <span className="badge" style={{ marginLeft: 8 }}>
            File Locations
          </span>
        </div>
        <div className="flex" style={{ gap: 8, alignItems: 'center' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={(e) => {
              e.stopPropagation()
              handleRefresh()
            }}
            title="Refresh paths"
          >
            <RefreshCw size={14} className={pathsQuery.isFetching ? 'spin' : ''} />
          </button>
          {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
      </button>

      {expanded && (
        <div style={{ padding: '0 16px 16px' }}>
          <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
            Place your files in these directories to use them in MAP2. Files are automatically detected.
          </p>

          {pathsQuery.isLoading ? (
            <div className="flex" style={{ justifyContent: 'center', padding: 24 }}>
              <span className="muted">Loading paths...</span>
            </div>
          ) : pathsQuery.error ? (
            <div className="flex" style={{ justifyContent: 'center', padding: 24 }}>
              <span style={{ color: 'var(--danger)' }}>Error loading paths</span>
            </div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {paths.map(({ label, path, displayPath, icon: Icon, description }) => (
                <div
                  key={label}
                  className="card"
                  style={{
                    padding: '12px 16px',
                    background: 'var(--bg-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                  }}
                >
                  <div className="flex" style={{ gap: 12, alignItems: 'center', flex: 1, minWidth: 0 }}>
                    <Icon size={18} style={{ color: 'var(--secondary)', flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="flex" style={{ gap: 8, alignItems: 'baseline' }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{label}</span>
                        <span className="muted" style={{ fontSize: 11 }}>{description}</span>
                      </div>
                      <code
                        style={{
                          display: 'block',
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          background: 'var(--bg-tertiary)',
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
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleCopyPath(path)}
                    title="Copy full path"
                    style={{ flexShrink: 0 }}
                  >
                    {copiedPath === path ? (
                      <>
                        <Check size={14} style={{ color: 'var(--success)' }} />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="muted" style={{ fontSize: 12, marginTop: 12, opacity: 0.7 }}>
            Tip: You can also access these directories via SMB network share (see Settings).
          </p>
        </div>
      )}
    </div>
  )
}
