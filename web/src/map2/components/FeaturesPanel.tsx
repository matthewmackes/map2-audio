// ============================================================================
// MAP2 Audio Platform - Unified Features Panel
// Central panel surfacing all 10 recommended features
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Divider,
  Collapse,
  IconButton,
  Tooltip,
  useMediaQuery,
} from '@mui/material';
import {
  ArrowsHorizontal,
  Camera,
  ChevronDown,
  ChevronUp,
  Dashboard,
  Document,
  Flash,
} from '@carbon/icons-react';
import { useTheme, alpha } from '@mui/material/styles';

// Import all feature components
import SnapshotBar from './SnapshotBar';
import FeatureToolbar from './FeatureToolbar';
import PluginCpuIndicator from './PluginCpuIndicator';
import LatencyDisplay from './LatencyDisplay';
import SessionStatusIndicator from './SessionStatusIndicator';
import BackupStatusWidget from './BackupStatusWidget';
import ABQuickToggle from './ABQuickToggle';

interface Chain {
  id: number;
  name: string;
  pluginCount?: number;
}

interface FeaturesPanelProps {
  chains?: Chain[];
  selectedChainAId?: number;
  selectedChainBId?: number;
  onChainAChange?: (id: number) => void;
  onChainBChange?: (id: number) => void;
  compact?: boolean;
  showAllSections?: boolean;
}

export default function FeaturesPanel({
  chains = [],
  selectedChainAId,
  selectedChainBId,
  onChainAChange,
  onChainBChange,
  compact = false,
  showAllSections = true,
}: FeaturesPanelProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [abEnabled, setAbEnabled] = useState(false);
  const [abBlend, setAbBlend] = useState(50);
  const [expandedSections, setExpandedSections] = useState({
    toolbar: true,
    snapshots: true,
    performance: !isMobile,
    abMode: true,
    session: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Compact mobile layout
  if (compact || isMobile) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {/* Top Bar: Toolbar + Session + Backup */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <FeatureToolbar compact />
          <Box sx={{ flex: 1 }} />
          <SessionStatusIndicator compact />
          <BackupStatusWidget compact />
        </Box>

        {/* Snapshots Bar */}
        <SnapshotBar compact />

        {/* A/B Toggle */}
        <ABQuickToggle
          chains={chains}
          chainAId={selectedChainAId}
          chainBId={selectedChainBId}
          blendPosition={abBlend}
          enabled={abEnabled}
          onChainAChange={onChainAChange}
          onChainBChange={onChainBChange}
          onBlendChange={setAbBlend}
          onToggle={setAbEnabled}
          compact
        />

        {/* Performance (collapsed by default on mobile) */}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <PluginCpuIndicator compact showChainTotal />
          <LatencyDisplay compact />
        </Box>
      </Box>
    );
  }

  // Full desktop layout
  return (
    <Paper
      elevation={2}
      sx={{
        p: 2,
        bgcolor: alpha(theme.palette.background.paper, 0.95),
        borderRadius: 2,
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Box sx={{ color: 'primary.main', display: 'inline-flex' }}>
          <Dashboard size={20} />
        </Box>
        <Typography variant="h6" sx={{ flex: 1 }}>
          Quick Access
        </Typography>
      </Box>

      <Grid container spacing={2}>
        {/* Left Column: Toolbar & Snapshots */}
        <Grid item xs={12} lg={8}>
          {/* Feature Toolbar Section */}
          <Box sx={{ mb: 2 }}>
            <Box 
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                cursor: 'pointer',
                mb: 1,
              }}
              onClick={() => toggleSection('toolbar')}
            >
              <Typography variant="subtitle2" sx={{ flex: 1 }}>
                <Document size={16} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
                Undo/Redo & Automation
              </Typography>
              <IconButton size="small">
                {expandedSections.toolbar ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </IconButton>
            </Box>
            <Collapse in={expandedSections.toolbar}>
              <FeatureToolbar />
            </Collapse>
          </Box>

          {/* Snapshots Section */}
          <Box sx={{ mb: 2 }}>
            <Box 
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                cursor: 'pointer',
                mb: 1,
              }}
              onClick={() => toggleSection('snapshots')}
            >
              <Typography variant="subtitle2" sx={{ flex: 1 }}>
                <Camera size={16} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
                Quick Snapshots
              </Typography>
              <IconButton size="small">
                {expandedSections.snapshots ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </IconButton>
            </Box>
            <Collapse in={expandedSections.snapshots}>
              <SnapshotBar />
            </Collapse>
          </Box>

          {/* A/B Mode Section */}
          <Box>
            <Box 
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                cursor: 'pointer',
                mb: 1,
              }}
              onClick={() => toggleSection('abMode')}
            >
              <Typography variant="subtitle2" sx={{ flex: 1 }}>
                <ArrowsHorizontal size={16} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
                A/B Compare
              </Typography>
              <IconButton size="small">
                {expandedSections.abMode ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </IconButton>
            </Box>
            <Collapse in={expandedSections.abMode}>
              <ABQuickToggle
                chains={chains}
                chainAId={selectedChainAId}
                chainBId={selectedChainBId}
                blendPosition={abBlend}
                enabled={abEnabled}
                onChainAChange={onChainAChange}
                onChainBChange={onChainBChange}
                onBlendChange={setAbBlend}
                onToggle={setAbEnabled}
              />
            </Collapse>
          </Box>
        </Grid>

        {/* Right Column: Performance & Status */}
        <Grid item xs={12} lg={4}>
          {/* Session & Backup */}
          <Box sx={{ mb: 2 }}>
            <Box 
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                cursor: 'pointer',
                mb: 1,
              }}
              onClick={() => toggleSection('session')}
            >
              <Typography variant="subtitle2" sx={{ flex: 1 }}>
                Session & Backup
              </Typography>
              <IconButton size="small">
                {expandedSections.session ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </IconButton>
            </Box>
            <Collapse in={expandedSections.session}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <SessionStatusIndicator />
                <BackupStatusWidget />
              </Box>
            </Collapse>
          </Box>

          {/* Performance Metrics */}
          <Box>
            <Box 
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                cursor: 'pointer',
                mb: 1,
              }}
              onClick={() => toggleSection('performance')}
            >
              <Typography variant="subtitle2" sx={{ flex: 1 }}>
                <Flash size={16} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
                Performance
              </Typography>
              <IconButton size="small">
                {expandedSections.performance ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </IconButton>
            </Box>
            <Collapse in={expandedSections.performance}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <PluginCpuIndicator showChainTotal />
                <LatencyDisplay showCompensationToggle />
              </Box>
            </Collapse>
          </Box>
        </Grid>
      </Grid>
    </Paper>
  );
}

// Export a minimal status bar version for embedding in headers
export function FeatureStatusBar() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <FeatureToolbar compact />
      <Divider orientation="vertical" flexItem />
      <SnapshotBar compact />
      <Divider orientation="vertical" flexItem />
      <SessionStatusIndicator compact />
      <BackupStatusWidget compact />
    </Box>
  );
}
