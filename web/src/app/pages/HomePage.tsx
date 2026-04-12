import type { MouseEvent } from 'react'
import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Maximize, Minimize } from '@carbon/icons-react'
import { Button, Menu, MenuItem, ProgressBar } from '@carbon/react'
import {
  MAP2_PLATFORM_NAME,
} from '../components/branding/map2Branding'
import map2Logo from '../../assets/MAP2-LOGO.png'
import defaultWallpaperImage from '../../../../branding/MAP-GRID-HORIZON-2026.png'
import { completeHomeDesktopBoot, shouldShowHomeBootSplash } from './homeDesktopSession'
import { readDesktopWallpaperState } from './desktopWallpaper'
import { useReducedEffectsPreference } from '../hooks/useReducedEffectsPreference'
import { HeroIconLauncher } from '../layout/HeroIconLauncher'
import { HomeStartMenuOverlay } from './HomeStartMenuOverlay'
import './HomePage.css'

const HOME_BOOT_SPLASH_DURATION_MS = 4_000

interface WallpaperContextMenuState {
  x: number
  y: number
}

export function HomePage() {
  const navigate = useNavigate()
  const { shouldReduceEffects } = useReducedEffectsPreference()
  const [showBootSplash, setShowBootSplash] = useState(() => shouldShowHomeBootSplash())
  const [contextMenu, setContextMenu] = useState<WallpaperContextMenuState | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement))
  const [menuOpen, setMenuOpen] = useState(false)
  const wallpaper = useMemo(() => readDesktopWallpaperState(), [])
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const cubeButtonRef = useRef<HTMLButtonElement | null>(null)
  const fullscreenAvailable = typeof document.documentElement.requestFullscreen === 'function'

  useEffect(() => {
    if (!showBootSplash) {
      return undefined
    }

    if (shouldReduceEffects) {
      completeHomeDesktopBoot()
      startTransition(() => {
        setShowBootSplash(false)
      })
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
  }, [showBootSplash, shouldReduceEffects])

  useEffect(() => {
    if (!contextMenu) {
      restoreFocusRef.current?.focus()
    }
  }, [contextMenu])

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    document.addEventListener('fullscreenchange', syncFullscreenState)
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState)
    }
  }, [])

  const openWallpaperMenu = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault()
    restoreFocusRef.current = event.currentTarget
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

  const handleToggleFullscreen = async () => {
    if (!fullscreenAvailable) {
      return
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }

    await document.documentElement.requestFullscreen()
  }

  const handleToggleCubeMenu = () => {
    setMenuOpen((prev) => !prev)
  }

  const handleCloseMenu = () => {
    setMenuOpen(false)
    // Return focus to the cube button after closing
    cubeButtonRef.current?.focus()
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
        tabIndex={-1}
      >
        <div className="hp2-desktop__controls">
          <Button
            type="button"
            kind="ghost"
            size="sm"
            hasIconOnly
            className="hp2-desktop__fullscreen-toggle"
            renderIcon={isFullscreen ? Minimize : Maximize}
            iconDescription={isFullscreen ? 'Exit browser fullscreen' : 'Enter browser fullscreen'}
            tooltipPosition="left"
            tooltipAlignment="center"
            disabled={!fullscreenAvailable}
            onClick={() => {
              void handleToggleFullscreen()
            }}
          />
        </div>
        {wallpaper.mode === 'uploaded-image' && wallpaper.imageDataUrl ? (
          <img
            src={wallpaper.imageDataUrl}
            alt=""
            className="hp2-desktop__wallpaper"
            data-testid="home-desktop-wallpaper-image"
            aria-hidden="true"
          />
        ) : null}
        {wallpaper.mode === 'default-image' ? (
          <div className="hp2-desktop__hero-wallpaper" aria-hidden="true">
            <img
              src={defaultWallpaperImage}
              alt=""
              className="hp2-desktop__default-wallpaper-image"
              data-testid="home-desktop-default-wallpaper-image"
            />
          </div>
        ) : null}
        <div className="hp2-desktop__underlay" aria-hidden="true" />

        {/* Centered Hero Icon Launcher */}
        <div className="hp2-desktop__cube-launcher">
          <HeroIconLauncher
            isActive={menuOpen}
            buttonRef={cubeButtonRef}
            onClick={handleToggleCubeMenu}
          />
        </div>

        {contextMenu ? (
          <Menu
            className="hp2-desktop__context-menu"
            label="Desktop context menu"
            onClose={() => setContextMenu(null)}
            open
            size="sm"
            x={contextMenu.x}
            y={contextMenu.y}
          >
            <MenuItem label="Refresh" onClick={handleRefreshDesktop} />
            <MenuItem label="Display settings" onClick={() => handleOpenDesktopRoute('/platforms/theme')} />
            <MenuItem label="About" onClick={() => handleOpenDesktopRoute('/platforms/about')} />
          </Menu>
        ) : null}
      </section>

      {/* Centered Start Menu Overlay */}
      <HomeStartMenuOverlay open={menuOpen} onClose={handleCloseMenu} />
    </div>
  )
}

export default HomePage
