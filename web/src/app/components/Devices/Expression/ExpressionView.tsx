/**
 * T2487 — extracted from web/src/app/pages/ExpressionPage.tsx.
 *
 * The integrated 3-column body of the Expression pedal control
 * surface. Audit (T2487-1) confirmed this is a single-view workflow
 * (Assignment List ↔ Form ↔ Live Monitor); not split into route
 * tabs because selecting an assignment in column 1 drives column
 * 2's form and column 3's live monitor — splitting would force
 * route navigation mid-edit.
 *
 * Behavior is preserved verbatim from the pre-extraction monolith.
 * Cleanup of the orphaned `isMobile` / `activeTab` state (the
 * mobile constrained-width branch was removed at some point but
 * the state plumbing stayed) is queued as a separate follow-up.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'

import { INSTANT_TRANSITION } from '../../../styles/useReducedMotionSafeVariants'
import { useReducedEffectsPreference } from '../../../hooks/useReducedEffectsPreference'
import styles from '../../../pages/ExpressionPage.module.css'

import { AssignmentForm } from './AssignmentForm'
import { AssignmentRow } from './AssignmentRow'
import { LiveDualGraphic } from './LiveDualGraphic'
import { apiFetch } from './expressionUtils'
import type {
  Assignment,
  EngineParam,
  ExpressionViewProps,
  ListenResult,
} from './expressionTypes'

type ConstrainedTab = 'assignments' | 'edit' | 'live'

export function ExpressionView({
  highlightedCcPairs,
  initialCc,
  initialChannel,
  onAssignmentMutated,
  constrainedWidth = false,
}: ExpressionViewProps) {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState<boolean>(false)
  const [, setIsMobile] = useState<boolean>(() => window.innerWidth < 1024)
  const [, setActiveTab] = useState<ConstrainedTab>('assignments')
  const { shouldReduceEffects } = useReducedEffectsPreference()
  // t() maps raw Framer transition objects through the reduced-motion preference
  const t = useCallback(
    (trans: Record<string, unknown>) => (shouldReduceEffects ? INSTANT_TRANSITION : trans),
    [shouldReduceEffects],
  )

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const { data: assignments = [] } = useQuery<Assignment[]>({
    queryKey: ['expression-assignments'],
    queryFn: () => apiFetch('/v2/expression/assignments'),
    refetchInterval: 2000,
  })

  const { data: paramData } = useQuery<{ parameters: EngineParam[] }>({
    queryKey: ['expression-engine-parameters'],
    queryFn: () => apiFetch('/v2/engine/parameters'),
    staleTime: 60_000,
  })
  const params = paramData?.parameters || []

  const selected = assignments.find((a) => a.id === selectedId) || null
  const selectedParam = params.find((param) => param.id === selected?.param_id)

  const isHighlighted = useCallback(
    (a: Assignment): boolean => {
      if (!highlightedCcPairs || highlightedCcPairs.length === 0) return false
      return highlightedCcPairs.some(
        (p) =>
          p.cc === a.cc &&
          (p.channel === a.channel || p.channel === 0 || a.channel === 0),
      )
    },
    [highlightedCcPairs],
  )

  const didAutoSelect = useRef(false)
  useEffect(() => {
    if (didAutoSelect.current || !highlightedCcPairs?.length || assignments.length === 0)
      return
    const match = assignments.find((a) => isHighlighted(a))
    if (match) {
      setSelectedId(match.id)
      setCreating(false)
      if (constrainedWidth) setActiveTab('edit')
      didAutoSelect.current = true
    }
  }, [assignments, highlightedCcPairs, isHighlighted, constrainedWidth])

  const newAssignmentSeed = useMemo((): Assignment | null => {
    if (initialCc == null) return null
    return {
      id: '',
      cc: initialCc,
      channel: initialChannel ?? 0,
      cc_min: 0,
      cc_max: 127,
      param_id: '',
      param_label: '',
      out_min: 0,
      out_max: 1,
      curve: 'linear',
      active: true,
      source: 'user',
    }
  }, [initialCc, initialChannel])

  const saveMutation = useMutation({
    mutationFn: (payload: Partial<Assignment>) =>
      apiFetch<Assignment>('/v2/expression/assignments', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['expression-assignments'] })
      setSelectedId(saved.id)
      setCreating(false)
      if (constrainedWidth) setActiveTab('assignments')
      onAssignmentMutated?.()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (assignmentId: string) =>
      apiFetch(`/v2/expression/assignments/${encodeURIComponent(assignmentId)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expression-assignments'] })
      setSelectedId(null)
      setCreating(false)
      if (constrainedWidth) setActiveTab('assignments')
      onAssignmentMutated?.()
    },
  })

  const listenForCC = useCallback(async (listenerId: string): Promise<ListenResult> => {
    return apiFetch<ListenResult>('/v2/expression/listen-for-cc', {
      method: 'POST',
      body: JSON.stringify({ listener_id: listenerId, timeout_seconds: 10.0 }),
    })
  }, [])

  const cancelListenForCC = useCallback(async (listenerId: string): Promise<void> => {
    await apiFetch('/v2/expression/listen-for-cc/cancel', {
      method: 'POST',
      body: JSON.stringify({ listener_id: listenerId }),
    })
  }, [])

  const userAssignments = assignments.filter((assignment) => assignment.source === 'user')
  const perfAssignments = assignments.filter(
    (assignment) => assignment.source === 'performance_mode',
  )
  const highlightedCount = assignments.filter(isHighlighted).length

  const handleNewAssignment = () => {
    setCreating(true)
    setSelectedId(null)
    if (constrainedWidth) setActiveTab('edit')
  }

  const handleSelectAssignment = (id: string) => {
    setSelectedId(id)
    setCreating(false)
    if (constrainedWidth) setActiveTab('edit')
  }

  const handleCancel = () => {
    setCreating(false)
    setSelectedId(null)
    if (constrainedWidth) setActiveTab('assignments')
  }

  // Full-width layout for desktop
  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={t({ duration: 0.4 })}
    >
      <div className={styles.header}>
        <h1 className={styles.title}>Expression Pedal Control</h1>
        <p className={styles.subtitle}>
          Map MIDI continuous controllers to any engine parameter with real-time
          feedback and curve shaping.
        </p>
        <div className={styles.headerDivider} />
      </div>

      <div className={styles.mainGrid}>
        {/* Assignment List Column */}
        <motion.div
          className={styles.assignmentColumn}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={t({ duration: 0.4, delay: 0.1 })}
        >
          <motion.button
            className={styles.newAssignmentButton}
            onClick={handleNewAssignment}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            layoutId="new-button"
          >
            New assignment
          </motion.button>

          {highlightedCount > 0 && (
            <motion.div
              className={`${styles.assignmentGroupLabel} ${styles.assignmentGroupLabelHighlighted}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={t({ duration: 0.2 })}
            >
              Linked to this plugin
            </motion.div>
          )}

          <AnimatePresence>
            {userAssignments.filter(isHighlighted).map((assignment) => (
              <AssignmentRow
                key={assignment.id}
                assignment={assignment}
                selected={selectedId === assignment.id}
                onSelect={() => handleSelectAssignment(assignment.id)}
                isHighlighted
              />
            ))}
          </AnimatePresence>

          {userAssignments.filter((a) => !isHighlighted(a)).length > 0 && (
            <motion.div
              className={styles.assignmentGroupLabel}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={t({ duration: 0.2 })}
              style={{
                marginTop: highlightedCount > 0 ? 10 : 6,
              }}
            >
              {highlightedCount > 0 ? 'Other assignments' : 'User assignments'}
            </motion.div>
          )}

          <AnimatePresence>
            {userAssignments
              .filter((a) => !isHighlighted(a))
              .map((assignment) => (
                <AssignmentRow
                  key={assignment.id}
                  assignment={assignment}
                  selected={selectedId === assignment.id}
                  onSelect={() => handleSelectAssignment(assignment.id)}
                  isHighlighted={false}
                />
              ))}
          </AnimatePresence>

          {perfAssignments.length > 0 && (
            <motion.div
              className={styles.assignmentGroupLabel}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={t({ duration: 0.2 })}
            >
              Performance mode defaults
            </motion.div>
          )}

          <AnimatePresence>
            {perfAssignments.map((assignment) => (
              <AssignmentRow
                key={assignment.id}
                assignment={assignment}
                selected={selectedId === assignment.id}
                onSelect={() => handleSelectAssignment(assignment.id)}
                isHighlighted={isHighlighted(assignment)}
              />
            ))}
          </AnimatePresence>
        </motion.div>

        {/* Form Column */}
        <motion.div
          className={styles.formColumn}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={t({ duration: 0.4, delay: 0.15 })}
        >
          <AnimatePresence mode="wait">
            {creating || selected ? (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={t({ duration: 0.3 })}
              >
                <AssignmentForm
                  initial={creating ? newAssignmentSeed ?? null : selected}
                  params={params}
                  onSave={(payload) => saveMutation.mutate(payload)}
                  onCancel={handleCancel}
                  onDelete={(assignmentId) => {
                    if (window.confirm('Delete this assignment?')) {
                      deleteMutation.mutate(assignmentId)
                    }
                  }}
                  onListenForCC={listenForCC}
                  onCancelListen={cancelListenForCC}
                />
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                className={styles.emptyStateContainer}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={t({ duration: 0.3 })}
              >
                <span>Select an assignment to edit, or create a new one.</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Live Monitor Column */}
        <motion.div
          className={styles.monitorColumn}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={t({ duration: 0.4, delay: 0.2 })}
        >
          <div className={styles.monitorHeader}>Live Signal</div>
          <LiveDualGraphic
            assignment={selected}
            paramUnit={selectedParam?.unit || ''}
          />
        </motion.div>
      </div>
    </motion.div>
  )
}
