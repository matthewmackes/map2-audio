import { getPluginIdentityKeyFromParts } from './pluginIdentity'

type PluginLevelPayload = {
  uri: string;
  input?: number | null;
  output?: number | null;
  position?: number | null;
  plugin_position?: number | null;
  instance_id?: number | null;
}

type PluginPerformancePayload = {
  uri: string;
  cpu_percent?: number | null;
  latency_samples?: number | null;
  position?: number | null;
  plugin_position?: number | null;
  instance_id?: number | null;
}

export function buildPluginLevelMap(plugins: PluginLevelPayload[]): Record<string, { input: number; output: number }> {
  const map: Record<string, { input: number; output: number }> = {}
  for (const plugin of plugins) {
    const position = plugin.plugin_position ?? plugin.position
    const pluginKey = getPluginIdentityKeyFromParts(plugin.uri, position, plugin.instance_id)
    const entry = {
      input: plugin.input ?? 0,
      output: plugin.output ?? 0,
    }
    map[pluginKey] = entry
    if (!map[plugin.uri]) {
      map[plugin.uri] = entry
    }
  }
  return map
}

export function buildPluginPerformanceMap(
  plugins: PluginPerformancePayload[],
): Record<string, { cpuPercent?: number; latencySamples?: number }> {
  const map: Record<string, { cpuPercent?: number; latencySamples?: number }> = {}
  for (const plugin of plugins) {
    const position = plugin.plugin_position ?? plugin.position
    const pluginKey = getPluginIdentityKeyFromParts(plugin.uri, position, plugin.instance_id)
    const entry = {
      cpuPercent: plugin.cpu_percent ?? undefined,
      latencySamples: plugin.latency_samples ?? undefined,
    }
    map[pluginKey] = entry
    if (!map[plugin.uri]) {
      map[plugin.uri] = entry
    }
  }
  return map
}
