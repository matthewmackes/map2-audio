// Shared primitive for rendering a list of detected audio/MIDI interface
// names as Carbon Tags, with loading and degraded-scan states. Replaces the
// near-duplicate DeviceList implementations that previously lived inside
// SystemSummary.tsx and LauncherPanel/LauncherPanel.tsx.
//
// The classNamePrefix parameter lets each call site keep its existing
// CSS namespace (`map2-launcher__device-*`) without any selector renames.

import { Tag } from '@carbon/react'

type DeviceInterfaceListProps = {
  classNamePrefix: string
  items: string[]
  isLoading: boolean
  errorMessage?: string | null
  detectingLabel: string
  emptyLabel: string
  degradedLabel?: string
}

export function DeviceInterfaceList({
  classNamePrefix,
  items,
  isLoading,
  errorMessage,
  detectingLabel,
  emptyLabel,
  degradedLabel,
}: DeviceInterfaceListProps) {
  if (isLoading && items.length === 0) {
    return <span className={`${classNamePrefix}__device-empty`}>{detectingLabel}</span>
  }

  if (errorMessage && items.length === 0 && degradedLabel) {
    return (
      <span className={`${classNamePrefix}__device-empty ${classNamePrefix}__device-empty--error`}>
        {degradedLabel}
      </span>
    )
  }

  if (items.length === 0) {
    return <span className={`${classNamePrefix}__device-empty`}>{emptyLabel}</span>
  }

  return (
    <>
      {items.map((name) => (
        <Tag key={name} className={`${classNamePrefix}__device-tag`} size="sm" type="cool-gray">
          {name}
        </Tag>
      ))}
      {errorMessage && degradedLabel ? (
        <span className={`${classNamePrefix}__device-empty ${classNamePrefix}__device-empty--error`}>
          {degradedLabel}
        </span>
      ) : null}
    </>
  )
}
