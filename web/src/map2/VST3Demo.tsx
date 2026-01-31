import React from 'react';
import { Container, Typography, Box, Paper } from '@mui/material';
import VST3PluginLoader from './components/VST3PluginLoader';

export const VST3Demo: React.FC = () => {
  const handlePluginAdded = (instanceId: string) => {
    console.log('Plugin added to chain with instance ID:', instanceId);
    // Here you would typically update your effects chain state
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Typography variant="h4" gutterBottom>
          VST3 Plugin Manager
        </Typography>
        
        <Typography variant="body1" color="text.secondary" paragraph>
          Load VST3 plugins into the effects chain and control their parameters.
        </Typography>

        <Box sx={{ mt: 4 }}>
          <VST3PluginLoader onPluginAdded={handlePluginAdded} />
        </Box>

        <Box sx={{ mt: 4, p: 2, bgcolor: 'info.main', color: 'info.contrastText', borderRadius: 1 }}>
          <Typography variant="body2">
            <strong>Note:</strong> VST3 plugins must be instantiated in the effects chain
            before their parameters can be enumerated. After clicking "Add to Effects Chain",
            the plugin will be loaded and parameters will become available.
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
};

export default VST3Demo;
