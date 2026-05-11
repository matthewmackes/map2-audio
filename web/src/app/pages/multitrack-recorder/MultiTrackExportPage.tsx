/**
 * T2503 Set 10 — Export sub-area page.
 *
 * Placeholder: the render/bounce/stem verb surface ships in a later set
 * once the engine offers an offline-render path. Surfaced today so the
 * tier-1 shell visibly carries all 8 sub-areas an operator expects from a
 * DAW.
 */
import { InlineNotification, Layer, Tag } from '@carbon/react'

export function MultiTrackExportPage() {
  return (
    <Layer>
      <div style={{ padding: 16 }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Export</h2>
          <Tag size="sm" type="warm-gray">deferred</Tag>
        </header>
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title="Offline render / bounce / stem"
          subtitle="The engine-side render path ships in a later set (post-Set 9 plugin scanner). The verb surface will be daw.export.* through engine_command; this page wires up the controls once the verbs land."
        />
        <ul style={{ margin: '16px 0 0', paddingLeft: 18, lineHeight: 1.6, fontSize: '0.9rem' }}>
          <li>Full mixdown to WAV/FLAC (project sample rate)</li>
          <li>Per-track stem export</li>
          <li>Offline render at higher sample rate / bit depth</li>
          <li>Loudness-normalised master (LUFS targets)</li>
        </ul>
      </div>
    </Layer>
  )
}

export default MultiTrackExportPage
