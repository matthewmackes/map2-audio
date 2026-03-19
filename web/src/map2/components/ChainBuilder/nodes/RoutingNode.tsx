// ============================================================================
// MAP2 Audio Platform - Routing Node Component
// Visual representation of signal split and blend points for A/B routing
// ============================================================================

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card, CardContent, Typography, Box, Stack, LinearProgress } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { DirectionFork, FlowConnection } from '@carbon/icons-react';
import { RoutingNodeData } from './RoutingNodeTypes';

const RoutingNode = memo(({ data }: NodeProps<RoutingNodeData>) => {
  const theme = useTheme();
  const isSplit = data.kind === 'split';
  const Icon = isSplit ? DirectionFork : FlowConnection;

  // Calculate blend percentages for display
  const blendA = data.blendPosition !== undefined ? 100 - data.blendPosition : 50;
  const blendB = data.blendPosition !== undefined ? data.blendPosition : 50;

  // Colors for A and B paths
  const colorA = theme.palette.primary.main;
  const colorB = theme.palette.secondary.main;

  return (
    <>
      {/* Input handle - left side */}
      {isSplit ? (
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
      ) : (
        <>
          {/* Blend node has two inputs - one for each path */}
          <Handle
            type="target"
            position={Position.Left}
            id="input-a"
            style={{
              width: 12,
              height: 12,
              top: '30%',
              background: colorA,
              border: `2px solid ${theme.palette.background.paper}`,
            }}
          />
          <Handle
            type="target"
            position={Position.Left}
            id="input-b"
            style={{
              width: 12,
              height: 12,
              top: '70%',
              background: colorB,
              border: `2px solid ${theme.palette.background.paper}`,
            }}
          />
        </>
      )}

      <Card
        sx={{
          width: 160,
          minHeight: isSplit ? 100 : 140,
          border: 2,
          borderColor: isSplit ? 'info.main' : 'warning.main',
          bgcolor: 'background.paper',
          boxShadow: 2,
          borderRadius: 2,
        }}
      >
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
          {/* Header */}
          <Stack direction="row" spacing={1} alignItems="center" mb={1}>
            <Box
              sx={{
                color: isSplit ? 'info.main' : 'warning.main',
                display: 'inline-flex',
                alignItems: 'center',
                transform: isSplit ? 'rotate(90deg)' : 'rotate(-90deg)',
              }}
            >
              <Icon size={18} />
            </Box>
            <Typography variant="body2" fontWeight="bold">
              {isSplit ? 'Split' : 'Blend'}
            </Typography>
          </Stack>

          {/* Path labels */}
          <Stack spacing={0.5} mb={1}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: colorA,
                }}
              />
              <Typography variant="caption" sx={{ color: colorA, fontWeight: 500 }}>
                {data.pathALabel || 'A'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: colorB,
                }}
              />
              <Typography variant="caption" sx={{ color: colorB, fontWeight: 500 }}>
                {data.pathBLabel || 'B'}
              </Typography>
            </Box>
          </Stack>

          {/* Blend position indicator (only for blend nodes) */}
          {!isSplit && data.blendPosition !== undefined && (
            <Box sx={{ mt: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" sx={{ color: colorA, fontWeight: 600 }}>
                  {blendA}%
                </Typography>
                <Typography variant="caption" sx={{ color: colorB, fontWeight: 600 }}>
                  {blendB}%
                </Typography>
              </Box>
              <Box
                sx={{
                  height: 8,
                  borderRadius: 4,
                  overflow: 'hidden',
                  display: 'flex',
                  bgcolor: alpha(theme.palette.divider, 0.3),
                }}
              >
                <Box
                  sx={{
                    width: `${blendA}%`,
                    bgcolor: colorA,
                    transition: 'width 0.2s ease',
                  }}
                />
                <Box
                  sx={{
                    width: `${blendB}%`,
                    bgcolor: colorB,
                    transition: 'width 0.2s ease',
                  }}
                />
              </Box>
            </Box>
          )}

          {/* Channel info */}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {data.channels} ch
          </Typography>
        </CardContent>
      </Card>

      {/* Output handles */}
      {isSplit ? (
        <>
          {/* Split node has two outputs */}
          <Handle
            type="source"
            position={Position.Right}
            id="output-a"
            style={{
              width: 12,
              height: 12,
              top: '30%',
              background: colorA,
              border: `2px solid ${theme.palette.background.paper}`,
            }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="output-b"
            style={{
              width: 12,
              height: 12,
              top: '70%',
              background: colorB,
              border: `2px solid ${theme.palette.background.paper}`,
            }}
          />
        </>
      ) : (
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

RoutingNode.displayName = 'RoutingNode';

export default RoutingNode;
