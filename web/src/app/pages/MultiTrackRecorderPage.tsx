import { RecordingFilledAlt } from '@carbon/icons-react'

export function MultiTrackRecorderPage() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        padding: '2rem',
        maxWidth: 960,
        margin: '0 auto',
        color: 'var(--cds-text-primary)',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <RecordingFilledAlt size={28} aria-hidden="true" />
        <h1 style={{ fontSize: '1.75rem', fontWeight: 600, margin: 0 }}>
          MultiTrack Recorder
        </h1>
      </header>
      <p style={{ fontSize: '1rem', lineHeight: 1.5, color: 'var(--cds-text-secondary)' }}>
        The DAW workspace entry point. Capture, arrangement, editing, mixdown,
        and session export will live here.
      </p>
      <section
        style={{
          padding: '1rem 1.25rem',
          border: '1px solid var(--cds-border-subtle)',
          background: 'var(--cds-layer)',
        }}
      >
        <p style={{ margin: 0, color: 'var(--cds-text-secondary)' }}>
          The interface is being scaffolded. Sub-sections (Tracks, Mixer,
          Sessions, Export) will appear under this entry as they ship.
        </p>
      </section>
    </div>
  )
}

export default MultiTrackRecorderPage
