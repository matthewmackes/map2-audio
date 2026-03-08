# Tesira DSP and Signal Chain Full Parity Feature Inventory

## Objective
Build MAP2 as a full functional replacement for Tesira DSP programming, signal-chain authoring, compile, deploy, and runtime operations.

This list defines the full feature surface that must be available in MAP2.

## Source Baseline
- Tesira Help: Compilation, DSP and Partitions
  - https://tesira-help.biamp.com/System_Design/Compiler.htm
- Tesira Text Protocol v4.2 (Attribute Tables and Interface Tables)
  - https://downloads.biamp.com/assets/docs/default-source/control/tesira_text_protocol_v4-2_jan22.pdf
- Tesira Help: Interface tables overview
  - https://tesira-help.biamp.com/System_Control/Tesira_Text_Protocol/Attribute_tables/Interface_tables.htm
- Biamp Cornerstone: Processing Library
  - https://support.biamp.com/Tesira/Programming/Processing_Library
- Biamp Cornerstone: Custom blocks
  - https://support.biamp.com/Tesira/Programming/Custom_blocks
- Biamp Cornerstone: Presets workflow
  - https://support.biamp.com/Tesira/Programming/Creating_and_modifying_presets_in_Tesira

## Full Feature List (Programming + Signal Chains)

### 1. Project and System Design Workspace
- New/Open/Save project files and version-safe project migration.
- Multi-partition design workflow.
- Device and equipment table authoring.
- Graphical DSP canvas with block placement, wiring, grouping, and annotation.
- Instance tag management and naming validation.
- Object initialization dialogs (channel counts, equipment type, block options).
- Copy/paste/duplicate/delete of blocks and signal-chain sections.
- Reusable design assets via Processing Library catalogs.
- Custom block authoring, cataloging, import/export, and reuse.

### 2. Compiler and Build System (Must Have)
- Compile active partition.
- Compile all partitions.
- Compile uncompiled partitions.
- Recompile all partitions.
- Global optimization pass.
- Compile report with warnings/errors and exact object references.
- Hardware allocation engine (I/O + DSP requirements).
- Device auto-selection by role/capability/cost.
- Fixed-in-unit allocation rules and per-channel device assignment.
- Delay equalization computation and insertion.
- DSP resource usage reporting by partition/device.
- Deterministic compile behavior when physical devices are assigned.

### 3. Deployment and Runtime Lifecycle
- Go Live / deploy compiled configuration to target hardware.
- Partition-aware deployment control.
- Runtime synchronization state (in-sync, out-of-sync, needs recompile).
- Online/offline unit state and reconnect behavior.
- Runtime readback of parameter and block state.
- Device reboot and post-restart state recovery.
- Configuration backup/restore and recovery workflow.

### 4. DSP Block Library (All Block Families)
The following block families and interfaces must be represented as first-class programmable objects in MAP2.

#### 4.1 Interface and I/O Blocks
- Audio Input Block, Audio Output Block.
- AVB Input Block, AVB Output Block.
- CobraNet Input/Output Blocks.
- Dante Input/Output Blocks.
- USB Input/Output Blocks.
- AEC Input Block, AEC Processing Block.
- ANC Input Block, ANC Processing Block.
- TI Receive/Transmit/Control Status Blocks.
- VoIP Receive/Transmit/Control Status/Transfer/Call State.
- TC Call State Commands.
- Audio-Technica mic block, SHURE mic block, Parle microphone block.
- Attero Tech Input/Output Blocks.
- AV Input/Output Blocks.
- EX-UBT Block.
- Paging Zone Block.
- Tesira amplifier and supported amplifier interface blocks.

#### 4.2 Mixer and Combine Blocks
- Standard Mixer Block.
- Matrix Mixer Block.
- Gating Auto Mixer Block.
- Gain Sharing Auto Mixer Block.
- Auto Mixer Combiner Block.
- Room Combiner Block.

#### 4.3 EQ, Filter, and Crossover
- Parametric EQ Block.
- Graphic EQ Block.
- Feedback Suppressor Block.
- Pass Filter Block.
- Shelf Filter Block.
- All Pass Filter Block.
- Uber Filter Block.
- FIR Filter Block.
- Crossover Block.

#### 4.4 Dynamics and Gain Control
- Leveler Block.
- Compressor Block.
- Peak Limiter Block.
- Ducker Block.
- Noise Gate Block.
- AGC Block.

#### 4.5 Routing and Selection
- Router Block.
- Source Selector Block.
- AV Router Block.

#### 4.6 Time, Metering, and Sources
- Audio Delay Block.
- Signal Present Meter Block.
- Peak/RMS Meter Block.
- Tone Generator Block.
- Noise Generator Block.

#### 4.7 Control and Command Blocks
- Level Control Block.
- Mute Control Block.
- Invert Control Block.
- Preset Control Block.
- Command String Block.
- Dialer Block.
- DTMF Decode Block.
- Network Command String behavior (where supported).

#### 4.8 Logic and Event Programming
- Logic State Block.
- Flip Flop Block.
- Logic Delay Block.
- Logic Meter Block.
- Logic Input/Output Blocks.
- Control Voltage Block.
- Logic Selector Block.
- Logic Pulse Block.
- Logic Sequence Block.

### 5. Presets, Scenes, and Recall Logic
- Preset definition from selected DSP blocks.
- Preset include/exclude scope by parameter and block.
- Preset recall, store, and overwrite workflows.
- External trigger recall (control protocol, GPIO, logic, controller).
- Scene capture/recall equivalence for MAP2 workflows.
- Preset synchronization and reverse-sync detection.

### 6. AVB/Network Media Programming
- AVB stream authoring (talker/listener stream definitions).
- Channel map and stream assignment.
- Route binding between DSP chain endpoints and network streams.
- PTP clock state visibility and topology modeling.
- Network interface configuration visibility relevant to media path.

### 7. External Control and Automation Interfaces
- DEVICE-level command surface via TTP (Telnet/SSH transport support).
- Attribute get/set for all exposed blocks.
- Subscription/push events where supported.
- Bulk read/write transactions.
- GPIO read/write abstraction.
- Serial/network control integration (command string workflows).

### 8. Diagnostics, Faults, and Validation
- Fault list and fault history.
- Real-time metering and meter history.
- Connection health and fleet health.
- Compile-time validation and runtime parameter validation.
- Compatibility warnings for unsupported blocks or attributes.

### 9. Security and Operations
- Protocol enable/disable state awareness (Telnet/SSH/HTTPS as exposed).
- Role-aware controls for configuration mutations.
- Audit trail for configuration and parameter changes.

## MAP2 Full Parity Requirement
To satisfy the "every feature available" requirement, MAP2 must provide:
- A complete DSP object model covering all block families listed above.
- Native design authoring and graph editing for new configurations.
- Native compile/validate/deploy lifecycle equivalent to Tesira software behavior.
- Full runtime control and observability for parameters, presets, streams, and faults.
- No hidden feature gaps for DSP programming workflows used by integrators.

## Implementation Note
For true parity at scale, MAP2 should maintain a machine-readable capability and block-definition registry per Tesira software/firmware version so object availability, attributes, and compile constraints stay deterministic.
