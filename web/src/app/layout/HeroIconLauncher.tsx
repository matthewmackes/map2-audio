import { useRef } from 'react'
import { Map2BrandMark } from '../components/branding/map2Branding'
import './HeroIconLauncher.css'

// ─── Public hero icon launcher button component ──────────────────────────────
interface HeroIconLauncherProps {
  isActive: boolean
  buttonRef: React.RefObject<HTMLButtonElement | null>
  onClick: () => void
}

export function HeroIconLauncher({
  isActive,
  buttonRef,
  onClick,
}: HeroIconLauncherProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`hero-icon-launcher__btn${isActive ? ' is-active' : ''}`}
      onClick={onClick}
      aria-label={isActive ? 'Close platform menu' : 'Open platform menu'}
      aria-haspopup="menu"
      aria-expanded={isActive}
      aria-controls="shell-launcher-panel"
    >
      <div className="hero-icon-launcher__scene" aria-hidden="true" ref={containerRef}>
        <div className="hero-icon-launcher__icon-wrap">
          <Map2BrandMark decorative className="hero-icon-launcher__icon" />
        </div>
      </div>
    </button>
  )
}
