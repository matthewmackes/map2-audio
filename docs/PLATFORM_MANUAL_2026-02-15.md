# MAP2: The Open-Source Playground for Real-Time Audio

**An open-source educational platform for the next generation of audio engineers, musicians, and creators.**

## The Live Concert: A Real-World Learning Lab

The MAP2 platform transforms a complex live stage into an understandable, hands-on educational experience. This diagram illustrates how MAP2 can power a full rock band, from the individual musician to the front-of-house engineer.

**(Image: A detailed, clean, and colorful technical diagram. See the prompt below to generate this image.)**

## The Building Blocks of Your Sound

MAP2 provides the tools to understand and control every aspect of your audio signal path.

*   **Nodes: Your Personal Audio Powerhouse**
    Each musician has a dedicated MAP2 Node, a powerful and compact unit for real-time audio processing.
*   **Chains: Craft Your Perfect Tone**
    A Chain is a sequence of effects, just like a guitarist's pedalboard. Create and save Chains for different songs or sounds, from a clean vocal reverb to a heavily distorted guitar tone.
*   **Flows: Bring Your Sound to Life**
    A Flow is a running instance of your Chain on a Node. Use the web UI to instantly deploy any Chain to any Node on the network.

## Three Ways to Play: From Studio to Stage

MAP2 scales to fit your needs, providing a clear learning path from basic to advanced audio concepts.

*   **The Studio: All-In-One Mode**
    Perfect for practice, sound design, and recording. Run the entire MAP2 platform—audio engine, control backend, and UI—on a single machine. It's a complete, self-contained studio in a box.
*   **The Stage: Networked Control**
    In a live setting, connect multiple MAP2 Nodes to a standard network. A backstage technician can use a laptop or tablet to centrally manage every musician's sound, deploying different Chains and tweaking parameters in real-time.
*   **The Arena: AVB Networked Audio**
    For large-scale productions, enable AVB (Audio Video Bridging) to send and receive dozens of channels of high-fidelity, low-latency audio over a single Ethernet cable. This "digital snake" functionality is the pinnacle of modern audio networking, and with MAP2, it's an open book for you to explore.

**MAP2 is more than just an audio processor; it's a transparent, powerful, and fun way to learn the principles of modern audio production. Explore the code, experiment with the technology, and build the sounds you've always imagined.**

---

## Gemini Image Generation Prompt

**Create a one-page sales brochure for an educational platform called MAP2. The brochure should be visually centered around a detailed diagram that depicts a real-world use case of the MAP2 audio platform in a live rock band setting.**

**The diagram should have a clean, modern, and educational aesthetic. Use clear lines, labels, and icons. The style should be a hybrid of a technical block diagram and an infographic.**

**The diagram must include the following components and signal flows:**

**1. The Stage (Left side of diagram):**
    *   A five-piece rock band:
        *   **Singer:** With a microphone.
        *   **Guitarist:** With an electric guitar and a MIDI foot controller.
        *   **Bassist:** With a bass guitar and a MIDI foot controller.
        *   **Keyboardist:** With a keyboard and a MIDI foot controller.
        *   **Drummer:** With an electronic drum kit (showing a MIDI out).
    *   Each musician is connected to their own **MAP2 Unit** (labeled as "MAP2 Node").
    *   Show audio signals (thin, colored lines) going from the instruments/mics into their respective MAP2 Nodes.
    *   Show MIDI signals (dashed lines) going from the MIDI controllers to the MAP2 Nodes.
    *   Each MAP2 Node is shown in **"All-In-One Mode"**, with a small icon of a screen on the unit itself, indicating local control.

**2. Backstage / Wings (Center of diagram):**
    *   A "Roadie" or "Backstage Tech" is looking at a laptop.
    *   The laptop screen shows the **MAP2 Web UI**, with a graphical representation of "Chains" and "Flows".
    *   Show a Wi-Fi or Ethernet connection from the laptop to a network switch.
    *   The MAP2 Nodes on stage are also connected to this network switch.
    *   This represents the **"Centralized Control"** use case. Add a text box explaining this: "A technician can remotely manage each musician's effects ('Chains') from a single control point."

**3. Front of House (Right side of diagram):**
    *   A "Front of House (FOH) Engineer" is at a large mixing desk, also looking at a PC screen or tablet which displays the MAP2 Web UI.
    *   Show a single Ethernet cable labeled **"AVB Network"** connecting the network switch from the stage area to an AVB-compatible switch at the FOH position.
    *   The FOH mixing desk is connected to this AVB switch.
    *   Clearly label this signal flow as a **"Digital Snake"**.
    *   Add a text box explaining this: "All audio channels are streamed over a single cable using AVB, replacing heavy analog snakes."
    *   Show the main stereo output from the mixing desk going to large "PA Speakers".

**4. Signal Flow Details:**
    *   Use distinct colors for different types of signals (e.g., blue for raw audio, red for processed audio, green for MIDI, purple for AVB).
    *   Use arrows to clearly indicate the direction of the signal flows.

**5. Text and Labels:**
    *   Use clear, sans-serif fonts.
    *   Label all key components: "MAP2 Node", "MIDI Controller", "AVB Switch", "Web UI", "FOH Mixing Desk", etc.
    *   Briefly explain the concepts of "Chains" and "Flows" in a small text box, perhaps with an icon.

**The overall layout should be clean, with a logical flow from left to right (Stage -> Backstage -> FOH). The tone should be professional, educational, and visually appealing.**