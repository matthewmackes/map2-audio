// ============================================================================
// PluginChooser - Plugin Card Component
// Rich visual card for plugins with metadata, icons, and expandable details
// ============================================================================

import { memo, MouseEvent, useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  IconButton,
  Stack,
  Chip,
  Tooltip,
  Link,
  Collapse,
  Divider,
  Button,
} from '@mui/material'
import {
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  Add as AddIcon,
  DragIndicator as DragIcon,
  Tune as TuneIcon,
  OpenInNew as OpenInNewIcon,
  ExpandMore as ExpandMoreIcon,
  ContentCopy as CopyIcon,
  Info as InfoIcon,
} from '@mui/icons-material'
import { UnifiedPlugin } from '../types'
import PluginFormatBadge from './PluginFormatBadge'
import { PluginIOBadge } from './PluginIOIndicator'
import PluginIcon from '../../../../pipedal/PluginIcon'
import { getPluginDescription } from '../utils/pluginDescriptions'

interface PluginCardProps {
  plugin: UnifiedPlugin
  selected?: boolean
  onSelect?: (uri: string) => void
  onAdd?: (uri: string) => void
  onToggleFavorite?: (uri: string) => void
  onDragStart?: (e: React.DragEvent, plugin: UnifiedPlugin) => void
  compact?: boolean
  draggable?: boolean
}

