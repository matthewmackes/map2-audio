import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { irLibraryApi } from '../../map2/api'
import type { DownloadRequest } from '../types/library'

export function useDownloadProgress() {
  const queryClient = useQueryClient()

  const statusQuery = useQuery({
    queryKey: ['ir', 'download', 'status'],
    queryFn: irLibraryApi.getDownloadStatus,
    refetchInterval: (query) => {
      // Poll every second when downloading, stop when idle
      return query.state.data?.is_downloading ? 1000 : false
    },
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

  return {
    status: statusQuery.data,
    isLoading: statusQuery.isLoading,
    isDownloading: statusQuery.data?.is_downloading ?? false,
    startDownload: startMutation.mutate,
    cancelDownload: cancelMutation.mutate,
    resetDownload: resetMutation.mutate,
    retrySource: retryMutation.mutate,
    isStarting: startMutation.isPending,
    isCancelling: cancelMutation.isPending,
    isRetrying: retryMutation.isPending,
    startError: startMutation.error,
    refetch: statusQuery.refetch,
  }
}
