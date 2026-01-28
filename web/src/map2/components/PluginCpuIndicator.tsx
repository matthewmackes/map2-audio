// ============================================================================
// MAP2 Audio Platform - Plugin CPU Indicator Component
// Per-plugin CPU usage display with color-coded warnings
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  LinearProgress,
  Tooltip,
  Typography,
  IconButton,
  Chip,
  Paper,
  List,
  ListItem,
  ListItemText,
  Collapse,
} from '@mui/material';
import {
  Speed as CpuIcon,
  Warning as WarningIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';

interface PluginCpuStats {
  uri: string;
  name: string;
  cpuPercent: number;
  avgTimeUs: number;
  maxTimeUs: number;
  callsPerSecond: number;
}

interface ChainCpuStats {
  totalPlugins: number;
  totalCpuPercent: number;
  totalAvgUs: number;
  totalMaxUs: number;
  deadlineUs: number;
  utilizationPercent: number;
}

interface PluginCpuIndicatorProps {
  pluginUri?: string;  // Show single plugin stats if provided
  showChainTotal?: boolean;
  compact?: boolean;
  onRefresh?: () => void;
}

const API_BASE = '/api';

// Color thresholds for CPU usage
const getCpuColor = (percent: number) => {
  if (percent < 30) return 'success';
  if (percent < 60) return 'warning';
  return 'error';
};

const getCpuColorHex = (percent: number, theme: any) => {
  if (percent < 30) return theme.palette.success.main;
  if (percent < 60) return theme.palette.warning.main;
  return theme.palette.error.main;
};

export function PluginCpuBadge({ cpuPercent, compact = false }: { cpuPercent: number; compact?: boolean }) {
  const theme = useTheme();
  const color = getCpuColor(cpuPercent);
  
  if (compact) {
    return (
      <Tooltip title={`CPU: ${cpuPercent.toFixed(1)}%`}>
        <Box
          sx={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            bgcolor: getCpuColorHex(cpuPercent, theme),
            display: 'inline-block',
          }}
        />
      </Tooltip>
    );
  }

  return (
    <Chip
      icon={<CpuIcon sx={{ fontSize: 14 }} />}
      label={`${cpuPercent.toFixed(1)}%`}
      size="small"
      color={color}
      variant="outlined"
      sx={{ 
        height: 20, 
        '& .MuiChip-label': { px: 0.5, fontSize: 11 },
        '& .MuiChip-icon': { ml: 0.5 },
      }}
    />
  );
}

export function PluginCpuBar({ cpuPercent, maxPercent = 100 }: { cpuPercent: number; maxPercent?: number }) {
  const theme = useTheme();
  
  return (
    <Tooltip title={`CPU: ${cpuPercent.toFixed(1)}% of ${maxPercent}% budget`}>
      <Box sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1 }}>
        <LinearProgress
          variant="determinate"
          value={Math.min((cpuPercent / maxPercent) * 100, 100)}
          sx={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.grey[500], 0.2),
            '& .MuiLinearProgress-bar': {
              bgcolor: getCpuColorHex(cpuPercent, theme),
              borderRadius: 2,
            },
          }}
        />
        <Typography variant="caption" sx={{ minWidth: 35, textAlign: 'right', fontFamily: 'monospace' }}>
          {cpuPercent.toFixed(1)}%
        </Typography>
      </Box>
    </Tooltip>
  );
}