export const PluginCard = memo(function PluginCard({
  plugin,
  selected = false,
  onSelect,
  onAdd,
  onToggleFavorite,
  onDragStart,
  compact = false,
  draggable = true,
}: PluginCardProps) {
  const [expanded, setExpanded] = useState(false)

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation()
    onSelect?.(plugin.uri)
  }

  const handleDoubleClick = (e: MouseEvent) => {
    e.stopPropagation()
    onAdd?.(plugin.uri)
  }

  const handleAddClick = (e: MouseEvent) => {
    e.stopPropagation()
    onAdd?.(plugin.uri)
  }

  const handleFavoriteClick = (e: MouseEvent) => {
    e.stopPropagation()
    onToggleFavorite?.(plugin.uri)
  }

  const handleDragStart = (e: React.DragEvent) => {
    onDragStart?.(e, plugin)
  }

  const handleExpandClick = (e: MouseEvent) => {
    e.stopPropagation()
    setExpanded(!expanded)
  }

  const handleCopyUri = (e: MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(plugin.uri)
  }

  if (compact) {
    return (
      <CompactPluginCard
        plugin={plugin}
        selected={selected}
        onSelect={onSelect}
        onAdd={onAdd}
        onToggleFavorite={onToggleFavorite}
        onDragStart={onDragStart}
        draggable={draggable}
      />
    )
  }

  return (
    <Card
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      draggable={draggable}
      onDragStart={handleDragStart}
      sx={{
        cursor: draggable ? 'grab' : 'pointer',
        border: 2,
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'action.selected' : 'background.paper',
        transition: 'all 0.15s ease',
        '&:hover': {
          borderColor: 'primary.light',
          boxShadow: 4,
          transform: 'translateY(-1px)',
        },
        '&:active': {
          cursor: draggable ? 'grabbing' : 'pointer',
        },
      }}
    >
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        {/* Header: Icon + Name + Format + Favorite */}
        <Stack direction="row" spacing={1} alignItems="flex-start" mb={1}>
          {/* Drag indicator */}
          {draggable && (
            <DragIcon
              sx={{
                fontSize: 16,
                color: 'text.disabled',
                mt: 0.25,
                flexShrink: 0,
              }}
            />
          )}

          {/* Plugin icon */}
          <Box sx={{ flexShrink: 0, mt: 0.25 }}>
            <PluginIcon pluginType={plugin.pluginType} size={20} opacity={0.8} />
          </Box>

          {/* Name and format */}
          <Box sx={{ flexGrow: 1, minWidth: 0, overflow: 'hidden' }}>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Typography
                variant="subtitle2"
                fontWeight={600}
                noWrap
                sx={{ flexShrink: 1, minWidth: 0 }}
              >
                {plugin.name}
              </Typography>
              <PluginFormatBadge format={plugin.format} size="small" />
            </Stack>

            {/* Author */}
            {plugin.authorHomepage ? (
              <Link
                href={plugin.authorHomepage}
                target="_blank"
                rel="noopener"
                onClick={(e) => e.stopPropagation()}
                sx={{
                  fontSize: '0.7rem',
                  color: 'text.secondary',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.25,
                  '&:hover': { color: 'primary.main' },
                }}
              >
                {plugin.authorName}
                <OpenInNewIcon sx={{ fontSize: 10 }} />
              </Link>
            ) : (
              <Typography variant="caption" color="text.secondary" noWrap>
                {plugin.authorName}
              </Typography>
            )}
          </Box>

          {/* Favorite button */}
          <IconButton
            size="small"
            onClick={handleFavoriteClick}
            sx={{
              p: 0.25,
              color: plugin.isFavorite ? '#F59E0B' : 'text.disabled',
              '&:hover': { color: '#F59E0B' },
            }}
          >
            {plugin.isFavorite ? (
              <StarIcon sx={{ fontSize: 18 }} />
            ) : (
              <StarBorderIcon sx={{ fontSize: 18 }} />
            )}
          </IconButton>
        </Stack>

        {/* Category pill */}
        <Chip
          label={plugin.category}
          size="small"
          sx={{
            height: 18,
            fontSize: '0.6rem',
            mb: 0.75,
            bgcolor: 'action.selected',
            '& .MuiChip-label': { px: 0.75 },
          }}
        />

        <Divider sx={{ my: 0.75 }} />

        {/* I/O and features badges */}
        <Stack direction="row" spacing={0.5} alignItems="center" mb={1} flexWrap="wrap" gap={0.5}>
          <Chip
            icon={<TuneIcon sx={{ fontSize: '0.7rem !important' }} />}
            label={`${plugin.parameterCount} params`}
            size="small"
            sx={{
              height: 18,
              fontSize: '0.55rem',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              '& .MuiChip-label': { px: 0.5 },
              '& .MuiChip-icon': { ml: 0.25, mr: -0.25, color: 'inherit' },
            }}
          />
          <PluginIOBadge
            audioInputs={plugin.audioInputs}
            audioOutputs={plugin.audioOutputs}
          />
          {plugin.version && (
            <Chip
              label={`v${plugin.version}`}
              size="small"
              sx={{
                height: 18,
                fontSize: '0.55rem',
                bgcolor: 'warning.main',
                color: 'warning.contrastText',
                '& .MuiChip-label': { px: 0.5 },
              }}
            />
          )}
        </Stack>

        {/* Feature badges row */}
        <Stack direction="row" spacing={0.5} alignItems="center" mb={1} flexWrap="wrap" gap={0.5}>
          {plugin.isStereo && (
            <Chip
              label="Stereo"
              size="small"
              sx={{
                height: 16,
                fontSize: '0.55rem',
                bgcolor: 'success.dark',
                color: 'success.contrastText',
                '& .MuiChip-label': { px: 0.5 },
              }}
            />
          )}
          {(plugin.hasMidiInput || plugin.hasMidiOutput) && (
            <Chip
              label="MIDI"
              size="small"
              sx={{
                height: 16,
                fontSize: '0.55rem',
                bgcolor: '#F472B6',
                color: 'white',
                '& .MuiChip-label': { px: 0.5 },
              }}
            />
          )}
          {plugin.hasUi && (
            <Chip
              label="UI"
              size="small"
              sx={{
                height: 16,
                fontSize: '0.55rem',
                bgcolor: 'info.dark',
                color: 'info.contrastText',
                '& .MuiChip-label': { px: 0.5 },
              }}
            />
          )}
        </Stack>

        {/* Technical Details Toggle */}
        <Button
          size="small"
          onClick={handleExpandClick}
          startIcon={<InfoIcon sx={{ fontSize: 14 }} />}
          endIcon={
            <ExpandMoreIcon
              sx={{
                fontSize: 14,
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            />
          }
          sx={{
            textTransform: 'none',
            fontSize: '0.65rem',
            color: 'text.secondary',
            py: 0.25,
            px: 0.5,
            minWidth: 'auto',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          Technical Details
        </Button>

        {/* Expandable Details Section */}
        <Collapse in={expanded}>
          <Box
            sx={{
              mt: 1,
              pt: 1,
              borderTop: 1,
              borderColor: 'divider',
              fontSize: '0.7rem',
            }}
          >
            {/* Plugin Description and Function */}
            {(() => {
              const info = getPluginDescription(plugin.name, plugin.displayType, plugin.category)
              return (
                <>
                  {info.description && (
                    <Box mb={0.75}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                        Description
                      </Typography>
                      <Typography variant="caption" color="text.primary" sx={{ display: 'block', mt: 0.25 }}>
                        {info.description}
                      </Typography>
                    </Box>
                  )}

                  {info.function && (
                    <Box mb={0.75}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                        Function
                      </Typography>
                      <Typography variant="caption" color="text.primary" sx={{ display: 'block', mt: 0.25 }}>
                        {info.function}
                      </Typography>
                    </Box>
                  )}

                  {info.tips && (
                    <Box
                      mb={0.75}
                      sx={{
                        p: 0.5,
                        bgcolor: 'info.lighter',
                        borderRadius: 0.5,
                        borderLeft: 2,
                        borderColor: 'info.main',
                      }}
                    >
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                        💡 Pro Tip
                      </Typography>
                      <Typography variant="caption" color="text.primary" sx={{ display: 'block', mt: 0.25 }}>
                        {info.tips}
                      </Typography>
                    </Box>
                  )}
                </>
              )
            })()}

            <Divider sx={{ my: 0.75 }} />
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                URI
              </Typography>
              <Tooltip title="Copy URI" arrow>
                <IconButton size="small" onClick={handleCopyUri} sx={{ p: 0.25 }}>
                  <CopyIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Tooltip>
            </Stack>
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                fontFamily: 'monospace',
                fontSize: '0.6rem',
                bgcolor: 'action.hover',
                p: 0.5,
                borderRadius: 0.5,
                wordBreak: 'break-all',
                mb: 1,
              }}
            >
              {plugin.uri}
            </Typography>

            {/* Version & License */}
            <Stack spacing={0.5} mb={1}>
              {plugin.version && (
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary">Version</Typography>
                  <Typography variant="caption">{plugin.version}</Typography>
                </Stack>
              )}
              {plugin.license && (
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary">License</Typography>
                  <Typography variant="caption">{plugin.license}</Typography>
                </Stack>
              )}
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">Has UI</Typography>
                <Typography variant="caption">{plugin.hasUi ? 'Yes' : 'No'}</Typography>
              </Stack>
            </Stack>

            {/* Parameters Preview */}
            {plugin.topParameters.length > 0 && (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, display: 'block', mb: 0.5 }}>
                  Parameters ({plugin.parameterCount})
                </Typography>
                <Stack spacing={0.25}>
                  {plugin.topParameters.slice(0, 5).map((param, idx) => (
                    <Stack key={idx} direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" sx={{ fontWeight: 500 }}>
                        {param.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                        {param.minValue} – {param.maxValue}
                        {param.defaultValue !== undefined && ` (${param.defaultValue})`}
                      </Typography>
                    </Stack>
                  ))}
                  {plugin.parameterCount > 5 && (
                    <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                      ...and {plugin.parameterCount - 5} more
                    </Typography>
                  )}
                </Stack>
              </>
            )}
          </Box>
        </Collapse>

        {/* Add button */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
          <Tooltip title="Add to chain (double-click card)" arrow>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon sx={{ fontSize: 14 }} />}
              onClick={handleAddClick}
              sx={{
                textTransform: 'none',
                fontSize: '0.7rem',
                py: 0.5,
                px: 1,
              }}
            >
              Add
            </Button>
          </Tooltip>
        </Box>
      </CardContent>
    </Card>
  )
})

