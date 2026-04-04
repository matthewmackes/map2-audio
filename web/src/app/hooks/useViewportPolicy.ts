import { useEffect, useState } from 'react'

export const MIN_SUPPORTED_VIEWPORT_WIDTH = 1920
export const MIN_SUPPORTED_VIEWPORT_HEIGHT = 1080

export interface ViewportPolicyState {
  width: number
  height: number
  isSupportedViewport: boolean
}

function readViewportPolicyState(): ViewportPolicyState {
  if (typeof window === 'undefined') {
    return {
      width: MIN_SUPPORTED_VIEWPORT_WIDTH,
      height: MIN_SUPPORTED_VIEWPORT_HEIGHT,
      isSupportedViewport: true,
    }
  }

  const width = window.innerWidth
  const height = window.innerHeight

  return {
    width,
    height,
    isSupportedViewport: width >= MIN_SUPPORTED_VIEWPORT_WIDTH && height >= MIN_SUPPORTED_VIEWPORT_HEIGHT,
  }
}

export function useViewportPolicy(): ViewportPolicyState {
  const [state, setState] = useState<ViewportPolicyState>(() => readViewportPolicyState())

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleResize = () => {
      setState((current) => {
        const next = readViewportPolicyState()
        return current.width === next.width
          && current.height === next.height
          && current.isSupportedViewport === next.isSupportedViewport
          ? current
          : next
      })
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return state
}
