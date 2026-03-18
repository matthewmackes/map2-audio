# MAP2 Audio Platform — Icon Descriptions for AI Generation

**Purpose:** Prompt reference for generating all 160 icon slots via an AI image generator (DALL-E 3, Midjourney, or equivalent).

**Style Specification (apply to every icon):**

> Monotone SVG icon, Carbon Design System style. 32×32px canvas, 2px safe zone border (28×28px live area). Solid filled paths only — no strokes. All strokes expanded to filled shapes. Single color: pure black `#000000` on transparent background. Pixel-grid aligned. Optical weight consistent with IBM Carbon iconography. Clean geometric forms, minimal detail, no decoration. Flat, technical, professional.

---

## Category: Audio Engine

**Color token:** `#37d6c9` (Brand Teal)

---

### `map-audio-grid`
A 2×2 grid of equal squares inside a rounded rectangle. The outer container has corner radius 4px. Each inner square is separated by a 2px gap. Represents a matrix or grid-based audio interface. All shapes pixel-aligned, filled paths only.

---

### `map-realtime-engine`
A horizontal rectangle (rack unit shape) with four short vertical tick marks along the top edge. Inside the rectangle, a heartbeat/ECG waveform line runs horizontally — flat, then a sharp spike up, down, back to baseline. Conveys real-time processing. Filled paths, 2px expanded strokes.

---

### `map-cluster-fabric`
Three small rounded squares connected by lines in a hub-and-spoke arrangement: one square on the left, two on the right (top and right). Lines connect the left node to both right nodes via a central junction point. Represents a networked cluster. All filled paths.

---

### `map-matrix-proc`
A square with a 3×3 internal grid of intersecting vertical and horizontal lines (two interior verticals, two interior horizontals dividing the square into 9 zones). Three filled dots sit at three non-adjacent grid intersections (top-right, center-left, bottom-right). Represents a signal processing matrix.

---

### `map-realtime-engine` *(Audio Engine variant)*
A rectangular chip outline with four connection pins on the top edge. Inside, a sine wave curve runs left to right across the center. Represents a dedicated audio processor chip.

---

### `fx-generator`
A circle with a sine wave passing horizontally through its center. The wave extends slightly beyond the circle on both sides. Represents an oscillator or tone generator. Clean, minimal, filled paths.

---

### `fx-oscillator`
A square frame containing a full sine wave (one complete cycle, left to right). Below the wave, a small triangle wave is visible as a secondary shape. Suggests a waveform generator with multiple shapes.

---

### `phosphor-disc`
A circle (disc outline, expanded to filled ring) with a small concentric circle at center and four short radial tick marks at 12, 3, 6, and 9 o'clock. Represents audio media or a storage disc.

---

### `phosphor-headphones`
Two rounded arc shapes connected at the top by a curved headband. Each arc terminates in a small circle (ear cup). Symmetric, clean geometry. Represents monitoring headphones.

---

### `carbon-waveform`
Five vertical bars of varying heights arranged left to right in a waveform/histogram pattern (short, medium, tall, medium, short — bell curve distribution). Represents an audio signal or waveform display.

---

## Category: Routing

**Color token:** `#60a5fa` (Blue)

---

### `map-signal-flow`
Three circles connected by straight lines forming a simple directed graph: one circle on the left, two on the right (top-right and bottom-right). Lines go from the left circle to each right circle. An arrowhead at each right circle tip indicates signal direction.

---

### `map-routing-matrix`
A square with two internal vertical lines and two internal horizontal lines creating a 3×3 grid. Three filled circles sit at specific grid intersections forming a diagonal pattern (top-left, center, bottom-right). Represents patch routing points on a matrix.

---

### `carbon-branch`
A vertical line that splits into two at the bottom: one line continues straight down, one branches diagonally right. Small arrow tips at each endpoint. Represents a signal branch or fork.

---

### `carbon-flow`
Three rectangles connected left-to-right by short horizontal arrows. Each arrow is a filled chevron/arrowhead. Represents a sequential signal flow pipeline.

---

