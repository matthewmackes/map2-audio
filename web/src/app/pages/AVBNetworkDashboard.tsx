/**
 * AVB/TSN Network Audio Dashboard
 *
 * A visually stunning, educational, real-time dashboard that:
 * 1. Explains how the AVB/TSN stack works
 * 2. Displays live network health telemetry
 * 3. Highlights the critical role of hardware-level precise timing
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

interface AvbNode {
  id: string;
  name: string;
  type: 'talker' | 'listener' | 'ptp-master';
  status: 'healthy' | 'warning' | 'critical' | 'offline';
  latencyMs: number;
  cpuPercent: number;
  memoryMB: number;
  activeStreams: number;
  ptpSynced: boolean;
  ptpOffsetNs: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface AvbLink {
  source: string | AvbNode;
  target: string | AvbNode;
  latencyMs: number;
  qualityScore: number; // 0-100
}

interface NetworkMetrics {
  networkHealth: 'healthy' | 'degraded' | 'critical';
  activeNodes: number;
  totalNodes: number;
  avgLatencyMs: number;
  p99LatencyMs: number;
  talkerStreams: number;
  listenerStreams: number;
  ptpSyncStatus: 'synced' | 'syncing' | 'unsync';
  avgCpuPercent: number;
  avgMemoryMB: number;
  packetLossRate: number;
  warningNodes: number;
  criticalNodes: number;
  lastUpdate: Date;
}

// ============================================================================
// Mock Data Generator
// ============================================================================

function generateMockData(): { nodes: AvbNode[]; links: AvbLink[]; metrics: NetworkMetrics } {
  const nodeCount = 8;
  const nodes: AvbNode[] = [];

  // Create PTP grandmaster
  nodes.push({
    id: 'ptp-master',
    name: 'PTP Grandmaster',
    type: 'ptp-master',
    status: 'healthy',
    latencyMs: 0,
    cpuPercent: 2,
    memoryMB: 50,
    activeStreams: 0,
    ptpSynced: true,
    ptpOffsetNs: 0,
  });

  // Create talker nodes
  for (let i = 0; i < 3; i++) {
    const status = Math.random() > 0.8 ? 'warning' : 'healthy';
    nodes.push({
      id: `talker-${i}`,
      name: `Talker ${i + 1}`,
      type: 'talker',
      status,
      latencyMs: 0.5 + Math.random() * 2,
      cpuPercent: 3 + Math.random() * 5,
      memoryMB: 80 + Math.random() * 40,
      activeStreams: 1 + Math.floor(Math.random() * 3),
      ptpSynced: Math.random() > 0.1,
      ptpOffsetNs: Math.random() * 500 - 250,
    });
  }

  // Create listener nodes
  for (let i = 0; i < 4; i++) {
    const rand = Math.random();
    const status = rand > 0.9 ? 'critical' : rand > 0.75 ? 'warning' : 'healthy';
    nodes.push({
      id: `listener-${i}`,
      name: `Listener ${i + 1}`,
      type: 'listener',
      status,
      latencyMs: 0.8 + Math.random() * 2.5,
      cpuPercent: 2 + Math.random() * 4,
      memoryMB: 60 + Math.random() * 30,
      activeStreams: 1 + Math.floor(Math.random() * 2),
      ptpSynced: Math.random() > 0.15,
      ptpOffsetNs: Math.random() * 600 - 300,
    });
  }

  // Create links between talkers and listeners
  const links: AvbLink[] = [];
  const talkers = nodes.filter(n => n.type === 'talker');
  const listeners = nodes.filter(n => n.type === 'listener');

  talkers.forEach(talker => {
    const numConnections = 1 + Math.floor(Math.random() * 2);
    const shuffled = [...listeners].sort(() => Math.random() - 0.5);

    for (let i = 0; i < Math.min(numConnections, listeners.length); i++) {
      const latency = 0.5 + Math.random() * 3;
      links.push({
        source: talker.id,
        target: shuffled[i].id,
        latencyMs: latency,
        qualityScore: Math.max(0, 100 - latency * 20),
      });
    }
  });

  // Calculate metrics
  const activeNodes = nodes.filter(n => n.status !== 'offline').length;
  const avgLatency = nodes.reduce((sum, n) => sum + n.latencyMs, 0) / nodes.length;
  const sortedLatencies = nodes.map(n => n.latencyMs).sort((a, b) => a - b);
  const p99Index = Math.floor(sortedLatencies.length * 0.99);

  const metrics: NetworkMetrics = {
    networkHealth: nodes.some(n => n.status === 'critical') ? 'critical' :
                   nodes.some(n => n.status === 'warning') ? 'degraded' : 'healthy',
    activeNodes,
    totalNodes: nodes.length,
    avgLatencyMs: avgLatency,
    p99LatencyMs: sortedLatencies[p99Index] || 0,
    talkerStreams: talkers.reduce((sum, n) => sum + n.activeStreams, 0),
    listenerStreams: listeners.reduce((sum, n) => sum + n.activeStreams, 0),
    ptpSyncStatus: nodes.every(n => n.ptpSynced) ? 'synced' : 'syncing',
    avgCpuPercent: nodes.reduce((sum, n) => sum + n.cpuPercent, 0) / nodes.length,
    avgMemoryMB: nodes.reduce((sum, n) => sum + n.memoryMB, 0) / nodes.length,
    packetLossRate: Math.random() * 0.05,
    warningNodes: nodes.filter(n => n.status === 'warning').length,
    criticalNodes: nodes.filter(n => n.status === 'critical').length,
    lastUpdate: new Date(),
  };

  return { nodes, links, metrics };
}

// ============================================================================
// Main Component
// ============================================================================

export const AVBNetworkDashboard: React.FC = () => {
  const [nodes, setNodes] = useState<AvbNode[]>([]);
  const [links, setLinks] = useState<AvbLink[]>([]);
  const [metrics, setMetrics] = useState<NetworkMetrics | null>(null);
  const [graphVisible, setGraphVisible] = useState(true);

  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<AvbNode, AvbLink> | null>(null);

  // Initialize data
  useEffect(() => {
    const data = generateMockData();
    setNodes(data.nodes);
    setLinks(data.links);
    setMetrics(data.metrics);
  }, []);

  // Update data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const data = generateMockData();
      setNodes(data.nodes);
      setLinks(data.links);
      setMetrics(data.metrics);
    }, 6000);

    return () => clearInterval(interval);
  }, []);

  // D3 Force Simulation
  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // Clear previous content
    svg.selectAll('*').remove();

    // Create simulation
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links)
        .id((d: any) => d.id)
        .distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    simulationRef.current = simulation;

    // Create container group with zoom
    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom as any);

    // Draw links
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', (d) => {
        const score = d.qualityScore;
        return score > 80 ? '#10b981' : score > 60 ? '#f59e0b' : '#ef4444';
      })
      .attr('stroke-width', (d) => 1 + d.qualityScore / 50)
      .attr('stroke-opacity', 0.6);

    // Draw nodes
    const node = g.append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', (d) => 8 + d.activeStreams * 2)
      .attr('fill', (d) => {
        if (d.type === 'ptp-master') return '#6366f1';
        switch (d.status) {
          case 'healthy': return '#10b981';
          case 'warning': return '#f59e0b';
          case 'critical': return '#ef4444';
          case 'offline': return '#6b7280';
          default: return '#6b7280';
        }
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .call(d3.drag<SVGCircleElement, AvbNode>()
        .on('start', dragStarted)
        .on('drag', dragged)
        .on('end', dragEnded) as any);

    // Add node labels
    const label = g.append('g')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .text((d) => d.name)
      .attr('font-size', 10)
      .attr('fill', '#e5e7eb')
      .attr('text-anchor', 'middle')
      .attr('dy', -15);

    // Add tooltips
    node.append('title')
      .text((d) => `${d.name}\nStatus: ${d.status}\nLatency: ${d.latencyMs.toFixed(2)}ms\nCPU: ${d.cpuPercent.toFixed(1)}%\nMemory: ${d.memoryMB.toFixed(0)}MB\nStreams: ${d.activeStreams}\nPTP: ${d.ptpSynced ? 'Synced' : 'Unsynced'}`);

    // Update positions on tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node
        .attr('cx', (d) => d.x!)
        .attr('cy', (d) => d.y!);

      label
        .attr('x', (d) => d.x!)
        .attr('y', (d) => d.y!);
    });

    // Drag functions
    function dragStarted(event: any, d: AvbNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: AvbNode) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragEnded(event: any, d: AvbNode) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [nodes, links]);

  const healthBadgeColor = metrics?.networkHealth === 'healthy' ? 'bg-emerald-500' :
                           metrics?.networkHealth === 'degraded' ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-gray-100">
      {/* Hero/Header Section */}
      <header className="bg-gradient-to-r from-[#1e293b] to-[#0f0f1a] border-b border-gray-800 px-6 py-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold text-white mb-2">
            AVB/TSN Network Audio Dashboard
          </h1>
          <p className="text-lg text-gray-400 mb-6">
            Real-time Network Health & Topology + In-depth Technical Explanation
          </p>

          {/* Live Stats Row */}
          {metrics && (
            <div className="flex flex-wrap gap-4 items-center">
              <div className={`px-4 py-2 rounded-full ${healthBadgeColor} text-white font-semibold`}>
                Network: {metrics.networkHealth.toUpperCase()}
              </div>
              <div className="text-gray-300">
                <span className="text-white font-semibold">{metrics.activeNodes}</span> / {metrics.totalNodes} Nodes Active
              </div>
              <div className="text-gray-300">
                Avg Latency: <span className="text-white font-semibold">{metrics.avgLatencyMs.toFixed(2)}ms</span>
              </div>
              <div className="text-gray-300 text-sm">
                Last Update: {metrics.lastUpdate.toLocaleTimeString()}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Metrics Cards */}
      {metrics && (
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Active Streams"
              value={`${metrics.talkerStreams} → ${metrics.listenerStreams}`}
              subtitle="Talkers → Listeners"
              color="indigo"
            />
            <MetricCard
              title="P99 Latency"
              value={`${metrics.p99LatencyMs.toFixed(2)}ms`}
              subtitle={metrics.p99LatencyMs < 2 ? 'Excellent' : 'Review needed'}
              color={metrics.p99LatencyMs < 2 ? 'emerald' : 'yellow'}
            />
            <MetricCard
              title="PTP Sync"
              value={metrics.ptpSyncStatus.toUpperCase()}
              subtitle="IEEE 802.1AS gPTP"
              color={metrics.ptpSyncStatus === 'synced' ? 'emerald' : 'yellow'}
            />
            <MetricCard
              title="Packet Loss"
              value={`${(metrics.packetLossRate * 100).toFixed(3)}%`}
              subtitle={metrics.packetLossRate < 0.01 ? 'Within spec' : 'High'}
              color={metrics.packetLossRate < 0.01 ? 'emerald' : 'red'}
            />
          </div>
        </div>
      )}

      {/* Main Content: Explanation + Graph Overlay */}
      <div className="max-w-7xl mx-auto px-6 py-8 relative">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Educational Content (2/3 width) */}
          <div className="lg:col-span-2">
            <EducationalContent />
          </div>

          {/* D3 Graph Panel (1/3 width, sticky) */}
          <div className="lg:col-span-1">
            <div className="sticky top-4">
              <div className="bg-[#1e293b]/80 backdrop-blur-lg rounded-lg border border-gray-700 p-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-white">Live Network Topology</h3>
                  <button
                    onClick={() => setGraphVisible(!graphVisible)}
                    className="text-sm text-gray-400 hover:text-white"
                  >
                    {graphVisible ? 'Hide' : 'Show'}
                  </button>
                </div>
                {graphVisible && (
                  <div className="bg-[#0f0f1a] rounded-lg">
                    <svg
                      ref={svgRef}
                      className="w-full"
                      style={{ height: '500px' }}
                    />
                    <GraphLegend />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Metric Card Component
// ============================================================================

interface MetricCardProps {
  title: string;
  value: string;
  subtitle: string;
  color: 'emerald' | 'yellow' | 'red' | 'indigo';
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, subtitle, color }) => {
  const colorClasses = {
    emerald: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30',
    yellow: 'from-yellow-500/20 to-yellow-600/10 border-yellow-500/30',
    red: 'from-red-500/20 to-red-600/10 border-red-500/30',
    indigo: 'from-indigo-500/20 to-indigo-600/10 border-indigo-500/30',
  };

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} backdrop-blur-lg rounded-lg border p-4`}>
      <h4 className="text-sm font-medium text-gray-400 mb-1">{title}</h4>
      <p className="text-2xl font-bold text-white mb-1">{value}</p>
      <p className="text-xs text-gray-500">{subtitle}</p>
    </div>
  );
};

// ============================================================================
// Graph Legend Component
// ============================================================================

const GraphLegend: React.FC = () => {
  return (
    <div className="mt-4 p-3 bg-[#1e293b]/50 rounded text-xs">
      <div className="font-semibold text-gray-300 mb-2">Legend:</div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#6366f1]"></div>
          <span className="text-gray-400">PTP Master</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
          <span className="text-gray-400">Healthy</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <span className="text-gray-400">Warning</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <span className="text-gray-400">Critical</span>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Educational Content Component
// ============================================================================

const EducationalContent: React.FC = () => {
  return (
    <article className="prose prose-invert prose-lg max-w-none">
      <h2 className="text-3xl font-bold text-white mb-4">What is AVB/TSN Network Audio?</h2>
      <p className="text-gray-300 leading-relaxed mb-6">
        <strong>AVB (Audio Video Bridging)</strong> and its evolution <strong>TSN (Time-Sensitive Networking)</strong> represent
        a suite of IEEE 802.1 standards that enable deterministic, low-latency audio streaming over standard Ethernet networks.
        Unlike traditional IP-based audio protocols, AVB/TSN operates at Layer 2, providing sub-2-millisecond latency with
        guaranteed delivery and precise synchronization across all network nodes.
      </p>

      <div className="bg-[#1e293b]/50 rounded-lg p-6 mb-8 border border-gray-700">
        <h3 className="text-xl font-semibold text-white mb-3">Key Benefits</h3>
        <ul className="text-gray-300 space-y-2">
          <li><strong>Deterministic Latency:</strong> Guaranteed &lt;2ms end-to-end with bounded jitter</li>
          <li><strong>Zero Packet Loss:</strong> Credit-Based Shaper prevents congestion</li>
          <li><strong>Precise Synchronization:</strong> gPTP provides sub-microsecond clock accuracy</li>
          <li><strong>Scalable:</strong> Support for hundreds of simultaneous audio channels</li>
          <li><strong>Standard Ethernet:</strong> Works with off-the-shelf TSN-capable switches</li>
        </ul>
      </div>

      <h2 className="text-3xl font-bold text-white mb-4 mt-12">Core Components & Architecture</h2>

      <h3 className="text-2xl font-semibold text-white mb-3">Node Roles</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
          <h4 className="text-lg font-semibold text-emerald-400 mb-2">Talker Nodes</h4>
          <p className="text-gray-300 text-sm">
            Audio sources that generate AVTP (Audio Video Transport Protocol) streams. Talkers capture audio,
            format it into IEEE 1722 AAF packets, and transmit at precise intervals coordinated with PTP timestamps.
          </p>
        </div>
        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-4">
          <h4 className="text-lg font-semibold text-indigo-400 mb-2">Listener Nodes</h4>
          <p className="text-gray-300 text-sm">
            Audio destinations that receive and decode AVTP streams. Listeners use presentation time offsets
            to buffer and play audio samples with exact synchronization across all endpoints.
          </p>
        </div>
      </div>

      <h2 className="text-3xl font-bold text-white mb-4 mt-12">AVB to TSN Evolution: IEEE 802.1 Standards</h2>
      <p className="text-gray-300 leading-relaxed mb-6">
        TSN (Time-Sensitive Networking) is the evolution and superset of AVB, extending deterministic Ethernet from
        media streaming to industrial automation, automotive, and real-time distributed systems. TSN maintains full
        backward compatibility with AVB while adding new capabilities for mission-critical applications.
      </p>

      <div className="space-y-6 mb-8">
        <StandardSection
          title="Time Synchronization: IEEE 802.1AS (gPTP)"
          description="Generalized Precision Time Protocol - profile of IEEE 1588 PTPv2. Provides sub-microsecond clock synchronization across all network nodes, essential for coordinated sample playback."
          color="indigo"
        />
        <StandardSection
          title="Traffic Shaping: IEEE 802.1Qav (CBS)"
          description="Credit-Based Shaper inherited from AVB. Guarantees bandwidth for audio streams by regulating transmission rates, preventing network congestion and ensuring zero packet loss for Class A traffic."
          color="emerald"
        />
        <StandardSection
          title="Scheduled Traffic: IEEE 802.1Qbv (TAS)"
          description="Time-Aware Shaper with gate-controlled queues. Enables time-slotted transmission windows for ultra-low latency and jitter, critical for real-time audio applications."
          color="yellow"
        />
        <StandardSection
          title="Reliability: IEEE 802.1CB (FRER)"
          description="Frame Replication and Elimination for Redundancy. Provides seamless failover by duplicating critical streams across redundant paths and eliminating duplicates at the destination."
          color="red"
        />
      </div>

      <h2 className="text-3xl font-bold text-white mb-4 mt-12">Why Intel® I210 NIC is Essential</h2>
      <div className="bg-[#1e293b] rounded-lg p-6 mb-8 border-2 border-indigo-500">
        <p className="text-gray-300 leading-relaxed mb-4">
          The <strong className="text-white">Intel® Ethernet Controller I210</strong> is specifically designed for
          AVB/TSN applications with hardware-accelerated features that software alone cannot provide:
        </p>
        <ul className="text-gray-300 space-y-2 mb-4">
          <li>✓ <strong>IEEE 802.1AS gPTP Support:</strong> Hardware timestamping with nanosecond precision</li>
          <li>✓ <strong>IEEE 802.1Qav CBS:</strong> Built-in credit-based traffic shaping</li>
          <li>✓ <strong>Launch Time Control:</strong> SO_TXTIME support for scheduled packet transmission</li>
          <li>✓ <strong>Low Latency Forwarding:</strong> Optimized DMA and interrupt handling</li>
          <li>✓ <strong>ECC-Protected Buffers:</strong> Reliability for mission-critical audio</li>
        </ul>
        <a
          href="https://www.intel.com/content/www/us/en/products/details/ethernet/gigabit-controllers/i210-controllers.html"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg transition-colors"
        >
          Intel I210 Product Page →
        </a>
      </div>

      <h2 className="text-3xl font-bold text-white mb-4 mt-12">Health & Liveness Requirements</h2>
      <div className="bg-[#1e293b]/50 rounded-lg p-6 border border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-lg font-semibold text-white mb-3">Network Performance</h4>
            <ul className="text-gray-300 space-y-1 text-sm">
              <li>• Stream uptime: &gt;99.99%</li>
              <li>• Avg latency: &lt;2ms</li>
              <li>• P99 latency: &lt;5ms</li>
              <li>• Jitter: &lt;100μs (Class A)</li>
              <li>• Packet loss: &lt;0.01%</li>
            </ul>
          </div>
          <div>
            <h4 className="text-lg font-semibold text-white mb-3">Resource Overhead</h4>
            <ul className="text-gray-300 space-y-1 text-sm">
              <li>• CPU per stream: &lt;5%</li>
              <li>• Memory per stream: ~8KB buffers</li>
              <li>• PTP sync accuracy: &lt;1μs</li>
              <li>• Clock drift: &lt;±100ppb</li>
              <li>• Bandwidth (stereo 48kHz/24bit): ~2.4Mbps</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-12 p-6 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
        <h3 className="text-xl font-semibold text-emerald-400 mb-3">TSN Enables Professional Audio Networks</h3>
        <p className="text-gray-300 leading-relaxed">
          By combining precise time synchronization (802.1AS), deterministic traffic shaping (802.1Qav/Qbv),
          and reliability mechanisms (802.1CB), TSN creates the foundation for professional audio networks that
          rival proprietary solutions like Dante or Ravenna—while using open standards and commodity Ethernet hardware.
        </p>
      </div>
    </article>
  );
};

// ============================================================================
// Standard Section Component
// ============================================================================

interface StandardSectionProps {
  title: string;
  description: string;
  color: 'emerald' | 'yellow' | 'red' | 'indigo';
}

const StandardSection: React.FC<StandardSectionProps> = ({ title, description, color }) => {
  const colorClasses = {
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    yellow: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
    red: 'bg-red-500/10 border-red-500/30 text-red-400',
    indigo: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400',
  };

  return (
    <div className={`${colorClasses[color].split(' ')[0]} border ${colorClasses[color].split(' ')[1]} rounded-lg p-4`}>
      <h4 className={`text-lg font-semibold ${colorClasses[color].split(' ')[2]} mb-2`}>
        {title}
      </h4>
      <p className="text-gray-300 text-sm">{description}</p>
    </div>
  );
};

export default AVBNetworkDashboard;
