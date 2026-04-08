import type { MouseEvent } from 'react'
import { startTransition, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ProgressBar } from '@carbon/react'
import {
  MAP2_PLATFORM_NAME,
} from '../components/branding/map2Branding'
import map2Logo from '../../assets/MAP2-LOGO.png'
import landingBg from '../../assets/NEW-map2-landing-bg.png'
import { completeHomeDesktopBoot, shouldShowHomeBootSplash } from './homeDesktopSession'
import { readDesktopWallpaperState } from './desktopWallpaper'
import './HomePage.css'

const HOME_BOOT_SPLASH_DURATION_MS = 4_000

interface WallpaperContextMenuState {
  x: number
  y: number
}

export function HomePage() {
  const navigate = useNavigate()
  const [showBootSplash, setShowBootSplash] = useState(() => shouldShowHomeBootSplash())
  const [contextMenu, setContextMenu] = useState<WallpaperContextMenuState | null>(null)
  const wallpaper = useMemo(() => readDesktopWallpaperState(), [])

  useEffect(() => {
    if (!showBootSplash) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      completeHomeDesktopBoot()
      startTransition(() => {
        setShowBootSplash(false)
      })
    }, HOME_BOOT_SPLASH_DURATION_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [showBootSplash])

  useEffect(() => {
    if (!contextMenu) {
      return undefined
    }

    const handleDismiss = () => setContextMenu(null)
    window.addEventListener('click', handleDismiss)
    window.addEventListener('contextmenu', handleDismiss)
    return () => {
      window.removeEventListener('click', handleDismiss)
      window.removeEventListener('contextmenu', handleDismiss)
    }
  }, [contextMenu])

  const openWallpaperMenu = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault()
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
    })
  }

  const handleRefreshDesktop = () => {
    setContextMenu(null)
    window.location.reload()
  }

  const handleOpenDesktopRoute = (route: string) => {
    setContextMenu(null)
    navigate(route)
  }

  if (showBootSplash) {
    return (
      <section className="hp2-boot" aria-label="MAP2 boot splash">
        <div className="hp2-boot__center">
          <div className="hp2-boot__mark-wrap">
            <img src={map2Logo} alt="MAP2 logo" className="hp2-boot__mark" />
          </div>
          <h1 className="hp2-boot__title">{MAP2_PLATFORM_NAME}</h1>
          <p className="hp2-boot__subtitle">Initializing the Carbon-governed pre-Warp desktop session and restoring platform context.</p>
        </div>
        <div className="hp2-boot__progress">
          <ProgressBar
            label="Boot progress"
            helperText="Restoring workplace shell"
            hideLabel
            value={null}
          />
        </div>
      </section>
    )
  }

  return (
    <div className="hp2-root">
      <section
        className={`hp2-desktop hp2-desktop--${wallpaper.mode}`}
        data-testid="home-desktop"
        data-wallpaper-mode={wallpaper.mode}
        onContextMenu={openWallpaperMenu}
      >
        {wallpaper.mode !== 'solid-theme' ? (
          <img
            src={wallpaper.mode === 'uploaded-image' ? wallpaper.imageDataUrl : landingBg}
            alt=""
            className="hp2-desktop__wallpaper"
            data-testid="home-desktop-wallpaper-image"
            aria-hidden="true"
          />
        ) : null}
        <div className="hp2-desktop__underlay" aria-hidden="true" />
        {contextMenu ? (
          <div
            className="hp2-desktop__context-menu"
            role="menu"
            aria-label="Desktop context menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button type="button" className="hp2-desktop__context-item" onClick={handleRefreshDesktop}>
              Refresh
            </button>
            <button type="button" className="hp2-desktop__context-item" onClick={() => handleOpenDesktopRoute('/platforms/theme')}>
              Display settings
            </button>
            <button type="button" className="hp2-desktop__context-item" onClick={() => handleOpenDesktopRoute('/platforms/about')}>
              About
            </button>
          </div>
        ) : null}
      </section>
    </div>
  )
}

export default HomePage
