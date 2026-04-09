import type { KeyboardEvent, MouseEvent } from 'react'
import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ProgressBar } from '@carbon/react'
import {
  Map2BrandMark,
  MAP2_PLATFORM_NAME,
} from '../components/branding/map2Branding'
import map2Logo from '../../assets/MAP2-LOGO.png'
import defaultWallpaperImage from '../../../../branding/MAP-GRID-HORIZON-2026.png'
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
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const contextMenuItemRefs = useRef<Array<HTMLButtonElement | null>>([])

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

  useEffect(() => {
    if (!contextMenu) {
      restoreFocusRef.current?.focus()
      return undefined
    }

    const focusFirstMenuItem = window.setTimeout(() => {
      contextMenuItemRefs.current[0]?.focus()
    }, 0)

    return () => {
      window.clearTimeout(focusFirstMenuItem)
    }
  }, [contextMenu])

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

  const handleContextMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!contextMenu) {
      return
    }

    const focusableItems = contextMenuItemRefs.current.filter(
      (item): item is HTMLButtonElement => item !== null,
    )

    if (focusableItems.length === 0) {
      return
    }

    const activeIndex = focusableItems.indexOf(document.activeElement as HTMLButtonElement)

    if (event.key === 'Escape') {
      event.preventDefault()
      setContextMenu(null)
      return
    }

    if (event.key === 'Tab') {
      event.preventDefault()
      const nextIndex = event.shiftKey
        ? (activeIndex <= 0 ? focusableItems.length - 1 : activeIndex - 1)
        : (activeIndex === -1 || activeIndex === focusableItems.length - 1 ? 0 : activeIndex + 1)
      focusableItems[nextIndex]?.focus()
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const nextIndex = activeIndex === -1 || activeIndex === focusableItems.length - 1 ? 0 : activeIndex + 1
      focusableItems[nextIndex]?.focus()
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      const nextIndex = activeIndex <= 0 ? focusableItems.length - 1 : activeIndex - 1
      focusableItems[nextIndex]?.focus()
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      focusableItems[0]?.focus()
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      focusableItems[focusableItems.length - 1]?.focus()
    }
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
        {wallpaper.mode === 'uploaded-image' ? (
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
            <Map2BrandMark className="hp2-desktop__hero-mark" />
          </div>
        ) : null}
        <div className="hp2-desktop__underlay" aria-hidden="true" />
        {contextMenu ? (
          <div
            className="hp2-desktop__context-menu"
            role="menu"
            aria-label="Desktop context menu"
            onKeyDown={handleContextMenuKeyDown}
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              ref={(node) => { contextMenuItemRefs.current[0] = node }}
              type="button"
              role="menuitem"
              className="hp2-desktop__context-item"
              onClick={handleRefreshDesktop}
            >
              Refresh
            </button>
            <button
              ref={(node) => { contextMenuItemRefs.current[1] = node }}
              type="button"
              role="menuitem"
              className="hp2-desktop__context-item"
              onClick={() => handleOpenDesktopRoute('/platforms/theme')}
            >
              Display settings
            </button>
            <button
              ref={(node) => { contextMenuItemRefs.current[2] = node }}
              type="button"
              role="menuitem"
              className="hp2-desktop__context-item"
              onClick={() => handleOpenDesktopRoute('/platforms/about')}
            >
              About
            </button>
          </div>
        ) : null}
      </section>
    </div>
  )
}

export default HomePage
