import type { PluginOrderRef } from './types'

export type RawPluginOrderRef = PluginOrderRef | {
  uri?: string
  position?: number
  plugin_uri?: string
  plugin_position?: number
}

export type RawReorderPluginsResponse = {
  status: string
  chain_id: number
  plugins?: RawPluginOrderRef[] | string[]
}

type ApiErrorDetail = {
  type?: string
  loc?: unknown[]
}

type ReorderApiErrorLike = {
  status?: unknown
  body?: unknown
}

export function getChainReorderCompatibilityKey(nodeId?: string | null): string {
  return nodeId && nodeId !== 'all' ? nodeId : '__default__'
}

export function hasDuplicatePluginOrderUris(pluginOrder: PluginOrderRef[]): boolean {
  const seen = new Set<string>()
  for (const plugin of pluginOrder) {
    if (seen.has(plugin.uri)) {
      return true
    }
    seen.add(plugin.uri)
  }
  return false
}

export function isLegacyUriOnlyReorderValidationError(error: unknown): boolean {
  const candidate = error as ReorderApiErrorLike | null
  if (!candidate || candidate.status !== 422) {
    return false
  }

  const detail = (candidate.body as { detail?: ApiErrorDetail[] } | undefined)?.detail
  if (!Array.isArray(detail)) {
    return false
  }

  return detail.some((entry) => (
    entry?.type === 'string_type'
    && Array.isArray(entry.loc)
    && entry.loc[0] === 'body'
  ))
}

function hasLegacyPluginUri(raw: RawPluginOrderRef): raw is RawPluginOrderRef & { plugin_uri: string } {
  return 'plugin_uri' in raw && typeof raw.plugin_uri === 'string'
}

function hasLegacyPluginPosition(raw: RawPluginOrderRef): raw is RawPluginOrderRef & { plugin_position: number } {
  return 'plugin_position' in raw && typeof raw.plugin_position === 'number'
}

function normalizePluginOrderRef(raw: RawPluginOrderRef | string, fallback: PluginOrderRef): PluginOrderRef {
  if (typeof raw === 'string') {
    return raw === fallback.uri ? fallback : { uri: raw, position: fallback.position }
  }

  const uri = typeof raw.uri === 'string'
    ? raw.uri
    : hasLegacyPluginUri(raw)
      ? raw.plugin_uri
      : fallback.uri
  const rawPosition = typeof raw.position === 'number'
    ? raw.position
    : hasLegacyPluginPosition(raw)
      ? raw.plugin_position
      : fallback.position

  return {
    uri,
    position: Number.isFinite(rawPosition) ? rawPosition : fallback.position,
  }
}

export function normalizeReorderPluginsResponse(
  response: RawReorderPluginsResponse,
  requestedOrder: PluginOrderRef[],
): { status: string; chain_id: number; plugins: PluginOrderRef[] } {
  const rawPlugins = Array.isArray(response.plugins) ? response.plugins : []
  const plugins = rawPlugins.length > 0
    ? rawPlugins.map((plugin, index) => normalizePluginOrderRef(plugin, requestedOrder[index] ?? { uri: '', position: index }))
    : requestedOrder

  return {
    status: response.status,
    chain_id: response.chain_id,
    plugins,
  }
}

export function getLegacyUriOnlyPluginOrder(pluginOrder: PluginOrderRef[]): string[] {
  if (hasDuplicatePluginOrderUris(pluginOrder)) {
    throw new Error(
      'The running backend still uses URI-only chain reorder payloads, so duplicate plugins cannot be moved safely until that API is updated.',
    )
  }

  return pluginOrder.map((plugin) => plugin.uri)
}
