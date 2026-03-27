import React, { useEffect, useMemo, useState } from 'react'
import { Button, InlineLoading, InlineNotification, Tag, TextInput, Tile, Toggle } from '@carbon/react'
import { useSetTesiraDspParam, useTesiraDspBlock, useTesiraDspParams } from '../hooks/useTesiraApi'
import { NumberInput } from '../../ParameterControl'
import './TesiraCarbonChrome.css'

interface TesiraDspBlockPanelProps {
  deviceId: string
  instanceTag: string
}

type ParamValues = Record<string, unknown>

function buildDraftValues(values: ParamValues): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, String(value ?? '')]),
  )
}

function draftsMatch(left: Record<string, string>, right: Record<string, string>) {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) {
    return false
  }

  return leftKeys.every((key) => left[key] === right[key])
}

function coerceDraftValue(raw: string): unknown {
  const text = raw.trim()
  if (text === '') return ''
  if (text.toLowerCase() === 'true') return true
  if (text.toLowerCase() === 'false') return false
  const numeric = Number(text)
  if (Number.isFinite(numeric)) return numeric
  return raw
}

function normalizePositiveIntegerInput(value: string): string {
  return value.replace(/[^0-9]/g, '')
}

function parsePositiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return fallback
  return Math.max(1, parsed)
}

function resolvePrecision(step: number): number {
  if (!Number.isFinite(step) || step <= 0) {
    return 0
  }

  const normalized = step.toFixed(12).replace(/0+$/, '').replace(/\.$/, '')
  if (!normalized.includes('.')) {
    return 0
  }
  return normalized.split('.')[1]?.length ?? 0
}

