import React, { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material'
import { useTesiraLayouts } from '../hooks/useTesiraApi'
import { tesiraApi } from '../../../../map2/api'

interface TesiraDeployDialogProps {
  deviceId: string
  open: boolean
  onClose: () => void
}

export function TesiraDeployDialog({ deviceId, open, onClose }: TesiraDeployDialogProps) {
  const { data: layouts, isLoading: layoutsLoading } = useTesiraLayouts({ includeInactive: false })

  const options = useMemo(() => layouts?.layouts ?? [], [layouts])
  const [selected, setSelected] = useState<string>('')

  const selectedLayout = useMemo(() => {
    if (!selected) return null
    const [layoutId, version] = selected.split('@')
    return options.find((layout) => layout.layout_id === layoutId && layout.version === version) ?? null
  }, [options, selected])

  const manualPackageUrl = selectedLayout
    ? tesiraApi.getLayoutManualPackageDownloadUrl(selectedLayout.layout_id, selectedLayout.version, deviceId)
    : ''

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Manual SageVue Deployment Package</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info">
            MAP2 direct SageVue deployment is disabled. Download the package and upload the TMF in SageVue manually.
          </Alert>

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

          {selectedLayout && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Package Contents</Typography>
              <List dense sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <ListItem divider>
                  <ListItemText
                    primary={`${selectedLayout.layout_id}_${selectedLayout.version}.tmf`}
                    secondary="Required by SageVue. Included when artifact_uri points to a local TMF file."
                  />
                </ListItem>
                <ListItem divider>
                  <ListItemText
                    primary={`${selectedLayout.layout_id}_${selectedLayout.version}.manifest.json`}
                    secondary="MAP2 compatibility metadata and checksum reference."
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="README_UPLOAD_TO_SAGEVUE.md"
                    secondary="Step-by-step manual upload instructions."
                  />
                </ListItem>
              </List>
            </Box>
          )}

          <Typography variant="subtitle2">Manual Upload Steps</Typography>
          <List dense sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            <ListItem divider>
              <ListItemText primary="1. Download the manual package ZIP." />
            </ListItem>
            <ListItem divider>
              <ListItemText primary="2. In SageVue, open Tesira Layouts and upload the included TMF." />
            </ListItem>
            <ListItem divider>
              <ListItemText primary="3. Deploy the uploaded layout to the target Tesira device(s)." />
            </ListItem>
            <ListItem>
              <ListItemText primary="4. Return to MAP2 and verify connectivity, AVB streams, and PTP." />
            </ListItem>
          </List>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              component="a"
              href={manualPackageUrl || undefined}
              disabled={!selectedLayout}
            >
              Download Manual Package
            </Button>
            <Button
              variant="text"
              component="a"
              href="https://sagevue-help.biamp.com/Tesira_Layouts.htm"
              target="_blank"
              rel="noreferrer"
            >
              SageVue Upload Guide
            </Button>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
