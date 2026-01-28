import React, { useState, useEffect } from 'react';
import { Box, Select, MenuItem, Typography, CircularProgress, Alert } from '@mui/material';

interface IR {
    name: string;
    type: string;
    size_mb: number;
    path: string;
}

interface IRSelectorProps {
    irType: 'cabinet' | 'reverb';
    onIRSelect?: (irName: string) => void;
    disabled?: boolean;
    compact?: boolean;
    onError?: (error: string) => void;
}

export function IRSelector(props: IRSelectorProps) {
    const { irType, onIRSelect, disabled = false, compact = true, onError } = props;
    const [irs, setIrs] = useState<IR[]>([]);
    const [selectedIR, setSelectedIR] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchIRs();
    }, [irType]);

    const fetchIRs = async () => {
        try {
            setLoading(true);
            setError(null);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const endpoint = irType === 'cabinet' ? '/api/ir/cabinets' : '/api/ir/reverbs';
            const response = await fetch(endpoint, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            let items: IR[] = (data.irs || []).slice(0, 50);

            if (items.length === 0) {
                setError(`No ${irType} IRs found`);
                setLoading(false);
                return;
            }

            setIrs(items);
            setSelectedIR(items[0].name);
            onIRSelect?.(items[0].name);
            setLoading(false);
        } catch (err) {
            const msg = err instanceof Error && err.name === 'AbortError'
                ? 'Request timeout'
                : 'Failed to load IRs';
            setError(msg);
            onError?.(msg);
            setLoading(false);
        }
    };

    const handleChange = (e: any) => {
        const name = e.target.value;
        setSelectedIR(name);
        onIRSelect?.(name);
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

    const label = irType === 'cabinet' ? 'Cabinet IR' : 'Reverb IR';

    return (
        <Select
            value={selectedIR}
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
            {irs.map((ir) => <MenuItem key={ir.name} value={ir.name}>{ir.name}</MenuItem>)}
        </Select>
    );
}

export default IRSelector;
