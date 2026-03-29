import { useCallback, useEffect, useRef, useState, type UIEvent } from 'react'
import { ComposedModal, ModalBody, ModalHeader } from '@carbon/react'
import { snapshotDetailToFlowSnapshotData } from '../../../map2/clients/snapshots'
import type { FlowSnapshotData, SnapshotDetail } from '../../../map2/types'
import { SnapshotModalContent } from './SnapshotModalContent'

export interface SnapshotModalProps {
  open: boolean
  onClose: () => void
  snapshotDraft: FlowSnapshotData | SnapshotDetail
  applySnapshotData: (snapshotData: FlowSnapshotData, options?: { toastMessage?: string | null; invalidateChains?: boolean }) => void
  onSnapshotSave?: () => void
}

function getStoredSnapshotTab(): string {
  try {
    return localStorage.getItem('map2_snapshots_modal_tab') ?? 'library'
  } catch {
    return 'library'
  }
}

function getStoredSnapshotScroll(): number {
  try {
    const raw = localStorage.getItem('map2_snapshots_modal_scroll')
    if (!raw) {
      return 0
    }
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) ? parsed : 0
  } catch {
    return 0
  }
}

export function SnapshotModal({
  open,
  onClose,
  snapshotDraft,
  applySnapshotData,
  onSnapshotSave,
}: SnapshotModalProps) {
  const normalizedSnapshotDraft = 'flowSlots' in snapshotDraft
    ? snapshotDraft
    : snapshotDetailToFlowSnapshotData(snapshotDraft)
  const [activeTab, setActiveTab] = useState(getStoredSnapshotTab)
  const [scrollTop, setScrollTop] = useState(getStoredSnapshotScroll)
  const bodyRef = useRef<HTMLDivElement>(null)
  const scrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (open && !wasOpenRef.current && bodyRef.current) {
      bodyRef.current.scrollTop = scrollTop
    }
    wasOpenRef.current = open
  }, [open, scrollTop])

  useEffect(() => {
    return () => {
      if (scrollDebounceRef.current) {
        clearTimeout(scrollDebounceRef.current)
      }
    }
  }, [])

  const persistActiveTab = useCallback((nextTab: string) => {
    setActiveTab(nextTab)
    try {
      localStorage.setItem('map2_snapshots_modal_tab', nextTab)
    } catch {}
  }, [])

  const persistScrollTop = useCallback((nextScrollTop: number) => {
    setScrollTop(nextScrollTop)
    if (scrollDebounceRef.current) {
      clearTimeout(scrollDebounceRef.current)
    }

    scrollDebounceRef.current = setTimeout(() => {
      try {
        localStorage.setItem('map2_snapshots_modal_scroll', String(nextScrollTop))
      } catch {}
    }, 200)
  }, [])

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    persistScrollTop(event.currentTarget.scrollTop)
  }, [persistScrollTop])

  const handleRecall = useCallback(() => {
    onClose()
  }, [onClose])

  const handleSnapshotSave = useCallback(() => {
    onSnapshotSave?.()
  }, [onSnapshotSave])

  return (
    <ComposedModal
      open={open}
      id="snapshots-modal"
      className="snapshot-modal"
      onClose={onClose}
    >
      <ModalHeader title="Snapshots" />
      <ModalBody
        onScroll={handleScroll}
        ref={bodyRef}
      >
        <SnapshotModalContent
          onRecall={handleRecall}
          onSnapshotSave={handleSnapshotSave}
          activeTab={activeTab}
          onTabChange={persistActiveTab}
          snapshotDraft={normalizedSnapshotDraft}
          applySnapshotData={applySnapshotData}
        />
      </ModalBody>
    </ComposedModal>
  )
}