### `carbon-link`
Two chain links: an oval ring on the left and an oval ring on the right, slightly overlapping at center. Both rings are filled outlines (expanded strokes). Represents a connection between two points.

---

### `phosphor-arrows-lr`
Two horizontal arrows pointing in opposite directions, stacked vertically with a small gap. Left arrow points left, right arrow points right. Both are filled solid arrowheads with stems. Represents stereo L/R or bidirectional signal.

---

### `phosphor-flow-arrow`
A thick curved arrow that begins at the bottom-left, curves upward through center, and exits at the top-right with a filled arrowhead. Represents signal routing or re-direction.

---

### `phosphor-link-break`
Two chain links (same as `carbon-link`) with a diagonal gap/break between them and two small diagonal lines crossing the gap. Represents a disconnected or broken signal path.

---

### `phosphor-path`
A dotted curved line (three visible dots/dashes) forming a gentle S-curve from bottom-left to top-right, terminating in a small arrowhead. Represents a signal path or routing route.

---

### `fx-converter`
A square with an arrow entering from the left and a different-shaped arrow exiting right. Inside the square, a small zigzag or transform symbol (two opposing diagonal arrows). Represents format or protocol conversion.

---

### `fx-lr`
The letters "L" and "R" side by side inside a rounded rectangle, separated by a thin vertical line at center. Bold, geometric letterforms, pixel-aligned. Represents stereo left/right routing.

---

### `fx-mixer`
Three vertical fader columns: each column is a thin vertical rectangle with a small square slider at a different height (high, medium, low). Represents a mixer or gain control panel.

---

### `fx-split`
A single horizontal line that diverges into two horizontal lines at a central Y-junction. Small filled circles at each of the three endpoints. Represents a signal splitter.

---

### `pip-sidechain`
A large arrow pointing right (main signal) with a smaller arrow entering from above at a 45° angle, merging into the main arrow shaft. Represents a sidechain or keyed input.

---

### `carbon-arrow-right`
A clean filled right-pointing arrow: a horizontal shaft with a solid equilateral arrowhead at the right end. No outline — solid filled shape. Represents directional signal flow.

---

## Category: Dynamics

**Color token:** `#3b82f6` (Blue)

---

### `map-dynamics`
Three vertical bars at different heights with a horizontal threshold line crossing them from left to right. The bars to the right of the threshold are shorter (compressed). A small rightward arrow at the threshold line tip. Represents dynamic range compression.

---

### `fx-compressor`
A graph: horizontal x-axis, vertical y-axis. A diagonal line rises at 45° from origin to a knee point, then continues at a shallower angle (2:1 or 4:1 slope). The knee is a small rounded corner. Represents a compressor transfer curve.

---

### `fx-gate`
A rectangle (gate frame) with an internal waveform that shows signal passing through when above a threshold line (solid) and being blocked (flat/zero) below it. The threshold is a dashed horizontal line inside the rectangle.

---

### `fx-limiter`
Same graph axes as `fx-compressor` but with a perfectly flat horizontal ceiling line at the top (hard clip). The diagonal input line hits the ceiling and goes flat. Represents a limiter's hard ceiling.

---

## Category: EQ / Filter

**Color token:** `#14b8a6` (Teal)

---

### `map-equalizer`
Three vertical lines (like faders) each with a small circle slider at different heights. Left circle low, center circle high, right circle mid. Represents a 3-band graphic equalizer.

---

### `fx-eq`
A frequency response curve inside a rectangle: starts flat left, has a gentle bell-curve peak in the center, ends flat right. The curve is a thick filled band (expanded stroke). Represents an equalizer frequency response.

---

### `fx-filter`
A frequency response showing a low-pass filter: flat from the left, then a smooth rolloff curve descending to the right. The curve's filled path shows the pass-band as a solid region below the curve.

---

### `fx-filter-hp`
Same as `fx-filter` but mirrored: flat on the right side, rolloff on the left. The pass-band fill is on the right. Represents a high-pass filter.

---

