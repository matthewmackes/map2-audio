/**
 * Matrix Cell Component
 *
 * Individual cell in the routing matrix representing a potential connection
 * between one talker and one listener.
 *
 * States:
 * - Empty (disconnected)
 * - Connecting (in progress)
 * - Connected (active route)
 * - Error (connection failed)
 * - Pending (staged in safe patch mode)
 *
 * Interactions:
 * - Click to patch/unpatch
 * - Hover for details
 * - Visual indicators for all states
 */

import React from 'react';
import { Box, CircularProgress, Tooltip } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import LockIcon from '@mui/icons-material/Lock';
import LinkIcon from '@mui/icons-material/Link';
import { useRouting } from '../../context/RoutingContext';
import type { Endpoint, Route } from '../../types';

interface MatrixCellProps {
  talker: Endpoint;
  listener: Endpoint;
  route: Route | null;
  isPending: boolean;
  isHovered: boolean;
  isFocused: boolean;
  isSelected?: boolean;
  onClick: () => void;
  onHover: (hover: boolean) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseMove?: () => void;
}

/**
 * Matrix cell component
 */
export function MatrixCell({
  talker,
  listener,
  route,
  isPending,
  isHovered,
  isFocused,
  isSelected = false,
  onClick,
  onHover,
  onMouseDown,
  onMouseMove,
}: MatrixCellProps) {
  const { state } = useRouting();

  const isConnected = route?.state === 'connected';
  const isConnecting = route?.state === 'connecting';
  const isError = route?.state === 'error';
  const isLocked = route?.locked || false;

  // Cross-node routing detection
  const isCrossNode = talker.node_id !== listener.node_id;
  const talkerNode = state.network.nodes[talker.node_id];
  const listenerNode = state.network.nodes[listener.node_id];
  const talkerColor = talkerNode?.color || '#1976d2';
  const listenerColor = listenerNode?.color || '#1976d2';

  // Validation warnings
  const hasWarning =
    talker.sample_rate !== listener.sample_rate ||
    talker.channels !== listener.channels;

  // Tooltip content
  const tooltipTitle = route ? (
    <div>
      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
        {talker.device_name} → {listener.device_name}
        {isCrossNode && ' 🔗'}
      </div>
      <div>State: {route.state}</div>
      {isCrossNode && (
        <div style={{ color: '#90caf9' }}>
          Cross-Node: {talkerNode?.name || 'Unknown'} → {listenerNode?.name || 'Unknown'}
        </div>
      )}
      {route.established_time && (
        <div>Connected: {new Date(route.established_time).toLocaleTimeString()}</div>
      )}
      {route.error_message && (
        <div style={{ color: '#ff6b6b' }}>Error: {route.error_message}</div>
      )}
      {isLocked && <div style={{ color: '#ffd43b' }}>🔒 Locked</div>}
      {route.srp_reservation_id && (
        <div style={{ fontSize: '0.85em', opacity: 0.8 }}>
          SRP: {route.srp_reservation_id.slice(0, 8)}...
        </div>
      )}
    </div>
  ) : hasWarning ? (
    <div>
      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
        {talker.device_name} → {listener.device_name}
      </div>
      <div style={{ color: '#ffd43b' }}>⚠️ Warnings:</div>
      {talker.sample_rate !== listener.sample_rate && (
        <div>Sample rate mismatch: {talker.sample_rate}Hz ≠ {listener.sample_rate}Hz</div>
      )}
      {talker.channels !== listener.channels && (
        <div>Channel count mismatch: {talker.channels}ch ≠ {listener.channels}ch</div>
      )}
    </div>
  ) : (
    <div>
      <div style={{ fontWeight: 'bold' }}>
        {talker.device_name} → {listener.device_name}
      </div>
      <div>Click to connect</div>
      <div style={{ fontSize: '0.85em', opacity: 0.7 }}>
        {talker.channels}ch @ {talker.sample_rate / 1000}kHz
      </div>
    </div>
  );

  // Cell background color or gradient (for cross-node)
  const getBgColor = () => {
    if (isConnected) {
      if (isCrossNode) {
        // Gradient from talker color to listener color
        return `linear-gradient(135deg, ${talkerColor}AA 0%, ${listenerColor}AA 100%)`;
      }
      return isPending ? '#ffd43b' : '#4caf50';
    }
    if (isConnecting) return isCrossNode ? `linear-gradient(135deg, ${talkerColor}66 0%, ${listenerColor}66 100%)` : '#2196f3';
    if (isError) return '#f44336';
    if (isPending) return '#ff9800';
    if (isHovered) return 'rgba(255, 255, 255, 0.1)';
    return 'transparent';
  };

  // Cell border
  const getBorder = () => {
    if (isSelected) return '2px solid #2196f3';
    if (isPending) return '2px solid #ff9800';
    if (isCrossNode && (isConnected || isConnecting)) return '2px dashed rgba(255, 255, 255, 0.5)';
    if (hasWarning && !isConnected) return '1px dashed #ffd43b';
    return '1px solid rgba(255, 255, 255, 0.12)';
  };

  return (
    <Tooltip title={tooltipTitle} placement="top" arrow>
      <Box
        onClick={onClick}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        sx={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isLocked ? 'not-allowed' : 'pointer',
          background: getBgColor(), // Use 'background' instead of 'bgcolor' for gradient support
          border: getBorder(),
          outline: isFocused ? '2px solid #90caf9' : 'none',
          outlineOffset: isFocused ? -2 : 0,
          boxShadow: isSelected
            ? '0 0 0 2px rgba(33, 150, 243, 0.4), inset 0 0 8px rgba(33, 150, 243, 0.2)'
            : isFocused
            ? '0 0 0 2px rgba(25, 118, 210, 0.3)'
            : 'none',
          borderRadius: 0.5,
          transition: 'all 0.2s ease',
          position: 'relative',
          '&:hover': {
            background: isConnected
              ? (isCrossNode ? getBgColor() : '#66bb6a')
              : isLocked
              ? getBgColor()
              : 'rgba(255, 255, 255, 0.15)',
            transform: isLocked ? 'none' : 'scale(1.05)',
          },
          '&:active': {
            transform: isLocked ? 'none' : 'scale(0.95)',
          },
        }}
      >
        {/* Connection indicator */}
        {isConnecting && <CircularProgress size={20} sx={{ color: 'white' }} />}
        {isConnected && <CheckCircleIcon sx={{ fontSize: 24, color: 'white' }} />}
        {isError && <ErrorIcon sx={{ fontSize: 24, color: 'white' }} />}

        {/* Cross-node indicator (overlay top-left) */}
        {isCrossNode && (isConnected || isConnecting) && (
          <LinkIcon
            sx={{
              position: 'absolute',
              top: 2,
              left: 2,
              fontSize: 12,
              color: 'rgba(255, 255, 255, 0.9)',
            }}
          />
        )}

        {/* Lock indicator (overlay top-right) */}
        {isLocked && (
          <LockIcon
            sx={{
              position: 'absolute',
              top: 2,
              right: 2,
              fontSize: 14,
              color: 'rgba(255, 255, 255, 0.7)',
            }}
          />
        )}

        {/* Warning indicator (overlay) */}
        {hasWarning && !isConnected && (
          <Box
            sx={{
              position: 'absolute',
              top: 2,
              left: 2,
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: '#ffd43b',
            }}
          />
        )}
      </Box>
    </Tooltip>
  );
}

export default MatrixCell;
