// ============================================================================
// MAP2 Audio Platform - MIDI Mappings Panel Component
// Table of all active MIDI CC mappings with edit/delete functionality
// ============================================================================

import { memo, useState, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  IconButton,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Slider,
  Switch,
  FormControlLabel,
  Alert,
  Collapse,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Piano as MidiIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
} from '@mui/icons-material';
import { useTheme, alpha, keyframes } from '@mui/material/styles';

// ============================================================================
// Types
// ============================================================================

export type MidiCurveType = 'linear' | 'exponential' | 'logarithmic' | 's_curve';

export interface MidiMapping {
  id: string;
  channel: number; // 0 = omni, 1-16 for specific channel
  cc: number; // 0-127
  pluginUri: string;
  pluginName: string;
  paramIndex: number;
  paramName: string;
  minValue: number;
  maxValue: number;
  curve: MidiCurveType;
  inverted: boolean;
}

export interface MidiMappingsPanelProps {
  /** List of active MIDI mappings */
  mappings: MidiMapping[];
  /** Callback when mapping is deleted */
  onDelete: (id: string) => void;
  /** Callback when mapping is updated */
  onUpdate: (id: string, updates: Partial<MidiMapping>) => void;
  /** Whether the panel is collapsible */
  collapsible?: boolean;
  /** Initial collapsed state */
  defaultCollapsed?: boolean;
  /** Currently active mapping (receiving MIDI) */
  activeMapping?: string;
  /** Last received CC activity */
  lastCCActivity?: { channel: number; cc: number; value: number };
}

// ============================================================================
// Animations
// ============================================================================

const flashAnimation = keyframes`
  0%, 100% {
    background-color: transparent;
  }
  50% {
    background-color: rgba(156, 39, 176, 0.2);
  }
`;

// ============================================================================
// Edit Dialog Component
// ============================================================================

interface EditDialogProps {
  open: boolean;
  mapping: MidiMapping | null;
  onClose: () => void;
  onSave: (updates: Partial<MidiMapping>) => void;
}

const EditDialog = memo(({ open, mapping, onClose, onSave }: EditDialogProps) => {
  const [minValue, setMinValue] = useState(mapping?.minValue ?? 0);
  const [maxValue, setMaxValue] = useState(mapping?.maxValue ?? 1);
  const [curve, setCurve] = useState<MidiCurveType>(mapping?.curve ?? 'linear');
  const [inverted, setInverted] = useState(mapping?.inverted ?? false);

  // Reset state when dialog opens with new mapping
  useState(() => {
    if (mapping) {
      setMinValue(mapping.minValue);
      setMaxValue(mapping.maxValue);
      setCurve(mapping.curve);
      setInverted(mapping.inverted);
    }
  });

  const handleSave = useCallback(() => {
    onSave({ minValue, maxValue, curve, inverted });
    onClose();
  }, [minValue, maxValue, curve, inverted, onSave, onClose]);

  if (!mapping) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Edit MIDI Mapping</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {/* Mapping info */}
          <Alert severity="info" icon={<MidiIcon />}>
            CC {mapping.cc} (Ch {mapping.channel === 0 ? 'Omni' : mapping.channel}) → {mapping.paramName}
          </Alert>

          {/* Value range */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>Value Range</Typography>
            <Stack direction="row" spacing={2}>
              <TextField
                label="Min"
                type="number"
                size="small"
                value={minValue}
                onChange={(e) => setMinValue(parseFloat(e.target.value))}
                inputProps={{ step: 0.01 }}
              />
              <TextField
                label="Max"
                type="number"
                size="small"
                value={maxValue}
                onChange={(e) => setMaxValue(parseFloat(e.target.value))}
                inputProps={{ step: 0.01 }}
              />
            </Stack>
          </Box>

          {/* Curve type */}
          <FormControl fullWidth size="small">
            <InputLabel>Response Curve</InputLabel>
            <Select
              value={curve}
              onChange={(e) => setCurve(e.target.value as MidiCurveType)}
              label="Response Curve"
            >
              <MenuItem value="linear">Linear</MenuItem>
              <MenuItem value="exponential">Exponential</MenuItem>
              <MenuItem value="logarithmic">Logarithmic</MenuItem>
              <MenuItem value="s_curve">S-Curve</MenuItem>
            </Select>
          </FormControl>

          {/* Invert */}
          <FormControlLabel
            control={
              <Switch
                checked={inverted}
                onChange={(e) => setInverted(e.target.checked)}
              />
            }
            label="Invert Direction"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">Save</Button>
      </DialogActions>
    </Dialog>
  );
});

