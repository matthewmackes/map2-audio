import { Library, Mic, Zap, Waves, Music } from 'lucide-react'
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
            <h1 style={{ margin: 0, fontSize: 24 }}>Library</h1>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Download and manage IRs, NAM models, and SoundFonts
            </p>
          </div>
        </div>
        <UploadButton label="Upload Assets" />
      </div>

      {/* Sound Asset Types Overview */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(59, 130, 246, 0.05))',
        borderColor: 'rgba(139, 92, 246, 0.4)',
        borderLeft: '6px solid #8b5cf6',
        padding: 32
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
          <Library size={36} style={{ color: '#8b5cf6', flexShrink: 0, marginTop: 4 }} />
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 22, fontWeight: 700, color: '#a78bfa', marginBottom: 12 }}>
              Sound Asset Library
            </h3>
            <p style={{ fontSize: 16, color: '#d1d5db', lineHeight: 1.7, marginBottom: 24 }}>
              High-quality impulse responses, neural amp models, and instrument samples for use with the
              <strong style={{ color: '#a78bfa' }}> ConvolutionProcessor</strong> and
              <strong style={{ color: '#a78bfa' }}> NAMProcessor</strong> native DSP modules:
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
                  <tr style={{ background: 'rgba(139, 92, 246, 0.15)' }}>
                    <th style={{ padding: '16px 20px', textAlign: 'left', color: '#a78bfa', fontWeight: 700, fontSize: 16, borderBottom: '1px solid rgba(139, 92, 246, 0.2)' }}>Asset Type</th>
                    <th style={{ padding: '16px 20px', textAlign: 'left', color: '#a78bfa', fontWeight: 700, fontSize: 16, borderBottom: '1px solid rgba(139, 92, 246, 0.2)' }}>Description</th>
                    <th style={{ padding: '16px 20px', textAlign: 'left', color: '#a78bfa', fontWeight: 700, fontSize: 16, borderBottom: '1px solid rgba(139, 92, 246, 0.2)' }}>Formats</th>
                    <th style={{ padding: '16px 20px', textAlign: 'right', color: '#a78bfa', fontWeight: 700, fontSize: 16, borderBottom: '1px solid rgba(139, 92, 246, 0.2)' }}>Used By</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '16px 20px', color: '#f97316' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 500 }}>
                        <Mic size={20} /> Cabinet IRs
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', color: '#e5e7eb', fontWeight: 600, fontSize: 15 }}>Guitar & bass cabinet impulse responses</td>
                    <td style={{ padding: '16px 20px', color: '#9ca3af', fontSize: 14 }}>.wav, .flac (44.1-96kHz)</td>
                    <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                      <div style={{ fontSize: 12, color: '#a78bfa', fontWeight: 600 }}>ConvolutionProcessor</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>Zero-latency IR</div>
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '16px 20px', color: '#ff6b6b' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 500 }}>
                        <Zap size={20} /> NAM Models
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', color: '#e5e7eb', fontWeight: 600, fontSize: 15 }}>Neural Amp Modeler captures</td>
                    <td style={{ padding: '16px 20px', color: '#9ca3af', fontSize: 14 }}>.nam (JSON model files)</td>
                    <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                      <div style={{ fontSize: 12, color: '#ff6b6b', fontWeight: 600 }}>NAMProcessor</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>ML inference</div>
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '16px 20px', color: '#a855f7' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 500 }}>
                        <Waves size={20} /> Reverb IRs
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', color: '#e5e7eb', fontWeight: 600, fontSize: 15 }}>Room, hall, plate, and space impulses</td>
                    <td style={{ padding: '16px 20px', color: '#9ca3af', fontSize: 14 }}>.wav, .flac (stereo/mono)</td>
                    <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                      <div style={{ fontSize: 12, color: '#a855f7', fontWeight: 600 }}>ConvolutionProcessor</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>Space simulation</div>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '16px 20px', color: '#22c55e' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 500 }}>
                        <Music size={20} /> SoundFonts
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
          </div>
        </div>
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
