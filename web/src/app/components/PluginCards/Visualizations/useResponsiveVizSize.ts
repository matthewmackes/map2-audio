/**
 * useResponsiveVizSize Hook
 *
 * Computes responsive dimensions for visualization components.
 * Reads CSS variables from container context and maintains aspect ratios.
 *
 * Usage:
 * ```tsx
 * const dimensions = useResponsiveVizSize(svgRef, {
 *   width,
 *   height,
 *   aspectRatio: 200 / 140,
 *   baseOn: 'width',
 *   defaultWidth: 200,
 *   defaultHeight: 140,
 * })
 * ```
 */

import { useState, useEffect, useRef } from 'react'

/**
 * Dimensions object returned by the hook
 */
export interface VizDimensions {
  width: number
  height: number
}

/**
 * Configuration for responsive visualization sizing
 */
export interface ResponsiveVizConfig {
  /** Explicit width override (bypasses responsive calculation) */
  width?: number

  /** Explicit height override (bypasses responsive calculation) */
  height?: number

  /** Target aspect ratio (width / height) */
  aspectRatio: number

  /** Which dimension to derive from base: 'width' or 'height' */
  baseOn?: 'width' | 'height'

  /** Default fallback width if CSS variables unavailable */
  defaultWidth: number

  /** Default fallback height if CSS variables unavailable */
  defaultHeight: number
}

/**
 * Hook to compute responsive visualization dimensions from CSS variables.
 *
 * Reads `--viz-width-base` and `--viz-height-base` from container context.
 * Maintains aspect ratios to prevent distortion.
 * Falls back to defaults if CSS variables are unavailable.
 *
 * @param ref - Ref to the component's container element
 * @param config - Configuration for aspect ratio and defaults
 * @returns Computed dimensions { width, height }
 */
export function useResponsiveVizSize(
  ref: React.RefObject<Element>,
  config: ResponsiveVizConfig
): VizDimensions {
  const { width, height, aspectRatio, baseOn = 'width', defaultWidth, defaultHeight } = config

  const [dimensions, setDimensions] = useState<VizDimensions>({
    width: width ?? defaultWidth,
    height: height ?? defaultHeight,
  })

  // Track initial mount to avoid stale closures
  const configRef = useRef(config)
  configRef.current = config

  useEffect(() => {
    // If explicit dimensions provided, use those and skip responsive behavior
    if (width !== undefined && height !== undefined) {
      setDimensions({ width, height })
      return
    }

    // Get the element and compute CSS variables
    const element = ref.current
    if (!element) return

    const updateDimensions = () => {
      try {
        const computedStyle = getComputedStyle(element)

        // Read CSS variables from computed styles
        const baseWidthValue = computedStyle
          .getPropertyValue('--viz-width-base')
          .trim()
          .replace('px', '')
        const baseHeightValue = computedStyle
          .getPropertyValue('--viz-height-base')
          .trim()
          .replace('px', '')

        const baseWidth = parseInt(baseWidthValue) || defaultWidth
        const baseHeight = parseInt(baseHeightValue) || defaultHeight

        let computedWidth: number
        let computedHeight: number

        if (width !== undefined) {
          // Width is explicit, compute height from aspect ratio
          computedWidth = width
          computedHeight = height ?? Math.round(width / aspectRatio)
        } else if (height !== undefined) {
          // Height is explicit, compute width from aspect ratio
          computedHeight = height
          computedWidth = width ?? Math.round(height * aspectRatio)
        } else if (baseOn === 'width') {
          // Derive from base width using aspect ratio
          computedWidth = baseWidth
          computedHeight = Math.round(baseWidth / aspectRatio)
        } else {
          // Derive from base height using aspect ratio
          computedHeight = baseHeight
          computedWidth = Math.round(baseHeight * aspectRatio)
        }

        setDimensions({
          width: Math.max(computedWidth, 1), // Ensure positive dimensions
          height: Math.max(computedHeight, 1),
        })
      } catch (error) {
        // Fallback to defaults on error
        setDimensions({
          width: defaultWidth,
          height: defaultHeight,
        })
      }
    }

    // Compute dimensions on mount
    updateDimensions()

    // Re-compute when container resizes (detect responsive changes)
    const resizeObserver = new ResizeObserver(updateDimensions)
    const parent = element.parentElement || element
    resizeObserver.observe(parent)

    return () => {
      resizeObserver.disconnect()
    }
  }, [ref, width, height, aspectRatio, baseOn, defaultWidth, defaultHeight])

  return dimensions
}

export default useResponsiveVizSize
