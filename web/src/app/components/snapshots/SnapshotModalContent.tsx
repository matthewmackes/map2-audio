import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Add, ChevronDown, ChevronRight, ChevronUp, Draggable, Renew } from '@carbon/icons-react'
import {
  Button,
  InlineLoading,
  Modal,
  OverflowMenu,
  OverflowMenuItem,
  Tab,
  TabList,
  Tabs,
  Tag,
  Tile,
} from '@carbon/react'
import { useToasts } from '../Toasts'
import { NumberInput } from '../ParameterControl'
import { useSpecialSettings } from '../../hooks/useSpecialSettings'
import {
  buildSnapshotSetlistOrder,
  moveSnapshotInSetlist,
  sortFavoriteSnapshotsForSetlist,
} from '../../utils/snapshotSetlist'
import type { SnapshotDetail, SnapshotDraftData, SnapshotSummary } from '../../../map2/types'
import {
  buildSnapshotComparisonSummary,
  checkSnapshotMorphCompatibility,
  fingerprintSnapshotData,
  interpolateSnapshotData,
} from '../SnapshotEditor/snapshotEditorComparison'
import { upsertRuntimeChains } from '../SnapshotEditor/snapshotEditorLiveSnapshotHydration'
import { SnapshotImportDialog } from './SnapshotImportDialog'
import { SnapshotNewWizard, type SnapshotNewWizardValues } from './SnapshotNewWizard'
import { buildDefaultSnapshotName } from '../../utils/snapshotNames'
import {
  flowSnapshotDataToSnapshotPayload,
  type SnapshotListResponse,
  snapshotDetailToDraftData,
  snapshotsApi,
} from '../../../map2/clients/snapshots'
import type { Chain, ChainsResponse } from '../../../map2/types'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function getSnapshotPathSummaries(snapshot: SnapshotSummary) {
  return snapshot.channels.map((channel) => ({
    id: channel.channel_key,
    label: channel.label,
    color: channel.color,
  }))
}

export interface SnapshotModalContentProps {
  entryPoint?: boolean
  onRecall?: () => void
  onSnapshotSave?: () => void
  activeTab?: string
  onTabChange?: (activeTab: string) => void
  snapshotDraft: SnapshotDraftData
  applySnapshotData: (snapshotData: SnapshotDraftData, options?: { toastMessage?: string | null; invalidateChains?: boolean }) => void
}

