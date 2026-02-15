# MAP2 System: A Study of AVB / 802.1AS Capabilities and Use Cases - 2026-02-14

### Introduction to Networked Audio and Audio Video Bridging (AVB)

In professional audio environments, distributing high-quality, multi-channel audio between multiple devices is a significant challenge. Traditional analog or digital point-to-point wiring can be cumbersome, expensive, and inflexible. Audio Video Bridging (AVB) is a set of IEEE standards designed to provide a solution by enabling deterministic, low-latency, and time-synchronized audio and video streaming over standard Ethernet networks.

For students and engineers, understanding AVB is crucial for grasping the future of professional audio and networked systems. The core components of the AVB standard include:

*   **IEEE 802.1AS (gPTP):** The Generalized Precision Time Protocol provides a shared, high-precision clock across all devices on the network. This is the foundational element that ensures all audio streams are perfectly synchronized, with timing accuracy typically in the sub-microsecond range.
*   **IEEE 1722 (AVTP):** The Audio Video Transport Protocol defines how audio and video data is formatted and packetized for transport over the network.
*   **Bandwidth Reservation and Traffic Shaping:** AVB-enabled switches reserve a portion of the network bandwidth for AVB traffic and prioritize it over standard network data, guaranteeing that audio streams are not interrupted by other network activity.
*   **IEEE 1722.1 (AVDECC):** The Audio Video Discovery, Enumeration, Connection management, and Control protocol. This is the "control plane" of AVB, allowing devices to discover each other, advertise their capabilities (e.g., "I am an 8-channel microphone preamp"), and establish connections between them.

The MAP2 platform's implementation of AVB serves as an excellent educational case study in how these complex standards can be integrated into a real-world audio processing system.

### Architectural Approach to AVB in the MAP2 Platform

The MAP2 project approaches AVB as an optional, advanced feature, providing a clear distinction between its standard and networked operational modes. This design choice offers a valuable lesson in creating flexible systems that can scale in capability. The two primary modes of inter-node operation are:

1.  **Without AVB (Control Plane Only):** In its default configuration, a cluster of MAP2 nodes communicates over a standard IP network. It is critical to understand that in this mode, **no deterministic audio is streamed between nodes**. The network is used exclusively for control and management traffic via HTTP and WebSockets. This allows a user to, for example, use a single web interface to deploy different settings or presets to multiple, independent MAP2 units that are each processing their own local audio.

2.  **With AVB (Data and Control Plane):** When AVB is enabled and the necessary hardware (such as an Intel I210/I225 network interface) and software dependencies (`ptp4l` for time synchronization) are present, the system's capabilities are fundamentally extended. In this mode, MAP2 can send and receive multi-channel, time-synchronized audio streams between nodes using the AVTP protocol over a Layer 2 network. This enables true distributed audio processing.

The source code provides insight into this dual-mode design. The `app/config.py` file shows that AVB is disabled by default, and the service initialization logic in `app/services/avb/__init__.py` demonstrates how the system gracefully checks for the availability of AVB capabilities at runtime.

### A Phased Implementation: An Educational Case Study

The implementation of AVB in MAP2 is a particularly interesting subject for study because it is presented in distinct, documented phases. This mirrors a real-world agile development process and allows learners to understand how a complex feature is built incrementally.

**Phase 1 (Implemented): Discovery and Enumeration (ADP and AEM)**

The current implementation of AVB in MAP2 successfully demonstrates the "discovery" and "enumeration" aspects of the AVDECC standard. This is a significant achievement and provides a working example of the following concepts:

*   **ADP (AVDECC Discovery Protocol):** The system can broadcast its presence on the network and discover other AVB-enabled devices.
*   **AEM (Application Entity Model):** Once a device is discovered, MAP2 can query its AEM, which is a standardized description of the device's capabilities. The code demonstrates how to read various descriptors, such as the number of audio inputs and outputs, the available clock sources, and the supported stream formats.
*   **Caching:** The Python service `app/services/avb/aem_cache.py` provides a practical example of how to cache this queried information in a local SQLite database, preventing the need for repeated, time-consuming enumeration every time the system restarts.

