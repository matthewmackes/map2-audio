"""Per-consumer projections over the MidiBinding canonical authority.

Each module in this directory translates between the canonical
MidiBinding shape and a consumer-specific request/response shape, so
consumers (Snapshot Editor, Brain, per-device pages, Tesira TTP, etc.)
don't have to change their public API to consume the authority.

Projections are added incrementally as their consumer migrations land:

- T2482-P2.3: snapshot.py
- T2482-P2.4: brain.py
- T2482-P2.5: device_pack.py
- T2482-P2.6: transport.py, tesira_ttp.py, gpio.py
- T2482-P2.7: plugin_param.py
- 2026-05-09: snapshot_program.py — surfaces the per-snapshot
  `program_number` column as a canonical PC binding so the MIDI Services
  Bindings/Routing pages reflect it alongside every other binding.
"""
