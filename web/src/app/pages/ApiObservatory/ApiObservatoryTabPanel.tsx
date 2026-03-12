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
        borderRadius: 18,
        border: '1px solid rgba(139, 92, 246, 0.2)',
        background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.94) 0%, rgba(2, 6, 23, 0.98) 100%)',
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 360,
      }}
    >
      <div>
        <h2 style={{ margin: 0, color: '#f5f3ff', fontSize: 22, fontWeight: 700 }}>{title}</h2>
        <p style={{ margin: '8px 0 0', color: '#a78bfa', lineHeight: 1.6 }}>{description}</p>
      </div>
      <div
        style={{
          borderRadius: 14,
          border: '1px dashed rgba(167, 139, 250, 0.35)',
          background: 'rgba(30, 41, 59, 0.48)',
          padding: 20,
          color: '#cbd5f5',
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
