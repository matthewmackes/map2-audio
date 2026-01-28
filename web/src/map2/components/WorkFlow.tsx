// ============================================================================
// MAP2 Audio Platform - WorkFlow Component
// Combines Automation, History, and Sessions into one unified interface
// ============================================================================

import React, { useState } from 'react';
import {
  Box,
  Paper,
  Tabs,
  Tab,
  Typography,
} from '@mui/material';
import {
  Timeline as AutomationIcon,
  History as HistoryIcon,
  FolderOpen as SessionIcon,
} from '@mui/icons-material';

import AutomationEditor from './AutomationEditor';
import HistoryPanel from './HistoryPanel';
import SessionManager from './SessionManager';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`workflow-tabpanel-${index}`}
      aria-labelledby={`workflow-tab-${index}`}
      style={{ height: '100%', overflow: 'hidden' }}
      {...other}
    >
      {value === index && <Box sx={{ height: '100%' }}>{children}</Box>}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `workflow-tab-${index}`,
    'aria-controls': `workflow-tabpanel-${index}`,
  };
}

export default function WorkFlow() {
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Tab Navigation */}
      <Paper
        elevation={0}
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          aria-label="workflow tabs"
          sx={{
            '& .MuiTab-root': {
              minHeight: 56,
              textTransform: 'none',
              fontWeight: 500,
            },
            '& .Mui-selected': {
              color: 'primary.main',
            },
          }}
        >
          <Tab
            icon={<AutomationIcon />}
            label="Automation"
            {...a11yProps(0)}
            iconPosition="start"
          />
          <Tab
            icon={<HistoryIcon />}
            label="History"
            {...a11yProps(1)}
            iconPosition="start"
          />
          <Tab
            icon={<SessionIcon />}
            label="Sessions"
            {...a11yProps(2)}
            iconPosition="start"
          />
        </Tabs>
      </Paper>

      {/* Tab Panels */}
      <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
        <TabPanel value={tabValue} index={0}>
          <AutomationEditor />
        </TabPanel>
        <TabPanel value={tabValue} index={1}>
          <HistoryPanel />
        </TabPanel>
        <TabPanel value={tabValue} index={2}>
          <SessionManager />
        </TabPanel>
      </Box>
    </Box>
  );
}
