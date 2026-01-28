import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Speaker, Waves, Zap, Loader2, RefreshCw } from 'lucide-react'
import { irApi, namApi } from '../../../map2/api'
import type { NAMModel, IRFile } from '../../../map2/types'
import { IRItemCard } from './IRItemCard'
import { NAMItemCard } from './NAMItemCard'

type TabId = 'cabinets' | 'reverbs' | 'nam'

const TABS: Array<{ id: TabId; label: string; icon: typeof Speaker }> = [
  { id: 'cabinets', label: 'Cabinets', icon: Speaker },
  { id: 'reverbs', label: 'Reverbs', icon: Waves },
  { id: 'nam', label: 'NAM Models', icon: Zap },
]

export function InstalledBrowser() {
  const [activeTab, setActiveTab] = useState<TabId>('cabinets')
  const [searchQuery, setSearchQuery] = useState('')

  const cabinetsQuery = useQuery({
    queryKey: ['ir', 'cabinets'],
    queryFn: irApi.listCabinets,
  })

  const reverbsQuery = useQuery({
    queryKey: ['ir', 'reverbs'],
    queryFn: irApi.listReverbs,
  })

  const namQuery = useQuery({
    queryKey: ['nam', 'models'],
    queryFn: () => namApi.listModels(),
  })

  const irStatusQuery = useQuery({
    queryKey: ['ir', 'status'],
    queryFn: irApi.getStatus,
  })

  const namStatusQuery = useQuery({
    queryKey: ['nam', 'status'],
    queryFn: namApi.getStatus,
  })

  // Filter items by search query
  const filterBySearch = <T extends { name: string }>(items: T[] | undefined): T[] => {
    if (!items) return []
    if (!searchQuery.trim()) return items
    const query = searchQuery.toLowerCase()
    return items.filter(item => item.name.toLowerCase().includes(query))
  }

  const filteredCabinets = filterBySearch<IRFile>(cabinetsQuery.data?.irs)
  const filteredReverbs = filterBySearch<IRFile>(reverbsQuery.data?.irs)
  const filteredNAM = filterBySearch<NAMModel>(namQuery.data?.models)

  const isLoading = cabinetsQuery.isLoading || reverbsQuery.isLoading || namQuery.isLoading

  const handleRefresh = () => {
    cabinetsQuery.refetch()
    reverbsQuery.refetch()
    namQuery.refetch()
    irStatusQuery.refetch()
    namStatusQuery.refetch()
  }

  const getCounts = (): Record<TabId, number> => ({
    cabinets: cabinetsQuery.data?.count ?? 0,
    reverbs: reverbsQuery.data?.count ?? 0,
    nam: namQuery.data?.count ?? 0,
  })

  const counts = getCounts()

  return (
    <div className="card">
      {/* Header with tabs */}
      <div style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex-between" style={{ padding: '12px 16px' }}>
          <div className="flex" style={{ gap: 4 }}>
            {TABS.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`btn btn-ghost btn-sm ${isActive ? 'active' : ''}`}
                  style={{
                    borderRadius: 6,
                    padding: '8px 12px',
                    background: isActive ? 'var(--bg-tertiary)' : 'transparent',
                    color: isActive ? 'var(--primary)' : 'inherit',
                    borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                  }}
                >
                  <Icon size={16} />
                  {tab.label}
                  <span className="badge" style={{ marginLeft: 6 }}>{counts[tab.id]}</span>
                </button>
              )
            })}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
          </button>
        </div>

        {/* Search bar */}
        <div style={{ padding: '0 16px 12px' }}>
          <div className="flex" style={{ gap: 8, alignItems: 'center', background: 'var(--bg-secondary)', borderRadius: 6, padding: '8px 12px' }}>
            <Search size={16} className="muted" />
            <input
              type="text"
              placeholder={`Search ${TABS.find(t => t.id === activeTab)?.label.toLowerCase()}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                color: 'inherit',
                fontSize: 14,
              }}
            />
            {searchQuery && (
              <button
                className="btn btn-ghost"
                onClick={() => setSearchQuery('')}
                style={{ padding: 4 }}
              >
                &times;
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: 16 }}>
        {isLoading ? (
          <div className="flex" style={{ justifyContent: 'center', padding: 40 }}>
            <Loader2 size={24} className="spin" style={{ color: 'var(--primary)' }} />
          </div>
        ) : (
          <>
            {activeTab === 'cabinets' && (
              <IRList
                items={filteredCabinets}
                type="cabinet"
                activeIR={irStatusQuery.data?.loaded_cabinet}
                emptyMessage="No cabinet IRs installed"
              />
            )}
            {activeTab === 'reverbs' && (
              <IRList
                items={filteredReverbs}
                type="reverb"
                activeIR={irStatusQuery.data?.loaded_reverb}
                emptyMessage="No reverb IRs installed"
              />
            )}
            {activeTab === 'nam' && (
              <NAMList
                items={filteredNAM}
                activeModel={namStatusQuery.data?.activeModel ?? undefined}
                emptyMessage="No NAM models installed"
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

interface IRListProps {
  items: IRFile[]
  type: 'cabinet' | 'reverb'
  activeIR?: string
  emptyMessage: string
}

function IRList({ items, type, activeIR, emptyMessage }: IRListProps) {
  if (items.length === 0) {
    return (
      <div className="muted" style={{ textAlign: 'center', padding: 40 }}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="model-list" style={{ maxHeight: 400, overflowY: 'auto' }}>
      {items.map(ir => (
        <IRItemCard
          key={ir.path}
          ir={ir}
          type={type}
          isActive={ir.name === activeIR}
        />
      ))}
    </div>
  )
}

interface NAMListProps {
  items: NAMModel[]
  activeModel?: string
  emptyMessage: string
}

function NAMList({ items, activeModel, emptyMessage }: NAMListProps) {
  if (items.length === 0) {
    return (
      <div className="muted" style={{ textAlign: 'center', padding: 40 }}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="model-list" style={{ maxHeight: 400, overflowY: 'auto' }}>
      {items.map(model => (
        <NAMItemCard
          key={model.name}
          model={model}
          isActive={model.name === activeModel}
        />
      ))}
    </div>
  )
}
