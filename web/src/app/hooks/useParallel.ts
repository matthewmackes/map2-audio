/**
 * useParallel - React hook for parallel processing chain management
 *
 * Provides control for A/B routing, parallel branches, and blend control
 * from the JUCE audio engine.
 */

import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clusterScopeKey, withNodeQuery } from '../utils/clusterTransport'

// ========================================
// Types
// ========================================

export interface ParallelGroup {
  id: number
  abBlend: number
  masterLevel: number
  bypass: boolean
  branches: number[][]  // Each branch is an array of plugin IDs
  branchLevels: number[]
}

export interface CreateParallelGroupParams {
  position?: number
  numBranches?: number
}

export interface AddToBranchParams {
  groupId: number
  branchIndex: number
  pluginId: number
  position?: number
}

export interface RemoveFromBranchParams {
  groupId: number
  branchIndex: number
  pluginId: number
}

// ========================================
// API Response parsing
// ========================================

function parseParallelGroup(data: Record<string, unknown>): ParallelGroup {
  return {
    id: (data.id as number) ?? -1,
    abBlend: (data.ab_blend as number) ?? 0.5,
    masterLevel: (data.master_level as number) ?? 1.0,
    bypass: (data.bypass as boolean) ?? false,
    branches: (data.branches as number[][]) ?? [],
    branchLevels: (data.branch_levels as number[]) ?? []
  }
}

// ========================================
// Hook
// ========================================

interface UseParallelOptions {
  nodeId?: string | null
}

export function useParallel(options: UseParallelOptions = {}) {
  const { nodeId } = options
  const queryClient = useQueryClient()
  const scopeKey = clusterScopeKey(nodeId)

  // ========================================
  // Query for all parallel groups
  // ========================================

  const groupsQuery = useQuery({
    queryKey: ['parallel', scopeKey, 'groups'],
    queryFn: async () => {
      const res = await fetch(withNodeQuery('/api/engine/parallel', nodeId))
      if (!res.ok) throw new Error('Failed to fetch parallel groups')
      const data = await res.json()
      return (data as Record<string, unknown>[]).map(parseParallelGroup)
    },
    staleTime: 2000
  })

  // ========================================
  // Mutations
  // ========================================

  const createGroup = useMutation({
    mutationFn: async (params: CreateParallelGroupParams) => {
      const res = await fetch(withNodeQuery('/api/engine/parallel', nodeId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position: params.position ?? -1,
          num_branches: params.numBranches ?? 2
        })
      })
      if (!res.ok) throw new Error('Failed to create parallel group')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parallel', scopeKey, 'groups'] })
    }
  })

  const removeGroup = useMutation({
    mutationFn: async (groupId: number) => {
      const res = await fetch(withNodeQuery(`/api/engine/parallel/${groupId}`, nodeId), {
        method: 'DELETE'
      })
      if (!res.ok) throw new Error('Failed to remove parallel group')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parallel', scopeKey, 'groups'] })
    }
  })

  const addToBranch = useMutation({
    mutationFn: async (params: AddToBranchParams) => {
      const res = await fetch(withNodeQuery(`/api/engine/parallel/${params.groupId}/branches`, nodeId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_index: params.branchIndex,
          plugin_id: params.pluginId,
          position: params.position ?? -1
        })
      })
      if (!res.ok) throw new Error('Failed to add to branch')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parallel', scopeKey, 'groups'] })
    }
  })

  const removeFromBranch = useMutation({
    mutationFn: async (params: RemoveFromBranchParams) => {
      const res = await fetch(
        withNodeQuery(`/api/engine/parallel/${params.groupId}/branches/${params.branchIndex}/plugins/${params.pluginId}`, nodeId),
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error('Failed to remove from branch')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parallel', scopeKey, 'groups'] })
    }
  })

  const setABBlend = useMutation({
    mutationFn: async ({ groupId, blend }: { groupId: number; blend: number }) => {
      const res = await fetch(withNodeQuery(`/api/engine/parallel/${groupId}/blend`, nodeId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blend })
      })
      if (!res.ok) throw new Error('Failed to set A/B blend')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parallel', scopeKey, 'groups'] })
    }
  })

  const setBranchLevel = useMutation({
    mutationFn: async ({
      groupId,
      branchIndex,
      level
    }: {
      groupId: number
      branchIndex: number
      level: number
    }) => {
      const res = await fetch(
        withNodeQuery(`/api/engine/parallel/${groupId}/branches/${branchIndex}/level`, nodeId),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branch_index: branchIndex, level })
        }
      )
      if (!res.ok) throw new Error('Failed to set branch level')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parallel', scopeKey, 'groups'] })
    }
  })

  const setBypass = useMutation({
    mutationFn: async ({ groupId, bypass }: { groupId: number; bypass: boolean }) => {
      const res = await fetch(withNodeQuery(`/api/engine/parallel/${groupId}/bypass`, nodeId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bypass })
      })
      if (!res.ok) throw new Error('Failed to set bypass')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parallel', scopeKey, 'groups'] })
    }
  })

  // ========================================
  // Convenience functions
  // ========================================

  const createParallelGroup = useCallback(
    (position?: number, numBranches?: number) => {
      return createGroup.mutateAsync({ position, numBranches })
    },
    [createGroup]
  )

  const removeParallelGroup = useCallback(
    (groupId: number) => {
      return removeGroup.mutateAsync(groupId)
    },
    [removeGroup]
  )

  const addPluginToBranch = useCallback(
    (groupId: number, branchIndex: number, pluginId: number, position?: number) => {
      return addToBranch.mutateAsync({ groupId, branchIndex, pluginId, position })
    },
    [addToBranch]
  )

  const removePluginFromBranch = useCallback(
    (groupId: number, branchIndex: number, pluginId: number) => {
      return removeFromBranch.mutateAsync({ groupId, branchIndex, pluginId })
    },
    [removeFromBranch]
  )

  const setGroupABBlend = useCallback(
    (groupId: number, blend: number) => {
      return setABBlend.mutateAsync({ groupId, blend })
    },
    [setABBlend]
  )

  const setGroupBranchLevel = useCallback(
    (groupId: number, branchIndex: number, level: number) => {
      return setBranchLevel.mutateAsync({ groupId, branchIndex, level })
    },
    [setBranchLevel]
  )

  const setGroupBypass = useCallback(
    (groupId: number, bypass: boolean) => {
      return setBypass.mutateAsync({ groupId, bypass })
    },
    [setBypass]
  )

  // ========================================
  // Return
  // ========================================

  return {
    // State
    groups: groupsQuery.data ?? [],
    isLoading: groupsQuery.isLoading,
    isError: groupsQuery.isError,
    error: groupsQuery.error,

    // Refresh
    refetch: groupsQuery.refetch,

    // Group management
    createParallelGroup,
    removeParallelGroup,

    // Branch management
    addPluginToBranch,
    removePluginFromBranch,

    // Parameters
    setGroupABBlend,
    setGroupBranchLevel,
    setGroupBypass,

    // Mutation states
    isCreating: createGroup.isPending,
    isRemoving: removeGroup.isPending,
    isUpdating:
      addToBranch.isPending ||
      removeFromBranch.isPending ||
      setABBlend.isPending ||
      setBranchLevel.isPending ||
      setBypass.isPending
  }
}

export default useParallel
