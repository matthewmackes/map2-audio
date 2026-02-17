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
import type { Endpoint, Route } from '../../types';

interface MatrixCellProps {
  talker: Endpoint;
  listener: Endpoint;
  route: Route | null;
  isPending: boolean;
  isHovered: boolean;
  isFocused: boolean;
  onClick: () => void;
  onHover: (hover: boolean) => void;
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
  onClick,
  onHover,
}: MatrixCellProps) {
  const isConnected = route?.state === 'connected';
  const isConnecting = route?.state === 'connecting';
  const isError = route?.state === 'error';
  const isLocked = route?.locked || false;

  // Validation warnings
  const hasWarning =
    talker.sample_rate !== listener.sample_rate ||
    talker.channels !== listener.channels;

  // Tooltip content
  const tooltipTitle = route ? (
    <div>
      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
        {talker.device_name} → {listener.device_name}
      </div>
      <div>State: {route.state}</div>
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

  // Cell background color
  const getBgColor = () => {
    if (isConnected) return isPending ? '#ffd43b' : '#4caf50';
    if (isConnecting) return '#2196f3';
    if (isError) return '#f44336';
    if (isPending) return '#ff9800';
    if (isHovered) return 'rgba(255, 255, 255, 0.1)';
    return 'transparent';
  };

  // Cell border
  const getBorder = () => {
    if (isPending) return '2px solid #ff9800';
    if (hasWarning && !isConnected) return '1px dashed #ffd43b';
    return '1px solid rgba(255, 255, 255, 0.12)';
  };

  return (
    <Tooltip title={tooltipTitle} placement="top" arrow>
      <Box
        onClick={onClick}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        sx={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isLocked ? 'not-allowed' : 'pointer',
          bgcolor: getBgColor(),
          border: getBorder(),
          outline: isFocused ? '2px solid #90caf9' : 'none',
          outlineOffset: isFocused ? -2 : 0,
          boxShadow: isFocused ? '0 0 0 2px rgba(25, 118, 210, 0.3)' : 'none',
          borderRadius: 0.5,
          transition: 'all 0.2s ease',
          position: 'relative',
          '&:hover': {
            bgcolor: isConnected
              ? '#66bb6a'
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

        {/* Lock indicator (overlay) */}
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
