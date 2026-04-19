import type { Chain, Plugin } from '../../../map2/types'

export function buildSnapshotEditorSelectedPluginCard(
  selectedPlugin: Chain['plugins'][number] | null,
  selectedPluginMeta: Plugin | null,
): Plugin | null {
  if (!selectedPlugin || !selectedPluginMeta) {
    return null
  }

  const selectedParameters = selectedPlugin.parameters || {}

  return {
    ...selectedPluginMeta,
    name: selectedPluginMeta.name || selectedPlugin.name,
    bypassed: selectedPlugin.bypassed,
    instance_id: selectedPlugin.instance_id ?? selectedPluginMeta.instance_id,
    latency_samples: selectedPlugin.latency_samples ?? selectedPluginMeta.latency_samples,
    loader_state: selectedPlugin.loader_state,
    parameters: selectedPluginMeta.parameters.map((parameter) => ({
      ...parameter,
      value: selectedParameters[parameter.symbol] ?? parameter.value ?? parameter.default,
    })),
  }
}