### `fx-parametric-eq`
A horizontal baseline with a bell-curve peak rising above it (parametric boost). Three small control points: one at the peak center, one on each side of the curve's base. Represents a parametric EQ band.

---

## Category: Reverb

**Color token:** `#8b5cf6` (Violet)

---

### `map-reverb`
Three concentric arcs opening to the right, like a sound propagation ripple. The arcs increase in size left to right. A small vertical line or dot at the left origin point. Represents spatial reverb decay.

---

### `fx-reverb`
A room outline: a simple rectangular room shape with a dot (sound source) in the lower-left corner. Diagonal lines (reflections) bounce from the walls toward the upper-right. Represents acoustic room reverb.

---

### `fx-lexicon`
A rectangular hardware unit outline with three small horizontal lines inside (representing front-panel controls) and two indicator dots on the right side. Represents a classic hardware reverb unit.

---

### `fx-spatial`
A circle (representing a head/listener) with three curved arcs above and around it radiating outward. Represents 3D or spatial audio processing.

---

## Category: Delay

**Color token:** `#f59e0b` (Amber)

---

### `map-delay`
A circle on the left (input signal) connected by a horizontal line to a rightward arrow. Below the arrow, a dashed line loops back left to the circle with a smaller secondary circle. Represents a delay feedback loop.

---

### `fx-delay`
A horizontal waveform pulse on the left, then after a gap, a smaller copy of the same pulse on the right. A small "t" (time) label implied by a bidirectional arrow spanning the gap. Represents a delayed echo copy.

---

## Category: Modulation

**Color token:** `#06b6d4` (Cyan)

---

### `map-modulation`
A full sine wave cycle across the width of the canvas. Below it, a shorter rectangular pulse wave (LFO trigger shape). The two waves are stacked vertically. Represents modulation from an LFO source.

---

### `fx-chorus`
Two overlapping sine waves slightly offset from each other (like a slight pitch detune). The waves intersect at two points creating a visual beating pattern. Represents chorus modulation.

---

### `fx-flanger`
A sine wave with a second, slightly compressed/frequency-modulated wave above it. The compressed wave appears to have a varying period. Represents flanger's comb-filter sweep.

---

### `fx-modulator`
A triangle wave (LFO shape) on top, with a downward arrow pointing to a sine wave below it. The arrow indicates modulation of the target parameter. Represents an LFO modulating a signal.

---

### `fx-phaser`
A sine wave on the left with a phase-shifted copy on the right (the right wave is offset by roughly 180°). A small phase symbol (φ) or rotation arrow between them. Represents phase shifting.

---

### `phosphor-wave-sine`
A clean, single full sine wave cycle. Smooth curves, the filled path forms a thick wave shape (expanded 2px stroke). The canonical representation of a sine oscillator.

---

## Category: Distortion / Drive / Amp

**Color token:** `#ef4444` (Red)

---

### `map-amplifier`
A rectangle (amp chassis) with a triangle/cone speaker grille pattern of diagonal lines inside the lower half, and two rows of small rectangles at the top representing controls. Conveys a guitar amplifier head.

---

### `fx-amplifier`
Same as `map-amplifier` — a guitar amplifier head: rectangular chassis, speaker cone representation below, control panel above. Slightly simplified.

---

### `fx-distortion`
An input sine wave on the left transforming into a clipped/squared-off wave on the right (top and bottom of the wave are flat, corners are sharp). Represents hard clipping/distortion.

---

## Category: Pitch

**Color token:** `#22c55e` (Green)

---

### `map-pitch`
A musical staff with two notes: a lower note on the left connected by an upward arrow to a higher note on the right. The arrow represents pitch transposition. Clean, minimal note shapes.

---

### `fx-pitch`
A diagonal arrow pointing upward-right with a small music note shape at the tail. Represents pitch shifting upward. The note is a filled oval with a vertical stem.

---

## Category: Cabinet / IR / Speaker

**Color token:** `#f97316` (Orange)

---

### `map-cabinet`
A rectangle (speaker cabinet box outline) containing a circle (speaker cone). Inside the circle, a smaller concentric circle (dust cap). The cabinet has a 2px border radius. Represents a guitar speaker cabinet.