From an educational perspective, this completed phase provides a solid foundation for understanding how networked devices can become aware of each other and their respective functions in a standardized way.

**Phase 2 (Future Work): Connection Management and Dynamic Formats (ACMP and AECP)**

The project's documentation, specifically `docs/AVDECC_FUTURE_IMPLEMENTATION_GUIDE.md`, transparently lays out the roadmap for future work. This is where the most powerful features of AVB are planned for implementation. Studying this plan offers insight into the next logical steps in building a complete AVB system.

*   **ACMP (AVDECC Connection Management Protocol):** This is the protocol used to dynamically create and tear down audio stream connections between devices. The documentation details the specific ACMP commands (`CONNECT_RX/TX`, `DISCONNECT_RX/TX`, etc.) that need to be implemented. Once complete, this would allow a user to, for example, graphically route an audio stream from a "talker" device to a "listener" device via the MAP2 web interface.
*   **Dynamic Format Negotiation (AECP):** The plan also describes using the AECP (AVDECC Enumeration and Control Protocol) to dynamically change a stream's format before a connection is made (e.g., changing from 2 channels at 48kHz to 8 channels at 96kHz).

By presenting the AVB feature in this phased manner, the MAP2 project serves as a living textbook. It provides working code for the foundational discovery elements, and a detailed, well-documented architectural plan for the more advanced connection management features.

### Use Cases: From Centralized Control to Distributed Processing

Understanding the different use cases for the AVB and non-AVB modes is key to grasping the platform's flexibility.

**Use Case 1: Centralized Control (Without AVB)**

Imagine a small recording studio with three separate rooms: a live room, a vocal booth, and a control room. Each room has a MAP2 unit acting as a standalone effects processor. Using the standard, non-AVB networking mode, a producer in the control room can use a single web browser to:

*   Load a high-gain amplifier model onto the MAP2 unit in the live room for a guitarist.
*   Load a vocal effects chain (compressor, EQ, reverb) onto the unit in the vocal booth.
*   Monitor the CPU and memory usage of all three units from a central dashboard.

In this scenario, the network is used only for management. The audio processing happens locally on each device.

**Use Case 2: Distributed DSP (With AVB)**

The true power of AVB is realized when it is used to distribute a single processing task across multiple nodes. This allows for more complex effects chains than a single CPU could handle.

*   **CPU Load Balancing:** A guitarist plugs into Node A. Node A is dedicated to running a very CPU-intensive Neural Amp Model. The processed audio is then streamed via AVB to Node B. Node B, free from the load of amp modeling, can now be dedicated to running a complex, high-quality convolution reverb and other spatial effects. The final stereo output is then sent from Node B to the monitors. This splits the processing load across two machines, achieving a result that might be impossible on a single machine without incurring xruns or unacceptable latency.

*   **Digital Snake:** In a live venue, a MAP2 unit can be placed on stage. All the microphones for the band are plugged into an audio interface connected to this unit. The MAP2 node then acts as an AVB "talker," streaming all 8, 16, or more microphone channels over a single, standard Ethernet cable to the front-of-house position. A second MAP2 unit at the mixing desk acts as a "listener," receiving the audio streams for mixing. This replaces a heavy, expensive, and often fragile analog multicore snake cable.

*   **Interoperability with Professional Equipment:** Because AVB is an open standard, a MAP2 node could be integrated into a larger professional audio network. For example, it could receive audio streams from an AVB-enabled MOTU or PreSonus mixing console, process them with its unique set of LV2 plugins or custom effects, and then stream the processed audio back to the console for final mixing.

### Conclusion

The AVB/802.1AS implementation in the MAP2 platform provides a rich and detailed case study for anyone interested in networked audio. It clearly demonstrates the fundamental differences between a simple control network and a deterministic, time-synchronized data network. By providing a partially-completed implementation with a well-documented future roadmap, the project offers a unique educational opportunity to not only study what has been built but to also understand the logical steps required to complete a complex, standards-compliant system. The use cases it enables, from simple centralized control to true distributed audio processing, highlight the transformative potential of AVB technology in the professional audio landscape.
