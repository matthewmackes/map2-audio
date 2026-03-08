/**
 * PluginBrowser - Multi-format Plugin Discovery and Loading
 *
 * Provides a searchable, filterable list of available plugins
 * across all supported formats (VST3, AudioUnit, LV2, LADSPA).
 */

import React, { useState } from 'react';
import { usePluginBrowser, PluginFormat, PluginInfo } from '../../hooks/usePluginBrowser';
import { MagnifyingGlass, ArrowsClockwise, Funnel, Plus, CaretDown, Package } from '@phosphor-icons/react';
import { getDisplayPluginName, sanitizeRestrictedDisplayText } from '../../../map2/displayNames';

interface PluginBrowserProps {
  /** Callback when a plugin is loaded */
  onPluginLoad?: (uri: string, instanceId: number) => void;
  /** Chain ID to load plugins into */
  chainId?: string;
  /** Compact mode */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

// Format badge colors
const FORMAT_COLORS: Record<PluginFormat, string> = {
  'All': '#888',
  'VST3': '#4ade80',
  'AudioUnit': '#60a5fa',
  'LV2': '#f472b6',
  'LADSPA': '#fbbf24',
};

const PluginCard: React.FC<{
  plugin: PluginInfo;
  onLoad: () => void;
  isLoading: boolean;
  compact: boolean;
}> = ({ plugin, onLoad, isLoading, compact }) => {
  const [isHovered, setIsHovered] = useState(false);
  const displayName = getDisplayPluginName(plugin.name, plugin.uri);
  const displayBrand = sanitizeRestrictedDisplayText(plugin.brand || plugin.author);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        padding: compact ? '8px 12px' : '12px 16px',
        background: isHovered ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.2)',
        borderRadius: 8,
        border: '1px solid rgba(255, 255, 255, 0.1)',
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {/* Plugin icon/format badge */}
      <div
        style={{
          width: compact ? 32 : 40,
          height: compact ? 32 : 40,
          borderRadius: 8,
          background: `${FORMAT_COLORS[plugin.format]}20`,
          border: `1px solid ${FORMAT_COLORS[plugin.format]}40`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Package size={compact ? 14 : 18} weight="duotone" style={{ color: FORMAT_COLORS[plugin.format] }} />
      </div>

      {/* Plugin info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: compact ? 12 : 14,
          fontWeight: 600,
          color: '#fff',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {displayName}
        </div>
        <div style={{
          fontSize: compact ? 10 : 11,
          color: '#6b7280',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 2,
        }}>
          <span>{displayBrand}</span>
          {!compact && plugin.category && (
            <>
              <span>•</span>
              <span>{plugin.category}</span>
            </>
          )}
        </div>
      </div>

      {/* Format badge */}
      <div
        style={{
          padding: '2px 6px',
          fontSize: 9,
          fontWeight: 600,
          background: `${FORMAT_COLORS[plugin.format]}20`,
          color: FORMAT_COLORS[plugin.format],
          borderRadius: 4,
          flexShrink: 0,
        }}
      >
        {plugin.format}
      </div>

      {/* I/O info */}
      {!compact && (
        <div style={{
          fontSize: 10,
          color: '#6b7280',
          flexShrink: 0,
          textAlign: 'center',
        }}>
          <div>{plugin.audioInputs}→{plugin.audioOutputs}</div>
          {plugin.hasMidiInput && <div style={{ color: '#60a5fa' }}>MIDI</div>}
        </div>
      )}

      {/* Load button */}
      <button
        onClick={onLoad}
        disabled={isLoading}
        style={{
          width: compact ? 28 : 32,
          height: compact ? 28 : 32,
          borderRadius: 6,
          border: '1px solid rgba(55, 214, 201, 0.3)',
          background: isHovered ? 'rgba(55, 214, 201, 0.2)' : 'transparent',
          color: '#37d6c9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isLoading ? 'wait' : 'pointer',
          transition: 'all 0.2s ease',
          flexShrink: 0,
        }}
        title="Add to chain"
      >
        {isLoading ? (
          <ArrowsClockwise size={14} weight="duotone" className="animate-spin" />
        ) : (
          <Plus size={14} weight="bold" />
        )}
      </button>
    </div>
  );
};

export const PluginBrowser: React.FC<PluginBrowserProps> = ({
  onPluginLoad,
  chainId,
  compact = false,
  className = '',
}) => {
  const {
    plugins,
    categories,
    formatCounts,
    filter,
    setFormatFilter,
    setSearchFilter,
    setCategoryFilter,
    scanPlugins,
    loadPlugin,
    isLoading,
    isScanning,
    isScanningPlugins,
    isLoadingPlugin,
    scanStatus,
  } = usePluginBrowser();

  const [showFilters, setShowFilters] = useState(false);
  const [loadingUri, setLoadingUri] = useState<string | null>(null);

  const handleLoad = async (plugin: PluginInfo) => {
    setLoadingUri(plugin.uri);
    try {
      const result = await loadPlugin(plugin.uri, chainId);
      onPluginLoad?.(plugin.uri, result.instanceId);
    } catch (error) {
      console.error('Failed to load plugin:', error);
    } finally {
      setLoadingUri(null);
    }
  };

  const formats: PluginFormat[] = ['All', 'VST3', 'AudioUnit', 'LV2', 'LADSPA'];

  return (
    <div className={className}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Package size={20} weight="duotone" style={{ color: '#37d6c9' }} />
          <span style={{
            fontSize: 16,
            fontWeight: 600,
            color: '#f2f6ff',
          }}>
            Plugin Browser
          </span>
          <span style={{
            fontSize: 11,
            padding: '2px 8px',
            background: 'rgba(55, 214, 201, 0.15)',
            border: '1px solid rgba(55, 214, 201, 0.3)',
            borderRadius: 12,
            color: '#37d6c9',
          }}>
            {plugins.length} plugins
          </span>
        </div>

        {/* Scan button */}
        <button
          onClick={() => scanPlugins()}
          disabled={isScanningPlugins}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 500,
            background: 'rgba(55, 214, 201, 0.1)',
            border: '1px solid rgba(55, 214, 201, 0.3)',
            borderRadius: 6,
            color: '#37d6c9',
            cursor: isScanningPlugins ? 'wait' : 'pointer',
          }}
        >
          <ArrowsClockwise size={14} weight="duotone" className={isScanningPlugins ? 'animate-spin' : ''} />
          {isScanningPlugins ? 'Scanning...' : 'Rescan'}
        </button>
      </div>