---

### `fx-simulator`
A rectangle (cabinet outline) with a speaker cone circle inside AND a small waveform curve visible to the right of the cabinet, trailing off. The waveform represents the impulse response (IR). Represents a cabinet simulator.

---

### `phosphor-speaker-high`
A speaker icon: a small rectangle (driver body) with a triangular horn/cone expanding to the right. Three small curved arcs to the right of the cone represent sound waves at full volume.

---

## Category: Multi-Effect / Hybrid

**Color token:** `#37d6c9` (Brand Teal)

---

### `map-multi-effect`
Three small circles arranged in a triangle formation (top-left, top-right, bottom-center), connected by lines forming a triangle. A small star/spark above the top center. Represents a multi-effect processor with interconnected modules.

---

### `carbon-ml-model`
A neural network diagram: three nodes in a column on the left, two nodes in a column on the right, connected by diagonal lines (every left node connects to every right node). Represents machine learning / Neural Amp Modeler.

---

### `fx-instrument`
A small piano keyboard: five white keys and three black keys visible, viewed from the front. The keys are rectangular filled paths. Represents a synthesizer or instrument plugin.

---

### `fx-nam`
A brain outline (two rounded lobes) with a small lightning bolt or signal arrow passing through it. Represents neural/AI-based amp modeling.

---

### `fx-plugin`
A puzzle piece: a rectangle with one convex tab on the right side and one concave cutout on the left. Represents a generic plugin or module slot.

---

## Category: Utility

**Color token:** `#6b7280` (Gray)

---

### `carbon-add`
A plus sign: horizontal bar intersecting a vertical bar at center, equal length, equal width. Both bars are filled rectangles. No circle surround. Clean, minimal.

---

### `carbon-checkmark`
A checkmark: short diagonal line going down-left, longer diagonal line going up-right. Both strokes expanded to filled paths forming a V with a long right arm. Optically balanced.

---

### `carbon-close`
An X mark: two diagonal lines crossing at center at 45°. Expanded to filled paths. Equal visual weight to `carbon-checkmark`.

---

### `carbon-compare`
Two rectangles side by side with a vertical dividing line between them. Each rectangle contains a simple bar or shape in a different position. Represents side-by-side comparison.

---

### `carbon-drag`
A 2×3 grid of six small filled dots (two columns, three rows). Represents a drag handle for reordering. All dots same size, evenly spaced.

---

### `carbon-flash`
A lightning bolt: a polygon that forms a Z-shape pointing downward. Top-right point, diagonal down-left to a center overhang, then diagonal down-right to bottom-left point. Filled solid polygon.

---

### `carbon-information`
A circle outline (expanded to filled ring) with a lowercase "i" centered inside. The "i" consists of a dot at top and a short vertical bar below. Represents an information tooltip.

---

### `carbon-moon`
A crescent moon: a filled circle with a smaller filled circle subtracted from its top-right quadrant, leaving a crescent shape. Represents dark mode.

---

### `carbon-pin`
A pushpin: a circle at top (pin head) connected to a downward-pointing elongated triangle (pin body) with a sharp tip at the bottom. Represents pinning/favoriting an item.

---

### `carbon-power`
A circle outline (ring, expanded stroke) with a vertical line breaking through the top of the ring, extending upward. Represents a power button.

---

### `carbon-redo`
A curved arrow (arc of approximately 270°) pointing clockwise, with a filled arrowhead at the right end. The arc has a small gap at the bottom-left. Represents redo / forward in history.

---

### `carbon-renew`
Two curved arrows forming a complete circle (each arrow is a semicircle with an arrowhead at its end, the two arrows facing opposite directions). Represents refresh or cycle.

---

### `carbon-reset`
A single circular arrow (approximately 300° arc) with an arrowhead pointing counterclockwise. A small vertical mark inside the circle near the gap. Represents reset to defaults.

---

### `carbon-settings`
A gear with eight teeth: a circle at center, eight rectangular teeth radiating outward at 45° intervals. Center hole is a smaller circle cutout. Represents configuration settings.

