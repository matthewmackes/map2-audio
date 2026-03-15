import type { SVGProps } from 'react'

export const MAP2_PRIMARY_LABEL = 'MAP2'
export const MAP2_PLATFORM_NAME = 'Mackes Audio Platform'
export const MAP2_PLATFORM_VERSION = typeof __MAP2_PLATFORM_VERSION__ !== 'undefined' ? __MAP2_PLATFORM_VERSION__ : '0.0.0-dev'
export const MAP2_PLATFORM_META = `${MAP2_PLATFORM_NAME} · v${MAP2_PLATFORM_VERSION}`

type Map2BrandMarkProps = SVGProps<SVGSVGElement> & {
  decorative?: boolean
  label?: string
}

export function Map2BrandMark({
  decorative = true,
  label = `${MAP2_PLATFORM_NAME} brand mark`,
  ...props
}: Map2BrandMarkProps) {
  if (decorative) {
    return (
      <svg viewBox="0 0 192 192" aria-hidden="true" focusable="false" {...props}>
        <rect x="10" y="10" width="172" height="172" rx="30" fill="#0F62FE" />
        <path d="M28 26H164C176.15 26 186 35.85 186 48V66H6V48C6 35.85 15.85 26 28 26Z" fill="#ffffff" fillOpacity="0.2" />
        <rect x="10" y="10" width="172" height="172" rx="30" fill="none" stroke="#A6C8FF" strokeWidth="2" />

        <rect x="34" y="34" width="52" height="52" rx="6" fill="#D9D9D9" />
        <rect x="34" y="34" width="26" height="26" rx="4" fill="#F4F4F4" />
        <rect x="60" y="34" width="26" height="26" rx="4" fill="#C6C6C6" />
        <rect x="34" y="60" width="26" height="26" rx="4" fill="#C6C6C6" />
        <rect x="60" y="60" width="26" height="26" rx="4" fill="#F4F4F4" />
        <rect x="34" y="34" width="52" height="52" rx="6" fill="none" stroke="#F4F4F4" strokeWidth="2" />

        <rect x="106" y="34" width="52" height="52" rx="6" fill="#D9D9D9" />
        <rect x="106" y="34" width="26" height="26" rx="4" fill="#F4F4F4" />
        <rect x="132" y="34" width="26" height="26" rx="4" fill="#C6C6C6" />
        <rect x="106" y="60" width="26" height="26" rx="4" fill="#C6C6C6" />
        <rect x="132" y="60" width="26" height="26" rx="4" fill="#F4F4F4" />
        <rect x="106" y="34" width="52" height="52" rx="6" fill="none" stroke="#F4F4F4" strokeWidth="2" />

        <rect x="34" y="106" width="52" height="52" rx="6" fill="#D9D9D9" />
        <rect x="34" y="106" width="26" height="26" rx="4" fill="#F4F4F4" />
        <rect x="60" y="106" width="26" height="26" rx="4" fill="#C6C6C6" />
        <rect x="34" y="132" width="26" height="26" rx="4" fill="#C6C6C6" />
        <rect x="60" y="132" width="26" height="26" rx="4" fill="#F4F4F4" />
        <rect x="34" y="106" width="52" height="52" rx="6" fill="none" stroke="#F4F4F4" strokeWidth="2" />

        <rect x="106" y="106" width="52" height="52" rx="6" fill="#D9D9D9" />
        <rect x="106" y="106" width="26" height="26" rx="4" fill="#F4F4F4" />
        <rect x="132" y="106" width="26" height="26" rx="4" fill="#C6C6C6" />
        <rect x="106" y="132" width="26" height="26" rx="4" fill="#C6C6C6" />
        <rect x="132" y="132" width="26" height="26" rx="4" fill="#F4F4F4" />
        <rect x="106" y="106" width="52" height="52" rx="6" fill="none" stroke="#F4F4F4" strokeWidth="2" />

        <rect x="24" y="24" width="144" height="144" rx="20" fill="none" stroke="#D0E2FF" strokeOpacity="0.3" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 192 192" role="img" aria-label={label} focusable="false" {...props}>
      <rect x="10" y="10" width="172" height="172" rx="30" fill="#0F62FE" />
      <path d="M28 26H164C176.15 26 186 35.85 186 48V66H6V48C6 35.85 15.85 26 28 26Z" fill="#ffffff" fillOpacity="0.2" />
      <rect x="10" y="10" width="172" height="172" rx="30" fill="none" stroke="#A6C8FF" strokeWidth="2" />

      <rect x="34" y="34" width="52" height="52" rx="6" fill="#D9D9D9" />
      <rect x="34" y="34" width="26" height="26" rx="4" fill="#F4F4F4" />
      <rect x="60" y="34" width="26" height="26" rx="4" fill="#C6C6C6" />
      <rect x="34" y="60" width="26" height="26" rx="4" fill="#C6C6C6" />
      <rect x="60" y="60" width="26" height="26" rx="4" fill="#F4F4F4" />
      <rect x="34" y="34" width="52" height="52" rx="6" fill="none" stroke="#F4F4F4" strokeWidth="2" />

      <rect x="106" y="34" width="52" height="52" rx="6" fill="#D9D9D9" />
      <rect x="106" y="34" width="26" height="26" rx="4" fill="#F4F4F4" />
      <rect x="132" y="34" width="26" height="26" rx="4" fill="#C6C6C6" />
      <rect x="106" y="60" width="26" height="26" rx="4" fill="#C6C6C6" />
      <rect x="132" y="60" width="26" height="26" rx="4" fill="#F4F4F4" />
      <rect x="106" y="34" width="52" height="52" rx="6" fill="none" stroke="#F4F4F4" strokeWidth="2" />

      <rect x="34" y="106" width="52" height="52" rx="6" fill="#D9D9D9" />
      <rect x="34" y="106" width="26" height="26" rx="4" fill="#F4F4F4" />
      <rect x="60" y="106" width="26" height="26" rx="4" fill="#C6C6C6" />
      <rect x="34" y="132" width="26" height="26" rx="4" fill="#C6C6C6" />
      <rect x="60" y="132" width="26" height="26" rx="4" fill="#F4F4F4" />
      <rect x="34" y="106" width="52" height="52" rx="6" fill="none" stroke="#F4F4F4" strokeWidth="2" />

      <rect x="106" y="106" width="52" height="52" rx="6" fill="#D9D9D9" />
      <rect x="106" y="106" width="26" height="26" rx="4" fill="#F4F4F4" />
      <rect x="132" y="106" width="26" height="26" rx="4" fill="#C6C6C6" />
      <rect x="106" y="132" width="26" height="26" rx="4" fill="#C6C6C6" />
      <rect x="132" y="132" width="26" height="26" rx="4" fill="#F4F4F4" />
      <rect x="106" y="106" width="52" height="52" rx="6" fill="none" stroke="#F4F4F4" strokeWidth="2" />

      <rect x="24" y="24" width="144" height="144" rx="20" fill="none" stroke="#D0E2FF" strokeOpacity="0.3" />
    </svg>
  )
}
