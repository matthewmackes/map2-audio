import { Library } from 'lucide-react'
import { LibrarySources } from '../components/library/LibrarySources'
import { DownloadManager } from '../components/library/DownloadManager'
import { InstalledBrowser } from '../components/library/InstalledBrowser'
import { LibraryPaths } from '../components/library/LibraryPaths'
import { useDownloadProgress } from '../hooks/useDownloadProgress'
import { UploadButton } from '../components/upload'

export function LibraryPage() {
  const { status, isDownloading } = useDownloadProgress()

  return (
    <div className="stack" style={{ gap: 24, padding: '24px 0' }}>
      {/* Header */}
      <div className="flex-between">
        <div className="flex" style={{ gap: 12, alignItems: 'center' }}>
          <Library size={28} style={{ color: 'var(--primary)' }} />
          <div>
            <h1 style={{ margin: 0, fontSize: 24 }}>Sound Library</h1>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Download and manage IRs, NAM models, and SoundFonts
            </p>
          </div>
        </div>
        <UploadButton label="Upload Assets" />
      </div>

      {/* Library Paths - where to put files */}
      <LibraryPaths />

      {/* Download Manager - visible when downloading or recently downloaded */}
      {(isDownloading || status?.stats) && (
        <DownloadManager />
      )}

      {/* Library Sources */}
      <LibrarySources />

      {/* Installed Browser */}
      <InstalledBrowser />
    </div>
  )
}
