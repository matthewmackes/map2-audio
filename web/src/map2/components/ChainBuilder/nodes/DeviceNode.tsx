// ============================================================================
// MAP2 Audio Platform - Device Node Component
// Represents input/output devices with channel config and engine state
// ============================================================================

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card, CardContent, Typography, Chip, Stack, Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import RadioIcon from '@mui/icons-material/SettingsInputAntenna';
import SpeakerIcon from '@mui/icons-material/Speaker';
import { DeviceNodeData } from './DeviceNodeTypes';

function formatSampleRate(sr: number): string {
  return sr >= 1000 ? `${sr / 1000}k` : `${sr}`;
}

const DeviceNode = memo(({ data }: NodeProps<DeviceNodeData>) => {
  const theme = useTheme();
  const isInput = data.kind === 'input';
  const Icon = isInput ? RadioIcon : SpeakerIcon;
  const accentColor = isInput ? theme.palette.info.main : theme.palette.success.main;
  const isRunning = data.isRunning ?? true;
  const chainActive = data.chainActive ?? true;

  const channelLabel =
    data.channels === 1 ? 'Mono' : data.channels === 2 ? 'Stereo' : `${data.channels}ch`;

  return (
    <>
      {!isInput && (
        <Handle
          type="target"
          position={Position.Left}
          style={{
            width: 12,
            height: 12,
            background: theme.palette.info.main,
            border: `2px solid ${theme.palette.background.paper}`,
          }}
        />
      )}

      <Card
        sx={{
          width: 200,
          minHeight: 80,
          border: 2,
          borderColor: isRunning && chainActive ? accentColor : 'divider',
          bgcolor: 'background.paper',
          boxShadow: 1,
          opacity: isRunning && chainActive ? 1 : 0.7,
        }}
      >
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
            <Icon sx={{ color: accentColor, fontSize: 18 }} />
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight="bold" noWrap>
                {data.name || (isInput ? 'Input' : 'Output')}
              </Typography>
            </Box>
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: isRunning && chainActive ? 'success.main' : !isRunning ? 'error.main' : 'warning.main',
                boxShadow: isRunning && chainActive
                  ? '0 0 4px rgba(34,197,94,0.4)'
                  : !isRunning
                  ? '0 0 4px rgba(239,68,68,0.4)'
                  : '0 0 4px rgba(245,158,11,0.4)',
                flexShrink: 0,
              }}
            />
          </Stack>

          <Stack direction="row" spacing={0.5} alignItems="center" mb={0.5}>
            <Chip
              label={channelLabel}
              size="small"
              color={isInput ? 'info' : 'success'}
              variant="outlined"
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          </Stack>

          {(data.sampleRate || data.bufferSize) && (
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                fontSize: '0.65rem',
                fontFeatureSettings: '"tnum"',
                display: 'block',
              }}
            >
              {data.sampleRate ? formatSampleRate(data.sampleRate) : ''}
              {data.sampleRate && data.bufferSize ? ' / ' : ''}
              {data.bufferSize ? `${data.bufferSize}smp` : ''}
            </Typography>
          )}
        </CardContent>
      </Card>

      {isInput && (
        <Handle
          type="source"
          position={Position.Right}
          style={{
            width: 12,
            height: 12,
            background: theme.palette.success.main,
            border: `2px solid ${theme.palette.background.paper}`,
          }}
        />
      )}
    </>
  );
});

DeviceNode.displayName = 'DeviceNode';

export default DeviceNode;