export function SnapshotModalContent({
  entryPoint = false,
  onRecall,
  onSnapshotSave,
  activeTab,
  onTabChange,
  snapshotDraft,
  applySnapshotData,
}: SnapshotModalContentProps) {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const { settings: specialSettings, updateSettings: updateSpecialSettings } = useSpecialSettings()
  const safeTab = activeTab === 'library' ? activeTab : 'library'
  const handleTabChange = useCallback((nextTab: string) => {
    onTabChange?.(nextTab)
  }, [onTabChange])

  useEffect(() => {
    if (safeTab !== 'library') {
      handleTabChange('library')
    }
  }, [safeTab, handleTabChange])

  const [snapshotTagFilter, setSnapshotTagFilter] = useState<string>('all')
  const snapshotTagFilters = snapshotTagFilter === 'all' ? [] : [snapshotTagFilter]

  const snapshotsQuery = useQuery<SnapshotListResponse>({
    queryKey: ['snapshots', 'list', snapshotTagFilter],
    queryFn: async () => snapshotsApi.list(snapshotTagFilters.length > 0 ? { tags: snapshotTagFilters } : undefined),
    refetchInterval: 5000,
  })

  const activeSnapshotId = snapshotsQuery.data?.active_id ?? null

  const activeSnapshotDetailQuery = useQuery<SnapshotDetail>({
    queryKey: ['snapshots', 'detail', activeSnapshotId],
    queryFn: async () => snapshotsApi.get(activeSnapshotId as number),
    enabled: activeSnapshotId !== null,
  })

  const [snapshotCompareTargetId, setSnapshotCompareTargetId] = useState<number | null>(null)
  const snapshotCompareDetailQuery = useQuery<SnapshotDetail>({
    queryKey: ['snapshots', 'compare-detail', snapshotCompareTargetId],
    queryFn: async () => snapshotsApi.get(snapshotCompareTargetId as number),
    enabled: snapshotCompareTargetId !== null,
  })

  const savedSnapshots = useMemo(() => {
    const raw = snapshotsQuery.data?.snapshots || []
    return [...raw].sort((a, b) => {
      if (a.is_favorite && !b.is_favorite) return -1
      if (!a.is_favorite && b.is_favorite) return 1
      return a.display_order - b.display_order
    })
  }, [snapshotsQuery.data?.snapshots])
  const availableSnapshotTags = snapshotsQuery.data?.available_tags ?? []

  useEffect(() => {
    if (!snapshotsQuery.data) {
      return
    }
    if (snapshotTagFilter !== 'all' && !availableSnapshotTags.includes(snapshotTagFilter)) {
      setSnapshotTagFilter('all')
    }
  }, [availableSnapshotTags, snapshotTagFilter, snapshotsQuery.data])

  const activeSnapshot = useMemo(() => {
    const listedSnapshot = savedSnapshots.find((snapshot) => snapshot.id === activeSnapshotId || snapshot.is_active)
    if (listedSnapshot) {
      return listedSnapshot
    }
    return activeSnapshotDetailQuery.data ? activeSnapshotDetailQuery.data as SnapshotSummary : null
  }, [activeSnapshotDetailQuery.data, activeSnapshotId, savedSnapshots])
  const rawFavoriteSnapshots = useMemo(
    () => savedSnapshots.filter((snapshot) => snapshot.is_favorite),
    [savedSnapshots],
  )
  const favoriteSetlistOrder = useMemo(
    () => buildSnapshotSetlistOrder(rawFavoriteSnapshots, specialSettings?.snapshotSetlistOrder),
    [rawFavoriteSnapshots, specialSettings?.snapshotSetlistOrder],
  )
  const favoriteSnapshots = useMemo(
    () => sortFavoriteSnapshotsForSetlist(rawFavoriteSnapshots, favoriteSetlistOrder),
    [favoriteSetlistOrder, rawFavoriteSnapshots],
  )
  const librarySnapshots = useMemo(
    () => savedSnapshots.filter((snapshot) => !snapshot.is_favorite),
    [savedSnapshots],
  )
  const activeSnapshotNeedsUpdate = useMemo(
    () => Boolean(
      activeSnapshot
      && activeSnapshotDetailQuery.data
      && fingerprintSnapshotData(snapshotDetailToDraftData(activeSnapshotDetailQuery.data)) !== fingerprintSnapshotData(snapshotDraft),
    ),
    [activeSnapshot, activeSnapshotDetailQuery.data, snapshotDraft],
  )

  const snapshotComparisonSummary = useMemo(() => {
    if (!snapshotCompareDetailQuery.data) {
      return null
    }
    const baseData = activeSnapshotDetailQuery.data
      ? snapshotDetailToDraftData(activeSnapshotDetailQuery.data)
      : snapshotDraft
    return buildSnapshotComparisonSummary(baseData, snapshotDetailToDraftData(snapshotCompareDetailQuery.data))
  }, [activeSnapshotDetailQuery.data, snapshotDraft, snapshotCompareDetailQuery.data])

  const [contentView, setContentView] = useState<'entry' | 'library' | 'wizard'>(entryPoint ? 'entry' : 'library')
  const [snapshotPendingRename, setSnapshotPendingRename] = useState<SnapshotSummary | null>(null)
  const [snapshotRenameValue, setSnapshotRenameValue] = useState('')
  const [snapshotPendingDelete, setSnapshotPendingDelete] = useState<SnapshotSummary | null>(null)
  const [snapshotPendingProgram, setSnapshotPendingProgram] = useState<SnapshotSummary | null>(null)
  const [snapshotProgramValue, setSnapshotProgramValue] = useState('')
  const [draggedSnapshotId, setDraggedSnapshotId] = useState<number | null>(null)
  const [dragOverSnapshotId, setDragOverSnapshotId] = useState<number | null>(null)
  const [snapshotLibraryExpanded, setSnapshotLibraryExpanded] = useState(false)
  const [momentarySnapshotId, setMomentarySnapshotId] = useState<number | null>(null)
  const [snapshotMorphTarget, setSnapshotMorphTarget] = useState<SnapshotSummary | null>(null)
  const [snapshotMorphDurationMs, setSnapshotMorphDurationMs] = useState(1200)
  const [snapshotMorphRunning, setSnapshotMorphRunning] = useState(false)
  const [snapshotCompareTarget, setSnapshotCompareTarget] = useState<number | null>(null)

  const [snapshotComparisonId, setSnapshotComparisonId] = useState<number | null>(null)
  const compareSummaryId = useMemo(() => snapshotComparisonId ?? snapshotCompareTarget, [snapshotComparisonId, snapshotCompareTarget])

  const momentaryRestoreStateRef = useRef<SnapshotDraftData | null>(null)
  const createFlowSnapshotMutation = useMutation({
    mutationFn: async (values: SnapshotNewWizardValues) => {
      const pathDefinitions = [
        {
          id: 'ch_a',
          name: `${values.name} Path A`,
          label: 'A',
          color: '#2563eb',
          muted: false,
          solo: false,
          dry_wet_mix: 100,
          order_index: 0,
          snapshot_chain_id: 1,
          runtime_chain_id: null,
          plugins: [],
          loop_insertions: [],
          effects_loops: [],
        },
        {
          id: 'ch_b',
          name: `${values.name} Path B`,
          label: 'B',
          color: '#22c55e',
          muted: false,
          solo: false,
          dry_wet_mix: 100,
          order_index: 1,
          snapshot_chain_id: 2,
          runtime_chain_id: null,
          plugins: [],
          loop_insertions: [],
          effects_loops: [],
        },
      ]
      const chainDefinitions = pathDefinitions.map((path) => ({
        id: path.snapshot_chain_id,
        name: path.name,
        plugins: path.plugins,
        loop_insertions: path.loop_insertions,
        effects_loops: path.effects_loops,
      }))
      const created = await snapshotsApi.create({
        name: values.name,
        description: 'Created from Snapshot Editor wizard',
        io_bindings: {
          input_device: values.inputDevice,
          output_device: values.outputDevice,
          remap_required: false,
        },
        controls: {
          midi_map: [],
          automation_lanes: [],
          expression_mappings: [],
          maschine_encoder_map: {
            enc1: null,
            enc2: null,
            enc3: null,
            enc4: null,
            enc5: null,
            enc6: null,
            enc7: null,
            enc8: null,
            vol: { fixed: true, label: 'Master Gain' },
            tempo: { fixed: true, label: 'MIDI Clock BPM' },
            swing: { label: 'Swing' },
          },
        },
        paths: pathDefinitions,
        chains: chainDefinitions,
        routing: {
          mode: values.routingMode,
          active_channel_key: 'ch_a',
          blend_positions: { ch_a: 100, ch_b: 100 },
          morph_position: 0.5,
          morph_source_channel_key: 'ch_a',
          morph_target_channel_key: 'ch_b',
          series_order: ['ch_a', 'ch_b'],
        },
        midi_map: [],
      })
      return snapshotsApi.activate(created.snapshot_id)
    },
    onSuccess: async (response) => {
      queryClient.setQueryData(['snapshots', 'live'], response.snapshot_data)
      queryClient.setQueryData<ChainsResponse | undefined>(
        ['chains'],
        (current) => upsertRuntimeChains(current, response.snapshot_data.live_state?.runtime_chains ?? []),
      )
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      setContentView('library')
      onSnapshotSave?.()
      applySnapshotData(snapshotDetailToDraftData(response.snapshot_data), {
        toastMessage: 'Snapshot created',
        invalidateChains: false,
      })
      onRecall?.()
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to create snapshot', 'error')
    },
  })

  const loadFlowSnapshotMutation = useMutation({
    mutationFn: (snapshotId: number) => snapshotsApi.activate(snapshotId),
    onSuccess: (data) => {
      queryClient.setQueryData(['snapshots', 'live'], data.snapshot_data)
      queryClient.setQueryData<ChainsResponse | undefined>(
        ['chains'],
        (current) => upsertRuntimeChains(current, data.snapshot_data.live_state?.runtime_chains ?? []),
      )
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      applySnapshotData(snapshotDetailToDraftData(data.snapshot_data), { toastMessage: 'Snapshot recalled', invalidateChains: false })
      onRecall?.()
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to recall snapshot', 'error')
    },
  })

  const updateFlowSnapshotMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: { name?: string; description?: string; tags?: string[]; display_order?: number; is_favorite?: boolean; snapshot_data?: SnapshotDraftData } }) =>
      snapshotsApi.update(id, {
        name: updates.name,
        description: updates.description,
        tags: updates.tags,
        display_order: updates.display_order,
        is_favorite: updates.is_favorite,
        ...(updates.snapshot_data ? flowSnapshotDataToSnapshotPayload(updates.snapshot_data) : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update snapshot', 'error')
    },
  })

  const refreshActiveSnapshotMutation = useMutation({
    mutationFn: ({ id, snapshotData }: { id: number; snapshotData: SnapshotDraftData }) =>
      snapshotsApi.update(id, flowSnapshotDataToSnapshotPayload(snapshotData)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      pushToast('Snapshot updated', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update snapshot', 'error')
    },
  })

  const deleteFlowSnapshotMutation = useMutation({
    mutationFn: (snapshotId: number) => snapshotsApi.delete(snapshotId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      pushToast('Snapshot deleted', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to delete snapshot', 'error')
    },
  })

  const duplicateFlowSnapshotMutation = useMutation({
    mutationFn: (snapshotId: number) => snapshotsApi.duplicate(snapshotId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      pushToast('Snapshot duplicated', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to duplicate snapshot', 'error')
    },
  })

  const setFlowSnapshotProgramMutation = useMutation({
    mutationFn: ({ id, programNumber }: { id: number; programNumber: number | null }) =>
      snapshotsApi.setProgram(id, programNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      pushToast('Snapshot MIDI program updated', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update snapshot MIDI program', 'error')
    },
  })

  const reorderFlowSnapshotsMutation = useMutation({
    mutationFn: (snapshotIds: number[]) => snapshotsApi.reorder(snapshotIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to reorder snapshots', 'error')
    },
  })

  const openSnapshotCreateWizard = useCallback(() => {
    setContentView('wizard')
  }, [])

  const openSnapshotRenameModal = useCallback((snapshot: SnapshotSummary) => {
    setSnapshotPendingRename(snapshot)
    setSnapshotRenameValue(snapshot.name)
  }, [])

  const submitSnapshotRename = useCallback(() => {
    if (!snapshotPendingRename) {
      return
    }
    const name = snapshotRenameValue.trim()
    if (!name) {
      return
    }
    updateFlowSnapshotMutation.mutate({
      id: snapshotPendingRename.id,
      updates: { name },
    })
    setSnapshotPendingRename(null)
    setSnapshotRenameValue('')
  }, [snapshotPendingRename, snapshotRenameValue, updateFlowSnapshotMutation])

  const submitSnapshotDelete = useCallback(() => {
    if (!snapshotPendingDelete) {
      return
    }
    if (snapshotPendingDelete.id === activeSnapshotId || snapshotPendingDelete.is_active) {
      pushToast('Cannot delete a live snapshot.', 'error')
      setSnapshotPendingDelete(null)
      return
    }
    deleteFlowSnapshotMutation.mutate(snapshotPendingDelete.id)
    setSnapshotPendingDelete(null)
  }, [activeSnapshotId, deleteFlowSnapshotMutation, pushToast, snapshotPendingDelete])

  const openSnapshotProgramModal = useCallback((snapshot: SnapshotSummary) => {
    setSnapshotPendingProgram(snapshot)
    setSnapshotProgramValue(snapshot.program_number?.toString() || '')
  }, [])

  const closeSnapshotProgramModal = useCallback(() => {
    setSnapshotPendingProgram(null)
    setSnapshotProgramValue('')
  }, [])

  const submitSnapshotProgram = useCallback(() => {
    if (!snapshotPendingProgram) {
      return
    }
    const trimmed = snapshotProgramValue.trim()
    const programNumber = trimmed === '' ? null : Number.parseInt(trimmed, 10)
    if (programNumber !== null && (Number.isNaN(programNumber) || programNumber < 0 || programNumber > 127)) {
      pushToast('MIDI Program Change must be between 0 and 127', 'error')
      return
    }
    setFlowSnapshotProgramMutation.mutate({
      id: snapshotPendingProgram.id,
      programNumber,
    })
    closeSnapshotProgramModal()
  }, [closeSnapshotProgramModal, snapshotPendingProgram, setFlowSnapshotProgramMutation, snapshotProgramValue, pushToast])

  const clearSnapshotProgram = useCallback((snapshot: SnapshotSummary) => {
    setFlowSnapshotProgramMutation.mutate({ id: snapshot.id, programNumber: null })
  }, [setFlowSnapshotProgramMutation])

  const persistSnapshotSetlistOrder = useCallback(async (nextOrder: number[]) => {
    setSnapshotSetlistPending(true)
    try {
      await updateSpecialSettings({ snapshotSetlistOrder: nextOrder })
    } finally {
      setSnapshotSetlistPending(false)
    }
  }, [updateSpecialSettings])

  const handleSnapshotFavoriteToggle = useCallback(async (snapshot: SnapshotSummary) => {
    try {
      await updateFlowSnapshotMutation.mutateAsync({
        id: snapshot.id,
        updates: { is_favorite: !snapshot.is_favorite },
      })
    } catch {
      return
    }

    try {
      if (snapshot.is_favorite) {
        await persistSnapshotSetlistOrder(favoriteSetlistOrder.filter((snapshotId) => snapshotId !== snapshot.id))
        return
      }

      await persistSnapshotSetlistOrder([...favoriteSetlistOrder, snapshot.id])
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Failed to update gig setlist order', 'error')
    }
  }, [favoriteSetlistOrder, persistSnapshotSetlistOrder, pushToast, updateFlowSnapshotMutation])

  const handleSnapshotSetlistMove = useCallback(async (snapshotId: number, direction: 'earlier' | 'later') => {
    const nextOrder = moveSnapshotInSetlist(favoriteSetlistOrder, snapshotId, direction)
    if (!nextOrder) {
      return
    }

    try {
      await persistSnapshotSetlistOrder(nextOrder)
      pushToast('Gig setlist order updated', 'success')
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Failed to update gig setlist order', 'error')
    }
  }, [favoriteSetlistOrder, persistSnapshotSetlistOrder, pushToast])

  const handleSnapshotDuplicate = useCallback((snapshot: SnapshotSummary) => {
    duplicateFlowSnapshotMutation.mutate(snapshot.id)
  }, [duplicateFlowSnapshotMutation])

  const handleActiveSnapshotRefresh = useCallback(() => {
    if (!activeSnapshot) {
      return
    }
    refreshActiveSnapshotMutation.mutate({
      id: activeSnapshot.id,
      snapshotData: snapshotDraft,
    })
  }, [activeSnapshot, refreshActiveSnapshotMutation, snapshotDraft])

  const fetchSnapshotDetail = useCallback((snapshotId: number) => (
    queryClient.fetchQuery({
      queryKey: ['snapshots', 'detail', snapshotId],
      queryFn: async () => snapshotsApi.get(snapshotId),
    })
  ), [queryClient])

  const previewSnapshotData = useCallback(async (snapshotData: SnapshotDraftData) => {
    const result = await snapshotsApi.preview(snapshotData)
    const nextSnapshotData = snapshotDetailToDraftData(result.snapshot_data)
    applySnapshotData(nextSnapshotData, { toastMessage: null, invalidateChains: false })
    return nextSnapshotData
  }, [applySnapshotData])

  const toggleSnapshotCompare = useCallback((snapshot: SnapshotSummary) => {
    setSnapshotCompareTargetId((current) => current === snapshot.id ? null : snapshot.id)
  }, [])

  const startMomentaryPreview = useCallback(async (snapshot: SnapshotSummary) => {
    if (momentarySnapshotId !== null || snapshotMorphRunning) {
      return
    }

    try {
      const detail = await fetchSnapshotDetail(snapshot.id)
      momentaryRestoreStateRef.current = snapshotDraft
      setMomentarySnapshotId(snapshot.id)
      await previewSnapshotData(snapshotDetailToDraftData(detail))
    } catch (error) {
      momentaryRestoreStateRef.current = null
      setMomentarySnapshotId(null)
      pushToast(error instanceof Error ? error.message : 'Failed to preview snapshot', 'error')
    }
  }, [fetchSnapshotDetail, momentarySnapshotId, momentaryRestoreStateRef, previewSnapshotData, pushToast, snapshotDraft, snapshotMorphRunning])

  const endMomentaryPreview = useCallback(async () => {
    if (momentarySnapshotId === null) {
      return
    }
    const restoreState = momentaryRestoreStateRef.current
    momentaryRestoreStateRef.current = null
    setMomentarySnapshotId(null)
    if (!restoreState) {
      return
    }
    try {
      await previewSnapshotData(restoreState)
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Failed to restore the current snapshot preview', 'error')
    }
  }, [momentarySnapshotId, previewSnapshotData, pushToast])

  useEffect(() => {
    if (momentarySnapshotId === null) {
      return undefined
    }

    const releasePreview = () => {
      void endMomentaryPreview()
    }

    window.addEventListener('pointerup', releasePreview)
    window.addEventListener('keyup', releasePreview)
    window.addEventListener('blur', releasePreview)
    return () => {
      window.removeEventListener('pointerup', releasePreview)
      window.removeEventListener('keyup', releasePreview)
      window.removeEventListener('blur', releasePreview)
    }
  }, [endMomentaryPreview, momentarySnapshotId])

  const handleSnapshotMorphStart = useCallback(async () => {
    if (!snapshotMorphTarget || snapshotMorphRunning || !activeSnapshot) {
      return
    }
    if (activeSnapshotNeedsUpdate) {
      pushToast('Update the active snapshot before starting a morph.', 'error')
      return
    }

    try {
      const sourceDetail = activeSnapshotDetailQuery.data ?? await fetchSnapshotDetail(activeSnapshot.id)
      const targetDetail = await fetchSnapshotDetail(snapshotMorphTarget.id)
      const sourceDraft = snapshotDetailToDraftData(sourceDetail)
      const targetDraft = snapshotDetailToDraftData(targetDetail)
      const compatibility = checkSnapshotMorphCompatibility(sourceDraft, targetDraft)
      if (!compatibility.ok) {
        pushToast(compatibility.reason || 'Snapshots are not morph-compatible.', 'error')
        return
      }

      setSnapshotMorphRunning(true)
      const steps = Math.max(6, Math.min(20, Math.round(snapshotMorphDurationMs / 100)))
      for (let step = 1; step < steps; step += 1) {
        const frame = interpolateSnapshotData(
          sourceDraft,
          targetDraft,
          step / steps,
        )
        await previewSnapshotData(frame)
        await delay(snapshotMorphDurationMs / steps)
      }

      await loadFlowSnapshotMutation.mutateAsync(snapshotMorphTarget.id)
      setSnapshotMorphTarget(null)
      setSnapshotComparisonId(snapshotMorphTarget.id)
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Failed to morph between snapshots', 'error')
    } finally {
      setSnapshotMorphRunning(false)
    }
  }, [
    activeSnapshot,
    activeSnapshotNeedsUpdate,
    activeSnapshotDetailQuery.data,
    snapshotDraft,
    setSnapshotMorphRunning,
    fetchSnapshotDetail,
    loadFlowSnapshotMutation,
    previewSnapshotData,
    pushToast,
    snapshotMorphDurationMs,
    snapshotMorphRunning,
    snapshotMorphTarget,
  ])

const handleSnapshotCardKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>, snapshot: SnapshotSummary) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      loadFlowSnapshotMutation.mutate(snapshot.id)
    }
  }, [loadFlowSnapshotMutation])

  const handleSnapshotDragStart = useCallback((event: React.DragEvent<HTMLElement>, snapshotId: number) => {
    setDraggedSnapshotId(snapshotId)
    event.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleSnapshotDragOver = useCallback((event: React.DragEvent<HTMLElement>, snapshotId: number) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (draggedSnapshotId !== snapshotId) {
      setDragOverSnapshotId(snapshotId)
    }
  }, [draggedSnapshotId])

  const handleSnapshotDragEnd = useCallback(() => {
    setDraggedSnapshotId(null)
    setDragOverSnapshotId(null)
  }, [])

  const handleSnapshotDrop = useCallback((event: React.DragEvent<HTMLElement>, targetSnapshotId: number) => {
    event.preventDefault()
    if (draggedSnapshotId === null || draggedSnapshotId === targetSnapshotId) {
      handleSnapshotDragEnd()
      return
    }

    const nextOrder = [...savedSnapshots]
    const draggedIndex = nextOrder.findIndex((snapshot) => snapshot.id === draggedSnapshotId)
    const targetIndex = nextOrder.findIndex((snapshot) => snapshot.id === targetSnapshotId)

    if (draggedIndex === -1 || targetIndex === -1) {
      handleSnapshotDragEnd()
      return
    }

    const [movedSnapshot] = nextOrder.splice(draggedIndex, 1)
    nextOrder.splice(targetIndex, 0, movedSnapshot)
    reorderFlowSnapshotsMutation.mutate(nextOrder.map((snapshot) => snapshot.id))
    handleSnapshotDragEnd()
  }, [draggedSnapshotId, savedSnapshots, handleSnapshotDragEnd, reorderFlowSnapshotsMutation])

  const [showImportDialog, setShowImportDialog] = useState(false)
  const [snapshotSetlistPending, setSnapshotSetlistPending] = useState(false)
  const isLoading = snapshotsQuery.isLoading
  const activeSnapshotDisplayName = activeSnapshot?.name || 'Live Workspace'
  const activeSnapshotDisplayNumber = activeSnapshot ? String(activeSnapshot.id).padStart(2, '0') : 'LIVE'
  const snapshotComparisonSnapshot = useMemo(() => {
    if (compareSummaryId === null) {
      return null
    }
    return savedSnapshots.find((snapshot) => snapshot.id === compareSummaryId) ?? null
  }, [compareSummaryId, savedSnapshots])

  useEffect(() => {
    setContentView(entryPoint ? 'entry' : 'library')
  }, [entryPoint])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (contentView === 'wizard') setContentView(entryPoint ? 'entry' : 'library')
        else if (snapshotPendingRename) setSnapshotPendingRename(null)
        else if (snapshotPendingProgram) closeSnapshotProgramModal()
        else if (snapshotPendingDelete) setSnapshotPendingDelete(null)
        else if (snapshotMorphTarget && !snapshotMorphRunning) setSnapshotMorphTarget(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeSnapshotProgramModal, contentView, entryPoint, snapshotPendingRename, snapshotPendingProgram, snapshotPendingDelete, snapshotMorphTarget, snapshotMorphRunning])

  const activeSnapshotDescription = activeSnapshot?.description?.trim()
    || (activeSnapshot
      ? 'Recallable snapshot for the current signal-path workspace.'
      : 'Capture the current routing, paths, and active blocks into the snapshot library.')

  if (contentView === 'entry') {
    return (
      <div className="juce-grid-page__snapshot-panel">
        <div className="juce-grid-page__snapshot-header">
          <div className="juce-grid-page__snapshot-copy">
            <strong>Choose a starting point</strong>
            <span>{savedSnapshots.length} saved snapshots available</span>
          </div>
        </div>

        <div className="juce-grid-page__snapshot-content">
          <Tile className="juce-grid-page__effect-modal-placeholder">
            <div className="juce-grid-page__parameter-editor-copy">
              <p className="juce-grid-page__dense-card-kicker">Snapshot entry point</p>
              <h3 className="juce-grid-page__selected-block-placeholder-heading">No snapshot loaded</h3>
              <p>Load an existing snapshot from the library or create a new one with the guided wizard.</p>
            </div>
            <div className="juce-grid-page__snapshot-command-row">
              <Button size="sm" kind="secondary" onClick={() => setContentView('library')}>
                Load Existing
              </Button>
              <Button size="sm" kind="primary" onClick={openSnapshotCreateWizard}>
                Create New
              </Button>
            </div>
          </Tile>
        </div>
      </div>
    )
  }

  if (contentView === 'wizard') {
    return (
      <SnapshotNewWizard
        existingSnapshotNames={savedSnapshots.map((snapshot) => snapshot.name)}
        initialName={buildDefaultSnapshotName(savedSnapshots.length + 1)}
        isSubmitting={createFlowSnapshotMutation.isPending}
        onCancel={() => setContentView(entryPoint ? 'entry' : 'library')}
        onSubmit={async (values) => {
          await createFlowSnapshotMutation.mutateAsync(values)
        }}
      />
    )
  }

  return (
    <>
      <Tabs
        selectedIndex={safeTab === 'library' ? 0 : 0}
        onChange={({ selectedIndex }) => {
          handleTabChange(selectedIndex === 0 ? 'library' : 'library')
        }}
      >
        <TabList aria-label="Audio Grid snapshots">
          <Tab>Library</Tab>
        </TabList>
      </Tabs>
      <div className="juce-grid-page__snapshot-panel">
        <div className="juce-grid-page__snapshot-header">
          <div className="juce-grid-page__snapshot-copy">
            <strong>Snapshots</strong>
            <span>
              {snapshotTagFilter === 'all'
                ? `${savedSnapshots.length} saved snapshots`
                : `${savedSnapshots.length} snapshots tagged ${snapshotTagFilter}`}
            </span>
          </div>
          <div className="juce-grid-page__compact-actions">
            <Button size="sm" kind="primary" onClick={openSnapshotCreateWizard}>
              Create New
            </Button>
            <Button size="sm" kind="ghost" onClick={() => setShowImportDialog(true)}>
              Import snapshot
            </Button>
          </div>
        </div>

        <div className="juce-grid-page__snapshot-content">
          {availableSnapshotTags.length > 0 && (
            <div className="juce-grid-page__snapshot-filter-row">
              <span className="juce-grid-page__snapshot-action-label">Filter by tag</span>
              <div className="juce-grid-page__snapshot-filter-actions" role="toolbar" aria-label="Filter snapshots by tag">
                <Button
                  size="sm"
                  kind={snapshotTagFilter === 'all' ? 'secondary' : 'ghost'}
                  onClick={() => setSnapshotTagFilter('all')}
                >
                  All tags
                </Button>
                {availableSnapshotTags.map((tag) => (
                  <Button
                    key={tag}
                    size="sm"
                    kind={snapshotTagFilter === tag ? 'secondary' : 'ghost'}
                    onClick={() => setSnapshotTagFilter(tag)}
                  >
                    {tag}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="juce-grid-page__snapshot-active-display">
            <div className="juce-grid-page__snapshot-active-header">
              <span className="juce-grid-page__snapshot-action-label">
                {activeSnapshot ? 'Active snapshot' : 'Live workspace'}
              </span>
              <div className="juce-grid-page__compact-tags">
                {activeSnapshot && <Tag type="blue">Active</Tag>}
                {activeSnapshot && activeSnapshotNeedsUpdate && <Tag type="warm-gray">Needs update</Tag>}
                {activeSnapshot && !activeSnapshotNeedsUpdate && <Tag type="green">Current</Tag>}
                {activeSnapshot?.is_favorite && <Tag type="cool-gray">Favorite</Tag>}
                {activeSnapshot?.program_number !== null && activeSnapshot?.program_number !== undefined && (
                  <Tag type="purple">PC {activeSnapshot.program_number}</Tag>
                )}
              </div>
            </div>

            <div className="juce-grid-page__snapshot-active-line">
              <span className="juce-grid-page__snapshot-active-number">{activeSnapshotDisplayNumber}</span>
              <span className="juce-grid-page__snapshot-active-name">{activeSnapshotDisplayName}</span>
            </div>

            <p className="juce-grid-page__snapshot-active-description">{activeSnapshotDescription}</p>

            {activeSnapshot && activeSnapshot.tags.length > 0 && (
              <div className="juce-grid-page__compact-tags">
                {activeSnapshot.tags.map((tag) => (
                  <Tag key={`active-tag-${tag}`} type="green">{tag}</Tag>
                ))}
              </div>
            )}

            <div className="juce-grid-page__compact-tags">
              {activeSnapshot ? (
                <Tag type="warm-gray">
                  Updated {new Date(activeSnapshot.updated_at).toLocaleString()}
                </Tag>
              ) : (
                <Tag type="warm-gray">{savedSnapshots.length} saved snapshots available</Tag>
              )}
              {activeSnapshot && activeSnapshotDetailQuery.isLoading && (
                <Tag type="blue">Inspecting active snapshot</Tag>
              )}
            </div>

            <div className="juce-grid-page__snapshot-command-row">
              {activeSnapshot && (
                <Button
                  size="sm"
                  kind={activeSnapshotNeedsUpdate ? 'primary' : 'secondary'}
                  renderIcon={Renew}
                  onClick={handleActiveSnapshotRefresh}
                  disabled={!activeSnapshotNeedsUpdate || refreshActiveSnapshotMutation.isPending || activeSnapshotDetailQuery.isLoading}
                >
                  {refreshActiveSnapshotMutation.isPending ? 'Updating...' : 'Update snapshot'}
                </Button>
              )}
              <Button
                size="sm"
                kind={activeSnapshot ? 'secondary' : 'primary'}
                renderIcon={Add}
                onClick={openSnapshotCreateWizard}
              >
                Create New
              </Button>
              {activeSnapshot && (
                <Button size="sm" kind="ghost" onClick={() => openSnapshotRenameModal(activeSnapshot)}>
                  Rename
                </Button>
              )}
              {activeSnapshot && (
                <Button size="sm" kind="ghost" onClick={() => openSnapshotProgramModal(activeSnapshot)}>
                  {activeSnapshot.program_number === null ? 'Set MIDI PC' : 'Edit MIDI PC'}
                </Button>
              )}
            </div>
          </div>

          {snapshotComparisonSnapshot && snapshotComparisonSummary && (
            <div className="juce-grid-page__snapshot-compare-display">
              <div className="juce-grid-page__snapshot-active-header">
                <span className="juce-grid-page__snapshot-action-label">Snapshot compare</span>
                <div className="juce-grid-page__snapshot-command-row">
                  <Button
                    size="sm"
                    kind="secondary"
                    onClick={() => setSnapshotMorphTarget(snapshotComparisonSnapshot)}
                    disabled={!activeSnapshot || activeSnapshotNeedsUpdate}
                  >
                    Prepare morph
                  </Button>
                  <Button size="sm" kind="ghost" onClick={() => setSnapshotCompareTargetId(null)}>
                    Clear compare
                  </Button>
                </div>
              </div>

              <div className="juce-grid-page__snapshot-compare-line">
                <strong>{activeSnapshot?.name || 'Live Workspace'}</strong>
                <span>vs</span>
                <strong>{snapshotComparisonSnapshot.name}</strong>
              </div>

              <div className="juce-grid-page__compact-tags">
                <Tag type="cool-gray">{snapshotComparisonSummary.pathChanges} path changes</Tag>
                <Tag type="cool-gray">{snapshotComparisonSummary.chainChanges} chain changes</Tag>
                <Tag type="cool-gray">{snapshotComparisonSummary.paramChanges} param changes</Tag>
                {snapshotComparisonSummary.routingChanged && <Tag type="purple">Routing changed</Tag>}
                {snapshotComparisonSummary.activePathChanged && <Tag type="blue">Active path changed</Tag>}
              </div>

              {activeSnapshot && activeSnapshotNeedsUpdate && (
                <p className="juce-grid-page__snapshot-compare-copy">
                  Compare is using the saved active snapshot. Update it first if you want the current live edits included.
                </p>
              )}
            </div>
          )}

          {isLoading ? (
            <InlineLoading description="Loading snapshots" status="active" />
          ) : savedSnapshots.length === 0 ? (
            <div className="juce-grid-page__empty-state">
              <p>No snapshots saved yet</p>
              <p className="juce-grid-page__empty-state-copy">
                Capture the current signal-path state to build a reusable snapshot library.
              </p>
            </div>
          ) : (
            <>
              <section className="juce-grid-page__snapshot-group">
                <div className="juce-grid-page__snapshot-group-header">
                  <div className="juce-grid-page__snapshot-group-title">
                    <strong>Favorites</strong>
                    <span>{favoriteSnapshots.length}</span>
                  </div>
                </div>

                {favoriteSnapshots.length === 0 ? (
                  <div className="juce-grid-page__snapshot-group-empty">
                    <p className="juce-grid-page__empty-state-copy">
                      Star any saved snapshot and it will show up here automatically.
                    </p>
                  </div>
                ) : (
                  <div className="juce-grid-page__snapshot-list">
                    {favoriteSnapshots.map((snapshot, index) => {
                      const isActiveSnapshot = snapshot.id === activeSnapshotId || snapshot.is_active

                      return (
                        <Tile
                          key={snapshot.id}
                          className={`juce-grid-page__snapshot-tile ${isActiveSnapshot ? 'is-active' : ''} ${draggedSnapshotId === snapshot.id ? 'is-dragging' : ''} ${dragOverSnapshotId === snapshot.id ? 'is-drag-over' : ''}`}
                          data-stripe-tone={index % 2 === 0 ? 'base' : 'alt'}
                          role="button"
                          tabIndex={0}
                          draggable
                          onClick={() => loadFlowSnapshotMutation.mutate(snapshot.id)}
                          onKeyDown={(event) => handleSnapshotCardKeyDown(event, snapshot)}
                          onDragStart={(event) => handleSnapshotDragStart(event, snapshot.id)}
                          onDragOver={(event) => handleSnapshotDragOver(event, snapshot.id)}
                          onDragEnd={handleSnapshotDragEnd}
                          onDrop={(event) => handleSnapshotDrop(event, snapshot.id)}
                        >
                          <div className="juce-grid-page__snapshot-main">
                            <div className="juce-grid-page__snapshot-top">
                              <div className="juce-grid-page__snapshot-name-row">
                                <Draggable size={14} aria-hidden />
                                <strong>{snapshot.name}</strong>
                              </div>
                              <div className="juce-grid-page__compact-tags">
                                {isActiveSnapshot && <Tag type="blue">Active</Tag>}
                                {isActiveSnapshot && activeSnapshotNeedsUpdate && <Tag type="warm-gray">Needs update</Tag>}
                                <Tag type="cool-gray">Favorite</Tag>
                                <Tag type="green">Set {index + 1}</Tag>
                                {snapshot.program_number !== null && <Tag type="purple">PC {snapshot.program_number}</Tag>}
                              </div>
                            </div>

                            <p className="juce-grid-page__snapshot-description">
                              {snapshot.description || 'A pinned recall for the sounds you return to most often.'}
                            </p>

                            <div className="juce-grid-page__snapshot-slot-row">
                              {getSnapshotPathSummaries(snapshot).map((slot) => (
                                <span
                                  key={`${snapshot.id}-${slot.id}`}
                                  className="juce-grid-page__snapshot-slot"
                                  style={{ '--snapshot-slot-color': slot.color } as React.CSSProperties}
                                >
                                  {slot.label}
                                </span>
                              ))}
                            </div>

                            {snapshot.tags.length > 0 && (
                              <div className="juce-grid-page__compact-tags">
                                {snapshot.tags.map((tag) => (
                                  <Tag key={`${snapshot.id}-tag-${tag}`} type="green">{tag}</Tag>
                                ))}
                              </div>
                            )}

                            <div className="juce-grid-page__compact-tags">
                              <Tag type="warm-gray">
                                Updated {new Date(snapshot.updated_at).toLocaleDateString()}
                              </Tag>
                            </div>
                          </div>

                          <div className="juce-grid-page__snapshot-actions" onClick={(event) => event.stopPropagation()}>
                            <div className="juce-grid-page__snapshot-setlist-actions" role="group" aria-label={`Gig order controls for ${snapshot.name}`}>
                              <Button
                                hasIconOnly
                                size="sm"
                                kind="ghost"
                                renderIcon={ChevronUp}
                                iconDescription={`Move ${snapshot.name} earlier in the gig setlist`}
                                aria-label={`Move ${snapshot.name} earlier in the gig setlist`}
                                onClick={() => { void handleSnapshotSetlistMove(snapshot.id, 'earlier') }}
                                disabled={snapshotSetlistPending || index === 0}
                              />
                              <Button
                                hasIconOnly
                                size="sm"
                                kind="ghost"
                                renderIcon={ChevronDown}
                                iconDescription={`Move ${snapshot.name} later in the gig setlist`}
                                aria-label={`Move ${snapshot.name} later in the gig setlist`}
                                onClick={() => { void handleSnapshotSetlistMove(snapshot.id, 'later') }}
                                disabled={snapshotSetlistPending || index === favoriteSnapshots.length - 1}
                              />
                            </div>
                            <Button
                              size="sm"
                              kind="primary"
                              onClick={() => loadFlowSnapshotMutation.mutate(snapshot.id)}
                              disabled={loadFlowSnapshotMutation.isPending}
                            >
                              Recall
                            </Button>
                            {snapshot.id !== activeSnapshotId && (
                              <Button
                                size="sm"
                                kind={momentarySnapshotId === snapshot.id ? 'secondary' : 'ghost'}
                                onPointerDown={(event) => {
                                  event.preventDefault()
                                  void startMomentaryPreview(snapshot)
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    void startMomentaryPreview(snapshot)
                                  }
                                }}
                                disabled={(momentarySnapshotId !== null && momentarySnapshotId !== snapshot.id) || snapshotMorphRunning}
                              >
                                {momentarySnapshotId === snapshot.id ? 'Previewing...' : 'Hold to preview'}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              kind="secondary"
                              onClick={() => { void handleSnapshotFavoriteToggle(snapshot) }}
                            >
                              Favorited
                            </Button>
                            <OverflowMenu
                              ariaLabel={`Actions for ${snapshot.name}`}
                              iconDescription={`Actions for ${snapshot.name}`}
                              size="sm"
                              flipped
                            >
                              <OverflowMenuItem itemText="Rename" onClick={() => openSnapshotRenameModal(snapshot)} />
                              <OverflowMenuItem itemText="Duplicate" onClick={() => handleSnapshotDuplicate(snapshot)} />
                              {snapshot.id !== activeSnapshotId && (
                                <OverflowMenuItem
                                  itemText={snapshotCompareTarget === snapshot.id ? 'Stop comparing' : activeSnapshot ? 'Compare with active snapshot' : 'Compare with live workspace'}
                                  onClick={() => toggleSnapshotCompare(snapshot)}
                                />
                              )}
                              {snapshot.id !== activeSnapshotId && (
                                <OverflowMenuItem
                                  itemText="Prepare morph"
                                  disabled={!activeSnapshot || activeSnapshotNeedsUpdate}
                                  onClick={() => {
                                    setSnapshotCompareTargetId(snapshot.id)
                                    setSnapshotMorphTarget(snapshot)
                                  }}
                                />
                              )}
                              <OverflowMenuItem
                                itemText={snapshot.program_number === null ? 'Set MIDI PC' : 'Edit MIDI PC'}
                                onClick={() => openSnapshotProgramModal(snapshot)}
                              />
                              {snapshot.program_number !== null && (
                                <OverflowMenuItem itemText="Clear MIDI PC" onClick={() => clearSnapshotProgram(snapshot)} />
                              )}
                              <OverflowMenuItem
                                itemText="Delete"
                                isDelete
                                disabled={isActiveSnapshot}
                                title={isActiveSnapshot ? 'Cannot delete a live snapshot.' : undefined}
                                onClick={() => setSnapshotPendingDelete(snapshot)}
                              />
                            </OverflowMenu>
                          </div>
                        </Tile>
                      )
                    })}
                  </div>
                )}
              </section>

              <section className="juce-grid-page__snapshot-group">
                <div className="juce-grid-page__snapshot-group-header">
                  <button
                    type="button"
                    className="juce-grid-page__snapshot-group-toggle"
                    onClick={() => setSnapshotLibraryExpanded((previous) => !previous)}
                    aria-expanded={snapshotLibraryExpanded}
                  >
                    <ChevronRight size={16} className={`juce-grid-page__snapshot-group-chevron ${snapshotLibraryExpanded ? 'is-open' : ''}`} />
                    <strong>Snapshot Library</strong>
                    <span>{librarySnapshots.length}</span>
                  </button>
                </div>

                {snapshotLibraryExpanded && (
                  librarySnapshots.length === 0 ? (
                    <div className="juce-grid-page__snapshot-group-empty">
                      <p className="juce-grid-page__empty-state-copy">
                        Everything saved right now is favorited. Unfavorite a snapshot to park it in the wider library.
                      </p>
                    </div>
                  ) : (
                    <div className="juce-grid-page__snapshot-list">
                      {librarySnapshots.map((snapshot, index) => {
                        const isActiveSnapshot = snapshot.id === activeSnapshotId || snapshot.is_active

                        return (
                          <Tile
                            key={snapshot.id}
                            className={`juce-grid-page__snapshot-tile ${isActiveSnapshot ? 'is-active' : ''} ${draggedSnapshotId === snapshot.id ? 'is-dragging' : ''} ${dragOverSnapshotId === snapshot.id ? 'is-drag-over' : ''}`}
                            data-stripe-tone={index % 2 === 0 ? 'base' : 'alt'}
                            role="button"
                            tabIndex={0}
                            draggable
                            onClick={() => loadFlowSnapshotMutation.mutate(snapshot.id)}
                            onKeyDown={(event) => handleSnapshotCardKeyDown(event, snapshot)}
                            onDragStart={(event) => handleSnapshotDragStart(event, snapshot.id)}
                            onDragOver={(event) => handleSnapshotDragOver(event, snapshot.id)}
                            onDragEnd={handleSnapshotDragEnd}
                            onDrop={(event) => handleSnapshotDrop(event, snapshot.id)}
                          >
                            <div className="juce-grid-page__snapshot-main">
                              <div className="juce-grid-page__snapshot-top">
                                <div className="juce-grid-page__snapshot-name-row">
                                  <Draggable size={14} aria-hidden />
                                  <strong>{snapshot.name}</strong>
                                </div>
                                <div className="juce-grid-page__compact-tags">
                                  {isActiveSnapshot && <Tag type="blue">Active</Tag>}
                                  {isActiveSnapshot && activeSnapshotNeedsUpdate && <Tag type="warm-gray">Needs update</Tag>}
                                  {snapshot.program_number !== null && <Tag type="purple">PC {snapshot.program_number}</Tag>}
                                </div>
                              </div>

                              <p className="juce-grid-page__snapshot-description">
                                {snapshot.description || 'Recallable snapshot for the current signal-path workspace.'}
                              </p>

                              <div className="juce-grid-page__snapshot-slot-row">
                                {getSnapshotPathSummaries(snapshot).map((slot) => (
                                  <span
                                    key={`${snapshot.id}-${slot.id}`}
                                    className="juce-grid-page__snapshot-slot"
                                    style={{ '--snapshot-slot-color': slot.color } as React.CSSProperties}
                                  >
                                    {slot.label}
                                  </span>
                                ))}
                              </div>

                              {snapshot.tags.length > 0 && (
                                <div className="juce-grid-page__compact-tags">
                                  {snapshot.tags.map((tag) => (
                                    <Tag key={`${snapshot.id}-tag-${tag}`} type="green">{tag}</Tag>
                                  ))}
                                </div>
                              )}

                              <div className="juce-grid-page__compact-tags">
                                <Tag type="warm-gray">
                                  Updated {new Date(snapshot.updated_at).toLocaleDateString()}
                                </Tag>
                              </div>
                            </div>

                            <div className="juce-grid-page__snapshot-actions" onClick={(event) => event.stopPropagation()}>
                              <Button
                                size="sm"
                                kind="primary"
                                onClick={() => loadFlowSnapshotMutation.mutate(snapshot.id)}
                                disabled={loadFlowSnapshotMutation.isPending}
                              >
                                Recall
                              </Button>
                              {snapshot.id !== activeSnapshotId && (
                                <Button
                                  size="sm"
                                  kind={momentarySnapshotId === snapshot.id ? 'secondary' : 'ghost'}
                                  onPointerDown={(event) => {
                                    event.preventDefault()
                                    void startMomentaryPreview(snapshot)
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault()
                                      void startMomentaryPreview(snapshot)
                                    }
                                  }}
                                  disabled={(momentarySnapshotId !== null && momentarySnapshotId !== snapshot.id) || snapshotMorphRunning}
                                >
                                  {momentarySnapshotId === snapshot.id ? 'Previewing...' : 'Hold to preview'}
                                </Button>
                              )}
                              <Button size="sm" kind="ghost" onClick={() => { void handleSnapshotFavoriteToggle(snapshot) }}>
                                Favorite
                              </Button>
                              <OverflowMenu
                                ariaLabel={`Actions for ${snapshot.name}`}
                                iconDescription={`Actions for ${snapshot.name}`}
                                size="sm"
                                flipped
                              >
                                <OverflowMenuItem itemText="Rename" onClick={() => openSnapshotRenameModal(snapshot)} />
                                <OverflowMenuItem itemText="Duplicate" onClick={() => handleSnapshotDuplicate(snapshot)} />
                                {snapshot.id !== activeSnapshotId && (
                                  <OverflowMenuItem
                                    itemText={snapshotCompareTarget === snapshot.id ? 'Stop comparing' : activeSnapshot ? 'Compare with active snapshot' : 'Compare with live workspace'}
                                    onClick={() => toggleSnapshotCompare(snapshot)}
                                  />
                                )}
                                {snapshot.id !== activeSnapshotId && (
                                  <OverflowMenuItem
                                    itemText="Prepare morph"
                                    disabled={!activeSnapshot || activeSnapshotNeedsUpdate}
                                    onClick={() => {
                                      setSnapshotCompareTargetId(snapshot.id)
                                      setSnapshotMorphTarget(snapshot)
                                    }}
                                  />
                                )}
                                <OverflowMenuItem
                                  itemText={snapshot.program_number === null ? 'Set MIDI PC' : 'Edit MIDI PC'}
                                  onClick={() => openSnapshotProgramModal(snapshot)}
                                />
                                {snapshot.program_number !== null && (
                                  <OverflowMenuItem itemText="Clear MIDI PC" onClick={() => clearSnapshotProgram(snapshot)} />
                                )}
                                <OverflowMenuItem
                                  itemText="Delete"
                                  isDelete
                                  disabled={isActiveSnapshot}
                                  title={isActiveSnapshot ? 'Cannot delete a live snapshot.' : undefined}
                                  onClick={() => setSnapshotPendingDelete(snapshot)}
                                />
                              </OverflowMenu>
                            </div>
                          </Tile>
                        )
                      })}
                    </div>
                  )
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {snapshotPendingRename && (
        <Modal
          open
          size="sm"
          modalHeading="Rename snapshot"
          modalLabel={snapshotPendingRename.name}
          primaryButtonText={updateFlowSnapshotMutation.isPending ? 'Saving...' : 'Save name'}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={snapshotRenameValue.trim().length === 0 || updateFlowSnapshotMutation.isPending}
          onRequestClose={() => {
            setSnapshotPendingRename(null)
            setSnapshotRenameValue('')
          }}
          onSecondarySubmit={() => {
            setSnapshotPendingRename(null)
            setSnapshotRenameValue('')
          }}
          onRequestSubmit={submitSnapshotRename}
          selectorPrimaryFocus="#juce-grid-snapshot-rename"
        >
          <div className="juce-grid-page__form-modal-body">
            <input
              id="juce-grid-snapshot-rename"
              aria-label="Snapshot name"
              value={snapshotRenameValue}
              onChange={(event) => setSnapshotRenameValue(event.target.value)}
            />
          </div>
        </Modal>
      )}

      {snapshotPendingProgram && (
        <Modal
          open
          size="sm"
          modalHeading="Snapshot MIDI Program Change"
          modalLabel={snapshotPendingProgram.name}
          primaryButtonText={setFlowSnapshotProgramMutation.isPending ? 'Saving...' : 'Save MIDI PC'}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={setFlowSnapshotProgramMutation.isPending}
          onRequestClose={closeSnapshotProgramModal}
          onSecondarySubmit={closeSnapshotProgramModal}
          onRequestSubmit={submitSnapshotProgram}
          selectorPrimaryFocus="#juce-grid-snapshot-program"
        >
          <div className="juce-grid-page__form-modal-body">
            <p className="juce-grid-page__modal-copy">
              Leave this field empty to clear the assigned Program Change number.
            </p>
            <NumberInput
              label="Program Change number"
              value={(() => {
                const trimmed = snapshotProgramValue.trim()
                if (trimmed === '') return null
                const parsed = Number.parseInt(trimmed, 10)
                return Number.isFinite(parsed) ? parsed : null
              })()}
              min={0}
              max={127}
              step={1}
              size="small"
              showBounds={false}
              showLabel={false}
              nullable
              onChange={(value) => setSnapshotProgramValue(String(Math.max(0, Math.min(127, Math.round(value)))))}
              onClear={() => setSnapshotProgramValue('')}
            />
          </div>
        </Modal>
      )}

      {snapshotPendingDelete && (
        <Modal
          open
          size="sm"
          modalHeading="Delete snapshot"
          modalLabel={snapshotPendingDelete.name}
          primaryButtonText={deleteFlowSnapshotMutation.isPending ? 'Deleting...' : 'Delete snapshot'}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={deleteFlowSnapshotMutation.isPending}
          onRequestClose={() => setSnapshotPendingDelete(null)}
          onSecondarySubmit={() => setSnapshotPendingDelete(null)}
          onRequestSubmit={submitSnapshotDelete}
          danger
        >
          <div className="juce-grid-page__form-modal-body">
            <p className="juce-grid-page__modal-copy">
              Delete <strong>{snapshotPendingDelete.name}</strong> from the snapshot library. This action cannot be undone.
            </p>
          </div>
        </Modal>
      )}

      {snapshotMorphTarget && (
        <Modal
          open
          size="sm"
          modalHeading="Morph snapshots"
          modalLabel={snapshotMorphTarget.name}
          primaryButtonText={snapshotMorphRunning ? 'Morphing...' : 'Start morph'}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={!activeSnapshot || activeSnapshotNeedsUpdate || snapshotMorphRunning}
          onRequestClose={() => {
            if (!snapshotMorphRunning) {
              setSnapshotMorphTarget(null)
            }
          }}
          onSecondarySubmit={() => {
            if (!snapshotMorphRunning) {
              setSnapshotMorphTarget(null)
            }
          }}
          onRequestSubmit={() => {
            void handleSnapshotMorphStart()
          }}
        >
          <div className="juce-grid-page__form-modal-body">
            <p className="juce-grid-page__modal-copy">
              Morph from <strong>{activeSnapshot?.name || 'the current source snapshot'}</strong> into <strong>{snapshotMorphTarget.name}</strong>. This uses the snapshot preview path and finishes by recalling the target snapshot.
            </p>
            {activeSnapshotNeedsUpdate && (
              <p className="juce-grid-page__snapshot-compare-copy">
                Update the active snapshot before starting a morph so the source state is deterministic.
              </p>
            )}
            <NumberInput
              label="Duration (ms)"
              value={snapshotMorphDurationMs}
              min={250}
              max={5000}
              step={50}
              unit="ms"
              profile="time-ms"
              showBounds={false}
              onChange={(nextValue) => setSnapshotMorphDurationMs(nextValue)}
            />
          </div>
        </Modal>
      )}

      <SnapshotImportDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImportSuccess={(presetId, name) => {
          queryClient.invalidateQueries({ queryKey: ['snapshots'] })
          queryClient.invalidateQueries({ queryKey: ['chains', 'presets'] })
          pushToast(`Imported "${name}" successfully`, 'success')
          void presetId
        }}
      />
    </>
  )
}
