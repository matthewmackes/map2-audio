import { normalizeEndpointPayload, normalizeEndpointsResponse, normalizeStreamPayload } from './endpointSchema';

describe('endpointSchema', () => {
  it('normalizes canonical endpoint payloads without dropping core fields', () => {
    const normalized = normalizeEndpointPayload({
      endpoint_id: '0011223344556677:3',
      entity_id: '0011223344556677',
      unique_id: 3,
      direction: 'talker',
      device_type: 'map2',
      device_name: 'Node A Talker',
      channels: 8,
      sample_rate: 96000,
      format: '24-bit PCM',
      mac_address: '00:11:22:33:44:55',
      node_address: 'http://node-a.local:8080',
      host: 'node-a.local',
      available: true,
      last_seen: '2026-02-21T00:00:00Z',
      node_id: 'node-a',
    });

    expect(normalized.endpoint_id).toBe('0011223344556677:3');
    expect(normalized.direction).toBe('talker');
    expect(normalized.device_type).toBe('map2');
    expect(normalized.channels).toBe(8);
    expect(normalized.sample_rate).toBe(96000);
    expect(normalized.node_id).toBe('node-a');
    expect(normalized.host).toBe('node-a.local');
  });

  it('maps legacy camelCase fields and infers host + node ownership fallback', () => {
    const normalized = normalizeEndpointPayload({
      endpointId: '8899aabbccddeeff:1',
      entityId: '8899aabbccddeeff',
      uniqueId: '1',
      direction: 'LISTENER',
      deviceType: 'AVDECC',
      deviceName: 'Remote Listener',
      channels: '0',
      sampleRate: '0',
      macAddress: '',
      nodeAddress: 'http://remote-host:8080',
      available: 'false',
    });

    expect(normalized.direction).toBe('listener');
    expect(normalized.device_type).toBe('avdecc');
    expect(normalized.channels).toBe(2);
    expect(normalized.sample_rate).toBe(48000);
    expect(normalized.available).toBe(false);
    expect(normalized.host).toBe('remote-host');
    expect(normalized.node_id).toBe('remote-host');
  });

  it('normalizes endpoint responses and derives count when missing/invalid', () => {
    const normalized = normalizeEndpointsResponse({
      endpoints: [{ endpointId: 'abc:0', direction: 'talker' }],
      count: -1,
    });

    expect(normalized.count).toBe(1);
    expect(normalized.endpoints).toHaveLength(1);
    expect(normalized.endpoints[0].endpoint_id).toBe('abc:0');
  });

  it('normalizes stream stats and diagnostics transport', () => {
    const payload = normalizeStreamPayload({
      stream_id: 's1',
      stats: {
        frames_sent: 10,
        sequence_gap_events: 2,
        max_timestamp_skew_ns: 5000,
      },
      diagnostics: {
        transport: {
          frames_sent: 10,
          sequence_gap_events: 2,
          timestamp_skew_events: 1,
        },
      },
    });

    expect(payload.stats?.frames_sent).toBe(10);
    expect(payload.stats?.sequence_gap_events).toBe(2);
    expect(payload.stats?.max_timestamp_skew_ns).toBe(5000);
    expect(payload.diagnostics?.transport?.timestamp_skew_events).toBe(1);
  });

  it('normalizes stream ownership metadata from canonical and camelCase aliases', () => {
    const payload = normalizeStreamPayload({
      stream_id: 's-ownership',
      ownership: {
        ownerNodeId: 'node-a',
        peer_node_id: 'node-b',
        owner_endpoint_id: '0011223344556677:1',
        peerEndpointId: '8899aabbccddeeff:2',
        talker_node_id: 'node-a',
        listenerNodeId: 'node-b',
        talker_endpoint_id: '0011223344556677:1',
        listener_endpoint_id: '8899aabbccddeeff:2',
      },
    });

    expect(payload.ownership?.owner_node_id).toBe('node-a');
    expect(payload.ownership?.peer_node_id).toBe('node-b');
    expect(payload.ownership?.owner_endpoint_id).toBe('0011223344556677:1');
    expect(payload.ownership?.peer_endpoint_id).toBe('8899aabbccddeeff:2');
    expect(payload.ownership?.talker_node_id).toBe('node-a');
    expect(payload.ownership?.listener_node_id).toBe('node-b');
    expect(payload.ownership?.talker_endpoint_id).toBe('0011223344556677:1');
    expect(payload.ownership?.listener_endpoint_id).toBe('8899aabbccddeeff:2');
    expect(payload.ownership?.node_ids).toEqual(['node-a', 'node-b']);
    expect(payload.ownership?.endpoint_ids).toEqual(['0011223344556677:1', '8899aabbccddeeff:2']);
  });
});
