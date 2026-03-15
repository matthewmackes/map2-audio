import type { SVGProps } from 'react'

export const MAP2_PRIMARY_LABEL = 'MAP2'
export const MAP2_PLATFORM_NAME = 'Mackes Audio Platform'
export const MAP2_PLATFORM_VERSION =
  typeof __MAP2_PLATFORM_VERSION__ !== 'undefined' ? __MAP2_PLATFORM_VERSION__ : '0000000000000001'
export const MAP2_PLATFORM_BUILD_DATE =
  typeof __MAP2_PLATFORM_BUILD_DATE__ !== 'undefined' ? __MAP2_PLATFORM_BUILD_DATE__ : '00000000'
export const MAP2_PLATFORM_BUILD_TIME =
  typeof __MAP2_PLATFORM_BUILD_TIME__ !== 'undefined' ? __MAP2_PLATFORM_BUILD_TIME__ : '000000'
export const MAP2_PLATFORM_BUILD_CHANNEL =
  typeof __MAP2_PLATFORM_BUILD_CHANNEL__ !== 'undefined' ? __MAP2_PLATFORM_BUILD_CHANNEL__ : '01'
export const MAP2_PLATFORM_BUILD_TIMESTAMP =
  typeof __MAP2_PLATFORM_BUILD_TIMESTAMP__ !== 'undefined' ? __MAP2_PLATFORM_BUILD_TIMESTAMP__ : ''
export const MAP2_PLATFORM_META = `${MAP2_PLATFORM_NAME} · ${MAP2_PLATFORM_VERSION}`

const BRAND_FRAME_COLOR = '#4589FF'
const BRAND_FRAME_HIGHLIGHT = '#A6C8FF'
const BRAND_BACKGROUND_COLOR = '#13171B'
const BRAND_PANEL_COLOR = '#1A1E23'

type Map2BrandMarkProps = SVGProps<SVGSVGElement> & {
  decorative?: boolean
  label?: string
}

function BrandMarkArtwork() {
  return (
    <>
      <rect x="12" y="12" width="168" height="168" rx="34" fill={BRAND_FRAME_COLOR} />
      <rect
        x="15"
        y="15"
        width="162"
        height="162"
        rx="31"
        fill="none"
        stroke={BRAND_FRAME_HIGHLIGHT}
        strokeOpacity="0.45"
        strokeWidth="2"
      />
      <rect x="28" y="28" width="136" height="136" rx="24" fill={BRAND_BACKGROUND_COLOR} />
      <rect x="83" y="28" width="26" height="136" rx="13" fill={BRAND_FRAME_COLOR} />
      <rect x="28" y="83" width="136" height="26" rx="13" fill={BRAND_FRAME_COLOR} />
      <rect x="34" y="34" width="43" height="43" rx="8" fill={BRAND_PANEL_COLOR} />
      <rect x="115" y="34" width="43" height="43" rx="8" fill={BRAND_PANEL_COLOR} />
      <rect x="34" y="115" width="43" height="43" rx="8" fill={BRAND_PANEL_COLOR} />
      <rect x="115" y="115" width="43" height="43" rx="8" fill={BRAND_PANEL_COLOR} />
    </>
  )
}

export function Map2BrandMark({
  decorative = true,
  label = `${MAP2_PLATFORM_NAME} brand mark`,
  ...props
}: Map2BrandMarkProps) {
  if (decorative) {
    return (
      <svg viewBox="0 0 192 192" aria-hidden="true" focusable="false" {...props}>
        <BrandMarkArtwork />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 192 192" role="img" aria-label={label} focusable="false" {...props}>
      <BrandMarkArtwork />
    </svg>
  )
}
