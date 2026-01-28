// @ts-nocheck
// ============================================================================
// MAP2 Audio Platform - React Flow Position Storage
// Persists node positions to localStorage per chain ID
// ============================================================================

import { Node } from 'reactflow';

const STORAGE_KEY_PREFIX = 'chain-flow-positions-';

/**
 * Save node positions to localStorage
 */
export function saveNodePositions(chainId: number, nodes: Node[]): void {
  const positions = nodes.reduce((acc, node) => {
    acc[node.id] = node.position;
    return acc;
  }, {} as Record<string, { x: number; y: number }>);

  try {
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${chainId}`,
      JSON.stringify(positions)
    );
  } catch (error) {
    console.error('Failed to save node positions:', error);
  }
}

/**
 * Load node positions from localStorage
 */
export function loadNodePositions(
  chainId: number
): Record<string, { x: number; y: number }> {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${chainId}`);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Failed to load node positions:', error);
    return {};
  }
}

/**
 * Clear node positions for a specific chain
 */
export function clearNodePositions(chainId: number): void {
  try {
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${chainId}`);
  } catch (error) {
    console.error('Failed to clear node positions:', error);
  }
}

/**
 * Clear all stored positions (useful for debugging)
 */
export function clearAllNodePositions(): void {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith(STORAGE_KEY_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.error('Failed to clear all node positions:', error);
  }
}
