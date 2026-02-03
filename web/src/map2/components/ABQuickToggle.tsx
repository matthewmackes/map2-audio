// ============================================================================
// MAP2 Audio Platform - A/B Quick Toggle Component
// Prominent A/B chain comparison with blend slider
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Button,
  ButtonGroup,
  Tooltip,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  Divider,
} from '@mui/material';
import { NumberInput } from './NumberInput';
import {
  SwapHoriz as SwapIcon,
  ContentCopy as DuplicateIcon,
  Link as LinkIcon,
  LinkOff as UnlinkIcon,
  VolumeUp as VolumeIcon,
  CompareArrows as CompareIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';

interface Chain {
  id: number;
  name: string;
  pluginCount?: number;
}

interface ABQuickToggleProps {
  chains: Chain[];
  chainAId?: number;
  chainBId?: number;
  blendPosition?: number; // 0 = 100% A, 100 = 100% B
  enabled?: boolean;
  linked?: boolean;
  dspLoadA?: number;
  dspLoadB?: number;
  onChainAChange?: (chainId: number) => void;
  onChainBChange?: (chainId: number) => void;
  onBlendChange?: (position: number) => void;
  onToggle?: (enabled: boolean) => void;
  onLink?: (linked: boolean) => void;
  onSwap?: () => void;
  onDuplicate?: (source: 'A' | 'B') => void;
  compact?: boolean;
}

const API_BASE = '/api';

export default function ABQuickToggle({
  chains,
  chainAId,
  chainBId,
  blendPosition = 50,
  enabled = false,
  linked = false,
  dspLoadA,
  dspLoadB,
  onChainAChange,
  onChainBChange,
  onBlendChange,
  onToggle,
  onLink,
  onSwap,
  onDuplicate,
  compact = false,
}: ABQuickToggleProps) {
  const theme = useTheme();
  const [localBlend, setLocalBlend] = useState(blendPosition);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [localEnabled, setLocalEnabled] = useState(enabled);

  useEffect(() => {
    setLocalBlend(blendPosition);
  }, [blendPosition]);

  useEffect(() => {
    setLocalEnabled(enabled);
  }, [enabled]);

  const handleToggle = () => {
    const newState = !localEnabled;
    setLocalEnabled(newState);
    onToggle?.(newState);
  };

  const handleBlendChange = (_: Event, value: number | number[]) => {
    const blend = value as number;
    setLocalBlend(blend);
  };

  const handleBlendCommit = (_: Event | React.SyntheticEvent, value: number | number[]) => {
    onBlendChange?.(value as number);
  };

  const handleSwap = () => {
    onSwap?.();
  };

  const getBlendLabel = (value: number) => {
    if (value <= 10) return '100% A';
    if (value >= 90) return '100% B';
    if (value === 50) return '50/50';
    return value < 50 ? `${100 - value}% A` : `${value}% B`;
  };

  const chainA = chains.find(c => c.id === chainAId);
  const chainB = chains.find(c => c.id === chainBId);

  if (compact) {
    return (
      <Paper
        elevation={1}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1,
          py: 0.5,
          bgcolor: localEnabled 
            ? alpha(theme.palette.primary.main, 0.1) 
            : alpha(theme.palette.background.paper, 0.8),
          borderRadius: 2,
          border: localEnabled ? `1px solid ${theme.palette.primary.main}` : undefined,
        }}
      >
        <Tooltip title={localEnabled ? 'Disable A/B Mode' : 'Enable A/B Mode'}>
          <Button
            size="small"
            variant={localEnabled ? 'contained' : 'outlined'}
            onClick={handleToggle}
            sx={{ minWidth: 40, px: 1 }}
          >
            A/B
          </Button>
        </Tooltip>

        {localEnabled && (
          <>
            <Chip
              label="A"
              size="small"
              color={localBlend < 50 ? 'primary' : 'default'}
              variant={localBlend < 50 ? 'filled' : 'outlined'}
              sx={{ height: 20, fontSize: 10 }}
            />

            <NumberInput
              value={localBlend}
              onChange={(v) => {
                handleBlendChange(null as any, v);
                handleBlendCommit(null as any, v);
              }}
              min={0}
              max={100}
              step={1}
              unit="%"
              size="small"
              sx={{ width: 100 }}
            />

            <Chip
              label="B"
              size="small"
              color={localBlend > 50 ? 'primary' : 'default'}
              variant={localBlend > 50 ? 'filled' : 'outlined'}
              sx={{ height: 20, fontSize: 10 }}
            />
          </>
        )}
      </Paper>
    );
  }

  return (
    <>
      <Paper
        elevation={2}
        sx={{
          p: 1.5,
          bgcolor: localEnabled 
            ? alpha(theme.palette.primary.main, 0.05) 
            : alpha(theme.palette.background.paper, 0.8),
          borderRadius: 2,
          border: localEnabled ? `2px solid ${theme.palette.primary.main}` : undefined,
        }}
      >
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <CompareIcon 
            sx={{ 
              color: localEnabled ? theme.palette.primary.main : theme.palette.action.active,
            }} 
          />
          <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 600 }}>
            A/B Compare
          </Typography>
          
          <Button
            size="small"
            variant={localEnabled ? 'contained' : 'outlined'}
            onClick={handleToggle}
            sx={{ minWidth: 60 }}
          >
            {localEnabled ? 'ON' : 'OFF'}
          </Button>
          
          <IconButton size="small" onClick={() => setSettingsOpen(true)}>
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Box>

        {localEnabled && (
          <>
            {/* Chain Selection */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              {/* Chain A */}
              <Box sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                  <Chip
                    label="A"
                    size="small"
                    color="primary"
                    sx={{ height: 18, fontSize: 10, fontWeight: 700 }}
                  />
                  {dspLoadA !== undefined && (
                    <Typography variant="caption" color="textSecondary">
                      {dspLoadA.toFixed(0)}% CPU
                    </Typography>
                  )}
                </Box>
                <FormControl fullWidth size="small">
                  <Select
                    value={chainAId || ''}
                    onChange={(e) => onChainAChange?.(e.target.value as number)}
                    displayEmpty
                    sx={{ fontSize: 12 }}
                  >
                    <MenuItem value="" disabled>Select Chain A</MenuItem>
                    {chains.map((chain) => (
                      <MenuItem key={chain.id} value={chain.id}>
                        {chain.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              {/* Swap Button */}
              <Tooltip title="Swap A ↔ B">
                <IconButton size="small" onClick={handleSwap}>
                  <SwapIcon />
                </IconButton>
              </Tooltip>

              {/* Chain B */}
              <Box sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5, justifyContent: 'flex-end' }}>
                  {dspLoadB !== undefined && (
                    <Typography variant="caption" color="textSecondary">
                      {dspLoadB.toFixed(0)}% CPU
                    </Typography>
                  )}
                  <Chip
                    label="B"
                    size="small"
                    color="secondary"
                    sx={{ height: 18, fontSize: 10, fontWeight: 700 }}
                  />
                </Box>
                <FormControl fullWidth size="small">
                  <Select
                    value={chainBId || ''}
                    onChange={(e) => onChainBChange?.(e.target.value as number)}
                    displayEmpty
                    sx={{ fontSize: 12 }}
                  >
                    <MenuItem value="" disabled>Select Chain B</MenuItem>
                    {chains.map((chain) => (
                      <MenuItem key={chain.id} value={chain.id}>
                        {chain.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </Box>

            {/* Blend Input */}
            <Box sx={{ px: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" color="primary" sx={{ fontWeight: 600 }}>
                  A
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  {getBlendLabel(localBlend)}
                </Typography>
                <Typography variant="caption" color="secondary" sx={{ fontWeight: 600 }}>
                  B
                </Typography>
              </Box>

              <NumberInput
                value={localBlend}
                onChange={(v) => {
                  handleBlendChange(null as any, v);
                  handleBlendCommit(null as any, v);
                }}
                min={0}
                max={100}
                step={1}
                unit="%"
                size="small"
                fullWidth
              />
            </Box>

            {/* Quick Actions */}
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
              <ButtonGroup size="small" variant="outlined">
                <Tooltip title="100% Chain A">
                  <Button onClick={() => { setLocalBlend(0); onBlendChange?.(0); }}>
                    A
                  </Button>
                </Tooltip>
                <Tooltip title="50/50 Mix">
                  <Button onClick={() => { setLocalBlend(50); onBlendChange?.(50); }}>
                    50/50
                  </Button>
                </Tooltip>
                <Tooltip title="100% Chain B">
                  <Button onClick={() => { setLocalBlend(100); onBlendChange?.(100); }}>
                    B
                  </Button>
                </Tooltip>
              </ButtonGroup>

              <Tooltip title={linked ? 'Unlink chains' : 'Link chains (sync changes)'}>
                <IconButton 
                  size="small" 
                  onClick={() => onLink?.(!linked)}
                  color={linked ? 'primary' : 'default'}
                >
                  {linked ? <LinkIcon /> : <UnlinkIcon />}
                </IconButton>
              </Tooltip>

              <Tooltip title="Duplicate Chain A to B">
                <IconButton size="small" onClick={() => onDuplicate?.('A')}>
                  <DuplicateIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </>
        )}
      </Paper>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>A/B Mode Settings</DialogTitle>
        <DialogContent>
          <Typography variant="body2" paragraph>
            A/B Mode allows you to compare two effect chains and smoothly blend between them.
          </Typography>
          <Typography variant="subtitle2" gutterBottom>Tips:</Typography>
          <Typography variant="body2" component="ul" sx={{ pl: 2 }}>
            <li>Use the blend slider to crossfade between chains</li>
            <li>Link chains to sync bypass states</li>
            <li>Duplicate a chain to create variations</li>
            <li>CPU load shows total processing for each chain</li>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

// Mini A/B indicator for status bars
export function ABModeIndicator({ enabled, blend }: { enabled: boolean; blend?: number }) {
  const theme = useTheme();
  
  if (!enabled) return null;
  
  return (
    <Tooltip title={`A/B Mode: ${blend !== undefined ? `${blend < 50 ? 100 - blend : blend}% ${blend < 50 ? 'A' : 'B'}` : 'Active'}`}>
      <Chip
        icon={<CompareIcon sx={{ fontSize: 14 }} />}
        label="A/B"
        size="small"
        color="primary"
        sx={{ height: 20, '& .MuiChip-label': { px: 0.5, fontSize: 10 } }}
      />
    </Tooltip>
  );
}
