/**
 * Custom Plugin Cards
 *
 * ⚠️  DO NOT add eager `export *` re-exports here.
 *
 * All custom cards are lazy-loaded via the plugin registry in registry.ts.
 * Each card is only downloaded when the user opens that specific plugin.
 * Adding eager exports here would pull ~40 card components (~500KB)
 * into the initial bundle.
 *
 * To add a new card: register it in registry.ts with a `loader` function:
 *   registerPluginCard('map2://juce/my-effect', {
 *     loader: () => import('./JUCE/MyEffectCard'),
 *   })
 */

// Intentionally empty — cards loaded via registry.ts
