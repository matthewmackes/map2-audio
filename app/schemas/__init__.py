"""Cross-process IPC schema definitions.

Each module in this package defines the wire-level message types
shared between ``map2-backend`` (Python) and a sibling C++ process.
The C++ side carries matching ``struct`` definitions; CI tests verify
the field lists stay in sync.
"""