/**
 * Compact version for list view
 */
function CompactPluginCard({
  plugin,
  selected,
  onSelect,
  onAdd,
  onToggleFavorite,
  onDragStart,
  draggable,
}: PluginCardProps) {
  const handleClick = (e: MouseEvent) => {
    e.stopPropagation()
    onSelect?.(plugin.uri)
  }

  const handleDoubleClick = (e: MouseEvent) => {
    e.stopPropagation()
    onAdd?.(plugin.uri)
  }

  return (
    <Box
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      draggable={draggable}
      onDragStart={(e) => onDragStart?.(e, plugin)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 1,
        cursor: draggable ? 'grab' : 'pointer',
        bgcolor: selected ? 'action.selected' : 'transparent',
        borderRadius: 1,
        borderBottom: 1,
        borderColor: 'divider',
        transition: 'background-color 0.15s',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {draggable && (
        <DragIcon sx={{ fontSize: 14, color: 'text.disabled', flexShrink: 0 }} />
      )}

      <PluginIcon pluginType={plugin.pluginType} size={18} opacity={0.7} />

      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Typography variant="body2" fontWeight={600} noWrap sx={{ flexShrink: 1 }}>
            {plugin.name}
          </Typography>
          <PluginFormatBadge format={plugin.format} size="small" />
        </Stack>
        <Typography variant="caption" color="text.secondary" noWrap>
          {plugin.authorName}
        </Typography>
      </Box>

      <Chip
        label={plugin.category}
        size="small"
        sx={{
          height: 18,
          fontSize: '0.6rem',
          bgcolor: 'action.selected',
          '& .MuiChip-label': { px: 0.5 },
        }}
      />

      <Chip
        label={`${plugin.parameterCount}`}
        size="small"
        icon={<TuneIcon sx={{ fontSize: '0.65rem !important' }} />}
        sx={{
          height: 18,
          fontSize: '0.6rem',
          '& .MuiChip-label': { px: 0.25 },
          '& .MuiChip-icon': { ml: 0.25 },
        }}
      />

      <PluginIOBadge
        audioInputs={plugin.audioInputs}
        audioOutputs={plugin.audioOutputs}
      />

      <IconButton
        size="small"
        onClick={(e) => {
          e.stopPropagation()
          onToggleFavorite?.(plugin.uri)
        }}
        sx={{ p: 0.25, color: plugin.isFavorite ? '#F59E0B' : 'text.disabled' }}
      >
        {plugin.isFavorite ? (
          <StarIcon sx={{ fontSize: 16 }} />
        ) : (
          <StarBorderIcon sx={{ fontSize: 16 }} />
        )}
      </IconButton>

      <IconButton
        size="small"
        onClick={(e) => {
          e.stopPropagation()
          onAdd?.(plugin.uri)
        }}
        sx={{
          p: 0.5,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          '&:hover': { bgcolor: 'primary.dark' },
        }}
      >
        <AddIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Box>
  )
}

export default PluginCard
