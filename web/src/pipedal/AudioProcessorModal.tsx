import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Stack,
  Divider,
  Button,
  Box
} from '@mui/material';

interface AudioProcessorModalProps {
  open: boolean;
  onSelect: (type: 'nam' | 'cabinet' | 'reverb' | 'lv2') => void;
  onClose: () => void;
}

export function AudioProcessorModal({ open, onSelect, onClose }: AudioProcessorModalProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Select Audio Processor Type</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {/* Neural Networks */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
              Neural Networks
            </Typography>
            <Card
              onClick={() => {
                onSelect('nam');
                onClose();
              }}
              sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
            >
              <CardActionArea>
                <CardContent>
                  <Typography variant="h6">🎸 Neural Amp Modeler</Typography>
                  <Typography variant="body2" color="textSecondary">
                    AI-trained guitar amp simulator with high-quality tone modeling
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Box>

          <Divider />

          {/* Impulse Responses */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
              Impulse Responses
            </Typography>
            <Stack spacing={1}>
              <Card
                onClick={() => {
                  onSelect('cabinet');
                  onClose();
                }}
                sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
              >
                <CardActionArea>
                  <CardContent>
                    <Typography variant="h6">🎚 Cabinet IR</Typography>
                    <Typography variant="body2" color="textSecondary">
                      Speaker cabinet simulation with impulse response convolution
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>

              <Card
                onClick={() => {
                  onSelect('reverb');
                  onClose();
                }}
                sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
              >
                <CardActionArea>
                  <CardContent>
                    <Typography variant="h6">🎵 Reverb IR</Typography>
                    <Typography variant="body2" color="textSecondary">
                      Space and room simulation with authentic reverb responses
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Stack>
          </Box>

          <Divider />

          {/* Standard LV2 */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
              Standard Plugins
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
              50+ professional LV2 effects and processors
            </Typography>
            <Button variant="outlined" fullWidth onClick={() => {
              onSelect('lv2');
              onClose();
            }}>
              Browse Standard LV2 Plugins
            </Button>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}

export default AudioProcessorModal;