export default function PluginCpuIndicator({
  pluginUri,
  showChainTotal = true,
  compact = false,
  onRefresh,
}: PluginCpuIndicatorProps) {
  const theme = useTheme();
  const [plugins, setPlugins] = useState<PluginCpuStats[]>([]);
  const [chain, setChain] = useState<ChainCpuStats | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/profiling/plugins`);
      if (res.ok) {
        const data = await res.json();
        
        if (data.plugins) {
          setPlugins(data.plugins.map((p: any) => ({
            uri: p.uri,
            name: p.name || p.uri.split('#').pop() || 'Unknown',
            cpuPercent: p.cpu_percent || 0,
            avgTimeUs: p.avg_time_us || 0,
            maxTimeUs: p.max_time_us || 0,
            callsPerSecond: p.calls_per_second || 0,
          })));
        }
        
        if (data.chain) {
          setChain({
            totalPlugins: data.chain.total_plugins || 0,
            totalCpuPercent: data.chain.total_cpu_percent || 0,
            totalAvgUs: data.chain.total_avg_us || 0,
            totalMaxUs: data.chain.total_max_us || 0,
            deadlineUs: data.chain.deadline_us || 5333,
            utilizationPercent: data.chain.utilization_percent || 0,
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch CPU stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Single plugin mode
  if (pluginUri) {
    const plugin = plugins.find(p => p.uri === pluginUri);
    if (!plugin) return null;
    
    return compact ? (
      <PluginCpuBadge cpuPercent={plugin.cpuPercent} compact />
    ) : (
      <PluginCpuBar cpuPercent={plugin.cpuPercent} />
    );
  }

  // Full chain view
  return (
    <Paper
      elevation={1}
      sx={{
        p: compact ? 0.5 : 1,
        bgcolor: alpha(theme.palette.background.paper, 0.8),
        borderRadius: 2,
      }}
    >
      {/* Chain Summary */}
      {showChainTotal && chain && (
        <Box 
          sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1, 
            cursor: 'pointer',
            mb: expanded ? 1 : 0,
          }}
          onClick={() => setExpanded(!expanded)}
        >
          <CpuIcon 
            sx={{ 
              color: getCpuColorHex(chain.totalCpuPercent, theme),
              fontSize: 20,
            }} 
          />
          
          {!compact && (
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              DSP
            </Typography>
          )}
          
          <Box sx={{ flex: 1 }}>
            <PluginCpuBar cpuPercent={chain.totalCpuPercent} maxPercent={80} />
          </Box>
          
          {chain.totalCpuPercent > 70 && (
            <Tooltip title="High CPU usage - consider removing plugins">
              <WarningIcon sx={{ color: theme.palette.warning.main, fontSize: 16 }} />
            </Tooltip>
          )}
          
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
            {expanded ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />}
          </IconButton>
          
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); fetchStats(); onRefresh?.(); }}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Box>
      )}

      {/* Per-Plugin Breakdown */}
      <Collapse in={expanded}>
        <List dense disablePadding>
          {plugins
            .sort((a, b) => b.cpuPercent - a.cpuPercent)
            .map((plugin) => (
              <ListItem key={plugin.uri} sx={{ px: 0, py: 0.25 }}>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PluginCpuBadge cpuPercent={plugin.cpuPercent} />
                      <Typography variant="caption" noWrap sx={{ flex: 1 }}>
                        {plugin.name}
                      </Typography>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace', opacity: 0.7 }}>
                        {plugin.avgTimeUs.toFixed(0)}µs
                      </Typography>
                    </Box>
                  }
                />
              </ListItem>
            ))}
        </List>
        
        {chain && (
          <Box sx={{ mt: 1, pt: 1, borderTop: `1px solid ${theme.palette.divider}` }}>
            <Typography variant="caption" color="textSecondary">
              Buffer deadline: {chain.deadlineUs.toFixed(0)}µs • 
              Used: {chain.totalAvgUs.toFixed(0)}µs ({chain.utilizationPercent.toFixed(1)}%)
            </Typography>
          </Box>
        )}
      </Collapse>
    </Paper>
  );
}

// Export utility function for inline use
export function useCpuStats(pluginUri?: string) {
  const [cpuPercent, setCpuPercent] = useState(0);
  
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_BASE}/profiling/plugins`);
        if (res.ok) {
          const data = await res.json();
          if (pluginUri && data.plugins) {
            const plugin = data.plugins.find((p: any) => p.uri === pluginUri);
            setCpuPercent(plugin?.cpu_percent || 0);
          } else if (data.chain) {
            setCpuPercent(data.chain.total_cpu_percent || 0);
          }
        }
      } catch (err) {
        // Ignore
      }
    };
    
    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, [pluginUri]);
  
  return cpuPercent;
}
