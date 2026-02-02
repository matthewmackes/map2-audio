/**
 * useParallel - React hook for parallel processing chain management
 *
 * Provides control for A/B routing, parallel branches, and blend control
 * from the JUCE audio engine.
 */

import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

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

export function useParallel() {
  const queryClient = useQueryClient()

  // ========================================
  // Query for all parallel groups
  // ========================================

  const groupsQuery = useQuery({
    queryKey: ['parallel', 'groups'],
    queryFn: async () => {
      const res = await fetch('/api/engine/parallel')
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
      const res = await fetch('/api/engine/parallel', {
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
      queryClient.invalidateQueries({ queryKey: ['parallel', 'groups'] })
    }
  })

  const removeGroup = useMutation({
    mutationFn: async (groupId: number) => {
      const res = await fetch(`/api/engine/parallel/${groupId}`, {
        method: 'DELETE'
      })
      if (!res.ok) throw new Error('Failed to remove parallel group')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parallel', 'groups'] })
    }
  })

  const addToBranch = useMutation({
    mutationFn: async (params: AddToBranchParams) => {
      const res = await fetch(`/api/engine/parallel/${params.groupId}/branches`, {
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
      queryClient.invalidateQueries({ queryKey: ['parallel', 'groups'] })
    }
  })

  const removeFromBranch = useMutation({
    mutationFn: async (params: RemoveFromBranchParams) => {
      const res = await fetch(
        `/api/engine/parallel/${params.groupId}/branches/${params.branchIndex}/plugins/${params.pluginId}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error('Failed to remove from branch')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parallel', 'groups'] })
    }
  })

  const setABBlend = useMutation({
    mutationFn: async ({ groupId, blend }: { groupId: number; blend: number }) => {
      const res = await fetch(`/api/engine/parallel/${groupId}/blend`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blend })
      })
      if (!res.ok) throw new Error('Failed to set A/B blend')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parallel', 'groups'] })
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
        `/api/engine/parallel/${groupId}/branches/${branchIndex}/level`,
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
      queryClient.invalidateQueries({ queryKey: ['parallel', 'groups'] })
    }
  })

  const setBypass = useMutation({
    mutationFn: async ({ groupId, bypass }: { groupId: number; bypass: boolean }) => {
      const res = await fetch(`/api/engine/parallel/${groupId}/bypass`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bypass })
      })
      if (!res.ok) throw new Error('Failed to set bypass')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parallel', 'groups'] })
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