EditDialog.displayName = 'EditDialog';

// ============================================================================
// Main MidiMappingsPanel Component
// ============================================================================

const MidiMappingsPanel = memo(({
  mappings,
  onDelete,
  onUpdate,
  collapsible = true,
  defaultCollapsed = false,
  activeMapping,
  lastCCActivity,
}: MidiMappingsPanelProps) => {
  const theme = useTheme();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [editMapping, setEditMapping] = useState<MidiMapping | null>(null);

  const handleEdit = useCallback((mapping: MidiMapping) => {
    setEditMapping(mapping);
  }, []);

  const handleEditSave = useCallback((updates: Partial<MidiMapping>) => {
    if (editMapping) {
      onUpdate(editMapping.id, updates);
    }
  }, [editMapping, onUpdate]);

  const handleDelete = useCallback((id: string) => {
    onDelete(id);
  }, [onDelete]);

  // Check if a mapping matches the last CC activity
  const isActive = useCallback((mapping: MidiMapping) => {
    if (!lastCCActivity) return false;
    return (
      mapping.cc === lastCCActivity.cc &&
      (mapping.channel === 0 || mapping.channel === lastCCActivity.channel)
    );
  }, [lastCCActivity]);

  return (
    <Paper
      sx={{
        bgcolor: alpha(theme.palette.background.paper, 0.95),
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 1,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{
          px: 2,
          py: 1,
          bgcolor: alpha(theme.palette.secondary.main, 0.1),
          borderBottom: `1px solid ${theme.palette.divider}`,
          cursor: collapsible ? 'pointer' : 'default',
        }}
        onClick={() => collapsible && setCollapsed(!collapsed)}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <MidiIcon sx={{ fontSize: 18, color: 'secondary.main' }} />
          <Typography variant="subtitle2" fontWeight={600}>
            MIDI Mappings
          </Typography>
          <Chip
            label={mappings.length}
            size="small"
            color="secondary"
            sx={{ height: 18, fontSize: '0.65rem' }}
          />
        </Stack>
        {collapsible && (
          <IconButton size="small">
            {collapsed ? <ExpandIcon /> : <CollapseIcon />}
          </IconButton>
        )}
      </Stack>

      {/* Content */}
      <Collapse in={!collapsed}>
        {mappings.length === 0 ? (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No MIDI mappings. Click a parameter while in Learn mode to create one.
            </Typography>
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: 300 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>CC</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Channel</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Plugin</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Parameter</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Curve</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {mappings.map((mapping) => (
                  <TableRow
                    key={mapping.id}
                    sx={{
                      animation: isActive(mapping) ? `${flashAnimation} 0.3s ease` : 'none',
                      bgcolor: activeMapping === mapping.id
                        ? alpha(theme.palette.secondary.main, 0.1)
                        : 'transparent',
                    }}
                  >
                    <TableCell>
                      <Chip
                        label={mapping.cc}
                        size="small"
                        color="secondary"
                        sx={{ fontWeight: 600, minWidth: 40 }}
                      />
                    </TableCell>
                    <TableCell>
                      {mapping.channel === 0 ? 'Omni' : mapping.channel}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 120 }}>
                        {mapping.pluginName}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 100 }}>
                        {mapping.paramName}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Chip
                          label={mapping.curve}
                          size="small"
                          variant="outlined"
                          sx={{ height: 18, fontSize: '0.6rem' }}
                        />
                        {mapping.inverted && (
                          <Chip
                            label="INV"
                            size="small"
                            color="warning"
                            sx={{ height: 18, fontSize: '0.6rem' }}
                          />
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Tooltip title="Edit">
                          <IconButton
                            size="small"
                            onClick={() => handleEdit(mapping)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDelete(mapping.id)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Collapse>

      {/* Edit Dialog */}
      <EditDialog
        open={!!editMapping}
        mapping={editMapping}
        onClose={() => setEditMapping(null)}
        onSave={handleEditSave}
      />
    </Paper>
  );
});

MidiMappingsPanel.displayName = 'MidiMappingsPanel';

export default MidiMappingsPanel;
