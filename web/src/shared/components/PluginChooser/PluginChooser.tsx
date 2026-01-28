// ============================================================================
// PluginChooser - Main Component
// Unified plugin selection interface for MAP2 Audio Platform
// ============================================================================

import { useState, useCallback, useEffect } from 'react'
import {
  Box,
  Dialog,
  DialogContent,
  Drawer,
  IconButton,
  Slide,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import { TransitionProps } from '@mui/material/transitions'
import { Close as CloseIcon } from '@mui/icons-material'
import { PluginChooserProvider, usePluginChooser } from './PluginChooserContext'
import { PluginChooserProps, UnifiedPlugin, ChooserMode } from './types'
import PluginChooserHeader from './components/PluginChooserHeader'
import CategorySidebar from './components/CategorySidebar'
import PluginGrid from './components/PluginGrid'
import PluginPreviewPanel from './components/PluginPreviewPanel'
import QuickAddButtons from './components/QuickAddButtons'
import React from 'react'

// Slide transition for dialog
const SlideTransition = React.forwardRef(function Transition(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />
})

interface PluginChooserWithDataProps extends PluginChooserProps {
  plugins: UnifiedPlugin[]
  onPluginsChange?: (plugins: UnifiedPlugin[]) => void
}

/**
 * PluginChooser with data - use this when you have plugins data
 */
export function PluginChooserWithData({
  plugins,
  onPluginsChange,
  ...props
}: PluginChooserWithDataProps) {
  return (
    <PluginChooserProvider plugins={plugins} onPluginsChange={onPluginsChange}>
      <PluginChooserInner {...props} />
    </PluginChooserProvider>
  )
}

/**
 * Inner component that uses the context
 */
function PluginChooserInner({
  mode = 'dialog',
  open,
  onClose,
  onSelect,
  showQuickAdd = true,
  showPreviewPanel = true,
  allowDragDrop = true,
  pinned = false,
}: PluginChooserProps) {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const { toggleSidebar, togglePreviewPanel, state } = usePluginChooser()

  // Handle plugin selection
  const handleAdd = useCallback(
    (uri: string) => {
      onSelect(uri)
      if (!pinned) {
        onClose()
      }
    },
    [onSelect, onClose, pinned]
  )

  // Handle drag start for plugins
  const handleDragStart = useCallback(
    (e: React.DragEvent, plugin: UnifiedPlugin) => {
      e.dataTransfer.setData('application/reactflow', JSON.stringify({
        type: 'audioPlugin',
        pluginUri: plugin.uri,
        pluginName: plugin.name,
      }))
      e.dataTransfer.effectAllowed = 'copy'
    },
    []
  )

  // Quick add handlers
  const handleAddNAM = useCallback(() => {
    onSelect('urn:map2:nam-player')
    if (!pinned) onClose()
  }, [onSelect, onClose, pinned])

  const handleAddCabinetIR = useCallback(() => {
    onSelect('urn:map2:ir-cabinet')
    if (!pinned) onClose()
  }, [onSelect, onClose, pinned])

  const handleAddReverbIR = useCallback(() => {
    onSelect('urn:map2:ir-reverb')
    if (!pinned) onClose()
  }, [onSelect, onClose, pinned])

  // Keyboard handling
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  const content = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: 'background.default',
      }}
    >
      {/* Header */}
      <PluginChooserHeader
        title="Select Plugin"
        showPreviewToggle={showPreviewPanel}
      />

      {/* Quick add buttons */}
      {showQuickAdd && (
        <QuickAddButtons
          onAddNAM={handleAddNAM}
          onAddCabinetIR={handleAddCabinetIR}
          onAddReverbIR={handleAddReverbIR}
        />
      )}

      {/* Main content area */}
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Category sidebar */}
        {!isMobile && (
          <CategorySidebar onCollapse={toggleSidebar} />
        )}

        {/* Plugin grid */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <PluginGrid
            onAdd={handleAdd}
            onDragStart={allowDragDrop ? handleDragStart : undefined}
            draggable={allowDragDrop}
          />
        </Box>

        {/* Preview panel */}
        {showPreviewPanel && !isMobile && (
          <PluginPreviewPanel onAdd={handleAdd} />
        )}
      </Box>
    </Box>
  )

  // Render based on mode
  if (mode === 'dialog') {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        fullScreen={isMobile}
        maxWidth="xl"
        fullWidth
        TransitionComponent={SlideTransition}
        PaperProps={{
          sx: {
            height: isMobile ? '100%' : '85vh',
            maxHeight: isMobile ? '100%' : '900px',
          },
        }}
      >
        <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Close button for mobile */}
          {isMobile && (
            <IconButton
              onClick={onClose}
              sx={{
                position: 'absolute',
                right: 8,
                top: 8,
                zIndex: 1,
              }}
            >
              <CloseIcon />
            </IconButton>
          )}
          {content}
        </DialogContent>
      </Dialog>
    )
  }

  if (mode === 'panel') {
    return (
      <Drawer
        anchor="right"
        open={open}
        onClose={onClose}
        variant="persistent"
        sx={{
          '& .MuiDrawer-paper': {
            width: isMobile ? '100%' : 600,
            boxSizing: 'border-box',
          },
        }}
      >
        {content}
      </Drawer>
    )
  }

  // Floating mode - rendered inline
  if (mode === 'floating') {
    if (!open) return null

    return (
      <Box
        sx={{
          position: 'fixed',
          right: 16,
          top: 80,
          width: 800,
          height: 600,
          zIndex: theme.zIndex.modal,
          borderRadius: 2,
          overflow: 'hidden',
          boxShadow: 24,
          border: 1,
          borderColor: 'divider',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            p: 0.5,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            cursor: 'move',
          }}
        >
          <IconButton size="small" onClick={onClose}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
        {content}
      </Box>
    )
  }

  return null
}

export default PluginChooserWithData
