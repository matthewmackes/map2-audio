// ============================================================================
// PluginChooser - Plugin Grid
// Virtualized grid/list display using react-window
// ============================================================================

import { useCallback, CSSProperties } from 'react'
import { FixedSizeGrid, FixedSizeList } from 'react-window'
import AutoSizer from 'react-virtualized-auto-sizer'
import { Box, Typography } from '@mui/material'
import { usePluginChooser } from '../PluginChooserContext'
import { UnifiedPlugin } from '../types'
import PluginCard from './PluginCard'

interface PluginGridProps {
  onAdd?: (uri: string) => void
  onDragStart?: (e: React.DragEvent, plugin: UnifiedPlugin) => void
  draggable?: boolean
}

// Grid cell dimensions
const GRID_CELL_WIDTH = 280
const GRID_CELL_HEIGHT = 240
const GRID_GAP = 12

// List item height
const LIST_ITEM_HEIGHT = 48

export function PluginGrid({ onAdd, onDragStart, draggable = true }: PluginGridProps) {
  const {
    state,
    filteredPlugins,
    selectPlugin,
    toggleFavorite,
    recordUsage,
  } = usePluginChooser()

  const handleAdd = useCallback(
    (uri: string) => {
      recordUsage(uri)
      onAdd?.(uri)
    },
    [recordUsage, onAdd]
  )

  const handleSelect = useCallback(
    (uri: string) => {
      selectPlugin(uri)
    },
    [selectPlugin]
  )

  const handleToggleFavorite = useCallback(
    (uri: string) => {
      toggleFavorite(uri)
    },
    [toggleFavorite]
  )

  if (filteredPlugins.length === 0) {
    return (
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 2,
          p: 4,
        }}
      >
        <Typography variant="h6" color="text.secondary">
          No plugins found
        </Typography>
        <Typography variant="body2" color="text.disabled">
          Try adjusting your search or filters
        </Typography>
      </Box>
    )
  }

  if (state.viewMode === 'list') {
    return (
      <ListViewRenderer
        plugins={filteredPlugins}
        selectedUri={state.selectedPluginUri}
        onSelect={handleSelect}
        onAdd={handleAdd}
        onToggleFavorite={handleToggleFavorite}
        onDragStart={onDragStart}
        draggable={draggable}
      />
    )
  }

  return (
    <GridViewRenderer
      plugins={filteredPlugins}
      selectedUri={state.selectedPluginUri}
      onSelect={handleSelect}
      onAdd={handleAdd}
      onToggleFavorite={handleToggleFavorite}
      onDragStart={onDragStart}
      draggable={draggable}
    />
  )
}

/**
 * Grid view with virtualization
 */
function GridViewRenderer({
  plugins,
  selectedUri,
  onSelect,
  onAdd,
  onToggleFavorite,
  onDragStart,
  draggable,
}: {
  plugins: UnifiedPlugin[]
  selectedUri: string | null
  onSelect: (uri: string) => void
  onAdd: (uri: string) => void
  onToggleFavorite: (uri: string) => void
  onDragStart?: (e: React.DragEvent, plugin: UnifiedPlugin) => void
  draggable: boolean
}) {
  return (
    <Box sx={{ flex: 1, minHeight: 0 }}>
      <AutoSizer>
        {({ width, height }) => {
          if (!width || !height) return null

          const columnCount = Math.max(1, Math.floor((width - GRID_GAP) / (GRID_CELL_WIDTH + GRID_GAP)))
          const rowCount = Math.ceil(plugins.length / columnCount)
          const columnWidth = (width - GRID_GAP) / columnCount

          return (
            <FixedSizeGrid
              width={width}
              height={height}
              columnCount={columnCount}
              rowCount={rowCount}
              columnWidth={columnWidth}
              rowHeight={GRID_CELL_HEIGHT + GRID_GAP}
              overscanRowCount={2}
              itemData={{
                plugins,
                columnCount,
                selectedUri,
                onSelect,
                onAdd,
                onToggleFavorite,
                onDragStart,
                draggable,
              }}
            >
              {GridCell}
            </FixedSizeGrid>
          )
        }}
      </AutoSizer>
    </Box>
  )
}

/**
 * Grid cell renderer
 */
function GridCell({
  columnIndex,
  rowIndex,
  style,
  data,
}: {
  columnIndex: number
  rowIndex: number
  style: CSSProperties
  data: {
    plugins: UnifiedPlugin[]
    columnCount: number
    selectedUri: string | null
    onSelect: (uri: string) => void
    onAdd: (uri: string) => void
    onToggleFavorite: (uri: string) => void
    onDragStart?: (e: React.DragEvent, plugin: UnifiedPlugin) => void
    draggable: boolean
  }
}) {
  const index = rowIndex * data.columnCount + columnIndex
  if (index >= data.plugins.length) {
    return null
  }

  const plugin = data.plugins[index]

  return (
    <Box
      style={style}
      sx={{
        p: `${GRID_GAP / 2}px`,
        boxSizing: 'border-box',
      }}
    >
      <PluginCard
        plugin={plugin}
        selected={plugin.uri === data.selectedUri}
        onSelect={data.onSelect}
        onAdd={data.onAdd}
        onToggleFavorite={data.onToggleFavorite}
        onDragStart={data.onDragStart}
        draggable={data.draggable}
      />
    </Box>
  )
}

/**
 * List view with virtualization
 */
function ListViewRenderer({
  plugins,
  selectedUri,
  onSelect,
  onAdd,
  onToggleFavorite,
  onDragStart,
  draggable,
}: {
  plugins: UnifiedPlugin[]
  selectedUri: string | null
  onSelect: (uri: string) => void
  onAdd: (uri: string) => void
  onToggleFavorite: (uri: string) => void
  onDragStart?: (e: React.DragEvent, plugin: UnifiedPlugin) => void
  draggable: boolean
}) {
  return (
    <Box sx={{ flex: 1, minHeight: 0 }}>
      <AutoSizer>
        {({ width, height }) => {
          if (!width || !height) return null

          return (
            <FixedSizeList
              width={width}
              height={height}
              itemCount={plugins.length}
              itemSize={LIST_ITEM_HEIGHT}
              overscanCount={10}
              itemData={{
                plugins,
                selectedUri,
                onSelect,
                onAdd,
                onToggleFavorite,
                onDragStart,
                draggable,
              }}
            >
              {ListRow}
            </FixedSizeList>
          )
        }}
      </AutoSizer>
    </Box>
  )
}

/**
 * List row renderer
 */
function ListRow({
  index,
  style,
  data,
}: {
  index: number
  style: CSSProperties
  data: {
    plugins: UnifiedPlugin[]
    selectedUri: string | null
    onSelect: (uri: string) => void
    onAdd: (uri: string) => void
    onToggleFavorite: (uri: string) => void
    onDragStart?: (e: React.DragEvent, plugin: UnifiedPlugin) => void
    draggable: boolean
  }
}) {
  const plugin = data.plugins[index]

  return (
    <Box style={style}>
      <PluginCard
        plugin={plugin}
        selected={plugin.uri === data.selectedUri}
        onSelect={data.onSelect}
        onAdd={data.onAdd}
        onToggleFavorite={data.onToggleFavorite}
        onDragStart={data.onDragStart}
        draggable={data.draggable}
        compact
      />
    </Box>
  )
}

export default PluginGrid
