import { useEffect, useState } from 'react'

const MOBILE_MEDIA_QUERY = '(max-width: 768px)'

function getInitialMatch(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => getInitialMatch())

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQueryList = window.matchMedia(MOBILE_MEDIA_QUERY)
    setIsMobile(mediaQueryList.matches)

    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches)
    }

    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', handleChange)
      return () => mediaQueryList.removeEventListener('change', handleChange)
    }

    mediaQueryList.addListener(handleChange)
    return () => mediaQueryList.removeListener(handleChange)
  }, [])

  return isMobile
}
