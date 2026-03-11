import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { midiClusterApi, type MidiClusterClock, type MidiClusterConnection, type MidiClusterEndpoint, type MidiClusterHealth, type MidiClusterNode, type MidiClusterSummary } from '../../map2/api'
import useMidiClusterEvents from './useMidiClusterEvents'

const QUERY_BASE = ['midi-cluster'] as const

export function useMidiClusterNodes() {
  const queryClient = useQueryClient()
  const events = useMidiClusterEvents('midi_cluster_nodes')

  useEffect(() => {
    if (events.latestEvent) {
      void queryClient.invalidateQueries({ queryKey: QUERY_BASE })
    }
  }, [events.latestEvent, queryClient])

  return useQuery<MidiClusterNode[]>({
    queryKey: [...QUERY_BASE, 'nodes'],
    queryFn: midiClusterApi.listNodes,
    refetchInterval: 10000,
  })
}

export function useMidiClusterConnections() {
  const queryClient = useQueryClient()
  const events = useMidiClusterEvents('midi_cluster_connections')

  useEffect(() => {
    if (events.latestEvent) {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_BASE, 'connections'] })
    }
  }, [events.latestEvent, queryClient])

  return useQuery<MidiClusterConnection[]>({
    queryKey: [...QUERY_BASE, 'connections'],
    queryFn: midiClusterApi.listConnections,
    refetchInterval: 8000,
  })
}

export function useMidiClusterEndpoints() {
  return useQuery<MidiClusterEndpoint[]>({
    queryKey: [...QUERY_BASE, 'endpoints'],
    queryFn: midiClusterApi.listEndpoints,
    refetchInterval: 15000,
  })
}

export function useMidiClusterClock() {
  const queryClient = useQueryClient()
  const events = useMidiClusterEvents('midi_cluster_clock')

  useEffect(() => {
    if (events.latestEvent) {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_BASE, 'clock'] })
    }
  }, [events.latestEvent, queryClient])

  return useQuery<MidiClusterClock>({
    queryKey: [...QUERY_BASE, 'clock'],
    queryFn: midiClusterApi.getClock,
    refetchInterval: 8000,
  })
}

export function useMidiClusterHealth() {
  return useQuery<MidiClusterHealth>({
    queryKey: [...QUERY_BASE, 'health'],
    queryFn: midiClusterApi.getHealth,
    refetchInterval: 15000,
  })
}

export function useMidiClusterSummary() {
  return useQuery<MidiClusterSummary>({
    queryKey: [...QUERY_BASE, 'summary'],
    queryFn: midiClusterApi.getSummary,
    refetchInterval: 15000,
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
