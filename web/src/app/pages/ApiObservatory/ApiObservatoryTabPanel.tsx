import type { ReactNode } from 'react'

export function ApiObservatoryTabPanel({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <section
      style={{
        // carbon-allow: Observatory panel uses 18px radius for visual identity beyond Carbon's stops.
        borderRadius: 18,
        border: '1px solid rgba(139, 92, 246, 0.2)',
        background: 'rgba(9, 16, 28, 0.96)',
        padding: 'var(--cds-spacing-06)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--cds-spacing-04)',
        // carbon-allow: dense surface; off-grid between Carbon stops.
        minHeight: 360,
      }}
    >
      <div>
        <h2
          style={{
            margin: 0,
            color: 'var(--cds-text-primary)',
            // 22px sits between productive-heading-04 (28px) and
            // expressive-heading-03 (20px); kept literal as a deliberate
            // sub-section step.
            fontSize: 22,
            fontWeight: 700,
          }}
        >
          {title}
        </h2>
        <p
          style={{
            margin: 'var(--cds-spacing-03) 0 0',
            color: 'var(--cds-text-secondary)',
            lineHeight: 1.6,
          }}
        >
          {description}
        </p>
      </div>
      <div
        style={{
          // carbon-allow: Observatory panel-body radius matches the section radius above.
          borderRadius: 14,
          border: '1px dashed rgba(167, 139, 250, 0.35)',
          background: 'rgba(30, 41, 59, 0.48)',
          padding: 'var(--cds-spacing-05)',
          color: 'var(--cds-text-primary)',
          lineHeight: 1.6,
          flex: 1,
        }}
      >
        {children}
      </div>
    </section>
  )
}

export default ApiObservatoryTabPanel
