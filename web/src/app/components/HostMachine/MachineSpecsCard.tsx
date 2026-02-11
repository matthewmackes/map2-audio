/**
 * Machine Specs Card - Hardware Specifications Display
 */

import { Box, Paper, Grid, Typography } from '@mui/material'
import { Cpu, HardDrive, Lightning, FileText } from '@phosphor-icons/react'
import type { HostMachineInfo } from '@/map2/types'

interface MachineSpecsCardProps {
  machineInfo: HostMachineInfo
}

const SpecRow = ({ label, value }: { label: string; value?: string | number }) => (
  <Box sx={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 2, py: 0.5, fontSize: 14 }}>
    <Typography sx={{ fontWeight: 600, color: '#333' }}>{label}</Typography>
    <Typography sx={{ color: '#6b7280', wordBreak: 'break-all' }}>{value || 'N/A'}</Typography>
  </Box>
)

export default function MachineSpecsCard({ machineInfo }: MachineSpecsCardProps) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
      {/* Processor Section */}
      <Paper sx={{ p: 2.5, border: '1px solid #e5e7eb' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Cpu size={20} weight="duotone" style={{ color: '#2563eb' }} />
          <Typography sx={{ fontWeight: 700, fontSize: 16 }}>Processor</Typography>
        </Box>
        <Box sx={{ borderTop: '1px solid #f0f0f0', pt: 1.5 }}>
          <SpecRow label="Model" value={machineInfo.cpu_model} />
          <SpecRow label="Cores" value={`${machineInfo.cpu_cores} physical`} />
          <SpecRow label="Threads" value={`${machineInfo.cpu_threads} logical`} />
          <SpecRow label="Frequency" value={machineInfo.cpu_frequency_mhz ? `${(machineInfo.cpu_frequency_mhz / 1000).toFixed(2)} GHz` : 'N/A'} />
        </Box>
      </Paper>

      {/* Memory Section */}
      <Paper sx={{ p: 2.5, border: '1px solid #e5e7eb' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <HardDrive size={20} weight="duotone" style={{ color: '#10b981' }} />
          <Typography sx={{ fontWeight: 700, fontSize: 16 }}>Memory</Typography>
        </Box>
        <Box sx={{ borderTop: '1px solid #f0f0f0', pt: 1.5 }}>
          <SpecRow label="Capacity" value={`${(machineInfo.total_memory_mb / 1024).toFixed(1)} GB`} />
          <SpecRow label="Type" value="System Memory" />
          <SpecRow label="Usage" value="Check health monitor" />
        </Box>
      </Paper>

      {/* System Information */}
      <Paper sx={{ p: 2.5, border: '1px solid #e5e7eb' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Lightning size={20} weight="duotone" style={{ color: '#f59e0b' }} />
          <Typography sx={{ fontWeight: 700, fontSize: 16 }}>System</Typography>
        </Box>
        <Box sx={{ borderTop: '1px solid #f0f0f0', pt: 1.5 }}>
          <SpecRow label="Manufacturer" value={machineInfo.manufacturer} />
          <SpecRow label="Product" value={machineInfo.product_name} />
          <SpecRow label="Chassis" value={machineInfo.chassis_type} />
          <SpecRow label="Hostname" value={machineInfo.hostname} />
        </Box>
      </Paper>

      {/* BIOS & Firmware */}
      <Paper sx={{ p: 2.5, border: '1px solid #e5e7eb' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <FileText size={20} weight="duotone" style={{ color: '#60a5fa' }} />
          <Typography sx={{ fontWeight: 700, fontSize: 16 }}>BIOS & Firmware</Typography>
        </Box>
        <Box sx={{ borderTop: '1px solid #f0f0f0', pt: 1.5 }}>
          <SpecRow label="BIOS Version" value={machineInfo.bios_version} />
          <SpecRow label="BIOS Date" value={machineInfo.bios_date} />
          <SpecRow label="Kernel" value={machineInfo.kernel_version} />
        </Box>
      </Paper>

      {/* Service Information */}
      <Paper sx={{ p: 2.5, border: '1px solid #e5e7eb' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <FileText size={20} weight="duotone" style={{ color: '#60a5fa' }} />
          <Typography sx={{ fontWeight: 700, fontSize: 16 }}>Identification</Typography>
        </Box>
        <Box sx={{ borderTop: '1px solid #f0f0f0', pt: 1.5, fontSize: 11 }}>
          <Box sx={{ mb: 1.5 }}>
            <Typography sx={{ fontWeight: 600, color: '#333', mb: 0.5 }}>System UUID</Typography>
            <Typography sx={{ color: '#6b7280', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 11 }}>
              {machineInfo.system_uuid}
            </Typography>
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 600, color: '#333', mb: 0.5 }}>Hostname</Typography>
            <Typography sx={{ color: '#6b7280', wordBreak: 'break-all', fontFamily: 'monospace' }}>
              {machineInfo.hostname}
            </Typography>
          </Box>
        </Box>
      </Paper>
    </Box>
  )
}
