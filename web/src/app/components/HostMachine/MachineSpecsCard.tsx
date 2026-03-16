/**
 * Machine Specs Card - Hardware Specifications Display
 */

import { Cpu, HardDrive, Lightning, FileText, IdentificationCard } from '@phosphor-icons/react'
import type { HostMachineInfo } from '@/map2/types'

interface MachineSpecsCardProps {
  machineInfo: HostMachineInfo
  nodeId?: string | null
}

interface SpecSection {
  icon: React.ReactNode
  title: string
  rows: { label: string; value?: string | number | null }[]
}

export default function MachineSpecsCard({ machineInfo }: MachineSpecsCardProps) {
  const sections: SpecSection[] = [
    {
      icon: <Cpu size={16} weight="duotone" />,
      title: 'Processor',
      rows: [
        { label: 'Model', value: machineInfo.cpu_model },
        { label: 'Physical cores', value: machineInfo.cpu_cores },
        { label: 'Logical threads', value: machineInfo.cpu_threads },
        {
          label: 'Base frequency',
          value: machineInfo.cpu_frequency_mhz
            ? `${(machineInfo.cpu_frequency_mhz / 1000).toFixed(2)} GHz`
            : null,
        },
      ],
    },
    {
      icon: <HardDrive size={16} weight="duotone" />,
      title: 'Memory',
      rows: [
        { label: 'Total capacity', value: `${(machineInfo.total_memory_mb / 1024).toFixed(1)} GB` },
        { label: 'Type', value: 'System RAM' },
      ],
    },
    {
      icon: <Lightning size={16} weight="duotone" />,
      title: 'System',
      rows: [
        { label: 'Manufacturer', value: machineInfo.manufacturer },
        { label: 'Product', value: machineInfo.product_name },
        { label: 'Chassis', value: machineInfo.chassis_type },
        { label: 'Hostname', value: machineInfo.hostname },
        { label: 'Kernel', value: machineInfo.kernel_version },
      ],
    },
    {
      icon: <FileText size={16} weight="duotone" />,
      title: 'BIOS & Firmware',
      rows: [
        { label: 'Version', value: machineInfo.bios_version },
        { label: 'Date', value: machineInfo.bios_date },
      ],
    },
    {
      icon: <IdentificationCard size={16} weight="duotone" />,
      title: 'Identification',
      rows: [
        { label: 'System UUID', value: machineInfo.system_uuid },
        { label: 'Hostname', value: machineInfo.hostname },
      ],
    },
  ]

  return (
    <div className="hm-specs-grid">
      {sections.map((section) => (
        <div key={section.title} className="hm-section-card">
          <div className="hm-section-card__header">
            <span className="hm-section-card__icon">{section.icon}</span>
            <span className="hm-section-card__title">{section.title}</span>
          </div>
          <table className="hm-info-table">
            <tbody>
              {section.rows.map(({ label, value }) => (
                <tr key={label}>
                  <td className="hm-info-table__key">{label}</td>
                  <td
                    className={`hm-info-table__val${
                      label === 'System UUID' ? ' hm-mono' : ''
                    }`}
                  >
                    {value ?? <span className="hm-na">N/A</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}