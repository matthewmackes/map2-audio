import { matchesScopedParameterUpdate } from './useWebSocket';

describe('matchesScopedParameterUpdate', () => {
  it('matches unscoped updates by plugin URI and parameter index', () => {
    expect(
      matchesScopedParameterUpdate(
        { plugin_uri: 'urn:test:plugin', param_index: 3, value: 0.5 },
        'urn:test:plugin',
        3,
      )
    ).toBe(true);
  });

  it('rejects updates from a different scoped instance', () => {
    expect(
      matchesScopedParameterUpdate(
        { plugin_uri: 'urn:test:plugin', param_index: 3, instance_id: 12, value: 0.5 },
        'urn:test:plugin',
        3,
        99,
      )
    ).toBe(false);
  });

  it('rejects position-scoped updates when the websocket payload lacks plugin_position', () => {
    expect(
      matchesScopedParameterUpdate(
        { plugin_uri: 'urn:test:plugin', param_index: 3, value: 0.5 },
        'urn:test:plugin',
        3,
        undefined,
        7,
      )
    ).toBe(false);
  });

  it('accepts updates when both scoped identifiers match', () => {
    expect(
      matchesScopedParameterUpdate(
        {
          plugin_uri: 'urn:test:plugin',
          param_index: 3,
          instance_id: 42,
          plugin_position: 7,
          value: 0.5,
        },
        'urn:test:plugin',
        3,
        42,
        7,
      )
    ).toBe(true);
  });
});
