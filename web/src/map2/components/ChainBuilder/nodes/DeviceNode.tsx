// ============================================================================
// MAP2 Audio Platform - Device Node Component
// Represents input/output devices with channel badges
// ============================================================================

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card, CardContent, Typography, Chip, Stack, Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import RadioIcon from '@mui/icons-material/SettingsInputAntenna';
import SpeakerIcon from '@mui/icons-material/Speaker';
import { DeviceNodeData } from './DeviceNodeTypes';

const DeviceNode = memo(({ data }: NodeProps<DeviceNodeData>) => {
  const theme = useTheme();
  const isInput = data.kind === 'input';
  const Icon = isInput ? RadioIcon : SpeakerIcon;

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
          minHeight: 100,
          border: 2,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          boxShadow: 1,
        }}
      >
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Stack direction="row" spacing={1} alignItems="center" mb={1}>
            <Icon sx={{ color: isInput ? 'info.main' : 'success.main' }} />
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight="bold" noWrap>
                {data.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {isInput ? 'Input Device' : 'Output Device'}
              </Typography>
            </Box>
          </Stack>

          <Chip
            label={`${data.channels} ch`}
            size="small"
            color={isInput ? 'info' : 'success'}
            variant="outlined"
            sx={{ height: 20, fontSize: '0.7rem' }}
          />
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
