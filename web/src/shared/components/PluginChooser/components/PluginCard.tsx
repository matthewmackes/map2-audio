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
import { alpha } from '@mui/material/styles'
import {
  Add,
  ChevronDown,
  Copy,
  Draggable,
  Favorite,
  FavoriteFilled,
  Information,
  Launch,
  SettingsAdjust,
} from '@carbon/icons-react'
import { UnifiedPlugin } from '../types'
import PluginFormatBadge from './PluginFormatBadge'
import { PluginIOBadge } from './PluginIOIndicator'
import { LegacyPluginIcon } from './LegacyPluginIcon'
import { getPluginDescription } from '../utils/pluginDescriptions'
import { getDisplayPluginName, sanitizeRestrictedDisplayText } from '../../../../map2/displayNames'

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
  const displayName = getDisplayPluginName(plugin.name, plugin.uri)
  const displayAuthor = sanitizeRestrictedDisplayText(plugin.authorName)

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

  const isHardware = plugin.format === 'hardware'

  return (
    <Card
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      draggable={draggable}
      onDragStart={handleDragStart}
      sx={{
        cursor: draggable ? 'grab' : 'pointer',
        border: 2,
        borderColor: selected ? 'primary.main' : isHardware ? 'warning.main' : 'divider',
        bgcolor: selected
          ? 'action.selected'
          : isHardware
            ? (theme) => alpha(theme.palette.warning.main, 0.06)
            : 'background.paper',
        transition: 'all 0.15s ease',
        '&:hover': {
          borderColor: isHardware ? 'warning.light' : 'primary.light',
          boxShadow: isHardware ? (theme) => `0 0 12px ${alpha(theme.palette.warning.main, 0.3)}` : 4,
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
            <Box
              component="span"
              sx={{
                color: 'text.disabled',
                mt: 0.25,
                flexShrink: 0,
                display: 'inline-flex',
              }}
            >
              <Draggable size={16} />
            </Box>
          )}

          {/* Plugin icon */}
          <Box sx={{ flexShrink: 0, mt: 0.25 }}>
            {isHardware ? (
              <img src="/img/fx_lexicon.svg" alt="Hardware" width={20} height={20} style={{ display: 'block' }} />
            ) : (
              <LegacyPluginIcon pluginType={plugin.pluginType} size={20} opacity={0.8} />
            )}
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
                {displayName}
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
                {displayAuthor}
                <Launch size={10} />
              </Link>
            ) : (
              <Typography variant="caption" color="text.secondary" noWrap>
                {displayAuthor}
              </Typography>
            )}
          </Box>

          {/* Favorite button */}
          <IconButton
            size="small"
            onClick={handleFavoriteClick}
          sx={{
            p: 0.25,
            color: plugin.isFavorite ? 'warning.main' : 'text.disabled',
            '&:hover': { color: 'warning.main' },
          }}
        >
            {plugin.isFavorite ? (
              <FavoriteFilled size={18} />
            ) : (
              <Favorite size={18} />
            )}
          </IconButton>
        </Stack>

        {/* Category pill */}
        <Chip
          label={isHardware ? 'Hardware Effect' : plugin.category}
          size="small"
          sx={{
            height: 18,
            fontSize: '0.6rem',
            mb: 0.75,
            bgcolor: isHardware ? (theme) => alpha(theme.palette.warning.main, 0.2) : 'action.selected',
            color: isHardware ? 'warning.main' : undefined,
            border: isHardware ? (theme) => `1px solid ${alpha(theme.palette.warning.main, 0.4)}` : undefined,
            '& .MuiChip-label': { px: 0.75 },
          }}
        />

        <Divider sx={{ my: 0.75 }} />

        {/* I/O and features badges */}
        <Stack direction="row" spacing={0.5} alignItems="center" mb={1} flexWrap="wrap" gap={0.5}>
          <Chip
            icon={<SettingsAdjust size={12} />}
            label={isHardware ? 'MPX1 Panel' : `${plugin.parameterCount} params`}
            size="small"
            sx={{
              height: 18,
              fontSize: '0.55rem',
              bgcolor: isHardware ? 'warning.main' : 'primary.main',
              color: isHardware ? 'warning.contrastText' : 'primary.contrastText',
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
                bgcolor: 'secondary.main',
                color: 'secondary.contrastText',
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
          startIcon={<Information size={14} />}
          endIcon={
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            >
              <ChevronDown size={14} />
            </Box>
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
                  <Copy size={12} />
                </IconButton>
              </Tooltip>
            </Stack>
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                fontFamily: 'var(--font-ui-tight)',
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
              startIcon={<Add size={14} />}
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
  const displayName = getDisplayPluginName(plugin.name, plugin.uri)
  const displayAuthor = sanitizeRestrictedDisplayText(plugin.authorName)

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation()
    onSelect?.(plugin.uri)
  }

  const handleDoubleClick = (e: MouseEvent) => {
    e.stopPropagation()
    onAdd?.(plugin.uri)
  }

  const isHardware = plugin.format === 'hardware'

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
        bgcolor: selected
          ? 'action.selected'
          : isHardware
            ? (theme) => alpha(theme.palette.warning.main, 0.06)
            : 'transparent',
        borderRadius: 1,
        borderBottom: 1,
        borderColor: isHardware ? (theme) => alpha(theme.palette.warning.main, 0.3) : 'divider',
        transition: 'background-color 0.15s',
        '&:hover': {
          bgcolor: isHardware ? (theme) => alpha(theme.palette.warning.main, 0.12) : 'action.hover',
        },
      }}
    >
      {draggable && (
        <Box component="span" sx={{ color: 'text.disabled', flexShrink: 0, display: 'inline-flex' }}>
          <Draggable size={14} />
        </Box>
      )}

      {isHardware ? (
        <img src="/img/fx_lexicon.svg" alt="Hardware" width={18} height={18} style={{ display: 'block', flexShrink: 0 }} />
      ) : (
        <LegacyPluginIcon pluginType={plugin.pluginType} size={18} opacity={0.7} />
      )}

      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Typography variant="body2" fontWeight={600} noWrap sx={{ flexShrink: 1 }}>
            {displayName}
          </Typography>
          <PluginFormatBadge format={plugin.format} size="small" />
        </Stack>
        <Typography variant="caption" color="text.secondary" noWrap>
          {displayAuthor}
        </Typography>
      </Box>

      <Chip
        label={isHardware ? 'Hardware Effect' : plugin.category}
        size="small"
        sx={{
          height: 18,
          fontSize: '0.6rem',
          bgcolor: isHardware ? (theme) => alpha(theme.palette.warning.main, 0.2) : 'action.selected',
          color: isHardware ? 'warning.main' : undefined,
          border: isHardware ? (theme) => `1px solid ${alpha(theme.palette.warning.main, 0.4)}` : undefined,
          '& .MuiChip-label': { px: 0.5 },
        }}
      />

      <Chip
        label={isHardware ? 'MPX1' : `${plugin.parameterCount}`}
        size="small"
        icon={<SettingsAdjust size={12} />}
        sx={{
          height: 18,
          fontSize: '0.6rem',
          bgcolor: isHardware ? 'warning.main' : undefined,
          color: isHardware ? 'warning.contrastText' : undefined,
          '& .MuiChip-label': { px: 0.25 },
          '& .MuiChip-icon': { ml: 0.25, color: isHardware ? 'warning.contrastText' : undefined },
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
        sx={{ p: 0.25, color: plugin.isFavorite ? 'warning.main' : 'text.disabled' }}
      >
        {plugin.isFavorite ? (
          <FavoriteFilled size={16} />
        ) : (
          <Favorite size={16} />
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
        <Add size={16} />
      </IconButton>
    </Box>
  )
}

export default PluginCard
