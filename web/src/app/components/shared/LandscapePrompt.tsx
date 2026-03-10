import { useEffect, useMemo, useState } from 'react'

interface LandscapePromptProps {
  componentId: string
  title?: string
  description?: string
  continueLabel?: string
}

const MOBILE_MEDIA_QUERY = '(max-width: 768px)'

function canUseMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

function getMobileViewportMatch(): boolean {
  if (!canUseMatchMedia()) {
    return false
  }
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches
}

export function LandscapePrompt({
  componentId,
  title = 'Rotate for full editor',
  description = 'This workspace is optimized for landscape orientation.',
  continueLabel = 'Continue anyway',
}: LandscapePromptProps) {
  const storageKey = useMemo(() => `map2:landscape-prompt-dismissed:${componentId}`, [componentId])
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => getMobileViewportMatch())
  const [dismissed, setDismissed] = useState<boolean>(false)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const storedDismissal = window.sessionStorage.getItem(storageKey)
    setDismissed(storedDismissal === '1')

    if (!canUseMatchMedia()) {
      return
    }

    const mediaQueryList = window.matchMedia(MOBILE_MEDIA_QUERY)
    setIsMobileViewport(mediaQueryList.matches)

    const handleViewportChange = (event: MediaQueryListEvent) => {
      setIsMobileViewport(event.matches)
      if (!event.matches) {
        setDismissed(true)
      }
    }

    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', handleViewportChange)
      return () => mediaQueryList.removeEventListener('change', handleViewportChange)
    }

    mediaQueryList.addListener(handleViewportChange)
    return () => mediaQueryList.removeListener(handleViewportChange)
  }, [storageKey])

  if (!isMobileViewport || dismissed) {
    return null
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Orientation recommendation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: 'min(440px, 100%)',
          borderRadius: '0',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          boxShadow: 'none',
          padding: '24px',
          display: 'grid',
          justifyItems: 'center',
          gap: '14px',
          textAlign: 'center',
        }}
      >
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <rect x="17" y="11" width="24" height="48" rx="5" stroke="var(--accent)" strokeWidth="2.2" />
          <rect x="31" y="15" width="24" height="48" rx="5" transform="rotate(90 31 15)" stroke="var(--accent)" strokeWidth="2.2" opacity="0.55" />
          <path
            d="M50 22C54 26 56 31 56 36C56 41 54 46 50 50"
            stroke="var(--accent)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M22 50C18 46 16 41 16 36C16 31 18 26 22 22"
            stroke="var(--accent)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>

        <div
          style={{
            fontFamily: "'SFMono-Regular', 'JetBrains Mono', 'Roboto Mono', monospace",
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '0.01em',
          }}
        >
          {title}
        </div>

        <div style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.45 }}>{description}</div>

        <button
          type="button"
          onClick={() => {
            setDismissed(true)
            if (typeof window !== 'undefined') {
              window.sessionStorage.setItem(storageKey, '1')
            }
          }}
          style={{
            minHeight: '44px',
            border: '1px solid var(--border-strong)',
            borderRadius: '0',
            padding: '0 16px',
            color: 'var(--text-primary)',
            background: 'var(--surface-2)',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {continueLabel}
        </button>
      </div>
    </div>
  )
}
