export type SequencerImportSource = 'drums' | 'synthforge'

export function parseSequencerImportSource(value: string | null): SequencerImportSource | undefined {
  return value === 'drums' || value === 'synthforge' ? value : undefined
}

export function buildBrainHandoffPath(source: SequencerImportSource, search: string): string {
  const currentSearchParams = new URLSearchParams(search)
  const nextSearchParams = new URLSearchParams()
  const instanceId = currentSearchParams.get('instance_id')
  const pluginPosition = currentSearchParams.get('plugin_position')

  if (instanceId && instanceId.trim() !== '') {
    nextSearchParams.set('instance_id', instanceId)
  }
  if (pluginPosition && pluginPosition.trim() !== '') {
    nextSearchParams.set('plugin_position', pluginPosition)
  }

  nextSearchParams.set('section', 'overview')
  nextSearchParams.set('import_source', source)

  return `/brain?${nextSearchParams.toString()}`
}
