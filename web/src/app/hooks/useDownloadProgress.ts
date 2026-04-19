import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { irLibraryApi } from '../../map2/api'
import type { DownloadRequest, FileDownloadTask } from '../types/library'
import { subscribeToDownloadProgressTopic } from './downloadProgressSocket'

export function useDownloadProgress() {
  const queryClient = useQueryClient()

  const statusQuery = useQuery({
    queryKey: ['ir', 'download', 'status'],
    queryFn: irLibraryApi.getDownloadStatus,
    refetchInterval: (query) => {
      // Poll every 2 seconds as fallback when downloading (WebSocket provides real-time updates)
      return query.state.data?.is_downloading ? 2000 : false
    },
  })

  const fileTasksQuery = useQuery({
    queryKey: ['ir', 'download', 'files'],
    queryFn: irLibraryApi.getFileTasks,
    refetchInterval: (query) => {
      // Poll every 2 seconds for file tasks when downloading
      return statusQuery.data?.is_downloading ? 2000 : false
    },
    enabled: !!statusQuery.data?.is_downloading,
  })

  const startMutation = useMutation({
    mutationFn: (request: DownloadRequest) => irLibraryApi.startDownload(request),
    onSuccess: () => {
      // Start polling immediately
      queryClient.invalidateQueries({ queryKey: ['ir', 'download'] })
    },
    onError: (error) => {
      console.error('Download start failed:', error)
    },
  })

  const pauseMutation = useMutation({
    mutationFn: irLibraryApi.pauseDownload,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ir', 'download', 'status'] })
    },
  })

  const resumeMutation = useMutation({
    mutationFn: irLibraryApi.resumeDownload,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ir', 'download'] })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: irLibraryApi.cancelDownload,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ir', 'download'] })
      // Refresh IR list after cancel
      queryClient.invalidateQueries({ queryKey: ['ir', 'list'] })
      queryClient.invalidateQueries({ queryKey: ['ir', 'cabinets'] })
      queryClient.invalidateQueries({ queryKey: ['ir', 'reverbs'] })
    },
  })

  const resetMutation = useMutation({
    mutationFn: irLibraryApi.resetDownload,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ir', 'download'] })
    },
  })

  const retryMutation = useMutation({
    mutationFn: (source: string) => irLibraryApi.retrySource(source),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ir', 'download'] })
    },
  })

  // WebSocket subscription effect
  useEffect(() => {
    if (!statusQuery.data?.is_downloading) {
      return
    }

    return subscribeToDownloadProgressTopic('download:progress', (message) => {
      const nextStatus = typeof message.data === 'object' && message.data !== null
        ? message.data
        : message
      queryClient.setQueryData(['ir', 'download', 'status'], nextStatus)
    })
  }, [statusQuery.data?.is_downloading, queryClient])

  return {
    status: statusQuery.data,
    fileTasks: fileTasksQuery.data || [],
    isLoading: statusQuery.isLoading,
    isDownloading: statusQuery.data?.is_downloading ?? false,
    isPaused: statusQuery.data?.is_downloading === false && !!statusQuery.data?.stats,
    startDownload: startMutation.mutate,
    pauseDownload: pauseMutation.mutate,
    resumeDownload: resumeMutation.mutate,
    cancelDownload: cancelMutation.mutate,
    resetDownload: resetMutation.mutate,
    retrySource: retryMutation.mutate,
    isStarting: startMutation.isPending,
    isPausing: pauseMutation.isPending,
    isResuming: resumeMutation.isPending,
    isCancelling: cancelMutation.isPending,
    isRetrying: retryMutation.isPending,
    startError: startMutation.error,
    refetch: statusQuery.refetch,
  }
}