---

### `carbon-timer`
A circle outline (clock face) with a short vertical line at 12 o'clock (representing the 12-hour mark) and a single clock hand pointing to approximately 2 o'clock. Represents timing or duration.

---

### `carbon-trash`
A rectangular bin with a lid: a small horizontal rectangle at top (lid) and a larger rectangle below (body). The body has three thin vertical internal lines (slots). Represents delete.

---

### `carbon-undo`
Mirror of `carbon-redo`: a curved arrow arc approximately 270° pointing counterclockwise, arrowhead at the left end. Represents undo.

---

### `carbon-warning`
An equilateral triangle pointing upward with an exclamation mark (vertical line + small dot at bottom) centered inside. Triangle has slight border radius on corners. Represents a warning or caution.

---

### `fx-constant`
An equals sign (=): two parallel short horizontal bars, equally spaced. Both bars are filled rectangles. Represents a constant or fixed value.

---

### `fx-dial`
A circle (knob outline) with a small filled dot at the 12 o'clock position and a slightly larger dot at center. A short arc below the knob (representing the sweep range). Represents a rotary knob parameter.

---

### `fx-empty`
A dashed-line rectangle (the dashes are short filled segments alternating with gaps). Represents an empty slot or placeholder.

---

### `fx-error`
A circle with an X inside: a filled ring (outer circle) with two diagonal lines crossing at center (X shape). Represents an error or failure state.

---

### `fx-terminal`
A rectangle (terminal window frame) with a right-angle bracket ">" on the left and a short horizontal blinking cursor line to its right. Represents a terminal or command-line interface.

---

### `fx-utility`
A wrench: an elongated S-curved shape with a circular jaw at one end. The wrench jaw has a small hexagonal cutout. Represents a utility or tool.

---

### `phosphor-bell`
A bell shape: a rounded dome at top with a slight inward curve at the sides, flat base. A small circle below the base (clapper). Represents a notification.

---

### `phosphor-check-circle`
A filled ring (circle outline) with a checkmark inside. The checkmark is a clean V-shape. Represents success or verified state.

---

### `phosphor-copy`
Two overlapping rectangles, the back one slightly offset up-right. The front rectangle is fully visible; the back one shows only its top and right edges. Represents copy/duplicate.

---

### `phosphor-eye`
An eye shape: a pointed oval (iris outline) containing a smaller filled circle (pupil) at center. The iris outline is an expanded arc path. Represents visibility.

---

### `phosphor-lightning`
Same as `carbon-flash` — a lightning bolt polygon. Filled solid Z-shape. Represents fast/instant action or power.

---

### `phosphor-minus`
A single horizontal filled rectangle bar. Represents subtract, collapse, or remove.

---

### `phosphor-pencil`
A diagonal pencil: a long rectangle rotated 45° with a pointed triangular tip at the bottom-left and a small square eraser cap at the top-right. Represents edit or rename.

---

### `phosphor-plus`
Same as `carbon-add` — a plus sign with two crossing filled rectangle bars. Represents add or create.

---

### `phosphor-shield`
A shield shape: rounded rectangle with a pointed bottom. The top is slightly curved inward. Interior empty. Represents security or protection.

---

### `phosphor-shuffle`
Two crossing diagonal arrows: one pointing from bottom-left to top-right, one pointing from top-left to bottom-right. Each has a small arrowhead. Represents shuffle or randomize.

---

### `phosphor-sliders`
Three vertical lines (like `map-equalizer`) each with a small filled square slider at different heights. Left slider at bottom, center at top, right at mid. Represents multi-parameter adjustment.

---

### `phosphor-speaker-mute`
A speaker icon (same base as `phosphor-speaker-high`) with an X mark overlaid on the sound wave arcs. No arcs — just the speaker body and an X. Represents muted output.

---

### `phosphor-squares-four`
A 2×2 grid of four equal squares with equal gaps between them. Each square is filled. Represents a grid or matrix layout view.

---

