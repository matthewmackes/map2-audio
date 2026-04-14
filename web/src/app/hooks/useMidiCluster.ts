import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { midiClusterApi, type MidiClusterClock, type MidiClusterConnection, type MidiClusterEndpoint, type MidiClusterHealth, type MidiClusterNode, type MidiClusterSummary } from '../../map2/api'
import { canonicalizeNavigationRoute } from '../data/advancedMenuItems'
import { PLATFORM_WORKSPACE_BASE_PATH } from '../platform/routes'
import { useRealtimeCadence } from './useRealtimeCadence'
import { useRouteActive } from './useRouteActive'
import useMidiClusterEvents from './useMidiClusterEvents'

const QUERY_BASE = ['midi-cluster'] as const

function useMidiClusterCadence(visibleMs: number, hiddenMs: number, inactiveMs: number | false = false) {
  const routeActive = useRouteActive((pathname) => {
    const canonicalPathname = canonicalizeNavigationRoute(pathname)
    return (
      canonicalPathname === '/midi-hub'
      || canonicalPathname.startsWith('/midi-hub/')
      || canonicalPathname === '/workspace'
      || canonicalPathname.startsWith('/workspace/')
      || canonicalPathname === PLATFORM_WORKSPACE_BASE_PATH
      || canonicalPathname.startsWith(`${PLATFORM_WORKSPACE_BASE_PATH}/`)
    )
  })
  return useRealtimeCadence({
    routeActive,
    visibleMs,
    hiddenMs,
    inactiveMs,
  })
}

export function useMidiClusterNodes() {
  const queryClient = useQueryClient()
  const events = useMidiClusterEvents('midi_cluster_nodes')
  const refetchInterval = useMidiClusterCadence(10_000, 30_000)

  useEffect(() => {
    if (events.latestEvent) {
      void queryClient.invalidateQueries({ queryKey: QUERY_BASE })
    }
  }, [events.latestEvent, queryClient])

  return useQuery<MidiClusterNode[]>({
    queryKey: [...QUERY_BASE, 'nodes'],
    queryFn: midiClusterApi.listNodes,
    refetchInterval,
  })
}

export function useMidiClusterConnections() {
  const queryClient = useQueryClient()
  const events = useMidiClusterEvents('midi_cluster_connections')
  const refetchInterval = useMidiClusterCadence(8_000, 20_000)

  useEffect(() => {
    if (events.latestEvent) {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_BASE, 'connections'] })
    }
  }, [events.latestEvent, queryClient])

  return useQuery<MidiClusterConnection[]>({
    queryKey: [...QUERY_BASE, 'connections'],
    queryFn: midiClusterApi.listConnections,
    refetchInterval,
  })
}

export function useMidiClusterEndpoints() {
  const refetchInterval = useMidiClusterCadence(15_000, 45_000)
  return useQuery<MidiClusterEndpoint[]>({
    queryKey: [...QUERY_BASE, 'endpoints'],
    queryFn: midiClusterApi.listEndpoints,
    refetchInterval,
  })
}

export function useMidiClusterClock() {
  const queryClient = useQueryClient()
  const events = useMidiClusterEvents('midi_cluster_clock')
  const refetchInterval = useMidiClusterCadence(8_000, 20_000)

  useEffect(() => {
    if (events.latestEvent) {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_BASE, 'clock'] })
    }
  }, [events.latestEvent, queryClient])

  return useQuery<MidiClusterClock>({
    queryKey: [...QUERY_BASE, 'clock'],
    queryFn: midiClusterApi.getClock,
    refetchInterval,
  })
}

export function useMidiClusterHealth() {
  const refetchInterval = useMidiClusterCadence(15_000, 45_000)
  return useQuery<MidiClusterHealth>({
    queryKey: [...QUERY_BASE, 'health'],
    queryFn: midiClusterApi.getHealth,
    refetchInterval,
  })
}

export function useMidiClusterSummary() {
  const refetchInterval = useMidiClusterCadence(15_000, 45_000)
  return useQuery<MidiClusterSummary>({
    queryKey: [...QUERY_BASE, 'summary'],
    queryFn: midiClusterApi.getSummary,
    refetchInterval,
  })
}

export function useConnectMidiCluster() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: midiClusterApi.createConnection,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_BASE, 'connections'] })
      void queryClient.invalidateQueries({ queryKey: [...QUERY_BASE, 'health'] })
    },
  })
}

export function useDisconnectMidiCluster() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: midiClusterApi.deleteConnection,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_BASE, 'connections'] })
      void queryClient.invalidateQueries({ queryKey: [...QUERY_BASE, 'health'] })
    },
  })
}

export function useTriggerClusterAutoConnect() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: midiClusterApi.triggerAutoConnect,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_BASE, 'summary'] })
      void queryClient.invalidateQueries({ queryKey: [...QUERY_BASE, 'connections'] })
    },
  })
}

export function useClusterClockActions() {
  const queryClient = useQueryClient()
  const setStrategy = useMutation({
    mutationFn: (payload: { strategy: string; manualNodeId?: string }) =>
      midiClusterApi.setClockStrategy(payload.strategy, payload.manualNodeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_BASE, 'clock'] })
    },
  })

  const forceSync = useMutation({
    mutationFn: midiClusterApi.forceClockSync,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_BASE, 'clock'] })
    },
  })

  return { setStrategy, forceSync }
}

export default {
  useMidiClusterNodes,
  useMidiClusterConnections,
  useMidiClusterEndpoints,
  useMidiClusterClock,
  useMidiClusterHealth,
  useMidiClusterSummary,
  useConnectMidiCluster,
  useDisconnectMidiCluster,
  useTriggerClusterAutoConnect,
  useClusterClockActions,
}
