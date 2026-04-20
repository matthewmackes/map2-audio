import type { SVGProps } from 'react'

import type { PluginCategorySpriteId } from '../../shared/pluginCategoryIcon'

export type SignalCanvasSpriteId =
  | PluginCategorySpriteId
  | 'i-trash'
  | 'i-vol-in'
  | 'i-vol-out'
  | 'i-branch'

export interface SignalCanvasIconProps extends Omit<SVGProps<SVGSVGElement>, 'id'> {
  id: SignalCanvasSpriteId
  title?: string
}

export function SignalCanvasIconSprite() {
  return (
    <svg aria-hidden="true" focusable="false" style={{ display: 'none' }} xmlns="http://www.w3.org/2000/svg">
      <symbol id="i-eq" viewBox="0 0 24 24">
        <path d="M4 6h16M4 12h16M4 18h16" />
        <path d="M8 3v6M14 9v6M18 15v6" />
      </symbol>
      <symbol id="i-comp" viewBox="0 0 24 24">
        <path d="M4 6h6l4 12h6" />
        <path d="M4 18h5l5-12h6" />
      </symbol>
      <symbol id="i-drive" viewBox="0 0 24 24">
        <path d="M5 17 11 4v7h8l-6 9v-7H5z" />
      </symbol>
      <symbol id="i-amp" viewBox="0 0 24 24">
        <path d="M4 7h16v10H4z" />
        <path d="M7 10h3M13 10h4M8 14h8" />
      </symbol>
      <symbol id="i-cab" viewBox="0 0 24 24">
        <path d="M5 4h14v16H5z" />
        <circle cx="12" cy="12" r="4" />
        <path d="M12 8v8M8 12h8" />
      </symbol>
      <symbol id="i-delay" viewBox="0 0 24 24">
        <circle cx="10" cy="12" r="6" />
        <path d="M10 8v5l4 2M17 7l3-3M18 12h4" />
      </symbol>
      <symbol id="i-reverb" viewBox="0 0 24 24">
        <path d="M4 17c3-8 13-8 16 0" />
        <path d="M6 14c2-5 10-5 12 0M8 11c2-3 6-3 8 0" />
      </symbol>
      <symbol id="i-mod" viewBox="0 0 24 24">
        <path d="M3 12c3-7 6 7 9 0s6 7 9 0" />
        <path d="M5 5h14M5 19h14" />
      </symbol>
      <symbol id="i-pitch" viewBox="0 0 24 24">
        <path d="M6 18V6h8v4H9v8" />
        <path d="m15 15 3-3 3 3M18 12v8" />
      </symbol>
      <symbol id="i-filter" viewBox="0 0 24 24">
        <path d="M4 6h16l-6 7v5l-4 2v-7z" />
      </symbol>
      <symbol id="i-plus" viewBox="0 0 24 24">
        <path d="M12 5v14M5 12h14" />
      </symbol>
      <symbol id="i-trash" viewBox="0 0 24 24">
        <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" />
        <path d="M10 11v5M14 11v5" />
      </symbol>
      <symbol id="i-vol-in" viewBox="0 0 24 24">
        <path d="M4 9h4l5-4v14l-5-4H4z" />
        <path d="M17 9c1 1 1 5 0 6" />
      </symbol>
      <symbol id="i-vol-out" viewBox="0 0 24 24">
        <path d="M5 9h4l5-4v14l-5-4H5z" />
        <path d="M17 7c3 3 3 7 0 10M20 5c4 4 4 10 0 14" />
      </symbol>
      <symbol id="i-branch" viewBox="0 0 24 24">
        <path d="M6 12h5c4 0 4-6 8-6" />
        <path d="M11 12c4 0 4 6 8 6" />
        <circle cx="6" cy="12" r="2" />
        <circle cx="19" cy="6" r="2" />
        <circle cx="19" cy="18" r="2" />
      </symbol>
    </svg>
  )
}

export function SignalCanvasIcon({ id, title, ...props }: SignalCanvasIconProps) {
  const labelledBy = title ? `${id}-title` : undefined

  return (
    <svg aria-hidden={title ? undefined : true} aria-labelledby={labelledBy} focusable="false" {...props}>
      {title ? <title id={labelledBy}>{title}</title> : null}
      <use href={`#${id}`} />
    </svg>
  )
}
