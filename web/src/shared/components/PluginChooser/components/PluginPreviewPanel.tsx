// ============================================================================
// PluginChooser - Plugin Preview Panel
// Right-side drawer showing detailed plugin information
// ============================================================================

import {
  Box,
  Typography,
  Divider,
  IconButton,
  Link,
  Stack,
  Chip,
  Button,
  List,
  ListItem,
  ListItemText,
  Tooltip,
} from '@mui/material'
import {
  Close as CloseIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  Add as AddIcon,
  OpenInNew as OpenInNewIcon,
  Tune as TuneIcon,
} from '@mui/icons-material'
import { usePluginChooser } from '../PluginChooserContext'
import PluginFormatBadge from './PluginFormatBadge'
import PluginIOIndicator from './PluginIOIndicator'
import { LegacyPluginIcon } from './LegacyPluginIcon'

interface PluginPreviewPanelProps {
  onAdd?: (uri: string) => void
  onClose?: () => void
}

export function PluginPreviewPanel({ onAdd, onClose }: PluginPreviewPanelProps) {
  const { state, selectedPlugin, toggleFavorite, togglePreviewPanel, recordUsage } =
    usePluginChooser()

  if (!state.previewPanelOpen) {
    return null
  }

  const handleAdd = () => {
    if (selectedPlugin) {
      recordUsage(selectedPlugin.uri)
      onAdd?.(selectedPlugin.uri)
    }
  }

  const handleClose = () => {
    onClose?.()
    togglePreviewPanel()
  }

  if (!selectedPlugin) {
    return (
      <Box
        sx={{
          width: 300,
          flexShrink: 0,
          borderLeft: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.paper',
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            p: 1.5,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant="subtitle2">Plugin Details</Typography>
          <IconButton size="small" onClick={handleClose}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>

        {/* Empty state */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: 3,
          }}
        >
          <Typography variant="body2" color="text.secondary" textAlign="center">
            Select a plugin to see details
          </Typography>
        </Box>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        width: 300,
        flexShrink: 0,
        borderLeft: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="subtitle2">Plugin Details</Typography>
        <IconButton size="small" onClick={handleClose}>
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      {/* Content */}
      <Box sx={{ p: 2 }}>
        {/* Plugin header */}
        <Stack direction="row" spacing={1.5} alignItems="flex-start" mb={2}>
          <Box sx={{ flexShrink: 0 }}>
            <LegacyPluginIcon pluginType={selectedPlugin.pluginType} size={40} opacity={0.9} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" alignItems="center" spacing={0.5} mb={0.5}>
              <Typography variant="subtitle1" fontWeight={600} noWrap>
                {selectedPlugin.name}
              </Typography>
              <PluginFormatBadge format={selectedPlugin.format} size="small" />
            </Stack>

            {/* Author */}
            {selectedPlugin.authorHomepage ? (
              <Link
                href={selectedPlugin.authorHomepage}
                target="_blank"
                rel="noopener"
                sx={{
                  fontSize: '0.8rem',
                  color: 'text.secondary',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  '&:hover': { color: 'primary.main' },
                }}
              >
                by {selectedPlugin.authorName}
                <OpenInNewIcon sx={{ fontSize: 12 }} />
              </Link>
            ) : (
              <Typography variant="body2" color="text.secondary">
                by {selectedPlugin.authorName}
              </Typography>
            )}
          </Box>

          {/* Favorite button */}
          <IconButton
            size="small"
            onClick={() => toggleFavorite(selectedPlugin.uri)}
            sx={{
              color: selectedPlugin.isFavorite ? 'warning.main' : 'text.disabled',
              '&:hover': { color: 'warning.main' },
            }}
          >
            {selectedPlugin.isFavorite ? (
              <StarIcon sx={{ fontSize: 24 }} />
            ) : (
              <StarBorderIcon sx={{ fontSize: 24 }} />
            )}
          </IconButton>
        </Stack>

        <Divider sx={{ mb: 2 }} />

        {/* Category */}
        <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
          Category
        </Typography>
        <Typography variant="body2" mb={2}>
          {selectedPlugin.category}
        </Typography>

        {/* I/O Configuration */}
        <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
          Audio Configuration
        </Typography>
        <Box mb={2}>
          <PluginIOIndicator
            audioInputs={selectedPlugin.audioInputs}
            audioOutputs={selectedPlugin.audioOutputs}
            hasMidiInput={selectedPlugin.hasMidiInput}
            hasMidiOutput={selectedPlugin.hasMidiOutput}
          />
        </Box>

        {/* Features */}
        <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
          Features
        </Typography>
        <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5} mb={2}>
          {selectedPlugin.isStereo && (
            <Chip label="Stereo" size="small" color="success" sx={{ height: 20 }} />
          )}
          {selectedPlugin.hasMidiInput && (
            <Chip label="MIDI In" size="small" sx={{ height: 20, bgcolor: 'secondary.main', color: 'secondary.contrastText' }} />
          )}
          {selectedPlugin.hasMidiOutput && (
            <Chip label="MIDI Out" size="small" sx={{ height: 20, bgcolor: 'secondary.main', color: 'secondary.contrastText' }} />
          )}
          {selectedPlugin.hasUi && (
            <Chip label="Custom UI" size="small" color="info" sx={{ height: 20 }} />
          )}
        </Stack>

        {/* Tags */}
        {selectedPlugin.tags.length > 0 && (
          <>
            <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
              Tags
            </Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5} mb={2}>
              {selectedPlugin.tags.map(tag => (
                <Chip key={tag} label={tag} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
              ))}
            </Stack>
          </>
        )}

        {/* Version / License */}
        {(selectedPlugin.version || selectedPlugin.license) && (
          <>
            <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
              Metadata
            </Typography>
            <Stack spacing={0.5} mb={2}>
              {selectedPlugin.version && (
                <Typography variant="caption">Version: {selectedPlugin.version}</Typography>
              )}
              {selectedPlugin.license && (
                <Typography variant="caption">License: {selectedPlugin.license}</Typography>
              )}
            </Stack>
          </>
        )}

        {/* Parameters */}
        <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <TuneIcon sx={{ fontSize: 14 }} />
            <span>Parameters ({selectedPlugin.parameterCount})</span>
          </Stack>
        </Typography>
        {selectedPlugin.topParameters.length > 0 ? (
          <List dense disablePadding sx={{ mb: 2 }}>
            {selectedPlugin.topParameters.map((param, i) => (
              <ListItem key={i} disablePadding sx={{ py: 0.25 }}>
                <ListItemText
                  primary={param.name}
                  secondary={`${param.minValue} - ${param.maxValue}${param.unit ? ` ${param.unit}` : ''}`}
                  primaryTypographyProps={{ fontSize: '0.75rem' }}
                  secondaryTypographyProps={{ fontSize: '0.65rem' }}
                />
              </ListItem>
            ))}
            {selectedPlugin.parameterCount > 3 && (
              <ListItem disablePadding sx={{ py: 0.25 }}>
                <ListItemText
                  primary={`... and ${selectedPlugin.parameterCount - 3} more`}
                  primaryTypographyProps={{ fontSize: '0.7rem', color: 'text.disabled' }}
                />
              </ListItem>
            )}
          </List>
        ) : (
          <Typography variant="body2" color="text.disabled" mb={2}>
            No parameters
          </Typography>
        )}

        {/* Description */}
        {selectedPlugin.description && (
          <>
            <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
              Description
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
              {selectedPlugin.description}
            </Typography>
          </>
        )}
      </Box>

      {/* Actions */}
      <Box
        sx={{
          mt: 'auto',
          p: 2,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.default',
        }}
      >
        <Button
          fullWidth
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAdd}
          size="large"
        >
          Add to Chain
        </Button>
      </Box>
    </Box>
  )
}

export default PluginPreviewPanel
