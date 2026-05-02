/**
 * T2487 — extracted from web/src/app/pages/ExpressionPage.tsx.
 *
 * Middle-column edit form for a CC→parameter assignment. Owns its
 * own draft state (re-seeded from the `initial` prop on change),
 * the CC-detection listen flow, the parameter search dropdown, the
 * curve picker, and the output-range editor.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'

import { INSTANT_TRANSITION } from '../../../styles/useReducedMotionSafeVariants'
import { useReducedEffectsPreference } from '../../../hooks/useReducedEffectsPreference'
import { NumberInput } from '../../ParameterControl'
import styles from '../../../pages/ExpressionPage.module.css'
import { CURVES } from './expressionConstants'
import { expressionTokens } from './expressionTokens'
import { CurvePreview } from './CurvePreview'
import { CustomCurveEditor } from './CustomCurveEditor'
import type {
  Assignment,
  Curve,
  CurvePoint,
  EngineParam,
  ListenResult,
} from './expressionTypes'

export function AssignmentForm({
  initial,
  params,
  onSave,
  onCancel,
  onDelete,
  onListenForCC,
  onCancelListen,
}: {
  initial: Assignment | null
  params: EngineParam[]
  onSave: (payload: Partial<Assignment>) => void
  onCancel: () => void
  onDelete: (assignmentId: string) => void
  onListenForCC: (listenerId: string) => Promise<ListenResult>
  onCancelListen: (listenerId: string) => Promise<void>
}) {
  const [cc, setCc] = useState<number>(initial?.cc ?? 0)
  const [channel, setChannel] = useState<number>(initial?.channel ?? 0)
  const [ccMin, setCcMin] = useState<number>(initial?.cc_min ?? 0)
  const [ccMax, setCcMax] = useState<number>(initial?.cc_max ?? 127)
  const [paramId, setParamId] = useState<string>(initial?.param_id ?? '')
  const [paramLabel, setParamLabel] = useState<string>(initial?.param_label ?? '')
  const [outMin, setOutMin] = useState<number>(initial?.out_min ?? 0)
  const [outMax, setOutMax] = useState<number>(initial?.out_max ?? 1)
  const [curve, setCurve] = useState<Curve>(initial?.curve ?? 'linear')
  const [customCurve, setCustomCurve] = useState<CurvePoint[]>(
    initial?.custom_curve?.length === 2
      ? initial.custom_curve
      : [
          { x: 0.25, y: 0.25 },
          { x: 0.75, y: 0.75 },
        ],
  )
  const [active, setActive] = useState<boolean>(initial?.active ?? true)
  const [search, setSearch] = useState<string>('')
  const [listening, setListening] = useState<boolean>(false)
  const [listenerId, setListenerId] = useState<string | null>(null)
  const [detectMessage, setDetectMessage] = useState<string>('')
  const { shouldReduceEffects } = useReducedEffectsPreference()
  const t = useCallback(
    (trans: Record<string, unknown>) => (shouldReduceEffects ? INSTANT_TRANSITION : trans),
    [shouldReduceEffects],
  )

  useEffect(() => {
    setCc(initial?.cc ?? 0)
    setChannel(initial?.channel ?? 0)
    setCcMin(initial?.cc_min ?? 0)
    setCcMax(initial?.cc_max ?? 127)
    setParamId(initial?.param_id ?? '')
    setParamLabel(initial?.param_label ?? '')
    setOutMin(initial?.out_min ?? 0)
    setOutMax(initial?.out_max ?? 1)
    setCurve(initial?.curve ?? 'linear')
    setCustomCurve(
      initial?.custom_curve?.length === 2
        ? initial.custom_curve
        : [
            { x: 0.25, y: 0.25 },
            { x: 0.75, y: 0.75 },
          ],
    )
    setActive(initial?.active ?? true)
    setDetectMessage('')
  }, [initial])

  const filteredParams = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return params
    return params.filter(
      (param) =>
        param.label.toLowerCase().includes(q) || param.id.toLowerCase().includes(q),
    )
  }, [params, search])

  const selectedParam = useMemo(
    () => params.find((param) => param.id === paramId),
    [paramId, params],
  )

  const handleParamSelect = useCallback((param: EngineParam) => {
    setParamId(param.id)
    setParamLabel(param.label)
    setOutMin(param.min)
    setOutMax(param.max)
    setSearch('')
  }, [])

  const startListen = useCallback(async () => {
    const id = `expr-${Date.now()}-${Math.floor(Math.random() * 100000)}`
    setListening(true)
    setListenerId(id)
    setDetectMessage('Move your expression pedal or controller. Waiting for signal...')
    try {
      const result = await onListenForCC(id)
      if (result.status === 'detected' && result.cc != null && result.channel != null) {
        setCc(result.cc)
        setChannel(result.channel)
        setCcMin(result.min_observed)
        setCcMax(result.max_observed)
        setDetectMessage(`Detected CC${result.cc} on channel ${result.channel}.`)
      } else if (result.status === 'timeout') {
        setDetectMessage('No pedal detected. Enter CC number manually.')
      } else {
        setDetectMessage('Listening cancelled.')
      }
    } catch {
      setDetectMessage('Detection failed. Enter CC number manually.')
    } finally {
      setListening(false)
      setListenerId(null)
    }
  }, [onListenForCC])

  const cancelListen = useCallback(async () => {
    if (!listenerId) return
    try {
      await onCancelListen(listenerId)
    } finally {
      setListening(false)
      setListenerId(null)
      setDetectMessage('Listening cancelled.')
    }
  }, [listenerId, onCancelListen])

  return (
    <motion.div
      className={styles.formSection}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={t({ duration: 0.3 })}
    >
      {/* CC Detection Panel */}
      <motion.div
        className={`${styles.detectCCPanel} ${listening ? styles.detectCCPanelListening : ''}`}
        animate={{
          borderColor: listening
            ? expressionTokens.colors.primary
            : expressionTokens.colors.border,
        }}
        transition={t({ duration: 0.2 })}
      >
        <div className={styles.detectCCMessage}>
          {detectMessage || 'Auto-detect MIDI CC by moving your pedal.'}
        </div>
        <div className={styles.detectCCButtons}>
          {!listening ? (
            <motion.button
              className={styles.buttonPrimary}
              onClick={startListen}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{ flex: 1 }}
            >
              Detect CC
            </motion.button>
          ) : (
            <motion.button
              className={styles.buttonSecondary}
              onClick={cancelListen}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{ flex: 1 }}
            >
              Cancel
            </motion.button>
          )}
        </div>
      </motion.div>

      {/* MIDI Input Fields */}
      <motion.div
        className={styles.fieldGrid}
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={t({ duration: 0.3, delay: 0.1 })}
      >
        <div>
          <label className={styles.fieldLabel}>CC</label>
          <NumberInput
            value={cc}
            min={0}
            max={127}
            step={1}
            profile="integer"
            onChange={setCc}
            showLabel={false}
            size="small"
            fullWidth
            accentColor={expressionTokens.colors.primary}
          />
        </div>
        <div>
          <label className={styles.fieldLabel}>Channel (0=Omni)</label>
          <NumberInput
            value={channel}
            min={0}
            max={16}
            step={1}
            profile="integer"
            onChange={setChannel}
            showLabel={false}
            size="small"
            fullWidth
            accentColor={expressionTokens.colors.primary}
          />
        </div>
        <div>
          <label className={styles.fieldLabel}>Input Min</label>
          <NumberInput
            value={ccMin}
            min={0}
            max={127}
            step={1}
            profile="integer"
            onChange={setCcMin}
            showLabel={false}
            size="small"
            fullWidth
            accentColor={expressionTokens.colors.primary}
          />
        </div>
        <div>
          <label className={styles.fieldLabel}>Input Max</label>
          <NumberInput
            value={ccMax}
            min={0}
            max={127}
            step={1}
            profile="integer"
            onChange={setCcMax}
            showLabel={false}
            size="small"
            fullWidth
            accentColor={expressionTokens.colors.primary}
          />
        </div>
      </motion.div>

      {/* Parameter Selection */}
      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={t({ duration: 0.3, delay: 0.15 })}
      >
        <label className={styles.fieldLabel}>Target Parameter</label>
        <input
          type="text"
          className={styles.inputField}
          value={search || paramLabel}
          placeholder="Search engine parameters..."
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: 4 }}
        />
        <AnimatePresence>
          {search.trim() && (
            <motion.div
              className={styles.parameterDropdown}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={t({ duration: 0.2 })}
            >
              {filteredParams.length === 0 && (
                <div className={styles.parameterEmptyMessage}>No matching parameter.</div>
              )}
              {filteredParams.map((param) => (
                <motion.button
                  key={param.id}
                  className={`${styles.parameterOption} ${paramId === param.id ? styles.parameterOptionSelected : ''}`}
                  onClick={() => handleParamSelect(param)}
                  whileHover={{ backgroundColor: expressionTokens.colors.panelSecondary }}
                >
                  <span>{param.label}</span>
                  <span className={styles.parameterOptionUnit}>{param.unit}</span>
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Output Range */}
      <motion.div
        className={styles.fieldGridThreeCol}
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={t({ duration: 0.3, delay: 0.2 })}
      >
        <div>
          <label className={styles.fieldLabel}>Output Min</label>
          <NumberInput
            value={outMin}
            min={selectedParam?.min ?? 0}
            max={selectedParam?.max ?? 1}
            step={
              selectedParam &&
              Number.isInteger(selectedParam.min) &&
              Number.isInteger(selectedParam.max)
                ? 1
                : 0.01
            }
            profile={
              selectedParam &&
              Number.isInteger(selectedParam.min) &&
              Number.isInteger(selectedParam.max)
                ? 'integer'
                : undefined
            }
            onChange={setOutMin}
            showLabel={false}
            size="small"
            fullWidth
            accentColor={expressionTokens.colors.liveIndicator}
          />
        </div>
        <div>
          <label className={styles.fieldLabel}>Output Max</label>
          <NumberInput
            value={outMax}
            min={selectedParam?.min ?? 0}
            max={selectedParam?.max ?? 1}
            step={
              selectedParam &&
              Number.isInteger(selectedParam.min) &&
              Number.isInteger(selectedParam.max)
                ? 1
                : 0.01
            }
            profile={
              selectedParam &&
              Number.isInteger(selectedParam.min) &&
              Number.isInteger(selectedParam.max)
                ? 'integer'
                : undefined
            }
            onChange={setOutMax}
            showLabel={false}
            size="small"
            fullWidth
            accentColor={expressionTokens.colors.liveIndicator}
          />
        </div>
        <motion.button
          className={styles.buttonSecondary}
          onClick={() => {
            const min = outMin
            setOutMin(outMax)
            setOutMax(min)
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{ height: 34 }}
        >
          Swap
        </motion.button>
      </motion.div>

      {/* Response Curve */}
      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={t({ duration: 0.3, delay: 0.25 })}
      >
        <label className={styles.fieldLabel}>Response Curve</label>
        <div className={styles.curveSection}>
          <div className={styles.curveButtonList}>
            {CURVES.map((entry) => (
              <motion.button
                key={entry.id}
                className={`${styles.curveButton} ${curve === entry.id ? styles.curveButtonActive : ''}`}
                onClick={() => setCurve(entry.id)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {entry.label}
              </motion.button>
            ))}
          </div>
          <div className={styles.curvePreviewContainer}>
            <CurvePreview curve={curve} customCurve={customCurve} />
            <AnimatePresence>
              {curve === 'custom' && (
                <CustomCurveEditor points={customCurve} onChange={setCustomCurve} />
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* Active Checkbox */}
      <motion.label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: expressionTokens.typography.fontFamily.ui,
          fontSize: '12px',
          color: expressionTokens.colors.textSecondary,
        }}
        whileHover={{ scale: 1.02 }}
      >
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
          style={{
            accentColor: expressionTokens.colors.primary,
            cursor: 'pointer',
          }}
        />
        Assignment active
      </motion.label>

      {/* Action Buttons */}
      <motion.div
        className={styles.buttonGroup}
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={t({ duration: 0.3, delay: 0.3 })}
      >
        <motion.button
          className={styles.buttonPrimary}
          onClick={() =>
            onSave({
              id: initial?.id,
              cc,
              channel,
              cc_min: ccMin,
              cc_max: ccMax,
              param_id: paramId,
              param_label: paramLabel || paramId,
              out_min: outMin,
              out_max: outMax,
              curve,
              custom_curve: customCurve,
              active,
              source: initial?.source || 'user',
            })
          }
          disabled={!paramId}
          whileHover={paramId ? { scale: 1.02 } : {}}
          whileTap={paramId ? { scale: 0.98 } : {}}
          style={{ opacity: paramId ? 1 : 0.5 }}
        >
          Save
        </motion.button>
        <motion.button
          className={styles.buttonSecondary}
          onClick={onCancel}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Cancel
        </motion.button>
        {initial && initial.source !== 'performance_mode' && (
          <motion.button
            className={styles.buttonDanger}
            onClick={() => onDelete(initial.id)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Delete
          </motion.button>
        )}
      </motion.div>
    </motion.div>
  )
}