### `phosphor-stack`
Three rectangles stacked vertically with slight offsets (each one shifted slightly right and up from the one below). The bottom rectangle is fully visible; upper ones show only top and right edges. Represents layers or stacked modes.

---

### `phosphor-x-circle`
Same as `fx-error` — a filled ring with an X inside. Represents error or cancel.

---

### `pip-delete`
Same as `carbon-trash` — a rectangular bin with a lid and three internal vertical slots. Represents delete.

---

### `pip-help`
A circle (ring outline) with a question mark "?" centered inside. The question mark has a curved top and a dot at the bottom. Represents help.

---

### `pip-settings`
Same as `carbon-settings` — a gear with eight teeth and a circular center hole. Represents settings/configuration.

---

### `phosphor-shield-check` *(security verified)*
A shield shape with a small checkmark inside at center. Represents verified or secure state.

---

## Category: Navigation

**Color token:** `#a8a8a8` (Neutral Gray)

---

### `carbon-chevron-down`
A downward-pointing chevron: two diagonal lines meeting at a bottom center point, forming a V shape. Expanded to filled paths. Represents expand or collapse.

---

### `carbon-dashboard`
A semicircle (gauge face) with three short radial tick marks (left, center, right) and a single needle pointing to approximately 2 o'clock. Represents an overview dashboard.

---

### `carbon-launch`
A square with an arrow pointing diagonally out of the top-right corner. The arrow exits through the corner of the square. Represents opening an external link.

---

### `carbon-menu`
Three equal-length horizontal bars stacked vertically with equal spacing. All bars are filled rectangles of identical width. Represents a hamburger navigation menu.

---

### `carbon-search`
A circle (magnifying glass lens, expanded ring) with a short diagonal line extending from the bottom-right (handle). Represents search.

---

### `carbon-zoom-in`
A magnifying glass (same as `carbon-search`) with a small plus sign inside the circle. Represents zoom in.

---

### `carbon-zoom-out`
A magnifying glass with a small minus/horizontal bar inside the circle. Represents zoom out.

---

### `carbon-zoom-reset`
A magnifying glass with two small opposing arrows inside the circle (like `carbon-renew` but tiny). Represents reset zoom to default.

---

### `phosphor-funnel`
A trapezoid (wide at top, narrow at bottom) representing a funnel filter. Three short horizontal lines inside the funnel at decreasing widths from top to bottom. Represents filter or search refinement.

---

### `pip-expand-down`
Same as `carbon-chevron-down` — a downward V chevron. Represents expand downward.

---

## Category: Library

**Color token:** `#818cf8` (Indigo)

---

### `carbon-book`
An open book: two rectangular pages meeting at a center vertical spine. A few short horizontal lines on each page represent text. Represents documentation.

---

### `carbon-document`
A rectangle with a folded top-right corner (dog-ear). Three short horizontal lines inside represent text content. Represents a document or file.

---

### `carbon-download`
A downward arrow (vertical shaft + arrowhead pointing down) above a horizontal baseline. Represents downloading a file.

---

### `carbon-save`
A floppy disk: a square with a smaller square cutout in the top-right corner (the write-protect tab) and a horizontal rectangle in the lower two-thirds (the metal shutter). Represents save.

---

### `carbon-star`
A five-pointed star: five triangular points evenly distributed. Filled solid. Represents a favorite or rating.

---

### `carbon-upload`
An upward arrow (vertical shaft + arrowhead pointing up) above a horizontal baseline. Mirror of `carbon-download`. Represents uploading a file.

---

### `phosphor-books`
Three rectangles standing vertically side by side (like books on a shelf) of slightly different heights. The spines are filled rectangles. Represents a library or knowledge base.

---

### `phosphor-cloud-down`
A cloud shape (two rounded humps at top, flat base) with a downward arrow below the cloud body. Represents cloud download or import.

---

### `phosphor-cloud-up`
Same cloud shape with an upward arrow above the cloud body. Represents cloud upload or export.

---

### `phosphor-copy`
Two overlapping rectangles offset diagonally. Already described above under Utility — duplicate entry resolved here as Library copy action.