      {/* Scan progress */}
      {isScanning && scanStatus && (
        <div style={{
          padding: '8px 12px',
          background: 'rgba(55, 214, 201, 0.1)',
          borderRadius: 6,
          marginBottom: 12,
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: '#37d6c9',
            marginBottom: 4,
          }}>
            <span>Scanning: {scanStatus.currentPath}</span>
            <span>{scanStatus.totalFound} found</span>
          </div>
          <div style={{
            height: 4,
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: 2,
            overflow: 'hidden',
          }}>
            <div
              style={{
                height: '100%',
                width: `${scanStatus.progress * 100}%`,
                background: '#37d6c9',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Search bar */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 12,
      }}>
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          background: 'rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 6,
        }}>
          <MagnifyingGlass size={14} weight="duotone" style={{ color: '#6b7280' }} />
          <input
            type="text"
            placeholder="Search plugins..."
            value={filter.search || ''}
            onChange={(e) => setSearchFilter(e.target.value)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#fff',
              fontSize: 13,
            }}
          />
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '8px 12px',
            background: showFilters ? 'rgba(55, 214, 201, 0.2)' : 'rgba(0, 0, 0, 0.3)',
            border: `1px solid ${showFilters ? 'rgba(55, 214, 201, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
            borderRadius: 6,
            color: showFilters ? '#37d6c9' : '#888',
            cursor: 'pointer',
          }}
        >
          <Funnel size={14} weight="duotone" />
          <CaretDown
            size={14}
            weight="bold"            style={{
              transform: showFilters ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          />
        </button>
      </div>

      {/* Format tabs */}
      <div style={{
        display: 'flex',
        gap: 4,
        marginBottom: 12,
        overflowX: 'auto',
      }}>
        {formats.map((format) => (
          <button
            key={format}
            onClick={() => setFormatFilter(format)}
            style={{
              padding: '6px 12px',
              fontSize: 11,
              fontWeight: 500,
              background: filter.format === format
                ? `${FORMAT_COLORS[format]}20`
                : 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${filter.format === format ? `${FORMAT_COLORS[format]}40` : 'rgba(255, 255, 255, 0.1)'}`,
              borderRadius: 6,
              color: filter.format === format ? FORMAT_COLORS[format] : '#888',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s ease',
            }}
          >
            {format} ({formatCounts[format]})
          </button>
        ))}
      </div>

      {/* Category filter (collapsible) */}
      {showFilters && (
        <div style={{
          padding: 12,
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: 6,
          marginBottom: 12,
        }}>
          <div style={{
            fontSize: 11,
            color: '#6b7280',
            marginBottom: 8,
          }}>
            Category
          </div>
          <div style={{
            display: 'flex',
            gap: 4,
            flexWrap: 'wrap',
          }}>
            <button
              onClick={() => setCategoryFilter(undefined)}
              style={{
                padding: '4px 8px',
                fontSize: 10,
                background: !filter.category ? 'rgba(55, 214, 201, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                border: `1px solid ${!filter.category ? 'rgba(55, 214, 201, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                borderRadius: 4,
                color: !filter.category ? '#37d6c9' : '#888',
                cursor: 'pointer',
              }}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                style={{
                  padding: '4px 8px',
                  fontSize: 10,
                  background: filter.category === cat ? 'rgba(55, 214, 201, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${filter.category === cat ? 'rgba(55, 214, 201, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                  borderRadius: 4,
                  color: filter.category === cat ? '#37d6c9' : '#888',
                  cursor: 'pointer',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Plugin list */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        maxHeight: 400,
        overflowY: 'auto',
      }}>
        {isLoading ? (
          <div style={{
            padding: 40,
            textAlign: 'center',
            color: '#6b7280',
          }}>
            <ArrowsClockwise size={24} weight="duotone" className="animate-spin" style={{ margin: '0 auto 12px' }} />
            Loading plugins...
          </div>
        ) : plugins.length === 0 ? (
          <div style={{
            padding: 40,
            textAlign: 'center',
            color: '#6b7280',
          }}>
            <Package size={32} weight="duotone" style={{ margin: '0 auto 12px', opacity: 0.5 }} />
            <div>No plugins found</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              Try scanning for plugins or adjusting your filters
            </div>
          </div>
        ) : (
          plugins.map((plugin) => (
            <PluginCard
              key={plugin.uri}
              plugin={plugin}
              onLoad={() => handleLoad(plugin)}
              isLoading={loadingUri === plugin.uri || isLoadingPlugin}
              compact={compact}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default PluginBrowser;
