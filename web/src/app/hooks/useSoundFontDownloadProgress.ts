import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { soundfontApi } from '../../map2/api'
import type { DownloadRequest } from '../types/library'
import { subscribeToDownloadProgressTopic } from './downloadProgressSocket'

export function useSoundFontDownloadProgress() {
  const queryClient = useQueryClient()

  const statusQuery = useQuery({
    queryKey: ['soundfont', 'download', 'status'],
    queryFn: soundfontApi.getDownloadStatus,
    refetchInterval: (query) => {
      // Poll every 2 seconds as fallback when downloading
      return query.state.data?.is_downloading ? 2000 : false
    },
  })

  const fileTasksQuery = useQuery({
    queryKey: ['soundfont', 'download', 'files'],
    queryFn: soundfontApi.getFileTasks,
    refetchInterval: (query) => {
      // Poll every 2 seconds for file tasks when downloading
      return statusQuery.data?.is_downloading ? 2000 : false
    },
    enabled: !!statusQuery.data?.is_downloading,
  })

  const startMutation = useMutation({
    mutationFn: (request: DownloadRequest) => soundfontApi.startDownload(request),
    onSuccess: () => {
      // Start polling immediately
      queryClient.invalidateQueries({ queryKey: ['soundfont', 'download'] })
    },
    onError: (error) => {
      console.error('SoundFont download start failed:', error)
    },
  })

  const pauseMutation = useMutation({
    mutationFn: soundfontApi.pauseDownload,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['soundfont', 'download', 'status'] })
    },
  })

  const resumeMutation = useMutation({
    mutationFn: soundfontApi.resumeDownload,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['soundfont', 'download'] })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: soundfontApi.cancelDownload,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['soundfont', 'download'] })
      queryClient.invalidateQueries({ queryKey: ['soundfonts'] })
    },
  })

  const resetMutation = useMutation({
    mutationFn: soundfontApi.resetDownload,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['soundfont', 'download'] })
    },
  })

  const retryMutation = useMutation({
    mutationFn: (source: string) => soundfontApi.retrySource(source),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['soundfont', 'download'] })
    },
  })

  // WebSocket subscription effect
  useEffect(() => {
    if (!statusQuery.data?.is_downloading) {
      return
    }

    return subscribeToDownloadProgressTopic('soundfont:download:progress', (message) => {
      const nextStatus = typeof message.data === 'object' && message.data !== null
        ? message.data
        : message
      queryClient.setQueryData(['soundfont', 'download', 'status'], nextStatus)
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
