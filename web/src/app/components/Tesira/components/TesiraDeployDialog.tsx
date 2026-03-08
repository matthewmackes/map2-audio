import React, { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Switch,
  Typography,
} from '@mui/material'
import {
  useRollbackTesiraDeployment,
  useStartTesiraDeployment,
  useTesiraDeployment,
  useTesiraLayouts,
  useTesiraSageVueStatus,
} from '../hooks/useTesiraApi'

interface TesiraDeployDialogProps {
  deviceId: string
  open: boolean
  onClose: () => void
}

export function TesiraDeployDialog({ deviceId, open, onClose }: TesiraDeployDialogProps) {
  const { data: layouts, isLoading: layoutsLoading } = useTesiraLayouts({ includeInactive: false })
  const { data: sagevue } = useTesiraSageVueStatus()
  const startDeploy = useStartTesiraDeployment()
  const rollbackDeploy = useRollbackTesiraDeployment()

  const options = useMemo(() => layouts?.layouts ?? [], [layouts])
  const [selected, setSelected] = useState<string>('')
  const [dryRun, setDryRun] = useState<boolean>(true)
  const [jobId, setJobId] = useState<string>('')
  const deployment = useTesiraDeployment(jobId)

  const selectedLayout = useMemo(() => {
    if (!selected) return null
    const [layoutId, version] = selected.split('@')
    return { layoutId, version }
  }, [selected])

  const status = deployment.data?.status
  const canRollback = status === 'succeeded'

  const handleStart = async () => {
    if (!selectedLayout) return
    const job = await startDeploy.mutateAsync({
      deviceId,
      layoutId: selectedLayout.layoutId,
      layoutVersion: selectedLayout.version,
      dryRun,
      requestedBy: 'map2-ui',
    })
    setJobId(job.job_id)
  }

  const handleRollback = async () => {
    if (!jobId) return
    await rollbackDeploy.mutateAsync({
      jobId,
      requestedBy: 'map2-ui',
    })
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Deploy Tesira Chain</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {!sagevue?.enabled && (
            <Alert severity="warning">SageVue integration is disabled in backend config.</Alert>
          )}

          {sagevue?.enabled && !sagevue.healthy && (
            <Alert severity="warning">SageVue is enabled but not healthy: {sagevue.detail || 'unknown error'}</Alert>
          )}

          <FormControl fullWidth size="small" disabled={layoutsLoading || options.length === 0}>
            <InputLabel id="tesira-layout-select-label">Layout</InputLabel>
            <Select
              labelId="tesira-layout-select-label"
              value={selected}
              label="Layout"
              onChange={(event) => setSelected(event.target.value)}
            >
              {options.map((layout) => {
                const value = `${layout.layout_id}@${layout.version}`
                return (
                  <MenuItem key={value} value={value}>
                    {layout.name} ({layout.layout_id} v{layout.version})
                  </MenuItem>
                )
              })}
            </Select>
          </FormControl>

          <FormControlLabel
            control={<Switch checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} />}
            label="Dry Run"
          />

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              onClick={handleStart}
              disabled={!selectedLayout || startDeploy.isPending}
            >
              {startDeploy.isPending ? 'Starting…' : 'Start Deployment'}
            </Button>
            {jobId && <Chip size="small" label={`Job ${jobId}`} />}
            {status && <Chip size="small" color={status === 'failed' ? 'error' : status === 'succeeded' ? 'success' : 'default'} label={status} />}
            {canRollback && (
              <Button variant="outlined" color="warning" onClick={handleRollback} disabled={rollbackDeploy.isPending}>
                {rollbackDeploy.isPending ? 'Rolling back…' : 'Rollback'}
              </Button>
            )}
          </Box>

          {startDeploy.error && <Alert severity="error">{startDeploy.error.message}</Alert>}
          {rollbackDeploy.error && <Alert severity="error">{rollbackDeploy.error.message}</Alert>}
          {deployment.error && <Alert severity="error">{deployment.error.message}</Alert>}

          {deployment.data && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Deployment Timeline</Typography>
              <List dense sx={{ maxHeight: 260, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                {deployment.data.events.map((event) => (
                  <ListItem key={`${event.sequence}-${event.stage}`} divider>
                    <ListItemText
                      primary={`${event.sequence}. ${event.stage} · ${event.status}`}
                      secondary={`${event.message}${event.created_at ? ` · ${event.created_at}` : ''}`}
                    />
                  </ListItem>
                ))}
                {deployment.data.events.length === 0 && (
                  <ListItem>
                    <ListItemText primary="No events yet" />
                  </ListItem>
                )}
              </List>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
