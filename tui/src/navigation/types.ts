export type ScreenId =
  | 'home'
  | 'metering'
  | 'cpu'
  | 'audio-grid'
  | 'pipewire'
  | 'midi-hub'
  | 'devices'
  | 'mpx1'
  | 'cluster'
  | 'avb'
  | 'tesira'
  | 'artifacts'
  | 'settings'
  | 'diagnostics'

export interface ScreenDefinition {
  id: ScreenId
  title: string
  shortTitle: string
  description: string
  keyHint?: string
}

export interface ScreenEntry {
  id: ScreenId
}
