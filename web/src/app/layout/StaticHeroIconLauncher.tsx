import { useRef } from 'react'
import { Map2BrandMark } from '../components/branding/map2Branding'
import './StaticHeroIconLauncher.css'

// ─── Public static hero icon launcher button component ──────────────────────
interface StaticHeroIconLauncherProps {
  isActive: boolean
  buttonRef: React.RefObject<HTMLButtonElement | null>
  onClick: () => void
}

export function StaticHeroIconLauncher({
  isActive,
  buttonRef,
  onClick,
}: StaticHeroIconLauncherProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`static-hero-icon-launcher__btn${isActive ? ' is-active' : ''}`}
      onClick={onClick}
      aria-label={isActive ? 'Close platform menu' : 'Open platform menu'}
      aria-haspopup="menu"
      aria-expanded={isActive}
      aria-controls="shell-launcher-panel"
    >
      <div className="static-hero-icon-launcher__scene" aria-hidden="true" ref={containerRef}>
        <div className="static-hero-icon-launcher__icon-wrap">
          <Map2BrandMark decorative className="static-hero-icon-launcher__icon" />
        </div>
      </div>
    </button>
  )
}
