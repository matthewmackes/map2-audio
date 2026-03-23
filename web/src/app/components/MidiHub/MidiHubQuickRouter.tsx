import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  InlineNotification,
  Layer,
  Select,
  SelectItem,
  Tag,
  Toggle,
} from '@carbon/react'
import { midiHubApi, type MidiHubRoute } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'
import { readPorts } from './portUtils'

function routePayloadFromExisting(route: MidiHubRoute, destinationPorts: string[]) {
  return {
    source_port: route.source_port,
    destination_ports: destinationPorts,
    enabled: route.enabled,
    priority: route.priority,
    route_type: route.route_type,
    filter: route.filter,
    transform_chain: route.transform_chain,
    latency_compensation_enabled: route.latency_compensation_enabled,
    destination_latency_ms: route.destination_latency_ms,
  }
}

export function MidiHubQuickRouter() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const [selectedRouterSource, setSelectedRouterSource] = useState('')

  const statusQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'status'],
    queryFn: () => midiHubApi.getStatus(nodeId),
    refetchInterval: 3000,
  })

  const routesQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'routes'],
    queryFn: () => midiHubApi.getRoutes(nodeId),
    refetchInterval: 3000,
  })

  const ports = useMemo(
    () => readPorts((statusQuery.data as Record<string, unknown> | undefined)?.ports),
    [statusQuery.data],
  )
  const routes = routesQuery.data?.routes ?? []
  const sourcePorts = useMemo(
    () => ports.filter((port) => port.direction === 'input' || port.direction === 'duplex'),
    [ports],
  )
  const destinationPorts = useMemo(
    () => ports.filter((port) => port.direction === 'output' || port.direction === 'duplex'),
    [ports],
  )
  const routerSource = selectedRouterSource || sourcePorts[0]?.port_id || ''

  const routeToggleMutation = useMutation({
    mutationFn: async (params: { source: string; destination: string; active: boolean }) => {
      const matching = routes.filter(
        (route) => route.source_port === params.source && route.destination_ports.includes(params.destination),
      )

      if (params.active) {
        if (matching.some((route) => route.enabled)) return
        await midiHubApi.createRoute(
          {
            source_port: params.source,
            destination_ports: [params.destination],
            enabled: true,
            priority: 100,
            route_type: 'pass_through',
            filter: { message_types: [], channels: [] },
            transform_chain: [],
          },
          nodeId,
        )
        return
      }

      for (const route of matching) {
        const nextDestinations = route.destination_ports.filter((destination) => destination !== params.destination)
        if (nextDestinations.length === 0) {
          await midiHubApi.deleteRoute(route.route_id, nodeId)
        } else {
          await midiHubApi.updateRoute(route.route_id, routePayloadFromExisting(route, nextDestinations), nodeId)
        }
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'routes'] })
    },
    onError: () => pushToast('Failed to update routing', 'error'),
  })

  const resetRouterMutation = useMutation({
    mutationFn: async () => {
      for (const route of routes) {
        await midiHubApi.deleteRoute(route.route_id, nodeId)
      }
    },
    onSuccess: () => {
      pushToast('Router reset complete', 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'routes'] })
    },
    onError: () => pushToast('Failed to reset router', 'error'),
  })

  const isRouteActive = (source: string, destination: string) =>
    routes.some((route) => route.enabled && route.source_port === source && route.destination_ports.includes(destination))

  return (
    <Layer className="midi-hub-connections-surface">
      <div className="midi-hub-connections-surface__header">
        <div>
          <h4>Quick router</h4>
          <p>Flip the primary route path on and off without leaving the connections workspace.</p>
        </div>
        <div className="midi-hub-connections-surface__header-meta">
          <Tag type="cool-gray">{`Sources ${sourcePorts.length}`}</Tag>
          <Tag type="cool-gray">{`Destinations ${destinationPorts.length}`}</Tag>
        </div>
      </div>

      {sourcePorts.length === 0 || destinationPorts.length === 0 ? (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title="Routing requires visible ports"
          subtitle="Connect at least one input and one output before using the quick router."
        />
      ) : (
        <>
          <div className="midi-hub-connections-form-grid">
            <Select
              id="midi-hub-quick-router-source"
              labelText="Input source"
              value={routerSource}
              onChange={(event) => setSelectedRouterSource(event.currentTarget.value)}
            >
              {sourcePorts.map((port) => (
                <SelectItem key={port.port_id} value={port.port_id} text={port.name} />
              ))}
            </Select>
          </div>

          <div className="midi-hub-connections-toggle-grid">
            {destinationPorts.map((port) => (
              <Layer key={port.port_id} className="midi-hub-connections-toggle-card">
                <div className="midi-hub-connections-toggle-card__copy">
                  <span className="midi-hub-connections-toggle-card__title">{port.name}</span>
                  <span>{port.kind}</span>
                </div>
                <Toggle
                  id={`midi-hub-quick-router-toggle-${port.port_id}`}
                  size="sm"
                  labelText={port.name}
                  labelA="Off"
                  labelB="On"
                  toggled={routerSource ? isRouteActive(routerSource, port.port_id) : false}
                  onToggle={(checked) => {
                    if (!routerSource) return
                    routeToggleMutation.mutate({
                      source: routerSource,
                      destination: port.port_id,
                      active: checked,
                    })
                  }}
                />
              </Layer>
            ))}
          </div>

          <div className="midi-hub-connections-toolbar">
            <Button size="sm" kind="danger--ghost" onClick={() => resetRouterMutation.mutate()}>
              Reset router
            </Button>
          </div>
        </>
      )}
    </Layer>
  )
}

export default MidiHubQuickRouter
