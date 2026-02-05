"""
React hook for LCD events WebSocket subscription and state management.
Handles real-time event streaming from backend.
"""

import { useEffect, useState, useCallback, useRef } from 'react';
import { LCDEvent } from '../models/lcd_event';

interface useLCDEventsOptions {
  autoConnect?: boolean;
  onError?: (error: Error) => void;
}

export function useLCDEvents(options: useLCDEventsOptions = {}) {
  const { autoConnect = true, onError } = options;
  
  const [events, setEvents] = useState<LCDEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  
  const connect = useCallback(() => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/api/lcd/ws/events`;
      
      const ws = new WebSocket(url);
      
      ws.onopen = () => {
        setConnected(true);
        setError(null);
      };
      
      ws.onmessage = (event) => {
        try {
          const lcdEvent = JSON.parse(event.data) as LCDEvent;
          setEvents(prev => [lcdEvent, ...prev].slice(0, 100)); // Keep last 100
        } catch (e) {
          console.error('Failed to parse event:', e);
        }
      };
      
      ws.onerror = (event) => {
        const err = new Error('WebSocket error');
        setError(err);
        onError?.(err);
      };
      
      ws.onclose = () => {
        setConnected(false);
      };
      
      wsRef.current = ws;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      onError?.(error);
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
    setEvents
  };
}

/**
 * Hook for fetching recent LCD events from API
 */
export function useLCDEventHistory(
  limit: number = 50,
  eventType?: string,
  severity?: string,
  source?: 'local' | 'remote'
) {
  const [events, setEvents] = useState<LCDEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          limit: String(limit)
        });
        
        if (eventType) params.append('event_type', eventType);
        if (severity) params.append('severity', severity);
        if (source) params.append('source', source);
        
        const response = await fetch(`/api/lcd/events?${params}`);
        if (!response.ok) throw new Error('Failed to fetch events');
        
        const data = await response.json();
        setEvents(data.events || []);
        setError(null);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchEvents();
    const interval = setInterval(fetchEvents, 5000); // Refresh every 5s
    
    return () => clearInterval(interval);
  }, [limit, eventType, severity, source]);
  
  return { events, loading, error };
}

/**
 * Hook for LCD statistics
 */
export function useLCDStatistics() {
  const [stats, setStats] = useState({
    local_events: 0,
    remote_events: 0,
    total_events: 0,
    by_type: {},
    by_severity: {},
    active_nodes: [],
    connected_peers: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/lcd/stats');
        if (!response.ok) throw new Error('Failed to fetch stats');
        
        const data = await response.json();
        setStats(data);
        setError(null);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchStats();
    const interval = setInterval(fetchStats, 10000); // Refresh every 10s
    
    return () => clearInterval(interval);
  }, []);
  
  return { stats, loading, error };
}
