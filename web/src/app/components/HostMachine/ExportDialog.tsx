/**
 * Export Data Dialog Component - Modal for exporting metrics and alerts
 * Supports CSV and PDF formats with date range filtering
 */

import { useState, useCallback } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormControl,
  FormLabel,
  TextField,
  Checkbox,
  Stack,
  Alert,
} from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import type { HistoricalMetric } from '@/app/hooks/useHealthMonitoring'
import type { StoredAlert } from '@/app/hooks/useLocalStorage'
import { useExportData } from '@/app/hooks/useExportData'

export interface ExportDialogProps {
  open: boolean
  onClose: () => void
  metrics: HistoricalMetric[]
  alerts: StoredAlert[]
}

export default function ExportDialog({ open, onClose, metrics, alerts }: ExportDialogProps) {
  const { exportMetricsAndAlerts } = useExportData()
  const [format, setFormat] = useState<'csv' | 'pdf'>('csv')
  const [includeMetrics, setIncludeMetrics] = useState(true)
  const [includeAlerts, setIncludeAlerts] = useState(true)
  const [useDateRange, setUseDateRange] = useState<boolean>(false)
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [filename, setFilename] = useState<string>('')
  const [isExporting, setIsExporting] = useState<boolean>(false)

  const handleExport = useCallback(async () => {
    setIsExporting(true)
    try {
      const start = useDateRange && startDate ? new Date(startDate) : undefined
      const end = useDateRange && endDate ? new Date(endDate) : undefined

      exportMetricsAndAlerts(metrics, alerts, {
        format,
        includeMetrics,
        includeAlerts,
        startDate: start,
        endDate: end,
        filename: filename || undefined,
      })

      onClose()
    } catch (error) {
      console.error('Export failed:', error)
    } finally {
      setIsExporting(false)
    }
  }, [
    format,
    includeMetrics,
    includeAlerts,
    useDateRange,
    startDate,
    endDate,
    filename,
    metrics,
    alerts,
    exportMetricsAndAlerts,
    onClose,
  ])

  const isValid = includeMetrics || includeAlerts

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>📥 Export Data</DialogTitle>
      <DialogContent sx={{ pt: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Format Selection */}
        <FormControl component="fieldset">
          <FormLabel component="legend" sx={{ fontWeight: 600, mb: 1 }}>
            Export Format
          </FormLabel>
          <RadioGroup
            value={format}
            onChange={(e) => setFormat(e.target.value as 'csv' | 'pdf')}
          >
            <FormControlLabel
              value="csv"
              control={<Radio />}
              label={
                <Box>
                  <Typography sx={{ fontWeight: 500 }}>CSV (Spreadsheet)</Typography>
                  <Typography sx={{ fontSize: 12, color: '#666' }}>
                    Compatible with Excel, Google Sheets, etc.
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              value="pdf"
              control={<Radio />}
              label={
                <Box>
                  <Typography sx={{ fontWeight: 500 }}>PDF (Print-friendly)</Typography>
                  <Typography sx={{ fontSize: 12, color: '#666' }}>
                    Formatted report with charts and summary
                  </Typography>
                </Box>
              }
            />
          </RadioGroup>
        </FormControl>

        {/* Data Selection */}
        <FormControl component="fieldset">
          <FormLabel component="legend" sx={{ fontWeight: 600, mb: 1 }}>
            Include Data
          </FormLabel>
          <Stack sx={{ gap: 1 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={includeMetrics}
                  onChange={(e) => setIncludeMetrics(e.target.checked)}
                />
              }
              label={
                <Box>
                  <Typography sx={{ fontWeight: 500 }}>
                    📊 Metrics ({metrics.length} records)
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: '#666' }}>
                    Temperature, CPU, Memory historical data
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={includeAlerts}
                  onChange={(e) => setIncludeAlerts(e.target.checked)}
                />
              }
              label={
                <Box>
                  <Typography sx={{ fontWeight: 500 }}>
                    🚨 Alerts ({alerts.length} records)
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: '#666' }}>
                    Alert history with timestamps and severity
                  </Typography>
                </Box>
              }
            />
          </Stack>
        </FormControl>

        {!isValid && (
          <Alert severity="warning">
            Please select at least one data type to export
          </Alert>
        )}

        {/* Date Range */}
        <FormControl component="fieldset">
          <FormControlLabel
            control={
              <Checkbox
                checked={useDateRange}
                onChange={(e) => setUseeDateRange(e.target.checked)}
              />
            }
            label={
              <Typography sx={{ fontWeight: 600 }}>Filter by Date Range</Typography>
            }
          />
        </FormControl>

        {useDateRange && (
          <Stack sx={{ gap: 2, pl: 3 }}>
            <TextField
              label="Start Date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
            />
            <TextField
              label="End Date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
            />
          </Stack>
        )}

        {/* Filename */}
        <TextField
          label="Filename (optional)"
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          placeholder={`host-machine-${new Date().toISOString().split('T')[0]}.${format}`}
          size="small"
          fullWidth
          helperText="Leave blank for auto-generated filename"
        />

        {/* Summary */}
        <Box sx={{ p: 2, backgroundColor: '#f3f4f6', borderRadius: 1 }}>
          <Typography sx={{ fontWeight: 600, fontSize: 12, mb: 1, color: '#666' }}>
            📋 Export Summary
          </Typography>
          <Stack sx={{ gap: 0.5, fontSize: 12, color: '#666' }}>
            <Typography>Format: {format.toUpperCase()}</Typography>
            {includeMetrics && <Typography>Metrics: {metrics.length} records</Typography>}
            {includeAlerts && <Typography>Alerts: {alerts.length} records</Typography>}
            {useDateRange && startDate && (
              <Typography>Date Range: {startDate} to {endDate || 'Now'}</Typography>
            )}
          </Stack>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={isExporting}>
          Cancel
        </Button>
        <Button
          onClick={handleExport}
          variant="contained"
          startIcon={<DownloadIcon />}
          disabled={!isValid || isExporting}
          sx={{
            backgroundColor: '#10b981',
            '&:hover': { backgroundColor: '#059669' },
          }}
        >
          {isExporting ? 'Exporting...' : 'Export'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
