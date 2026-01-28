// ============================================================================
// PluginChooser - Quick Add Buttons
// Prominent buttons for NAM, Cabinet IR, Reverb IR
// ============================================================================

import { Box, Button, Stack, Tooltip, Typography } from '@mui/material'
import {
  MusicNote as NAMIcon,
  Speaker as CabinetIcon,
  Waves as ReverbIcon,
} from '@mui/icons-material'

interface QuickAddButtonsProps {
  onAddNAM?: () => void
  onAddCabinetIR?: () => void
  onAddReverbIR?: () => void
}

export function QuickAddButtons({
  onAddNAM,
  onAddCabinetIR,
  onAddReverbIR,
}: QuickAddButtonsProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1,
        p: 1,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'action.hover',
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'flex', alignItems: 'center', mr: 1 }}
      >
        Quick Add:
      </Typography>

      <Stack direction="row" spacing={1}>
        <Tooltip title="Add Neural Amp Modeler plugin" arrow>
          <Button
            variant="contained"
            size="small"
            startIcon={<NAMIcon />}
            onClick={onAddNAM}
            sx={{
              textTransform: 'none',
              bgcolor: '#10B981',
              '&:hover': { bgcolor: '#059669' },
            }}
          >
            NAM
          </Button>
        </Tooltip>

        <Tooltip title="Add Cabinet Impulse Response plugin" arrow>
          <Button
            variant="contained"
            size="small"
            startIcon={<CabinetIcon />}
            onClick={onAddCabinetIR}
            sx={{
              textTransform: 'none',
              bgcolor: '#6366F1',
              '&:hover': { bgcolor: '#4F46E5' },
            }}
          >
            Cabinet IR
          </Button>
        </Tooltip>

        <Tooltip title="Add Reverb Impulse Response plugin" arrow>
          <Button
            variant="contained"
            size="small"
            startIcon={<ReverbIcon />}
            onClick={onAddReverbIR}
            sx={{
              textTransform: 'none',
              bgcolor: '#8B5CF6',
              '&:hover': { bgcolor: '#7C3AED' },
            }}
          >
            Reverb IR
          </Button>
        </Tooltip>
      </Stack>
    </Box>
  )
}

export default QuickAddButtons
