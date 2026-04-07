import type { SVGProps } from 'react'

export interface MapIconProps extends SVGProps<SVGSVGElement> {
  size?: number
  title?: string
}

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  vectorEffect: 'non-scaling-stroke' as const,
}

function MapIconBase({ size = 24, title, children, ...props }: MapIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

export function MapSignalFlowIcon(props: MapIconProps) {
  return (
    <MapIconBase {...props}>
      <circle cx="8" cy="10" r="3" {...STROKE} />
      <circle cx="24" cy="8" r="3" {...STROKE} />
      <circle cx="24" cy="24" r="3" {...STROKE} />
      <path d="M11 10h5l4-2" {...STROKE} />
      <path d="M11 10h5l4 11" {...STROKE} />
      <path d="M8 13v11h13" {...STROKE} />
    </MapIconBase>
  )
}

export function MapAudioGridIcon(props: MapIconProps) {
  return (
    <MapIconBase {...props}>
      <rect x="2" y="2" width="28" height="28" rx="6" fill="#0f172a" />
      <rect x="2.8" y="2.8" width="26.4" height="26.4" rx="5.4" fill="#3b82f6" />
      <rect x="6.6" y="6.6" width="8.2" height="8.2" rx="1.2" fill="#18181b" />
      <rect x="17.2" y="6.6" width="8.2" height="8.2" rx="1.2" fill="#18181b" />
      <rect x="6.6" y="17.2" width="8.2" height="8.2" rx="1.2" fill="#18181b" />
      <rect x="17.2" y="17.2" width="8.2" height="8.2" rx="1.2" fill="#18181b" />
      <path d="M2.8 9.2c0-3.53 2.87-6.4 6.4-6.4h13.6c3.53 0 6.4 2.87 6.4 6.4v1.2H2.8z" fill="#ffffff" fillOpacity="0.16" />
      <rect x="2.8" y="2.8" width="26.4" height="26.4" rx="5.4" fill="none" stroke="#bfdbfe" strokeOpacity="0.32" />
    </MapIconBase>
  )
}

export function MapRealtimeEngineIcon(props: MapIconProps) {
  return (
    <MapIconBase {...props}>
      <rect x="5" y="6" width="22" height="20" rx="4" {...STROKE} />
      <path d="M9 16h3l2-4 3 8 2-5h4" {...STROKE} />
      <path d="M10 9v2" {...STROKE} />
      <path d="M14 9v2" {...STROKE} />
      <path d="M18 9v2" {...STROKE} />
      <path d="M22 9v2" {...STROKE} />
    </MapIconBase>
  )
}

export function MapClusterFabricIcon(props: MapIconProps) {
  return (
    <MapIconBase {...props}>
      <rect x="4" y="12" width="8" height="8" rx="2" {...STROKE} />
      <rect x="20" y="5" width="8" height="8" rx="2" {...STROKE} />
      <rect x="20" y="19" width="8" height="8" rx="2" {...STROKE} />
      <path d="M12 16h5" {...STROKE} />
      <path d="M17 16v-7" {...STROKE} />
      <path d="M17 16v7" {...STROKE} />
      <path d="M17 9h3" {...STROKE} />
      <path d="M17 23h3" {...STROKE} />
    </MapIconBase>
  )
}

// OS/2-inspired launcher glyphs stay single-color so Carbon surfaces can own the accent.
export function MapOs2DrivesIcon(props: MapIconProps) {
  return (
    <MapIconBase {...props}>
      <path d="M8 8h13l3 3H11z" {...STROKE} />
      <path d="M8 11h16a2 2 0 0 1 2 2v3H8z" {...STROKE} />
      <path d="M8 18h16a2 2 0 0 1 2 2v4H8z" {...STROKE} />
      <path d="M10 14h5" {...STROKE} />
      <path d="M10 21h5" {...STROKE} />
      <circle cx="22" cy="14" r="1.2" fill="currentColor" />
      <circle cx="19" cy="14" r="1.2" fill="currentColor" />
      <circle cx="22" cy="21" r="1.2" fill="currentColor" />
      <circle cx="19" cy="21" r="1.2" fill="currentColor" />
    </MapIconBase>
  )
}

export function MapOs2FileManagerIcon(props: MapIconProps) {
  return (
    <MapIconBase {...props}>
      <path d="M7 9h11l3 3h4v13H7z" {...STROKE} />
      <path d="M7 12h18" {...STROKE} />
      <path d="M12 14.5v8.5" {...STROKE} />
      <path d="M15 16h7" {...STROKE} />
      <path d="M15 19h7" {...STROKE} />
      <path d="M15 22h5" {...STROKE} />
      <circle cx="10" cy="16.5" r="1" fill="currentColor" />
      <circle cx="10" cy="19.5" r="1" fill="currentColor" />
      <path d="M10 17.5v1" {...STROKE} />
      <path d="M10 20.5v1.5h1.5" {...STROKE} />
    </MapIconBase>
  )
}

export function MapOs2HomeIcon(props: MapIconProps) {
  return (
    <MapIconBase {...props}>
      <path d="M7 15.5L16 8l9 7.5" {...STROKE} />
      <path d="M10 14.5v10h12v-10" {...STROKE} />
      <path d="M14 24.5v-5h4v5" {...STROKE} />
      <path d="M19 14.5l4-2.5V22l-4 2.5" {...STROKE} />
      <path d="M21 11h2v3" {...STROKE} />
      <path d="M12.5 17.5h2" {...STROKE} />
    </MapIconBase>
  )
}

export function MapRoutingMatrixIcon(props: MapIconProps) {
  return (
    <MapIconBase {...props}>
      <rect x="4" y="4" width="24" height="24" rx="4" {...STROKE} />
      <path d="M12 8v16" {...STROKE} />
      <path d="M20 8v16" {...STROKE} />
      <path d="M8 12h16" {...STROKE} />
      <path d="M8 20h16" {...STROKE} />
      <path d="M8 24h4l4-4 4 0 4-8" {...STROKE} />
      <circle cx="8" cy="24" r="1.3" fill="currentColor" />
      <circle cx="16" cy="20" r="1.3" fill="currentColor" />
      <circle cx="24" cy="12" r="1.3" fill="currentColor" />
    </MapIconBase>
  )
}

export function MapPatchLibraryIcon(props: MapIconProps) {
  return (
    <MapIconBase {...props}>
      <path d="M9 7h11l4 4v14H9z" {...STROKE} />
      <path d="M20 7v4h4" {...STROKE} />
      <path d="M12 18h4l2-3 2 3h2" {...STROKE} />
      <path d="M12 23h10" {...STROKE} />
      <path d="M6 11v14h12" {...STROKE} />
    </MapIconBase>
  )
}

export function MapArtifactsLibraryIcon(props: MapIconProps) {
  return (
    <MapIconBase {...props}>
      <path d="M7 11h18v13H7z" {...STROKE} />
      <path d="M10 8h12l2 3H8z" {...STROKE} />
      <path d="M14 15h4" {...STROKE} />
      <path d="M12 19h8" {...STROKE} />
      <path d="M9 11v-1.5A1.5 1.5 0 0 1 10.5 8" {...STROKE} />
    </MapIconBase>
  )
}

export function MapStagePerformanceIcon(props: MapIconProps) {
  return (
    <MapIconBase {...props}>
      <path d="M8 7h16" {...STROKE} />
      <path d="M12 7l-2 6" {...STROKE} />
      <path d="M20 7l2 6" {...STROKE} />
      <path d="M10 20h12" {...STROKE} />
      <path d="M12 24h8" {...STROKE} />
      <path d="M16 10v10" {...STROKE} />
      <path d="M16 10c0-2.4 1.8-4 4-4" {...STROKE} />
      <circle cx="20" cy="6" r="1.5" fill="currentColor" />
    </MapIconBase>
  )
}

export function MapRackDeviceIcon(props: MapIconProps) {
  return (
    <MapIconBase {...props}>
      <rect x="5" y="6" width="22" height="20" rx="4" {...STROKE} />
      <path d="M9 11h14" {...STROKE} />
      <path d="M9 16h14" {...STROKE} />
      <path d="M9 21h14" {...STROKE} />
      <circle cx="11" cy="11" r="1.2" fill="currentColor" />
      <circle cx="21" cy="16" r="1.2" fill="currentColor" />
      <circle cx="15" cy="21" r="1.2" fill="currentColor" />
    </MapIconBase>
  )
}

export function MapMatrixProcessorIcon(props: MapIconProps) {
  return (
    <MapIconBase {...props}>
      <rect x="5" y="5" width="22" height="22" rx="4" {...STROKE} />
      <path d="M11 9v14" {...STROKE} />
      <path d="M17 9v14" {...STROKE} />
      <path d="M23 9v14" {...STROKE} />
      <path d="M9 13h14" {...STROKE} />
      <path d="M9 19h14" {...STROKE} />
      <circle cx="11" cy="19" r="1.2" fill="currentColor" />
      <circle cx="17" cy="13" r="1.2" fill="currentColor" />
      <circle cx="23" cy="19" r="1.2" fill="currentColor" />
    </MapIconBase>
  )
}

export function MapAmplifierIcon(props: MapIconProps) {
  return (
    <MapIconBase {...props}>
      <path d="M7 9h18v14H7z" {...STROKE} />
      <path d="M10 13h12" {...STROKE} />
      <circle cx="12" cy="19" r="1.6" {...STROKE} />
      <circle cx="20" cy="19" r="1.6" {...STROKE} />
      <path d="M10 9V7h12v2" {...STROKE} />
    </MapIconBase>
  )
}

export function MapCabinetIcon(props: MapIconProps) {
  return (
    <MapIconBase {...props}>
      <path d="M8 7h16v18H8z" {...STROKE} />
      <circle cx="16" cy="16" r="5.5" {...STROKE} />
      <circle cx="16" cy="16" r="1.8" fill="currentColor" />
    </MapIconBase>
  )
}

export function MapDelayIcon(props: MapIconProps) {
  return (
    <MapIconBase {...props}>
      <circle cx="9" cy="16" r="3" {...STROKE} />
      <path d="M12 16h6" {...STROKE} />
      <path d="M19 13l4 3-4 3" {...STROKE} />
      <path d="M18 10h4" {...STROKE} />
      <path d="M18 22h4" {...STROKE} />
    </MapIconBase>
  )
}

export function MapDynamicsIcon(props: MapIconProps) {
  return (
    <MapIconBase {...props}>
      <path d="M8 24V11" {...STROKE} />
      <path d="M16 24V8" {...STROKE} />
      <path d="M24 24v-6" {...STROKE} />
      <path d="M7 14h18" {...STROKE} />
      <path d="M20 10l5 4-5 4" {...STROKE} />
    </MapIconBase>
  )
}

export function MapEqualizerIcon(props: MapIconProps) {
  return (
    <MapIconBase {...props}>
      <path d="M10 8v16" {...STROKE} />
      <path d="M16 8v16" {...STROKE} />
      <path d="M22 8v16" {...STROKE} />
      <circle cx="10" cy="13" r="2" {...STROKE} />
      <circle cx="16" cy="20" r="2" {...STROKE} />
      <circle cx="22" cy="11" r="2" {...STROKE} />
    </MapIconBase>
  )
}

export function MapModulationIcon(props: MapIconProps) {
  return (
    <MapIconBase {...props}>
      <path d="M6 18c2.5 0 2.5-8 5-8s2.5 8 5 8 2.5-8 5-8 2.5 8 5 8" {...STROKE} />
      <circle cx="11" cy="10" r="1.3" fill="currentColor" />
      <circle cx="21" cy="10" r="1.3" fill="currentColor" />
    </MapIconBase>
  )
}

export function MapMultiEffectIcon(props: MapIconProps) {
  return (
    <MapIconBase {...props}>
      <circle cx="9" cy="10" r="2.5" {...STROKE} />
      <circle cx="23" cy="10" r="2.5" {...STROKE} />
      <circle cx="16" cy="22" r="2.5" {...STROKE} />
      <path d="M11.5 10h9" {...STROKE} />
      <path d="M10.5 12.2l4 7.3" {...STROKE} />
      <path d="M21.5 12.2l-4 7.3" {...STROKE} />
      <path d="M16 7v-2" {...STROKE} />
      <path d="M14.4 6.2l1.6-3.2 1.6 3.2" {...STROKE} />
    </MapIconBase>
  )
}

export function MapPitchIcon(props: MapIconProps) {
  return (
    <MapIconBase {...props}>
      <path d="M12 8v12" {...STROKE} />
      <path d="M12 8c2.4 0 4.5 1.1 6 3" {...STROKE} />
      <path d="M18 11v7" {...STROKE} />
      <path d="M18 11c2.2 0 4 1 5 2.7" {...STROKE} />
      <path d="M22 20l3 3" {...STROKE} />
      <path d="M25 20v3h-3" {...STROKE} />
    </MapIconBase>
  )
}

export function MapReverbIcon(props: MapIconProps) {
  return (
    <MapIconBase {...props}>
      <path d="M8 16h3" {...STROKE} />
      <path d="M13 11c3.5 1.5 5.5 4.1 5.5 8" {...STROKE} />
      <path d="M13 8c5.8 1.9 9 5.9 9 11" {...STROKE} />
      <path d="M13 5c7.8 2.4 12 7.2 12 14" {...STROKE} />
    </MapIconBase>
  )
}
