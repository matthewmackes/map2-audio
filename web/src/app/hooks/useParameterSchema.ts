import { useCallback, useEffect, useState } from 'react'
import {
  PLUGIN_INVENTORY_CHANGED_EVENT,
  pluginsApi,
  type PluginParameterSchemaPlugin,
} from '../../map2/api'
import {
  hydrateParameterSchema,
  parameterSchema,
  type ParameterRegistry,
} from '../data/parameterSchema'

export interface UseParameterSchemaResult {
  registry: ParameterRegistry
  plugins: PluginParameterSchemaPlugin[]
  loading: boolean
  error: string | null
  lastUpdated: string | null
  refresh: () => Promise<void>
}

export function useParameterSchema(): UseParameterSchemaResult {
  const [registry, setRegistry] = useState<ParameterRegistry>({ ...parameterSchema })
  const [plugins, setPlugins] = useState<PluginParameterSchemaPlugin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const response = await pluginsApi.getParameterSchema()
      const hydrated = hydrateParameterSchema(response.schema)
      setRegistry({ ...hydrated })
      setPlugins(response.plugins)
      setError(null)
      setLastUpdated(new Date().toISOString())
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to load parameter schema')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const handleInventoryChanged = () => {
      void refresh()
    }

    window.addEventListener(PLUGIN_INVENTORY_CHANGED_EVENT, handleInventoryChanged)
    return () => {
      window.removeEventListener(PLUGIN_INVENTORY_CHANGED_EVENT, handleInventoryChanged)
    }
  }, [refresh])

  return {
    registry,
    plugins,
    loading,
    error,
    lastUpdated,
    refresh,
  }
}
