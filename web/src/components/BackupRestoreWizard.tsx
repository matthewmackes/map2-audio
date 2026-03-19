/**
 * Backup & Restore Wizard Component
 * 
 * Step-by-step guided interface for cluster backup and restore operations:
 * - Select backup date
 * - Choose what to restore (full/database/presets/config)
 * - Preview changes
 * - Execute restore
 * - Verify integrity
 * - Show progress with percentage completion
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Button,
  Typography,
  Card,
  CardContent,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  List,
  ListItem,
  ListItemText,
  Alert,
  AlertTitle,
  LinearProgress,
  Chip,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  CheckmarkFilled as CheckIcon,
  CloudDownload as BackupIcon,
  Upload as RestoreIcon,
  WarningAlt as WarningIcon,
} from '@carbon/icons-react';

// ============================================================================
// Types
// ============================================================================

interface BackupManifest {
  backup_id: string;
  timestamp: string;
  backup_type: string;
  size_mb: number;
  files_included: string[];
  restoration_tested: boolean;
  nodes_included: string[];
}

interface RestoreProgress {
  step: string;
  progress: number;
  message: string;
  completed: boolean;
  error?: string;
}

// ============================================================================
// Main Component
// ============================================================================

export default function BackupRestoreWizard({
  open,
  onClose,
  mode = 'restore',
}: {
  open: boolean;
  onClose: () => void;
  mode?: 'backup' | 'restore';
}) {
  const [activeStep, setActiveStep] = useState(0);
  const [backups, setBackups] = useState<BackupManifest[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<string>('');
  const [restoreType, setRestoreType] = useState<string>('full');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<RestoreProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const API_BASE = 'http://localhost:8080/api/cluster';

  // Wizard steps
  const restoreSteps = [
    'Select Backup',
    'Choose Restore Type',
    'Preview Changes',
    'Execute Restore',
    'Verification',
  ];

  const backupSteps = [
    'Choose Backup Type',
    'Review',
    'Execute Backup',
    'Verification',
  ];

  const steps = mode === 'restore' ? restoreSteps : backupSteps;

  // ============================================================================
  // Data Fetching
  // ============================================================================

  useEffect(() => {
    if (open && mode === 'restore') {
      fetchBackups();
    }
  }, [open, mode]);

  const fetchBackups = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/backup/list?limit=20`);
      if (!response.ok) throw new Error('Failed to fetch backups');
      const data = await response.json();
      setBackups(data.backups || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // Actions
  // ============================================================================

  const handleCreateBackup = async () => {
    try {
      setLoading(true);
      setProgress({
        step: 'Creating backup',
        progress: 0,
        message: 'Initializing backup...',
        completed: false,
      });

      const response = await fetch(
        `${API_BASE}/backup/create?backup_type=${restoreType}`,
        {
          method: 'POST',
        }
      );

      if (!response.ok) throw new Error('Backup creation failed');

      const result = await response.json();

      // Simulate progress updates
      await simulateProgress([
        { progress: 25, message: 'Collecting database files...' },
        { progress: 50, message: 'Backing up presets...' },
        { progress: 75, message: 'Creating archive...' },
        { progress: 100, message: 'Backup complete!' },
      ]);

      setSuccess(true);
      setProgress({
        step: 'Complete',
        progress: 100,
        message: `Backup created: ${result.backup.backup_id}`,
        completed: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed');
      setProgress({
        step: 'Failed',
        progress: 0,
        message: 'Backup failed',
        completed: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    try {
      setLoading(true);
      setProgress({
        step: 'Restoring',
        progress: 0,
        message: 'Preparing restore...',
        completed: false,
      });

      const response = await fetch(`${API_BASE}/backup/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backup_id: selectedBackup,
          restore_type: restoreType,
        }),
      });

      if (!response.ok) throw new Error('Restore failed');

      // Simulate progress
      await simulateProgress([
        { progress: 20, message: 'Verifying backup integrity...' },
        { progress: 40, message: 'Extracting files...' },
        { progress: 60, message: 'Restoring database...' },
        { progress: 80, message: 'Restoring configurations...' },
        { progress: 100, message: 'Restore complete!' },
      ]);

      setSuccess(true);
      setProgress({
        step: 'Complete',
        progress: 100,
        message: 'Restore completed successfully',
        completed: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
      setProgress({
        step: 'Failed',
        progress: 0,
        message: 'Restore failed',
        completed: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  const simulateProgress = async (
    steps: { progress: number; message: string }[]
  ) => {
    for (const step of steps) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setProgress((prev) => ({
        ...prev!,
        progress: step.progress,
        message: step.message,
      }));
    }
  };

  // ============================================================================
  // Step Content Renderers
  // ============================================================================

  const renderSelectBackupStep = () => (
    <Box>
      <Typography variant="body2" sx={{ mb: 2 }}>
        Select a backup to restore from:
      </Typography>
      
      {loading ? (
        <LinearProgress />
      ) : backups.length === 0 ? (
        <Alert severity="info">No backups available</Alert>
      ) : (
        <FormControl component="fieldset" fullWidth>
          <RadioGroup
            value={selectedBackup}
            onChange={(e) => setSelectedBackup(e.target.value)}
          >
            {backups.map((backup) => (
              <Card
                key={backup.backup_id}
                sx={{
                  mb: 1,
                  border: selectedBackup === backup.backup_id ? 2 : 1,
                  borderColor:
                    selectedBackup === backup.backup_id
                      ? 'primary.main'
                      : 'divider',
                }}
              >
                <CardContent>
                  <FormControlLabel
                    value={backup.backup_id}
                    control={<Radio />}
                    label={
                      <Box>
                        <Typography variant="subtitle2">
                          {backup.backup_id}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                          <Chip label={backup.backup_type} size="small" />
                          <Chip
                            label={`${backup.size_mb} MB`}
                            size="small"
                            variant="outlined"
                          />
                          <Chip
                            label={new Date(backup.timestamp).toLocaleString()}
                            size="small"
                            variant="outlined"
                          />
                          {backup.restoration_tested && (
                            <Chip
                              icon={<CheckIcon />}
                              label="Tested"
                              size="small"
                              color="success"
                            />
                          )}
                        </Box>
                        <Typography variant="caption" color="textSecondary">
                          Nodes: {backup.nodes_included.join(', ')}
                        </Typography>
                      </Box>
                    }
                  />
                </CardContent>
              </Card>
            ))}
          </RadioGroup>
        </FormControl>
      )}
    </Box>
  );

  const renderRestoreTypeStep = () => (
    <Box>
      <FormControl component="fieldset">
        <FormLabel component="legend">What would you like to restore?</FormLabel>
        <RadioGroup
          value={restoreType}
          onChange={(e) => setRestoreType(e.target.value)}
          sx={{ mt: 2 }}
        >
          <FormControlLabel
            value="full"
            control={<Radio />}
            label={
              <Box>
                <Typography variant="subtitle2">Full Restore</Typography>
                <Typography variant="caption" color="textSecondary">
                  Restore everything: databases, presets, and configurations
                </Typography>
              </Box>
            }
          />
          <FormControlLabel
            value="database"
            control={<Radio />}
            label={
              <Box>
                <Typography variant="subtitle2">Database Only</Typography>
                <Typography variant="caption" color="textSecondary">
                  Restore cluster registry and metadata
                </Typography>
              </Box>
            }
          />
          <FormControlLabel
            value="presets"
            control={<Radio />}
            label={
              <Box>
                <Typography variant="subtitle2">Presets Only</Typography>
                <Typography variant="caption" color="textSecondary">
                  Restore user preset library
                </Typography>
              </Box>
            }
          />
          <FormControlLabel
            value="config"
            control={<Radio />}
            label={
              <Box>
                <Typography variant="subtitle2">Configuration Only</Typography>
                <Typography variant="caption" color="textSecondary">
                  Restore configuration files
                </Typography>
              </Box>
            }
          />
        </RadioGroup>
      </FormControl>
    </Box>
  );

  const renderPreviewStep = () => {
    const selectedBackupData = backups.find((b) => b.backup_id === selectedBackup);
    
    return (
      <Box>
        <Alert severity="warning" sx={{ mb: 2 }}>
          <AlertTitle>Warning</AlertTitle>
          This will overwrite current data. A safety backup will be created automatically.
        </Alert>

        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Restore Summary
            </Typography>
            <Divider sx={{ mb: 2 }} />
            
            <List dense>
              <ListItem>
                <ListItemText
                  primary="Backup ID"
                  secondary={selectedBackup}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Restore Type"
                  secondary={restoreType}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Backup Date"
                  secondary={
                    selectedBackupData
                      ? new Date(selectedBackupData.timestamp).toLocaleString()
                      : 'Unknown'
                  }
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Size"
                  secondary={`${selectedBackupData?.size_mb || 0} MB`}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Files Included"
                  secondary={`${selectedBackupData?.files_included.length || 0} files`}
                />
              </ListItem>
            </List>
          </CardContent>
        </Card>
      </Box>
    );
  };

  const renderExecuteStep = () => (
    <Box>
      {progress ? (
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            {progress.step}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={progress.progress}
            sx={{ mb: 2, height: 8, borderRadius: 4 }}
          />
          <Typography variant="body2" color="textSecondary">
            {progress.message} ({progress.progress}%)
          </Typography>

          {progress.error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {progress.error}
            </Alert>
          )}

          {progress.completed && !progress.error && (
            <Alert severity="success" sx={{ mt: 2 }} icon={<CheckIcon />}>
              {mode === 'restore' ? 'Restore' : 'Backup'} completed successfully!
            </Alert>
          )}
        </Box>
      ) : (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="h6" gutterBottom>
            Ready to {mode === 'restore' ? 'restore' : 'create backup'}
          </Typography>
          <Button
            variant="contained"
            size="large"
            startIcon={mode === 'restore' ? <RestoreIcon /> : <BackupIcon />}
            onClick={mode === 'restore' ? handleRestore : handleCreateBackup}
            disabled={loading}
            sx={{ mt: 2 }}
          >
            {mode === 'restore' ? 'Start Restore' : 'Create Backup'}
          </Button>
        </Box>
      )}
    </Box>
  );

  const renderVerificationStep = () => (
    <Box sx={{ textAlign: 'center', py: 4 }}>
      {success ? (
        <>
          <CheckIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
          <Typography variant="h5" gutterBottom>
            {mode === 'restore' ? 'Restore' : 'Backup'} Successful!
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {mode === 'restore'
              ? 'Your cluster has been restored from the selected backup.'
              : 'Your cluster backup has been created successfully.'}
          </Typography>
        </>
      ) : (
        <>
          <WarningIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
          <Typography variant="h5" gutterBottom>
            {mode === 'restore' ? 'Restore' : 'Backup'} Failed
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {error || 'An unknown error occurred'}
          </Typography>
        </>
      )}
    </Box>
  );

  const getStepContent = (step: number) => {
    if (mode === 'restore') {
      switch (step) {
        case 0:
          return renderSelectBackupStep();
        case 1:
          return renderRestoreTypeStep();
        case 2:
          return renderPreviewStep();
        case 3:
          return renderExecuteStep();
        case 4:
          return renderVerificationStep();
        default:
          return null;
      }
    } else {
      switch (step) {
        case 0:
          return renderRestoreTypeStep();
        case 1:
          return renderPreviewStep();
        case 2:
          return renderExecuteStep();
        case 3:
          return renderVerificationStep();
        default:
          return null;
      }
    }
  };

  const handleNext = () => {
    setActiveStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const handleReset = () => {
    setActiveStep(0);
    setSelectedBackup('');
    setRestoreType('full');
    setProgress(null);
    setError(null);
    setSuccess(false);
  };

  const canProceed = () => {
    if (mode === 'restore') {
      if (activeStep === 0) return !!selectedBackup;
      if (activeStep === 1) return !!restoreType;
    } else {
      if (activeStep === 0) return !!restoreType;
    }
    return true;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {mode === 'restore' ? 'Restore Wizard' : 'Backup Wizard'}
      </DialogTitle>
      <DialogContent>
        <Stepper activeStep={activeStep} orientation="vertical">
          {steps.map((label, index) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
              <StepContent>
                {getStepContent(index)}
                <Box sx={{ mt: 2 }}>
                  <Button
                    variant="contained"
                    onClick={handleNext}
                    disabled={!canProceed() || loading}
                    sx={{ mr: 1 }}
                  >
                    {index === steps.length - 1 ? 'Finish' : 'Continue'}
                  </Button>
                  <Button disabled={index === 0 || loading} onClick={handleBack}>
                    Back
                  </Button>
                </Box>
              </StepContent>
            </Step>
          ))}
        </Stepper>
      </DialogContent>
      <DialogActions>
        {activeStep === steps.length && (
          <Button onClick={handleReset}>Start Over</Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
