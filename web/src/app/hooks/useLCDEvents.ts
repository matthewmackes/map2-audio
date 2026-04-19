/**
 * React hook for LCD event projections driven by the canonical PlatformEvent API.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { getWsUrl } from '../../map2/api';
import type { PlatformEvent } from '../../map2/platformEvent';
import type { EventSeverity, EventType, LCDEvent, LCDStatistics } from '../models/lcd_event';

interface UseLCDEventsOptions {
  autoConnect?: boolean;
  onError?: (error: Error) => void;
}

interface PeerDiscoverySnapshot {
  local_node_id?: string;
  peers?: Array<{ node_id?: string; is_online?: boolean }>;
}

function normalizeNodeId(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

function platformEventType(event: PlatformEvent): EventType {
  const explicit = String(event.context?.lcd_event_type || '').trim().toLowerCase();
  if (explicit === 'audio' || explicit === 'system' || explicit === 'network' || explicit === 'service' || explicit === 'user' || explicit === 'alert') {
    return explicit;
  }
  if (event.kind.startsWith('lcd.')) {
    const suffix = event.kind.split('.', 2)[1];
    if (suffix === 'audio' || suffix === 'system' || suffix === 'network' || suffix === 'service' || suffix === 'user' || suffix === 'alert') {
      return suffix;
    }
  }
  if (event.kind.startsWith('audio.') || event.kind.startsWith('plugin.') || event.kind.startsWith('chain.')) {
    return 'audio';
  }
  if (event.kind.startsWith('node.') || event.kind.startsWith('cluster.') || event.kind.startsWith('midi.')) {
    return 'network';
  }
  if (event.kind.startsWith('config.')) {
    return 'system';
  }
  if (event.kind.startsWith('workflow.')) {
    return 'service';
  }
  if (event.kind.startsWith('snapshot.')) {
    return 'user';
  }
  return event.priority >= 0.7 || event.ack_required ? 'alert' : 'system';
}

function isLcdRelevant(event: PlatformEvent): boolean {
  const surfaces = new Set(event.target_surfaces || []);
  if (surfaces.size === 0 || surfaces.has('lcd')) {
    return true;
  }
  return event.kind.startsWith('lcd.') || Boolean(event.context?.lcd_event_type);
}

function projectPlatformEvent(event: PlatformEvent): LCDEvent {
  return {
    event_id: event.event_id,
    timestamp: event.occurred_at,
    source_node: event.source_node,
    event_type: platformEventType(event),
    severity: event.severity as EventSeverity,
    title: event.title,
    message: event.message,
    icon: event.icon || '•',
    broadcast: event.broadcast,
    target_nodes: event.target_nodes || [],
    ttl: event.ttl_seconds,
    color: event.color || 'white',
    sound: Boolean(event.sound),
    dismiss_auto: !event.sticky,
    context: {
      ...event.context,
      platform_event_kind: event.kind,
      platform_event_priority: event.priority,
      platform_event_source_service: event.source_service,
      platform_event_supersedes: event.supersedes,
      platform_event_resource: event.resource,
      platform_event_workflow: event.workflow,
    },
  };
}

async function fetchPeerDiscoverySnapshot(): Promise<PeerDiscoverySnapshot> {
  const response = await fetch('/api/peers');
  if (!response.ok) {
    return {};
  }
  return response.json() as Promise<PeerDiscoverySnapshot>;
}

function isLocalEvent(event: LCDEvent, localNodeId: string): boolean {
  return localNodeId.length > 0 && normalizeNodeId(event.source_node) === localNodeId;
}

export function useLCDEvents(options: UseLCDEventsOptions = {}) {
  const { autoConnect = true, onError } = options;

  const [events, setEvents] = useState<LCDEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(getWsUrl());

      ws.onopen = () => {
        ws.send(JSON.stringify({ action: 'subscribe', topic: 'platform:events' }));
        setConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as { type?: string; data?: PlatformEvent };
          if (message.type !== 'platform_event' || !message.data || !isLcdRelevant(message.data)) {
            return;
          }
          const lcdEvent = projectPlatformEvent(message.data);
          setEvents((prev) => [lcdEvent, ...prev].slice(0, 100));
        } catch (parseError) {
          console.error('Failed to parse event:', parseError);
        }
      };

      ws.onerror = () => {
        const nextError = new Error('WebSocket error');
        setError(nextError);
        onError?.(nextError);
      };

      ws.onclose = () => {
        setConnected(false);
      };

      wsRef.current = ws;
    } catch (err) {
      const nextError = err instanceof Error ? err : new Error(String(err));
      setError(nextError);
      onError?.(nextError);
    }
  }, [onError]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    events,
    connected,
    error,
    connect,
    disconnect,
    setEvents,
  };
}

export function useLCDEventHistory(
  limit: number = 50,
  eventType?: string,
  severity?: string,
  source?: 'local' | 'remote',
) {
  const [events, setEvents] = useState<LCDEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true);
        const [peerSnapshot, response] = await Promise.all([
          fetchPeerDiscoverySnapshot().catch(() => ({})),
          fetch(`/api/platform-events?${new URLSearchParams({
            limit: String(limit),
            surface: 'lcd',
            ...(severity ? { severity } : {}),
          }).toString()}`),
        ]);
        if (!response.ok) {
          throw new Error('Failed to fetch events');
        }

        const data = await response.json();
        const localNodeId = normalizeNodeId(peerSnapshot.local_node_id);
        const projected = ((data.events || []) as PlatformEvent[])
          .filter(isLcdRelevant)
          .map(projectPlatformEvent)
          .filter((event) => !eventType || event.event_type === eventType)
          .filter((event) => {
            if (!source) {
              return true;
            }
            const local = isLocalEvent(event, localNodeId);
            return source === 'local' ? local : !local;
          });
        setEvents(projected);
        setError(null);
      } catch (err) {
        const nextError = err instanceof Error ? err : new Error(String(err));
        setError(nextError);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
    const interval = setInterval(fetchEvents, 5000);

    return () => clearInterval(interval);
  }, [eventType, limit, severity, source]);

  return { events, loading, error };
}

export function useLCDStatistics() {
  const [stats, setStats] = useState<LCDStatistics>({
    local_events: 0,
    remote_events: 0,
    total_events: 0,
    by_type: {},
    by_severity: {},
    active_nodes: [],
    connected_peers: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const [peerSnapshot, response] = await Promise.all([
          fetchPeerDiscoverySnapshot().catch(() => ({})),
          fetch('/api/platform-events?surface=lcd&limit=500'),
        ]);
        if (!response.ok) {
          throw new Error('Failed to fetch stats');
        }

        const data = await response.json();
        const localNodeId = normalizeNodeId(peerSnapshot.local_node_id);
        const projected = ((data.events || []) as PlatformEvent[])
          .filter(isLcdRelevant)
          .map(projectPlatformEvent);
        const byType: Record<string, number> = {};
        const bySeverity: Record<string, number> = {};
        let localEvents = 0;
        let remoteEvents = 0;

        for (const event of projected) {
          byType[event.event_type] = (byType[event.event_type] || 0) + 1;
          bySeverity[event.severity] = (bySeverity[event.severity] || 0) + 1;
          if (isLocalEvent(event, localNodeId)) {
            localEvents += 1;
          } else {
            remoteEvents += 1;
          }
        }

        setStats({
          local_events: localEvents,
          remote_events: remoteEvents,
          total_events: projected.length,
          by_type: byType,
          by_severity: bySeverity,
          active_nodes: Array.from(new Set(projected.map((event) => event.source_node))).sort(),
          connected_peers: Array.isArray(peerSnapshot.peers)
            ? peerSnapshot.peers
                .filter((peer) => peer?.is_online && peer?.node_id)
                .map((peer) => String(peer.node_id))
                .sort()
            : [],
        });
        setError(null);
      } catch (err) {
        const nextError = err instanceof Error ? err : new Error(String(err));
        setError(nextError);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 10000);

    return () => clearInterval(interval);
  }, []);

  return { stats, loading, error };
}
