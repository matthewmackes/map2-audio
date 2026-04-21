import type { SVGProps } from 'react'

export const MAP2_PRIMARY_LABEL = 'MAP'
export const MAP2_PLATFORM_NAME = 'Mackes Audio Platform'
export const MAP2_PLATFORM_TAGLINE = 'MACKES AUDIO PLATFORM'
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

const BRAND_PRIMARY = '#4DA6FF'
const BRAND_BACKGROUND = '#000000'

type Map2BrandMarkProps = SVGProps<SVGSVGElement> & {
  decorative?: boolean
  label?: string
}

function BrandMarkArtwork() {
  return (
    <>
      <rect x="0" y="0" width="256" height="256" rx="56" ry="56" fill={BRAND_PRIMARY} />
      <rect x="22" y="22" width="95" height="95" rx="14" ry="14" fill={BRAND_BACKGROUND} />
      <rect x="139" y="22" width="95" height="95" rx="14" ry="14" fill={BRAND_BACKGROUND} />
      <rect x="22" y="139" width="95" height="95" rx="14" ry="14" fill={BRAND_BACKGROUND} />
      <rect x="139" y="139" width="95" height="95" rx="14" ry="14" fill={BRAND_BACKGROUND} />
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
      <svg viewBox="0 0 256 256" aria-hidden="true" focusable="false" {...props}>
        <BrandMarkArtwork />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 256 256" role="img" aria-label={label} focusable="false" {...props}>
      <BrandMarkArtwork />
    </svg>
  )
}
