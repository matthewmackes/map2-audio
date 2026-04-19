/**
 * Sticky Headers Component
 *
 * Displays sticky headers for talkers (top) and listeners (left) that remain
 * visible while scrolling the routing matrix.
 *
 * Features:
 * - Talker names along the top (horizontal)
 * - Listener names along the left (vertical)
 * - Status indicators (availability, device type)
 * - Click to select endpoint
 * - Color coding from endpoint metadata
 */

import React from 'react';
import { Devices, DotMark, Pin, Router } from '@carbon/icons-react';
import { Box, Typography, Chip, Tooltip, Stack } from '@mui/material';
import { useRouting } from '../../context/RoutingContext';
import type { Endpoint } from '../../types';

interface StickyHeadersProps {
  talkers: Endpoint[];
  listeners: Endpoint[];
  cellWidth: number;
  cellHeight: number;
  headerWidth: number;
  headerHeight: number;
}

/**
 * Sticky headers component
 */
export function StickyHeaders({
  talkers,
  listeners,
  cellWidth,
  cellHeight,
  headerWidth,
  headerHeight,
}: StickyHeadersProps) {
  const { state } = useRouting();

  // Helper function to get node color for an endpoint
  const getNodeColor = (endpoint: Endpoint): string => {
    const node = state.network.nodes[endpoint.node_id];
    return node?.color || '#1976d2'; // Default blue
  };

  return (
    <>
      {/* Top-left corner (empty spacer) */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: headerWidth,
          height: headerHeight,
          bgcolor: 'background.paper',
          borderBottom: '2px solid',
          borderRight: '2px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 30,
        }}
      >
        <Typography variant="caption" color="text.disabled" textAlign="center">
          Talkers →<br />↓ Listeners
        </Typography>
      </Box>

      {/* Talker header (top, horizontal) */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: headerWidth,
          height: headerHeight,
          bgcolor: 'background.paper',
          borderBottom: '2px solid',
          borderColor: 'divider',
          display: 'flex',
          zIndex: 20,
          overflow: 'hidden',
        }}
      >
        {talkers.map((talker, index) => (
          <TalkerHeader
            key={talker.endpoint_id}
            talker={talker}
            width={cellWidth}
            height={headerHeight}
            nodeColor={getNodeColor(talker)}
          />
        ))}
      </Box>

      {/* Listener header (left, vertical) */}
      <Box
        sx={{
          position: 'absolute',
          top: headerHeight,
          left: 0,
          width: headerWidth,
          bgcolor: 'background.paper',
          borderRight: '2px solid',
          borderColor: 'divider',
          zIndex: 20,
          overflow: 'hidden',
        }}
      >
        {listeners.map((listener, index) => (
          <ListenerHeader
            key={listener.endpoint_id}
            listener={listener}
            width={headerWidth}
            height={cellHeight}
            nodeColor={getNodeColor(listener)}
          />
        ))}
      </Box>
    </>
  );
}

/**
 * Individual talker header cell
 */
function TalkerHeader({
  talker,
  width,
  height,
  nodeColor
}: {
  talker: Endpoint;
  width: number;
  height: number;
  nodeColor: string;
}) {
  const DeviceIcon = talker.device_type === 'map2' ? Devices : Router;
  const statusColor = talker.available ? '#4caf50' : '#f44336';

  return (
    <Tooltip
      title={
        <div>
          <div style={{ fontWeight: 'bold' }}>{talker.device_name}</div>
          <div>ID: {talker.endpoint_id}</div>
          <div>Type: {talker.device_type.toUpperCase()}</div>
          <div>{talker.channels}ch @ {talker.sample_rate / 1000}kHz</div>
          <div>Format: {talker.format}</div>
          {talker.mac_address && <div>MAC: {talker.mac_address}</div>}
          <div>Status: {talker.available ? 'Available' : 'Offline'}</div>
          {talker.tags.length > 0 && <div>Tags: {talker.tags.join(', ')}</div>}
        </div>
      }
      placement="top"
    >
      <Box
        sx={{
          width,
          height,
          minWidth: width,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.5,
          px: 0.5,
          borderRight: '1px solid',
          borderColor: 'divider',
          cursor: 'pointer',
          bgcolor: `${nodeColor}15`, // Light tint of node color
          borderTop: `3px solid ${nodeColor}`, // Bold top border with node color
          '&:hover': {
            bgcolor: `${nodeColor}25`,
          },
        }}
      >
        {/* Device icon + status */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <DeviceIcon size={14} />
          <DotMark size={12} style={{ color: statusColor }} />
        </Box>

        {/* Device name (vertical text) */}
        <Typography
          variant="caption"
          sx={{
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            fontSize: 11,
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxHeight: height - 40,
          }}
        >
          {talker.device_name}
        </Typography>

        {/* Pinned indicator */}
        {talker.pinned && (
          <Pin size={10} />
        )}
      </Box>
    </Tooltip>
  );
}

/**
 * Individual listener header cell
 */
function ListenerHeader({
  listener,
  width,
  height,
  nodeColor,
}: {
  listener: Endpoint;
  width: number;
  height: number;
  nodeColor: string;
}) {
  const DeviceIcon = listener.device_type === 'map2' ? Devices : Router;
  const statusColor = listener.available ? '#4caf50' : '#f44336';

  return (
    <Tooltip
      title={
        <div>
          <div style={{ fontWeight: 'bold' }}>{listener.device_name}</div>
          <div>ID: {listener.endpoint_id}</div>
          <div>Type: {listener.device_type.toUpperCase()}</div>
          <div>{listener.channels}ch @ {listener.sample_rate / 1000}kHz</div>
          <div>Format: {listener.format}</div>
          {listener.mac_address && <div>MAC: {listener.mac_address}</div>}
          <div>Status: {listener.available ? 'Available' : 'Offline'}</div>
          {listener.tags.length > 0 && <div>Tags: {listener.tags.join(', ')}</div>}
        </div>
      }
      placement="left"
    >
      <Box
        sx={{
          width,
          height,
          minHeight: height,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          cursor: 'pointer',
          bgcolor: `${nodeColor}15`, // Light tint of node color
          borderLeft: `3px solid ${nodeColor}`, // Bold left border with node color
          '&:hover': {
            bgcolor: `${nodeColor}25`,
          },
        }}
      >
        {/* Device icon + status */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
          <DeviceIcon size={14} />
          <DotMark size={12} style={{ color: statusColor }} />
        </Box>

        {/* Device name */}
        <Typography
          variant="body2"
          sx={{
            fontSize: 12,
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {listener.device_name}
        </Typography>

        {/* Pinned indicator */}
        {listener.pinned && (
          <Pin size={12} />
        )}
      </Box>
    </Tooltip>
  );
}

export default StickyHeaders;