export function TesiraDspBlockPanel({ deviceId, instanceTag }: TesiraDspBlockPanelProps) {
  const block = useTesiraDspBlock(deviceId, instanceTag)
  const params = useTesiraDspParams(deviceId, instanceTag)
  const setParam = useSetTesiraDspParam()

  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [localError, setLocalError] = useState<string | null>(null)
  const [matrixInput, setMatrixInput] = useState('1')
  const [matrixOutput, setMatrixOutput] = useState('1')
  const [matrixGain, setMatrixGain] = useState(0)
  const [matrixMute, setMatrixMute] = useState(false)

  const values = useMemo(
    () => ((params.data?.values || {}) as ParamValues),
    [params.data?.values],
  )

  const editorFamily = useMemo(() => {
    const family = (block.data?.editor as Record<string, unknown> | undefined)?.family
    return typeof family === 'string' && family.trim() ? family : 'generic'
  }, [block.data?.editor])

  const sortedKeys = useMemo(() => {
    const keys = Object.keys(values)
    const familyOrder: Record<string, string[]> = {
      matrix: ['crosspointLevelOut', 'crosspointMute', 'crosspointDelay'],
      router: ['crosspointLevelOut', 'crosspointMute'],
      dynamics: ['threshold', 'ratio', 'attack', 'release', 'depth', 'targetLevel', 'bypass'],
      filter: ['frequency', 'q', 'slope', 'bypass'],
      stream: ['streamEnabled', 'latency', 'packetTime'],
      logic: ['state', 'mode', 'running', 'period', 'pulseWidth'],
      meter: ['level', 'rms', 'peak', 'holdTime'],
      selector: ['sourceSelection', 'mute'],
    }
    const ordered = familyOrder[editorFamily] ?? []
    return keys.sort((left, right) => {
      const leftIndex = ordered.indexOf(left)
      const rightIndex = ordered.indexOf(right)
      if (leftIndex >= 0 || rightIndex >= 0) {
        if (leftIndex < 0) return 1
        if (rightIndex < 0) return -1
        return leftIndex - rightIndex
      }
      return left.localeCompare(right)
    })
  }, [editorFamily, values])

  const matrixArgs = useMemo(
    () => [parsePositiveInteger(matrixInput, 1), parsePositiveInteger(matrixOutput, 1)],
    [matrixInput, matrixOutput],
  )

  const supportsCrosspoint = useMemo(
    () =>
      sortedKeys.includes('crosspointLevelOut') ||
      sortedKeys.includes('crosspointMute') ||
      Boolean((block.data?.parameter_map as Record<string, unknown> | undefined)?.crosspointLevelOut),
    [block.data?.parameter_map, sortedKeys],
  )

  const crosspointGainDefinition = useMemo(
    () => ((block.data?.parameter_map?.crosspointLevelOut ?? {}) as Record<string, unknown>),
    [block.data?.parameter_map],
  )
  const crosspointGainMin = typeof crosspointGainDefinition.min_value === 'number' ? crosspointGainDefinition.min_value : -100
  const crosspointGainMax = typeof crosspointGainDefinition.max_value === 'number' ? crosspointGainDefinition.max_value : 24
  const crosspointGainStep = typeof crosspointGainDefinition.step === 'number' ? crosspointGainDefinition.step : 0.1

  useEffect(() => {
    const nextDrafts = buildDraftValues(values)
    setDrafts((prev) => (draftsMatch(prev, nextDrafts) ? prev : nextDrafts))
  }, [values])

  const applyOne = async (attribute: string, value: unknown, args: unknown[] = []) => {
    setLocalError(null)
    try {
      await setParam.mutateAsync({ deviceId, instanceTag, attribute, value, args })
      await params.refetch()
    } catch (error: unknown) {
      setLocalError(error instanceof Error ? error.message : String(error))
    }
  }

  if (params.isLoading || block.isLoading) {
    return (
      <div className="tesira-dsp-panel__loading">
        <InlineLoading description="Loading block parameters" />
      </div>
    )
  }

  return (
    <div className="tesira-dsp-panel">
      <Tile className="tesira-dsp-panel__tile">
        <div className="tesira-dsp-panel__header">
          <div>
            <p className="tesira-dashboard__eyebrow">Block parameters</p>
            <h3 className="tesira-dashboard__title">{instanceTag}</h3>
            <p className="tesira-dashboard__summary">
              Inspect the current parameter map and write back individual values without leaving the Tesira dashboard.
            </p>
          </div>
          <div className="tesira-dsp-panel__tags">
            <Tag type="cool-gray" size="sm">{editorFamily}</Tag>
            <Tag type="warm-gray" size="sm">{sortedKeys.length} params</Tag>
            <Button
              size="sm"
              kind="ghost"
              onClick={() => {
                params.refetch().catch(() => undefined)
              }}
            >
              Refresh
            </Button>
          </div>
        </div>

        {localError ? (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="Parameter write failed"
            subtitle={localError}
          />
        ) : null}

        {params.error ? (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="Failed to read block parameters"
            subtitle={(params.error as Error).message || 'The block parameter map could not be read.'}
          />
        ) : null}

        {(editorFamily === 'matrix' || editorFamily === 'router') && supportsCrosspoint ? (
          <div className="tesira-dsp-panel__crosspoint">
            <div className="tesira-dsp-panel__crosspoint-header">
              <div>
                <h4 className="tesira-dsp-panel__param-title">Crosspoint helper</h4>
                <p className="tesira-dsp-panel__param-meta">Apply a gain or mute change to a specific matrix crosspoint.</p>
              </div>
              <Tag type="blue" size="sm">{`${matrixArgs[0]} → ${matrixArgs[1]}`}</Tag>
            </div>

            <div className="tesira-dsp-panel__crosspoint-form">
              <TextInput
                id={`tesira-dsp-matrix-input-${instanceTag}`}
                labelText="Input"
                value={matrixInput}
                onChange={(event) => setMatrixInput(normalizePositiveIntegerInput(event.target.value))}
                inputMode="numeric"
              />
              <TextInput
                id={`tesira-dsp-matrix-output-${instanceTag}`}
                labelText="Output"
                value={matrixOutput}
                onChange={(event) => setMatrixOutput(normalizePositiveIntegerInput(event.target.value))}
                inputMode="numeric"
              />
              <NumberInput
                label="Gain dB"
                className="tesira-dsp-panel__range"
                min={crosspointGainMin}
                max={crosspointGainMax}
                step={crosspointGainStep}
                value={matrixGain}
                unit="dB"
                precision={resolvePrecision(crosspointGainStep)}
                size="small"
                showBounds={false}
                fullWidth
                onChange={(value) => setMatrixGain(value)}
              />
              <Button
                size="sm"
                kind="secondary"
                disabled={setParam.isPending}
                onClick={() => {
                  if (!Number.isFinite(matrixGain)) return
                  void applyOne('crosspointLevelOut', matrixGain, matrixArgs)
                }}
              >
                Apply gain
              </Button>
            </div>

            <Toggle
              id={`tesira-dsp-matrix-mute-${instanceTag}`}
              labelText="Crosspoint mute"
              labelA="Off"
              labelB="On"
              toggled={matrixMute}
              onToggle={(checked) => {
                setMatrixMute(checked)
                void applyOne('crosspointMute', checked, matrixArgs)
              }}
            />
          </div>
        ) : null}

        <div className="tesira-dsp-panel__params">
          {sortedKeys.map((key) => {
            const value = values[key]
            const definition = (block.data?.parameter_map?.[key] ?? {}) as Record<string, unknown>
            const valueType = String(definition.value_type ?? '')
            const unit = String(definition.unit ?? '')
            const isBool = typeof value === 'boolean' || valueType.toUpperCase() === 'BOOL'
            const min = typeof definition.min_value === 'number' ? (definition.min_value as number) : undefined
            const max = typeof definition.max_value === 'number' ? (definition.max_value as number) : undefined
            const step = typeof definition.step === 'number' ? (definition.step as number) : 0.1
            const numeric = typeof value === 'number' ? value : Number(drafts[key])
            const useSlider = Number.isFinite(numeric) && min != null && max != null

            return (
              <div key={key} className="tesira-dsp-panel__param">
                <div className="tesira-dsp-panel__param-header">
                  <div>
                    <h4 className="tesira-dsp-panel__param-title" title={key}>{key}</h4>
                    <p className="tesira-dsp-panel__param-meta">
                      {unit ? `${unit} · ` : ''}
                      {valueType || typeof value || 'unknown'}
                    </p>
                  </div>
                  <Tag type="cool-gray" size="sm">{String(value ?? '—')}</Tag>
                </div>

                {isBool ? (
                  <Toggle
                    id={`tesira-dsp-param-${instanceTag}-${key}`}
                    labelText={`Boolean value for ${key}`}
                    labelA="Off"
                    labelB="On"
                    toggled={Boolean(value)}
                    disabled={setParam.isPending}
                    onToggle={(checked) => {
                      void applyOne(key, checked)
                    }}
                  />
                ) : (
                  <div className="tesira-dsp-panel__param-editor">
                    {useSlider ? (
                      <NumberInput
                        label={`Value for ${key}`}
                        className="tesira-dsp-panel__range"
                        min={min ?? 0}
                        max={max ?? 1}
                        step={step}
                        value={Number.isFinite(numeric) ? Number(numeric) : min ?? 0}
                        unit={unit || undefined}
                        precision={resolvePrecision(step)}
                        size="small"
                        showBounds={false}
                        showLabel={false}
                        fullWidth
                        onChange={(value) => setDrafts((prev) => ({
                          ...prev,
                          [key]: String(value),
                        }))}
                      />
                    ) : (
                      <TextInput
                        id={`tesira-dsp-value-${instanceTag}-${key}`}
                        labelText={`Value for ${key}`}
                        value={drafts[key] ?? ''}
                        onChange={(event) => setDrafts((prev) => ({
                          ...prev,
                          [key]: event.target.value,
                        }))}
                      />
                    )}
                    <Button
                      size="sm"
                      kind="secondary"
                      disabled={setParam.isPending}
                      onClick={() => {
                        void applyOne(key, coerceDraftValue(drafts[key] ?? ''))
                      }}
                    >
                      Apply
                    </Button>
                  </div>
                )}
              </div>
            )
          })}

          {sortedKeys.length === 0 ? (
            <p className="tesira-presets-tab__empty">No readable parameters returned.</p>
          ) : null}
        </div>
      </Tile>
    </div>
  )
}
