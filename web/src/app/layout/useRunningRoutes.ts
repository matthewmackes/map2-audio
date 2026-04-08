import { useEffect, useRef, useState } from 'react'
import type { NavigateFunction } from 'react-router-dom'

import {
  readHomeDesktopSession,
  updateHomeDesktopSession,
} from '../pages/homeDesktopSession'

export function useRunningRoutes({
  pathname,
  isDesktopRoute,
  navigate,
  closeShellMenus,
  closeDurationMs,
}: {
  pathname: string
  isDesktopRoute: boolean
  navigate: NavigateFunction
  closeShellMenus: () => void
  closeDurationMs: number
}) {
  const closeWindowTimerRef = useRef<number | null>(null)
  const [closingAppRoute, setClosingAppRoute] = useState<string | null>(null)
  const [runningRoutes, setRunningRoutes] = useState<string[]>(() => (
    readHomeDesktopSession()?.runningRoutes.filter((route) => route !== '/') ?? []
  ))

  useEffect(() => {
    setRunningRoutes((current) => {
      const sanitized = current.filter((route) => route !== '/')
      if (isDesktopRoute || pathname === '/' || sanitized.includes(pathname)) {
        return sanitized
      }

      return [...sanitized, pathname]
    })

    if (closingAppRoute && closingAppRoute !== pathname) {
      setClosingAppRoute(null)
    }
  }, [closingAppRoute, isDesktopRoute, pathname])

  useEffect(() => () => {
    if (closeWindowTimerRef.current !== null) {
      window.clearTimeout(closeWindowTimerRef.current)
    }
  }, [])

  useEffect(() => {
    updateHomeDesktopSession({
      runningRoutes: runningRoutes.filter((route) => route !== '/'),
      currentRoute: pathname,
    })
  }, [pathname, runningRoutes])

  const handleCloseCurrentApp = () => {
    if (isDesktopRoute) {
      return
    }

    const routeToClose = pathname
    closeShellMenus()
    setClosingAppRoute(routeToClose)
    setRunningRoutes((current) => current.filter((route) => route !== routeToClose))

    if (closeWindowTimerRef.current !== null) {
      window.clearTimeout(closeWindowTimerRef.current)
    }

    closeWindowTimerRef.current = window.setTimeout(() => {
      closeWindowTimerRef.current = null
      setRunningRoutes((current) => current.filter((runningRoute) => runningRoute !== routeToClose))
      navigate('/')
    }, closeDurationMs)
  }

  return {
    closingAppRoute,
    runningRoutes,
    handleCloseCurrentApp,
  }
}
