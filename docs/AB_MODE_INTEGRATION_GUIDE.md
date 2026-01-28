// ============================================================================
// MAP2 Audio Platform - Enhanced ChainBuilder with A/B Mode Integration
// Integration code to add A/B mode to existing ChainBuilder component
// ============================================================================

/**
 * This file shows how to integrate the ChainABMode component into ChainBuilder.tsx
 * Add the following to your ChainBuilder component:
 */

// 1. Add to imports at top of ChainBuilder.tsx:
// import ChainABMode from './ChainABMode';

// 2. Add state hooks:
// const [abModeEnabled, setAbModeEnabled] = useState(false);
// const [selectedChainIdA, setSelectedChainIdA] = useState<number | null>(null);
// const [selectedChainIdB, setSelectedChainIdB] = useState<number | null>(null);
// const [currentBlend, setCurrentBlend] = useState(0); // 0-100

// 3. Handle keyboard shortcuts in useEffect:
// useEffect(() => {
//   const handleKeyDown = (e: KeyboardEvent) => {
//     if (abModeEnabled) {
//       // Space: Toggle A/B
//       if (e.code === 'Space') {
//         e.preventDefault();
//         // Switch between chains
//       }
//       // Arrow Left: Decrease blend (more A)
//       if (e.code === 'ArrowLeft') {
//         setCurrentBlend(prev => Math.max(0, prev - 5));
//       }
//       // Arrow Right: Increase blend (more B)
//       if (e.code === 'ArrowRight') {
//         setCurrentBlend(prev => Math.min(100, prev + 5));
//       }
//     }
//   };
//   window.addEventListener('keydown', handleKeyDown);
//   return () => window.removeEventListener('keydown', handleKeyDown);
// }, [abModeEnabled]);

// 4. Add API call for blend configuration:
// const handleBlendChange = async (newBlend: number) => {
//   setCurrentBlend(newBlend);
//   if (selectedChainIdA && selectedChainIdB) {
//     try {
//       await fetch(`/api/chains/${selectedChainIdA}/blend`, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({
//           chain_a_id: selectedChainIdA,
//           chain_b_id: selectedChainIdB,
//           blend_position: newBlend / 100,
//           enabled: true,
//         }),
//       });
//     } catch (error) {
//       console.error('Failed to update blend:', error);
//     }
//   }
// };

// 5. Render the A/B Mode component in the layout:
// Suggested location: After the top controls, before the main content area

// <ChainABMode
//   chains={chains}
//   selectedChainIdA={selectedChainIdA}
//   selectedChainIdB={selectedChainIdB}
//   onSelectChainA={setSelectedChainIdA}
//   onSelectChainB={setSelectedChainIdB}
//   onToggleABMode={setAbModeEnabled}
//   onBlendChange={handleBlendChange}
//   currentBlend={currentBlend}
//   dspLoadA={globalDspLoads?.a}
//   dspLoadB={globalDspLoads?.b}
// />

// 6. Modify the center panel to show the active chain based on blend:
// const displayChainId = currentBlend < 50 ? selectedChainIdA : selectedChainIdB;
// OR in blend mode, show both side-by-side

// ============================================================================
// API Integration Guide
// ============================================================================

/**
 * New API endpoints added to support A/B mode:
 * 
 * POST /api/chains/{chain_id}/duplicate
 *   - Duplicate a chain for quick A/B pair creation
 *   - Body: { name: string, include_settings: boolean }
 *   - Returns: New chain object
 * 
 * POST /api/chains/{chain_id}/blend
 *   - Configure A/B blending
 *   - Body: {
 *       chain_a_id: number,
 *       chain_b_id: number,
 *       blend_position: float (0-1),
 *       enabled: boolean,
 *       linked: boolean
 *     }
 *   - Returns: Blend configuration confirmation
 * 
 * GET /api/chains/{chain_a_id}/compare/{chain_b_id}
 *   - Get comparison data for two chains
 *   - Returns: {
 *       chain_a: Chain,
 *       chain_b: Chain,
 *       differences: {
 *         only_in_a: Plugin[],
 *         only_in_b: Plugin[],
 *         common_plugins: number,
 *         plugin_count_diff: number
 *       },
 *       estimated_latency_diff: number
 *     }
 * 
 * POST /api/chains/{chain_id}/morph?target_chain_id={id}&progress={0-1}
 *   - Morph parameters between chains
 *   - Returns: Morphing status
 * 
 * GET /api/chains/{chain_id}/dsp-load
 *   - Get DSP load estimate
 *   - Returns: {
 *       total_dsp_load_percent: number,
 *       plugin_loads: Array<{uri, name, estimated_cpu_percent}>,
 *       warning: boolean
 *     }
 */

// ============================================================================
// TUI Integration Guide
// ============================================================================

/**
 * In your TUI implementation, integrate the ChainABModeTUI:
 * 
 * from tui.chain_ab_mode import get_ab_mode_tui
 * 
 * ab_tui = get_ab_mode_tui()
 * ab_tui.set_chains(all_chains)
 * 
 * # In main input loop:
 * action = ab_tui.handle_input(key_pressed)
 * if action == 'select_chain_a':
 *     ab_tui.select_chain_a(user_selected_chain_id)
 * 
 * # Rendering:
 * display(ab_tui.render())
 */

// ============================================================================
// Example: Complete A/B Workflow
// ============================================================================

/**
 * USER WORKFLOW:
 * 
 * 1. Enable A/B Mode
 *    - Click "A/B Mode ON" button
 *    - UI shows two chain slots (A and B)
 * 
 * 2. Create A/B Pair
 *    - Option A: Select existing chain for A, select existing chain for B
 *    - Option B: Select chain for A, click "Clone as B", enter new name
 * 
 * 3. Compare/Blend
 *    - Adjust blend slider from A (left) to B (right)
 *    - See DSP load for each chain
 *    - Hear real-time blend output
 * 
 * 4. Fine-tune Chains
 *    - In side-by-side mode, edit chain A, then edit chain B
 *    - Compare visually and by ear
 *    - Export best configuration
 * 
 * 5. Save Preset Pair
 *    - Link chains to keep as synchronized pair
 *    - Export as preset bundle
 * 
 * LIVE USE:
 *    - Map footpedal to "Toggle A/B" (song switch)
 *    - Map expression pedal to "Blend Slider" (tone morphing)
 */

// ============================================================================
// Accessibility Features
// ============================================================================

/**
 * A/B Mode supports multiple interaction styles:
 * 
 * KEYBOARD (Default):
 *   - SPACE: Toggle A/B mode on/off
 *   - A/B: Select chains for positions A/B
 *   - LEFT/RIGHT ARROW: Adjust blend
 *   - [/]: 100% A or B
 *   - =: 50/50 blend
 * 
 * MOUSE:
 *   - Click "A/B MODE ON" to toggle
 *   - Drag blend slider
 *   - Click chain to select position
 * 
 * MIDI LEARN:
 *   - Learn footpedal to toggle
 *   - Learn expression pedal to blend
 *   - Learn MIDI CC to chain selection
 * 
 * TOUCHSCREEN:
 *   - Tap blend slider
 *   - Swipe left/right to adjust blend
 *   - Tap chain names to select
 */

export {}; // Empty export for TypeScript module
