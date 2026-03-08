import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Slider,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import { useSetTesiraDspParam, useTesiraDspBlock, useTesiraDspParams } from '../hooks/useTesiraApi'

interface TesiraDspBlockPanelProps {
  deviceId: string
  instanceTag: string
}

type ParamValues = Record<string, unknown>

function coerceDraftValue(raw: string): unknown {
  const text = raw.trim()
  if (text === '') return ''
  if (text.toLowerCase() === 'true') return true
  if (text.toLowerCase() === 'false') return false
  const numeric = Number(text)
  if (Number.isFinite(numeric)) return numeric
  return raw
}

export function TesiraDspBlockPanel({ deviceId, instanceTag }: TesiraDspBlockPanelProps) {
  const block = useTesiraDspBlock(deviceId, instanceTag)
  const params = useTesiraDspParams(deviceId, instanceTag)
  const setParam = useSetTesiraDspParam()

  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [localError, setLocalError] = useState<string | null>(null)

  const values = (params.data?.values || {}) as ParamValues
  const sortedKeys = useMemo(() => Object.keys(values).sort(), [values])

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        Object.entries(values).map(([key, value]) => [key, String(value ?? '')])
      )
    )
  }, [values])

  const applyOne = async (attribute: string, value: unknown) => {
    setLocalError(null)
    try {
      await setParam.mutateAsync({ deviceId, instanceTag, attribute, value, args: [] })
      await params.refetch()
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : String(err))
    }
  }

  if (params.isLoading || block.isLoading) return <CircularProgress size={18} />

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="caption" fontWeight={700}>
          Block Parameters
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {instanceTag}
        </Typography>
        <Button
          size="small"
          variant="text"
          onClick={() => {
            params.refetch().catch(() => undefined)
          }}
        >
          Refresh
        </Button>
      </Stack>

      {localError && <Alert severity="warning" sx={{ mb: 1 }}>{localError}</Alert>}
      {params.error && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          {(params.error as Error).message || 'Failed to read block parameters'}
        </Alert>
      )}

      <Stack spacing={1}>
        {sortedKeys.map((key) => {
          const value = values[key]
          const definition = (block.data?.parameter_map?.[key] ?? {}) as Record<string, unknown>
          const valueType = String(definition['value_type'] ?? '')
          const unit = String(definition['unit'] ?? '')
          const isBool = typeof value === 'boolean' || valueType.toUpperCase() === 'BOOL'
          const min = typeof definition['min_value'] === 'number' ? (definition['min_value'] as number) : undefined
          const max = typeof definition['max_value'] === 'number' ? (definition['max_value'] as number) : undefined
          const step = typeof definition['step'] === 'number' ? (definition['step'] as number) : 0.1
          const numeric = typeof value === 'number' ? value : Number(drafts[key])
          const useSlider = Number.isFinite(numeric) && min != null && max != null

          return (
            <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography
                variant="caption"
                sx={{ width: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={key}
              >
                {key}
              </Typography>
              {isBool ? (
                <Switch
                  size="small"
                  checked={Boolean(value)}
                  disabled={setParam.isPending}
                  onChange={(_, checked) => {
                    applyOne(key, checked).catch(() => undefined)
                  }}
                />
              ) : (
                <>
                  <TextField
                    size="small"
                    value={drafts[key] ?? ''}
                    onChange={(event) => setDrafts((prev) => ({ ...prev, [key]: event.target.value }))}
                    sx={{ minWidth: 180 }}
                    inputProps={{ style: { fontSize: 12 } }}
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={setParam.isPending}
                    onClick={() => {
                      applyOne(key, coerceDraftValue(drafts[key] ?? '')).catch(() => undefined)
                    }}
                  >
                    Apply
                  </Button>
                  {useSlider ? (
                    <Slider
                      size="small"
                      value={Number.isFinite(numeric) ? (numeric as number) : (min as number)}
                      min={min}
                      max={max}
                      step={step}
                      sx={{ width: 180, color: '#E31837' }}
                      onChange={(_event, next) => {
                        const nextNumber = Number(next)
                        if (Number.isFinite(nextNumber)) {
                          setDrafts((prev) => ({ ...prev, [key]: String(nextNumber) }))
                        }
                      }}
                      onChangeCommitted={(_event, next) => {
                        applyOne(key, Number(next)).catch(() => undefined)
                      }}
                    />
                  ) : null}
                </>
              )}
              {unit ? (
                <Typography variant="caption" color="text.secondary">
                  {unit}
                </Typography>
              ) : null}
            </Box>
          )
        })}
        {sortedKeys.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No readable parameters returned.
          </Typography>
        )}
      </Stack>
    </Paper>
  )
}
