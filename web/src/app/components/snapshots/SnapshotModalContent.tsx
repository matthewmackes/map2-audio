import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Add, ChevronRight, Draggable, Flow, Renew } from '@carbon/icons-react'
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
import { flowSnapshotsApi } from '../../../map2/api'
import type { ChainSnapshot, FlowSnapshot, FlowSnapshotDetail, FlowSnapshotData } from '../../../map2/types'
import {
  buildSnapshotComparisonSummary,
  checkSnapshotMorphCompatibility,
  fingerprintSnapshotData,
  interpolateSnapshotData,
} from '../SnapshotEditor/snapshotEditorComparison'
import { SnapshotImportDialog } from './SnapshotImportDialog'
import { SnapshotNewWizard, type SnapshotNewWizardValues } from './SnapshotNewWizard'
import { snapshotDetailToFlowSnapshotData, snapshotsApi } from '../../../map2/clients/snapshots'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function formatSnapshotWizardDate(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}${month}${day}`
}

export interface SnapshotModalContentProps {
  entryPoint?: boolean
  onRecall?: () => void
  onSnapshotSave?: () => void
  activeTab?: string
  onTabChange?: (activeTab: string) => void
  snapshotDraft: FlowSnapshotData
  applySnapshotData: (snapshotData: FlowSnapshotData, options?: { toastMessage?: string | null; invalidateChains?: boolean }) => void
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
  const safeTab = activeTab === 'library' ? activeTab : 'library'
  const handleTabChange = useCallback((nextTab: string) => {
    onTabChange?.(nextTab)
  }, [onTabChange])

  useEffect(() => {
    if (safeTab !== 'library') {
      handleTabChange('library')
    }
  }, [safeTab, handleTabChange])

  const flowSnapshotsQuery = useQuery<{
    snapshots: FlowSnapshot[]
    count: number
    active_id: number | null
  }>({
    queryKey: ['flow-snapshots'],
    queryFn: () => flowSnapshotsApi.list(),
    refetchInterval: 5000,
  })

  const activeSnapshotId = flowSnapshotsQuery.data?.active_id ?? null

  const activeSnapshotDetailQuery = useQuery<FlowSnapshotDetail>({
    queryKey: ['flow-snapshots', 'detail', activeSnapshotId],
    queryFn: () => flowSnapshotsApi.get(activeSnapshotId as number),
    enabled: activeSnapshotId !== null,
  })

  const [snapshotCompareTargetId, setSnapshotCompareTargetId] = useState<number | null>(null)
  const snapshotCompareDetailQuery = useQuery<FlowSnapshotDetail>({
    queryKey: ['flow-snapshots', 'compare-detail', snapshotCompareTargetId],
    queryFn: () => flowSnapshotsApi.get(snapshotCompareTargetId as number),
    enabled: snapshotCompareTargetId !== null,
  })

  const flowSnapshots = useMemo(() => {
    const raw = flowSnapshotsQuery.data?.snapshots || []
    return [...raw].sort((a, b) => {
      if (a.is_favorite && !b.is_favorite) return -1
      if (!a.is_favorite && b.is_favorite) return 1
      return a.display_order - b.display_order
    })
  }, [flowSnapshotsQuery.data?.snapshots])

  const activeSnapshot = useMemo(
    () => flowSnapshots.find((snapshot) => snapshot.id === activeSnapshotId || snapshot.is_active) ?? null,
    [activeSnapshotId, flowSnapshots],
  )
  const favoriteSnapshots = useMemo(
    () => flowSnapshots.filter((snapshot) => snapshot.is_favorite),
    [flowSnapshots],
  )
  const librarySnapshots = useMemo(
    () => flowSnapshots.filter((snapshot) => !snapshot.is_favorite),
    [flowSnapshots],
  )
  const activeSnapshotNeedsUpdate = useMemo(
    () => Boolean(
      activeSnapshot
      && activeSnapshotDetailQuery.data?.snapshot_data
      && fingerprintSnapshotData(activeSnapshotDetailQuery.data.snapshot_data) !== fingerprintSnapshotData(snapshotDraft),
    ),
    [activeSnapshot, activeSnapshotDetailQuery.data?.snapshot_data, snapshotDraft],
  )

  const currentSnapshotFingerprint = useMemo(
    () => fingerprintSnapshotData(snapshotDraft),
    [snapshotDraft],
  )
  const activeSnapshotFingerprint = useMemo(
    () => activeSnapshotDetailQuery.data?.snapshot_data
      ? fingerprintSnapshotData(activeSnapshotDetailQuery.data.snapshot_data)
      : null,
    [activeSnapshotDetailQuery.data?.snapshot_data],
  )
  const compareTargetSnapshot = useMemo(
    () => flowSnapshots.find((snapshot) => snapshot.id === snapshotCompareTargetId) ?? null,
    [flowSnapshots, snapshotCompareTargetId],
  )
  const snapshotComparisonSummary = useMemo(() => {
    if (!snapshotCompareDetailQuery.data?.snapshot_data) {
      return null
    }
    const baseData = activeSnapshotDetailQuery.data?.snapshot_data ?? snapshotDraft
    return buildSnapshotComparisonSummary(baseData, snapshotCompareDetailQuery.data.snapshot_data)
  }, [activeSnapshotDetailQuery.data?.snapshot_data, snapshotDraft, snapshotCompareDetailQuery.data?.snapshot_data])

  const [contentView, setContentView] = useState<'entry' | 'library' | 'wizard'>(entryPoint ? 'entry' : 'library')
  const [snapshotPendingRename, setSnapshotPendingRename] = useState<FlowSnapshot | null>(null)
  const [snapshotRenameValue, setSnapshotRenameValue] = useState('')
  const [snapshotPendingDelete, setSnapshotPendingDelete] = useState<FlowSnapshot | null>(null)
  const [snapshotPendingProgram, setSnapshotPendingProgram] = useState<FlowSnapshot | null>(null)
  const [snapshotProgramValue, setSnapshotProgramValue] = useState('')
  const [draggedSnapshotId, setDraggedSnapshotId] = useState<number | null>(null)
  const [dragOverSnapshotId, setDragOverSnapshotId] = useState<number | null>(null)
  const [snapshotLibraryExpanded, setSnapshotLibraryExpanded] = useState(false)
  const [momentarySnapshotId, setMomentarySnapshotId] = useState<number | null>(null)
  const [snapshotMorphTarget, setSnapshotMorphTarget] = useState<FlowSnapshot | null>(null)
  const [snapshotMorphDurationMs, setSnapshotMorphDurationMs] = useState(1200)
  const [snapshotMorphRunning, setSnapshotMorphRunning] = useState(false)
  const [snapshotCompareTarget, setSnapshotCompareTarget] = useState<number | null>(null)

  const [snapshotComparisonId, setSnapshotComparisonId] = useState<number | null>(null)
  const activeSnapshotDataForCompare = useMemo(() => {
    if (!snapshotComparisonId) {
      return null
    }
    return flowSnapshots.find((snapshot) => snapshot.id === snapshotComparisonId) ?? null
  }, [flowSnapshots, snapshotComparisonId])
  const compareSummaryId = useMemo(() => snapshotComparisonId ?? snapshotCompareTarget, [snapshotComparisonId, snapshotCompareTarget])

  const momentaryRestoreStateRef = useRef<FlowSnapshotData | null>(null)
  const createFlowSnapshotMutation = useMutation({
    mutationFn: async (values: SnapshotNewWizardValues) => {
      const channelDefinitions = [
        {
          channel_key: 'ch_a',
          label: 'A',
          color: '#2563eb',
          muted: false,
          solo: false,
          dry_wet_mix: 100,
          chain_id: null,
        },
        {
          channel_key: 'ch_b',
          label: 'B',
          color: '#22c55e',
          muted: false,
          solo: false,
          dry_wet_mix: 100,
          chain_id: null,
        },
      ]
      const chainName = `${values.name}-${formatSnapshotWizardDate(new Date())}`
      const created = await snapshotsApi.create({
        name: values.name,
        description: 'Created from Snapshot Editor wizard',
        input_device: values.inputDevice,
        output_device: values.outputDevice,
        channels: channelDefinitions,
        chains: [],
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

      const afterFirstChain = await snapshotsApi.addChain(created.snapshot_id, chainName)
      const firstChain = afterFirstChain.chains[afterFirstChain.chains.length - 1]
      const afterSecondChain = await snapshotsApi.addChain(created.snapshot_id, chainName)
      const secondChain = afterSecondChain.chains[afterSecondChain.chains.length - 1]
      const channelA = afterSecondChain.channels.find((channel) => channel.channel_key === 'ch_a')
      const channelB = afterSecondChain.channels.find((channel) => channel.channel_key === 'ch_b')

      if (!firstChain?.id || !secondChain?.id || !channelA?.id || !channelB?.id) {
        throw new Error('Snapshot wizard provisioning did not return the expected channels and chains.')
      }

      await snapshotsApi.updateChannel(created.snapshot_id, channelA.id, {
        chain_id: firstChain.id,
      })
      await snapshotsApi.updateChannel(created.snapshot_id, channelB.id, {
        chain_id: secondChain.id,
      })

      return snapshotsApi.activate(created.snapshot_id)
    },
    onSuccess: async (response) => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
      setContentView('library')
      onSnapshotSave?.()
      applySnapshotData(snapshotDetailToFlowSnapshotData(response.snapshot_data), {
        toastMessage: 'Snapshot created',
        invalidateChains: true,
      })
      onRecall?.()
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to create snapshot', 'error')
    },
  })

  const loadFlowSnapshotMutation = useMutation({
    mutationFn: (snapshotId: number) => flowSnapshotsApi.load(snapshotId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
      applySnapshotData(data.snapshot_data, { toastMessage: 'Snapshot recalled', invalidateChains: true })
      onRecall?.()
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to recall snapshot', 'error')
    },
  })

  const updateFlowSnapshotMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Parameters<typeof flowSnapshotsApi.update>[1] }) =>
      flowSnapshotsApi.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update snapshot', 'error')
    },
  })

  const refreshActiveSnapshotMutation = useMutation({
    mutationFn: ({ id, snapshotData }: { id: number; snapshotData: FlowSnapshotData }) =>
      flowSnapshotsApi.update(id, { snapshot_data: snapshotData }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
      pushToast('Snapshot updated', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update snapshot', 'error')
    },
  })

  const deleteFlowSnapshotMutation = useMutation({
    mutationFn: (snapshotId: number) => flowSnapshotsApi.delete(snapshotId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
      pushToast('Snapshot deleted', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to delete snapshot', 'error')
    },
  })

  const duplicateFlowSnapshotMutation = useMutation({
    mutationFn: (snapshotId: number) => flowSnapshotsApi.duplicate(snapshotId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
      pushToast('Snapshot duplicated', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to duplicate snapshot', 'error')
    },
  })

  const setFlowSnapshotProgramMutation = useMutation({
    mutationFn: ({ id, programNumber }: { id: number; programNumber: number | null }) =>
      flowSnapshotsApi.setProgram(id, programNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
      pushToast('Snapshot MIDI program updated', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update snapshot MIDI program', 'error')
    },
  })

  const reorderFlowSnapshotsMutation = useMutation({
    mutationFn: (snapshotIds: number[]) => flowSnapshotsApi.reorder(snapshotIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to reorder flow snapshots', 'error')
    },
  })

  const openSnapshotCreateWizard = useCallback(() => {
    setContentView('wizard')
  }, [])

  const openSnapshotRenameModal = useCallback((snapshot: FlowSnapshot) => {
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
    deleteFlowSnapshotMutation.mutate(snapshotPendingDelete.id)
    setSnapshotPendingDelete(null)
  }, [deleteFlowSnapshotMutation, snapshotPendingDelete])

  const openSnapshotProgramModal = useCallback((snapshot: FlowSnapshot) => {
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

  const clearSnapshotProgram = useCallback((snapshot: FlowSnapshot) => {
    setFlowSnapshotProgramMutation.mutate({ id: snapshot.id, programNumber: null })
  }, [setFlowSnapshotProgramMutation])

  const handleSnapshotFavoriteToggle = useCallback((snapshot: FlowSnapshot) => {
    updateFlowSnapshotMutation.mutate({
      id: snapshot.id,
      updates: { is_favorite: !snapshot.is_favorite },
    })
  }, [updateFlowSnapshotMutation])

  const handleSnapshotDuplicate = useCallback((snapshot: FlowSnapshot) => {
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
      queryKey: ['flow-snapshots', 'detail', snapshotId],
      queryFn: () => flowSnapshotsApi.get(snapshotId),
    })
  ), [queryClient])

  const previewSnapshotData = useCallback(async (snapshotData: FlowSnapshotData) => {
    const result = await flowSnapshotsApi.preview({ snapshot_data: snapshotData })
    applySnapshotData(result.snapshot_data, { toastMessage: null, invalidateChains: false })
    return result.snapshot_data
  }, [applySnapshotData])

  const toggleSnapshotCompare = useCallback((snapshot: FlowSnapshot) => {
    setSnapshotCompareTargetId((current) => current === snapshot.id ? null : snapshot.id)
  }, [])

  const startMomentaryPreview = useCallback(async (snapshot: FlowSnapshot) => {
    if (momentarySnapshotId !== null || snapshotMorphRunning) {
      return
    }

    try {
      const detail = await fetchSnapshotDetail(snapshot.id)
      momentaryRestoreStateRef.current = snapshotDraft
      setMomentarySnapshotId(snapshot.id)
      await previewSnapshotData(detail.snapshot_data)
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
      const compatibility = checkSnapshotMorphCompatibility(sourceDetail.snapshot_data, targetDetail.snapshot_data)
      if (!compatibility.ok) {
        pushToast(compatibility.reason || 'Snapshots are not morph-compatible.', 'error')
        return
      }

      setSnapshotMorphRunning(true)
      const steps = Math.max(6, Math.min(20, Math.round(snapshotMorphDurationMs / 100)))
      for (let step = 1; step < steps; step += 1) {
        const frame = interpolateSnapshotData(
          sourceDetail.snapshot_data,
          targetDetail.snapshot_data,
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

const handleSnapshotCardKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>, snapshot: FlowSnapshot) => {
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

    const nextOrder = [...flowSnapshots]
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
  }, [draggedSnapshotId, flowSnapshots, handleSnapshotDragEnd, reorderFlowSnapshotsMutation])

  const [showImportDialog, setShowImportDialog] = useState(false)
  const isLoading = flowSnapshotsQuery.isLoading
  const activeSnapshotDisplayName = activeSnapshot?.name || 'Live Workspace'
  const activeSnapshotDisplayNumber = activeSnapshot ? String(activeSnapshot.id).padStart(2, '0') : 'LIVE'
  const snapshotComparisonSnapshot = useMemo(() => {
    if (compareSummaryId === null) {
      return null
    }
    return flowSnapshots.find((snapshot) => snapshot.id === compareSummaryId) ?? null
  }, [compareSummaryId, flowSnapshots])

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
      ? 'Recallable snapshot for the current multi-flow rig.'
      : 'Capture the current routing, chains, and active blocks into the snapshot library.')

  if (contentView === 'entry') {
    return (
      <div className="juce-grid-page__snapshot-panel">
        <div className="juce-grid-page__snapshot-header">
          <div className="juce-grid-page__snapshot-copy">
            <strong>Choose a starting point</strong>
            <span>{flowSnapshots.length} saved snapshots available</span>
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
        existingSnapshotNames={flowSnapshots.map((snapshot) => snapshot.name)}
        initialName={`Snapshot ${flowSnapshots.length + 1}`}
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
            <span>{flowSnapshots.length} saved snapshots</span>
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

            <div className="juce-grid-page__compact-tags">
              {activeSnapshot ? (
                <Tag type="warm-gray">
                  Updated {new Date(activeSnapshot.updated_at).toLocaleString()}
                </Tag>
              ) : (
                <Tag type="warm-gray">{flowSnapshots.length} saved snapshots available</Tag>
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
                <Tag type="cool-gray">{snapshotComparisonSummary.flowChanges} flow changes</Tag>
                <Tag type="cool-gray">{snapshotComparisonSummary.chainChanges} chain changes</Tag>
                <Tag type="cool-gray">{snapshotComparisonSummary.paramChanges} param changes</Tag>
                {snapshotComparisonSummary.routingChanged && <Tag type="purple">Routing changed</Tag>}
                {snapshotComparisonSummary.activeFlowChanged && <Tag type="blue">Active flow changed</Tag>}
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
          ) : flowSnapshots.length === 0 ? (
            <div className="juce-grid-page__empty-state">
              <p>No snapshots saved yet</p>
              <p className="juce-grid-page__empty-state-copy">
                Capture the current multi-flow state to build a reusable snapshot library.
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
                                {snapshot.program_number !== null && <Tag type="purple">PC {snapshot.program_number}</Tag>}
                              </div>
                            </div>

                            <p className="juce-grid-page__snapshot-description">
                              {snapshot.description || 'A pinned recall for the sounds you return to most often.'}
                            </p>

                            <div className="juce-grid-page__snapshot-slot-row">
                              {snapshot.flow_slots.map((slot) => (
                                <span
                                  key={`${snapshot.id}-${slot.id}`}
                                  className="juce-grid-page__snapshot-slot"
                                  style={{ '--snapshot-slot-color': slot.color } as React.CSSProperties}
                                >
                                  {slot.label}
                                </span>
                              ))}
                            </div>

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
                            <Button
                              size="sm"
                              kind="secondary"
                              onClick={() => handleSnapshotFavoriteToggle(snapshot)}
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
                              <OverflowMenuItem itemText="Delete" isDelete onClick={() => setSnapshotPendingDelete(snapshot)} />
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
                                {snapshot.description || 'Recallable snapshot for the current multi-flow rig.'}
                              </p>

                              <div className="juce-grid-page__snapshot-slot-row">
                                {snapshot.flow_slots.map((slot) => (
                                  <span
                                    key={`${snapshot.id}-${slot.id}`}
                                    className="juce-grid-page__snapshot-slot"
                                    style={{ '--snapshot-slot-color': slot.color } as React.CSSProperties}
                                  >
                                    {slot.label}
                                  </span>
                                ))}
                              </div>

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
                              <Button size="sm" kind="ghost" onClick={() => handleSnapshotFavoriteToggle(snapshot)}>
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
                                <OverflowMenuItem itemText="Delete" isDelete onClick={() => setSnapshotPendingDelete(snapshot)} />
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
          queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
          queryClient.invalidateQueries({ queryKey: ['chains', 'presets'] })
          pushToast(`Imported "${name}" successfully`, 'success')
          void presetId
        }}
      />
    </>
  )
}
