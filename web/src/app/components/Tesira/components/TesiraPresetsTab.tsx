import React, { useState } from 'react'
import { Add, PlayFilled, TrashCan } from '@carbon/icons-react'
import {
  Box, Typography, List, ListItem, ListItemText, ListItemSecondaryAction,
  Button, Divider, TextField, IconButton, Tooltip, CircularProgress,
  Table, TableHead, TableRow, TableCell, TableBody, Alert,
} from '@mui/material'
import {
  useTesiraPresets, useRecallPreset,
  usePresetInterlockRules, useAddInterlockRule, useDeleteInterlockRule,
} from '../hooks/useTesiraApi'
import { useTesiraReversePresetSync } from '../hooks/useTesiraWebSocket'
import type { TesiraReversePresetSyncEvent } from '../types'
import { NumberInput } from '../../Controls/NumberInput'

interface TesiraPresetsTabProps {
  deviceId: string
}

export function TesiraPresetsTab({ deviceId }: TesiraPresetsTabProps) {
  const { data: presets, isLoading } = useTesiraPresets(deviceId)
  const recallPreset = useRecallPreset()
  const { data: rules } = usePresetInterlockRules()
  const addRule = useAddInterlockRule()
  const deleteRule = useDeleteInterlockRule()

  const [newMap2Id, setNewMap2Id] = useState('')
  const [newPresetIdx, setNewPresetIdx] = useState('')
  const [latestReverse, setLatestReverse] = useState<TesiraReversePresetSyncEvent | null>(null)

  useTesiraReversePresetSync((event) => {
    if (event.device_id === deviceId) {
      setLatestReverse(event)
    }
  })

  function handleAddRule() {
    if (!newMap2Id || !newPresetIdx) return
    addRule.mutate({
      map2_preset_id: parseInt(newMap2Id),
      tesira_device_id: deviceId,
      tesira_preset_index: parseInt(newPresetIdx),
    })
    setNewMap2Id('')
    setNewPresetIdx('')
  }

  return (
    <Box sx={{ p: 1.5 }}>
      {/* Preset list */}
      <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        DEVICE PRESETS
      </Typography>

      {isLoading ? (
        <CircularProgress size={20} />
      ) : !presets || presets.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No presets found.</Typography>
      ) : (
        <List dense disablePadding>
          {presets.map((p) => (
            <ListItem key={p.index} divider sx={{ py: 0.25 }}>
              <ListItemText
                primary={p.name || `Preset ${p.index}`}
                secondary={`Index ${p.index}`}
                primaryTypographyProps={{ variant: 'body2' }}
                secondaryTypographyProps={{ variant: 'caption' }}
              />
              <ListItemSecondaryAction>
                <Tooltip title="Recall preset">
                  <IconButton
                    size="small"
                    onClick={() => recallPreset.mutate({ deviceId, presetIndex: p.index })}
                    disabled={recallPreset.isPending}
                  >
                    <PlayFilled size={16} />
                  </IconButton>
                </Tooltip>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      )}

      <Divider sx={{ my: 2 }} />

      {/* Interlock rules */}
      <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        PRESET INTERLOCK RULES
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        When a MAP2 preset is recalled, automatically recall the mapped Tesira preset.
      </Typography>

      {latestReverse && (
        <Alert severity={latestReverse.matched ? 'info' : 'warning'} sx={{ mb: 1.5 }}>
          Tesira preset {latestReverse.preset_index} changed on-device.
          {latestReverse.matched
            ? ` Mapped MAP2 preset IDs: ${latestReverse.map2_preset_ids.join(', ')}.`
            : ' No MAP2 interlock mapping found for this preset.'}
        </Alert>
      )}

      {rules && rules.length > 0 ? (
        <Table size="small" sx={{ mb: 2 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontSize: 11 }}>MAP2 Preset ID</TableCell>
              <TableCell sx={{ fontSize: 11 }}>Tesira Preset</TableCell>
              <TableCell sx={{ fontSize: 11 }}></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rules
              .filter((r) => r.tesira_device_id === deviceId)
              .map((r) => (
                <TableRow key={r.id}>
                  <TableCell sx={{ fontSize: 12 }}>{r.map2_preset_id}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{r.tesira_preset_index}</TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => deleteRule.mutate(r.id)}>
                      <TrashCan size={14} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>No interlock rules.</Typography>
      )}

      {/* Add rule */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <NumberInput
          label="MAP2 Preset ID"
          value={newMap2Id === '' ? 0 : Number(newMap2Id)}
          min={0}
          max={999999}
          step={1}
          size="small"
          showBounds={false}
          style={{ width: 140 }}
          onChange={(value) => setNewMap2Id(String(Math.max(0, Math.round(value))))}
        />
        <NumberInput
          label="Tesira Preset #"
          value={newPresetIdx === '' ? 0 : Number(newPresetIdx)}
          min={0}
          max={999999}
          step={1}
          size="small"
          showBounds={false}
          style={{ width: 140 }}
          onChange={(value) => setNewPresetIdx(String(Math.max(0, Math.round(value))))}
        />
        <Button
          size="small"
          variant="outlined"
          startIcon={<Add size={16} />}
          onClick={handleAddRule}
          disabled={!newMap2Id || !newPresetIdx || addRule.isPending}
        >
          Add
        </Button>
      </Box>

      {addRule.isError && (
        <Alert severity="error" sx={{ mt: 1 }}>Failed to add rule</Alert>
      )}
    </Box>
  )
}