---

### `phosphor-database`
Three thin horizontal ovals (like disc platters) stacked vertically with small gaps, representing database storage layers. Represents a database or preset store.

---

### `phosphor-file-text`
A rectangle (file outline) with a folded top-right corner. Inside: three short horizontal lines (text rows). Represents a text document or log file.

---

### `phosphor-floppy`
Same as `carbon-save` — a floppy disk with write-protect notch and shutter rectangle. Represents save to disk.

---

### `phosphor-folder-open`
A folder shape (rectangle with a small tab at top-left) with the front flap open (angled upward). Represents browse or open folder.

---

### `phosphor-package`
A cube outline (isometric box): a square front face, a parallelogram top face, and a parallelogram right face. Three visible faces. Represents a plugin package or asset bundle.

---

### `pip-bank`
A rectangle with three small horizontal compartments inside (like a memory bank or preset slots). Each compartment has a tiny filled rectangle indicator. Represents a preset bank.

---

### `pip-file-download`
Same as `carbon-download` — downward arrow above baseline. Represents file download.

---

### `pip-file-rename`
A rectangle (file shape) with a small pencil icon overlaid at the bottom-right corner. The pencil is a miniature diagonal rectangle with a point. Represents rename or edit file.

---

### `pip-file-upload`
Same as `carbon-upload` — upward arrow above baseline. Represents file upload.

---

### `pip-preset`
A rectangle (file card) with a small database cylinder icon in the center. Represents a plugin preset saved to storage.

---

### `pip-presets`
Three overlapping rectangle cards arranged in a slight fan/cascade (like a deck of cards). Represents a collection of presets.

---

### `pip-snapshot`
A camera outline: a rectangle with a small circle (lens) centered and a small raised rectangle on top (shutter/viewfinder bump). Represents saving a snapshot of state.

---

### `map-patch-library`
A rectangle (document) with a small musical waveform (two humps) inside the lower half and a dog-ear fold at top-right. Represents a library of signal chain patches.

---

## Category: MIDI

**Color token:** `#c084fc` (Purple)

---

### `carbon-music`
A filled music note: an oval notehead (filled circle) with a vertical stem rising from the right and a single flag/beam at the top of the stem. Represents MIDI or musical data.

---

### `phosphor-music-note`
Same as `carbon-music` — a single music note with filled oval head and stem. Represents MIDI or audio note.

---

### `phosphor-piano-keys`
Five white keys (tall rectangles) with three black keys (shorter, narrower rectangles) overlaid in the standard piano pattern (gap between keys 3 and 4). Represents MIDI keyboard input.

---

### `pip-midi`
A five-pin DIN connector outline: a circle (connector housing) with five small circles inside arranged in a semicircular arc (the five pins). Represents a MIDI port.

---

## Category: Monitoring

**Color token:** `#4ade80` (Green)

---

### `carbon-activity`
Same as `map-realtime-engine` waveform — an ECG/heartbeat line: flat, then a sharp upward spike, then flat again. Represents real-time activity monitoring.

---

### `carbon-chart-line`
A rectangle (chart area) with a rising line graph: starts low-left, two data points in middle at different heights, ends high-right. Small filled dots at each data point. Represents a performance chart.

---

### `carbon-meter`
An arc (approximately 180°, semicircle) representing a VU meter face. Three tick marks on the arc (low, mid, high). A single needle line pointing from center to approximately 2/3 up the scale. Represents an audio level meter.

---

### `fx-analyzer`
A rectangle (display area) with a frequency spectrum display inside: multiple vertical bars of varying heights (roughly bell-curve shaped), densely packed from left to right. Represents a spectrum analyzer.

---

### `fx-spectral`
A rectangle containing a gradient bar (represented by a series of very thin vertical rectangles of progressively increasing height from left to right) below a curved frequency line. Represents spectral/FFT analysis.

---

### `phosphor-chart-bar`
A bar chart: three vertical rectangles of different heights on a shared baseline. Left bar shortest, center bar tallest, right bar medium. Represents statistics or metrics.

