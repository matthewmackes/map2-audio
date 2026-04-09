import { useEffect, useRef, useState } from 'react'

type UseAppShellStateOptions = {
  pathname: string
}

export function useAppShellState({ pathname }: UseAppShellStateOptions) {
  const [navOpen, setNavOpen] = useState(false)
  const [powerMenuOpen, setPowerMenuOpen] = useState(false)
  const [performFullscreen, setPerformFullscreen] = useState(pathname === '/perform')
  const navMenuRef = useRef<HTMLDivElement>(null)

  const closeShellMenus = () => {
    setNavOpen(false)
    setPowerMenuOpen(false)
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (navMenuRef.current && !navMenuRef.current.contains(event.target as Node)) {
        closeShellMenus()
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeShellMenus()
      }
    }

    if (!navOpen) {
      return undefined
    }

    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [navOpen])

  useEffect(() => {
    closeShellMenus()
  }, [pathname])

  useEffect(() => {
    setPerformFullscreen(pathname === '/perform')
  }, [pathname])

  useEffect(() => {
    if (!(pathname === '/perform' && performFullscreen)) {
      return undefined
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPerformFullscreen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [pathname, performFullscreen])

  return {
    closeShellMenus,
    navMenuRef,
    navOpen,
    performFullscreen,
    powerMenuOpen,
    setNavOpen,
    setPerformFullscreen,
    setPowerMenuOpen,
  }
}
