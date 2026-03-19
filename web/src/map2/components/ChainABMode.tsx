// ============================================================================
// MAP2 Audio Platform - Dual-Chain A/B Mode Component
// Professional A/B comparison and blend mixing for signal chains
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Button,
  Stack,
  Typography,
  Chip,
  IconButton,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Tooltip,
} from '@mui/material';
import { NumberInput } from './NumberInput';
import {
  ArrowsHorizontal,
  Copy,
  Link,
  Settings,
  SplitScreen,
  VolumeUp,
} from '@carbon/icons-react';
import { useTheme } from '@mui/material/styles';
import type { Chain } from '../types';

interface ChainABModeProps {
  chains: Chain[];
  selectedChainIdA: number | null;
  selectedChainIdB: number | null;
  onSelectChainA: (chainId: number) => void;
  onSelectChainB: (chainId: number) => void;
  onToggleABMode: (enabled: boolean) => void;
  onBlendChange: (value: number) => void;
  currentBlend: number; // 0 = 100% A, 50 = 50/50, 100 = 100% B
  dspLoadA?: number; // CPU % for chain A
  dspLoadB?: number; // CPU % for chain B
}

export default function ChainABMode({
  chains,
  selectedChainIdA,
  selectedChainIdB,
  onSelectChainA,
  onSelectChainB,
  onToggleABMode,
  onBlendChange,
  currentBlend,
  dspLoadA,
  dspLoadB,
}: ChainABModeProps) {
  const theme = useTheme();
  const [abModeEnabled, setAbModeEnabled] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateSource, setDuplicateSource] = useState<'A' | 'B'>('A');
  const [newChainName, setNewChainName] = useState('');
  const [linkedPairs, setLinkedPairs] = useState<{ a: number; b: number }[]>([]);

  const chainA = chains.find(c => c.id === selectedChainIdA);
  const chainB = chains.find(c => c.id === selectedChainIdB);

  const isLinked = linkedPairs.some(
    pair => (pair.a === selectedChainIdA && pair.b === selectedChainIdB) ||
            (pair.a === selectedChainIdB && pair.b === selectedChainIdA)
  );

  const handleToggleABMode = () => {
    const newState = !abModeEnabled;
    setAbModeEnabled(newState);
    onToggleABMode(newState);
  };

  const handleLinkPair = () => {
    if (!selectedChainIdA || !selectedChainIdB) return;
    
    const isCurrentlyLinked = linkedPairs.some(
      pair => (pair.a === selectedChainIdA && pair.b === selectedChainIdB) ||
              (pair.a === selectedChainIdB && pair.b === selectedChainIdA)
    );

    if (isCurrentlyLinked) {
      setLinkedPairs(prev =>
        prev.filter(pair =>
          !((pair.a === selectedChainIdA && pair.b === selectedChainIdB) ||
            (pair.a === selectedChainIdB && pair.b === selectedChainIdA))
        )
      );
    } else {
      setLinkedPairs(prev => [...prev, { a: selectedChainIdA, b: selectedChainIdB }]);
    }
  };

  const handleDuplicate = async () => {
    if (!newChainName.trim()) return;
    
    const sourceChain = duplicateSource === 'A' ? chainA : chainB;
    if (!sourceChain) return;

    try {
      const response = await fetch(`/api/chains/${sourceChain.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newChainName, include_settings: true }),
      });
      
      if (response.ok) {
        const newChain = await response.json();
        if (duplicateSource === 'A') {
          onSelectChainB(newChain.id);
        } else {
          onSelectChainA(newChain.id);
        }
        setNewChainName('');
        setDuplicateDialogOpen(false);
      }
    } catch (error) {
      console.error('Failed to duplicate chain:', error);
    }
  };

  const handleSwap = () => {
    if (selectedChainIdA && selectedChainIdB) {
      onSelectChainA(selectedChainIdB);
      onSelectChainB(selectedChainIdA);
    }
  };

  const handleBlendChange = (_: Event, newValue: number | number[]) => {
    const value = Array.isArray(newValue) ? newValue[0] : newValue;
    onBlendChange(value);
  };

  // DSP load indicator color
  const getDspColor = (load?: number) => {
    if (!load) return 'inherit';
    if (load < 50) return theme.palette.success.main;
    if (load < 80) return theme.palette.warning.main;
    return theme.palette.error.main;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* A/B Mode Toggle Header */}
      <Paper sx={{ p: 2, bgcolor: abModeEnabled ? 'action.selected' : 'background.paper' }} elevation={1}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Button
            variant={abModeEnabled ? 'contained' : 'outlined'}
            onClick={handleToggleABMode}
            color={abModeEnabled ? 'primary' : 'inherit'}
            sx={{ fontWeight: 'bold' }}
          >
            A/B Mode {abModeEnabled ? 'ON' : 'OFF'}
          </Button>
          
          <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
            {abModeEnabled
              ? 'Compare two chains side-by-side with live blend mixing'
              : 'Enable A/B mode to compare two signal chain configurations'}
          </Typography>

          {abModeEnabled && (
            <Stack direction="row" spacing={1}>
              <Tooltip title={isLinked ? 'Unlink chains' : 'Link as A/B pair'}>
                <IconButton
                  size="small"
                  onClick={handleLinkPair}
                  color={isLinked ? 'primary' : 'default'}
                  sx={{ border: isLinked ? `1px solid ${theme.palette.primary.main}` : 'none' }}
                >
                  <Link size={16} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Swap A and B">
                <IconButton size="small" onClick={handleSwap} disabled={!selectedChainIdA || !selectedChainIdB}>
                  <ArrowsHorizontal size={16} />
                </IconButton>
              </Tooltip>
            </Stack>
          )}
        </Stack>
      </Paper>

      {/* A/B Chain Selection and Controls */}
      {abModeEnabled && (
        <Paper sx={{ p: 2 }} elevation={1}>
          {/* Top: Chain Selection Row */}
          <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ mb: 2 }}>
            {/* Chain A */}
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" color="primary" fontWeight="bold" sx={{ mb: 1 }}>
                Chain A
              </Typography>
              <Box sx={{ 
                border: `2px solid ${theme.palette.primary.main}`,
                borderRadius: 1,
                p: 1.5,
                bgcolor: selectedChainIdA ? 'action.selected' : 'background.paper',
                minHeight: 80,
              }}>
                {chainA ? (
                  <Stack spacing={1}>
                    <Typography variant="body2" fontWeight="bold">{chainA.name}</Typography>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      <Chip label={`${chainA.plugins?.length || 0} plugins`} size="small" />
                      {chainA.is_active && <Chip label="Active" color="success" size="small" />}
                      {dspLoadA !== undefined && (
                        <Chip
                          label={`CPU: ${dspLoadA.toFixed(1)}%`}
                          size="small"
                          sx={{ color: getDspColor(dspLoadA) }}
                        />
                      )}
                    </Stack>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<Copy size={16} />}
                      onClick={() => {
                        setDuplicateSource('A');
                        setDuplicateDialogOpen(true);
                      }}
                      sx={{ mt: 1 }}
                    >
                      Clone as B
                    </Button>
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.disabled">
                    Select a chain for position A
                  </Typography>
                )}
              </Box>
            </Box>

            {/* Center Blend Control */}
            <Box sx={{
              flex: 0.8,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 2,
              px: 1,
            }}>
              <VolumeUp size={20} />
              <Box sx={{ width: '100%', textAlign: 'center' }}>
                <NumberInput
                  label="Blend"
                  value={currentBlend}
                  onChange={(v) => handleBlendChange(null as any, v)}
                  min={0}
                  max={100}
                  step={1}
                  unit="%"
                  size="small"
                />
              </Box>
              <Typography variant="caption" color="text.secondary" textAlign="center">
                {currentBlend === 0 ? '100% A' : currentBlend === 100 ? '100% B' : `${currentBlend}% Blend`}
              </Typography>
            </Box>

            {/* Chain B */}
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" color="secondary" fontWeight="bold" sx={{ mb: 1 }}>
                Chain B
              </Typography>
              <Box sx={{ 
                border: `2px solid ${theme.palette.secondary.main}`,
                borderRadius: 1,
                p: 1.5,
                bgcolor: selectedChainIdB ? 'action.selected' : 'background.paper',
                minHeight: 80,
              }}>
                {chainB ? (
                  <Stack spacing={1}>
                    <Typography variant="body2" fontWeight="bold">{chainB.name}</Typography>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      <Chip label={`${chainB.plugins?.length || 0} plugins`} size="small" />
                      {chainB.is_active && <Chip label="Active" color="success" size="small" />}
                      {dspLoadB !== undefined && (
                        <Chip
                          label={`CPU: ${dspLoadB.toFixed(1)}%`}
                          size="small"
                          sx={{ color: getDspColor(dspLoadB) }}
                        />
                      )}
                    </Stack>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<Copy size={16} />}
                      onClick={() => {
                        setDuplicateSource('B');
                        setDuplicateDialogOpen(true);
                      }}
                      sx={{ mt: 1 }}
                    >
                      Clone as A
                    </Button>
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.disabled">
                    Select a chain for position B
                  </Typography>
                )}
              </Box>
            </Box>
          </Stack>

          <Divider sx={{ my: 2 }} />

          {/* Bottom: Available Chains List */}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Available Chains
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {chains.map((chain) => {
              const isA = chain.id === selectedChainIdA;
              const isB = chain.id === selectedChainIdB;
              
              return (
                <Box key={chain.id} sx={{ display: 'flex', gap: 0.5 }}>
                  {isA || isB ? (
                    <>
                      {isA && (
                        <Button
                          size="small"
                          variant="contained"
                          color="primary"
                          onClick={() => onSelectChainA(chain.id)}
                        >
                          A: {chain.name}
                        </Button>
                      )}
                      {isB && (
                        <Button
                          size="small"
                          variant="contained"
                          color="secondary"
                          onClick={() => onSelectChainB(chain.id)}
                        >
                          B: {chain.name}
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => onSelectChainA(chain.id)}
                      >
                        → A
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => onSelectChainB(chain.id)}
                      >
                        → B
                      </Button>
                    </>
                  )}
                </Box>
              );
            })}
          </Stack>

          {/* Info Box */}
          <Paper sx={{ mt: 2, p: 1.5, bgcolor: 'info.lighter' }} elevation={0}>
            <Typography variant="caption" color="info.dark">
              💡 <strong>Tip:</strong> Press <code>SPACE</code> to toggle A/B, <code>←/→</code> to adjust blend.
              Link chains to keep them synchronized as a preset pair.
            </Typography>
          </Paper>
        </Paper>
      )}

      {/* Duplicate Chain Dialog */}
      <Dialog open={duplicateDialogOpen} onClose={() => setDuplicateDialogOpen(false)}>
        <DialogTitle>
          Duplicate Chain {duplicateSource} as {duplicateSource === 'A' ? 'B' : 'A'}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="New Chain Name"
            fullWidth
            value={newChainName}
            onChange={(e) => setNewChainName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') handleDuplicate();
            }}
            helperText="This will copy all plugins and settings from the selected chain"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDuplicateDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDuplicate} variant="contained" disabled={!newChainName.trim()}>
            Duplicate
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
