/*
 * NAM Model Selector Component
 *
 * Displays available Neural Amp Modeler models and allows selection.
 * Integrated into plugin parameter display when NAM is selected.
 */

import React, { useState, useEffect } from 'react';
import {
    Box,
    Select,
    MenuItem,
    Typography,
    CircularProgress,
    Alert
} from '@mui/material';

interface NAMModel {
    name: string;
    type: string;
    size_mb: number;
    path: string;
}

interface NAMModelSelectorProps {
    onModelSelect?: (modelName: string) => void;
    disabled?: boolean;
    compact?: boolean;
    onError?: (error: string) => void;
}

export function NAMModelSelector(props: NAMModelSelectorProps) {
    const { onModelSelect, disabled = false, compact = true, onError } = props;
    const [models, setModels] = useState<NAMModel[]>([]);
    const [selectedModel, setSelectedModel] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchModels();
    }, []);

    const fetchModels = async () => {
        try {
            setLoading(true);
            setError(null);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch('/api/nam/models', { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            let items: NAMModel[] = (data.models || []).slice(0, 50);

            if (items.length === 0) {
                setError('No NAM models found');
                setLoading(false);
                return;
            }

            setModels(items);
            setSelectedModel(items[0].name);
            onModelSelect?.(items[0].name);
            setLoading(false);
        } catch (err) {
            const msg = err instanceof Error && err.name === 'AbortError' 
                ? 'Request timeout' 
                : 'Failed to load models';
            setError(msg);
            onError?.(msg);
            setLoading(false);
        }
    };

    const handleChange = (e: any) => {
        const name = e.target.value;
        setSelectedModel(name);
        onModelSelect?.(name);
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1 }}>
                <CircularProgress size={16} />
                <Typography variant="caption">Loading...</Typography>
            </Box>
        );
    }

    if (error) {
        return <Alert severity="warning" sx={{ m: 1, fontSize: '12px' }}>{error}</Alert>;
    }

    return (
        <Select
            value={selectedModel}
            onChange={handleChange}
            disabled={disabled || loading}
            fullWidth
            size="small"
            MenuProps={{
                PaperProps: {
                    sx: {
                        maxHeight: '300px',
                        '&::-webkit-scrollbar': { width: '6px' },
                        '&::-webkit-scrollbar-thumb': { background: '#404040', borderRadius: '3px' }
                    }
                }
            }}
        >
            {models.map((m) => <MenuItem key={m.name} value={m.name}>{m.name}</MenuItem>)}
        </Select>
    );
}

export default NAMModelSelector;
