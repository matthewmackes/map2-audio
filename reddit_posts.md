Here are four draft posts for Reddit.

---

### Post 1: For /r/linuxaudio

**Title:** Introducing MAP2: A new open-source, pro-audio ecosystem for Linux

**Body:**

Hey everyone,

For the past couple of years, I've been working on a project I'm incredibly passionate about, and I think it's finally ready to be shared with the Linux audio community. It's called MAP2 (Macke's Audio Platform 2), and it's my vision for a complete, open-source ecosystem for professional audio production and performance.

**What is it?**

MAP2 is a full-stack audio platform designed to run on a dedicated x86 machine. The idea is to have a central "brain" for your studio that handles all audio routing, processing, and networking. It's built from the ground up on a modern Linux audio stack, designed for high performance and low latency.

**Why is it powerful?**

*   **Modern Audio Stack:** It's built on PipeWire and leverages AVB (Audio Video Bridging) for professional, low-latency network audio. This allows for incredibly complex and high-channel-count routing over standard ethernet.
*   **High-Performance Engine:** The core audio processing is handled by a custom engine written in C++/JUCE, ensuring rock-solid, high-performance DSP.
*   **Built for Fedora Server:** We chose Fedora Server for its stability, up-to-date kernel, and fantastic PipeWire support. We've created a suite of scripts and configurations to turn a standard Fedora Server install into a real-time audio powerhouse.
*   **Focus on Low Latency:** Every part of the system has been designed and audited with the goal of achieving the lowest possible latency, making it suitable for live performance and tracking.

**Current Status & How to Get Involved**

The platform is about 90% complete. The core features are in place and it's very capable, but it's not quite a "daily driver" for critical studio work just yet. We're looking for adventurous users, testers, and contributors to help us get to version 1.0.

It's currently built for x86 machines running Fedora Server.

You can check out the project and our progress on GitHub: https://github.com/matthewmackes/map2-audio

Let me know what you think!

---

### Post 2: For /r/programming

**Title:** After 2 years of work, I'm sharing MAP2: A full-stack, real-time audio platform built with Python, React, and a C++/JUCE engine.

**Body:**

Hey /r/programming,

I'm excited to finally share a project that's been my passion for the last couple of years. It's called MAP2, and it's an ambitious open-source attempt at building a complete, full-stack ecosystem for real-time professional audio.

**What is it?**

MAP2 is a hardware/software platform that turns a dedicated x86 machine into a powerful audio processing server. You can control it via a web UI or a terminal-based UI. Think of it as a networked, headless audio workstation that you can build yourself.

**The Tech Stack & Architecture:**

This has been a fascinating and challenging project to build. The system is composed of several distinct parts working in concert:

*   **Backend:** A Python/FastAPI backend serves the main API, manages the system configuration, handles device discovery, and communicates with the audio engine.
*   **Audio Engine:** The real-time heavy lifting is done by a completely separate process: a multi-threaded C++ audio engine built using the JUCE framework. This is where all the DSP, mixing, and routing logic lives.
*   **Frontend:** We have two main frontends: a React-based web UI for comprehensive visual control and monitoring, and a Python-based Textual TUI for quick, headless operation from the terminal.
*   **Networking:** A huge part of the project is the implementation of the AVB (Audio Video Bridging) standard, allowing for high-bandwidth, low-latency, and synchronized audio streaming over a standard Ethernet network.
*   **OS Level:** The entire system is designed to be deployed on a real-time-optimized Fedora Server, and we've written extensive setup scripts to handle kernel tuning and dependency management.

**Current Status & Invitation to Collaborate**

The project is about 90% complete. The architecture is solid, and the core functionality is there, but we're still in the final push to get to a stable 1.0 release. It's not a "daily driver" just yet.

If you're interested in real-time systems, audio programming, full-stack development, or just a complex and rewarding challenge, I'd love for you to check it out.

The code is on GitHub: https://github.com/matthewmackes/map2-audio

Thanks for reading!

---

### Post 3: For /r/audioengineering

**Title:** Could a dedicated, open-source audio server change your studio workflow? Introducing MAP2.

**Body:**

Hello fellow audio nerds,

I want to introduce you to a project I've been working on called MAP2. It's an open-source platform that I believe could represent a new way of thinking about our studio workflows.

**What is it?**

In simple terms, MAP2 is a system that lets you build your own dedicated audio processing server. Imagine a custom box in your rack that handles all your heavy audio processing—your effects, your routing, maybe even your virtual instruments—and you control it all from a laptop, tablet, or any device with a web browser.

**Why is this powerful for a studio?**

*   **Offload Your CPU:** By moving the processing load from your main DAW computer to a dedicated MAP2 server, you free up your workstation to do what it does best: recording and arranging. This means you can use more plugins with lower latency and have a more stable system overall.
*   **Centralized Routing Power:** MAP2 is designed as a routing matrix for your entire studio. It uses professional AVB networking, which means you can send and receive dozens of channels of high-quality audio over a single Ethernet cable. Connect all your synths, interfaces, and outboard gear to it and route anything anywhere.
*   **Open and Customizable:** Because it's open-source, MAP2 is endlessly customizable. You're not locked into one company's ecosystem. You can dig into the code, add features, and truly make it your own.
*   **The Best of Hardware and Software:** It gives you the "single purpose" stability of a hardware unit, but with the flexibility and power of a software-defined system.

**Where is it at?**

I'd say the platform is about 90% of the way to a full "1.0" release. It's incredibly capable already, but we're still doing the final polishing and bug hunting. So, it's not quite ready to be the daily driver for a mission-critical session, but it's perfect for tinkerers and adventurous studio owners who want to get in on the ground floor.

It's designed to be built on a standard x86 computer running Fedora Server.

The project is on GitHub, and we'd love for you to check it out: https://github.com/matthewmackes/map2-audio

Thanks for your time!

---

### Post 4: For /r/Fedora

**Title:** Proudly built on Fedora Server: MAP2, a professional audio platform and ecosystem.

**Body:**

Hey /r/Fedora,

I wanted to share a project my team and I have been passionately building, with Fedora Server at its very core: MAP2 (Macke's Audio Platform 2).

**What is MAP2?**

MAP2 is a complete, open-source ecosystem for professional audio production and live performance. It's a software and hardware integration project that turns a standard x86 computer into a dedicated, networked, low-latency audio powerhouse. You can use it to build a digital mixer, a guitar effects processor, a studio-wide routing matrix, and more.

**Why We Chose Fedora Server**

From the very beginning, Fedora Server was the perfect OS for this project:

*   **Rock-Solid Stability:** For a real-time audio system, stability is everything. Fedora Server has provided the reliable foundation we need.
*   **First-Class PipeWire Support:** MAP2 is built on PipeWire. Fedora's leadership in the adoption and integration of PipeWire made it the obvious and best choice for us.
*   **Modern and Up-to-Date:** Access to the latest kernel versions and system libraries is crucial for performance tuning and hardware compatibility in the pro-audio world.
*   **Amazing Community:** We've built a suite of tools and setup scripts to optimize Fedora Server for ultra-low latency audio, and the wealth of knowledge in the Fedora community has been a huge help.

**Project Status**

We're about 90% complete. The system is stable and the main features are all working, but we're still on the final stretch toward a "1.0" release. It's not a "daily driver" for critical use just yet, but we'd love for some fellow Fedora enthusiasts to check it out and give us feedback.

The platform is built for x86 hardware.

You can find all our work, including the installation and setup guides for Fedora Server, on our GitHub: https://github.com/matthewmackes/map2-audio

Thanks for being an awesome community! We're proud to build on Fedora.