---

### `phosphor-cpu`
A square (chip outline) with four connection pins on each side (16 total). Inside the square, a smaller square (die). Represents CPU usage or processing load.

---

### `phosphor-gauge`
Same as `carbon-meter` — a semicircular gauge face with tick marks and a needle. Represents a performance meter.

---

### `phosphor-graph`
A horizontal baseline with a smooth bell-curve shape rising above it, then falling back to baseline. The area under the curve is filled. Represents a frequency or signal graph.

---

### `phosphor-pulse`
Same shape as `carbon-activity` — an ECG heartbeat waveform. Represents a pulse or heartbeat activity indicator.

---

### `phosphor-thermometer`
A narrow vertical rectangle (thermometer tube) with a circle at the bottom (bulb). A filled rectangle inside the tube represents the mercury level at approximately 60% height. Represents temperature or thermal monitoring.

---

### `phosphor-trend-up`
A diagonal arrow pointing from bottom-left to top-right. Below the arrow, a simple rising line chart (two or three upward steps). Represents an upward trend in metrics.

---

## Category: Devices

**Color token:** `#fb923c` (Orange)

---

### `map-rack-device`
A tall rectangle (rack unit) with three horizontal rows of small controls: dots and short lines representing knobs and faders on a hardware device faceplate.

---

### `phosphor-broadcast`
A small filled circle (transmitter) with three progressively larger curved arcs (semicircles) radiating outward above and to the sides of it. Represents network broadcast or streaming.

---

### `phosphor-desktop`
A monitor (rectangle with slight border radius) on a short stand (small rectangle below, wider at base). Represents a desktop computer or server.

---

### `phosphor-hard-drive`
A horizontal rectangle (drive body) with two short horizontal lines inside (representing drive platters or the label area) and a small circle on the right side (connector). Represents hard drive storage.

---

### `phosphor-id-card`
A rectangle (card outline) with a small circle at the top-left (photo area) and three horizontal lines on the right side (text fields). Represents a device identification card.

---

### `phosphor-plug-charge`
An electrical plug: two vertical parallel rectangles (prongs) side by side, joined at their tops by a horizontal bar (the plug body). A short cable line extends downward. Represents a power or connection plug.

---

### `phosphor-share-network`
Three filled circles arranged in a triangular formation (one left, two right) connected by two diagonal lines. Arrowheads on the lines indicate sharing direction. Represents network sharing.

---

### `phosphor-wifi`
Three concentric arcs opening upward (like a Wi-Fi symbol), with a small filled dot at the bottom center. Represents wireless network connectivity.

---

## Category: Performance

**Color token:** `#fb7185` (Rose)

---

### `map-stage-perform`
A trapezoidal stage platform (wide at bottom, narrower at top) with a small circle above center (spotlight beam origin) and two diagonal lines descending from the circle to the stage edges. Represents a live performance stage.

---

### `carbon-play`
A solid right-pointing triangle (equilateral or slightly taller than wide). Filled. Represents play or start audio.

---

### `phosphor-pause`
Two equal vertical rectangles side by side with a small gap between them. Both filled. Represents pause playback.

---

---

## Global Style Notes for AI Generation

1. **Every icon** must render clearly at 24×24px actual display size
2. **No gradients, no shadows, no color other than black**
3. **Strokes are expanded** — every line is a filled shape, not a stroked path
4. **Minimum feature size:** no detail smaller than 2px at 32×32
5. **Optical center:** visually centered within the 32×32 canvas, not mathematically centered
6. **Consistent weight:** all icons should feel equally "heavy" — no thin wispy icons mixed with chunky ones
7. **Carbon vocabulary:** prefer rectangles with slight radius (1-2px), clean arcs, no serif or decorative elements
8. **Monotone only:** a single AI pass should produce a clean black silhouette on white/transparent — no shading

---

*Total: 160 icon slots across 10 DSP categories + Navigation, Library, MIDI, Monitoring, Devices, Performance*
*Generated: 2026-03-17 — MAP2 Audio Platform T205-subA*
