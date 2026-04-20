"""
Telnet protocol byte constants used by Tesira Text Protocol clients.
"""

from __future__ import annotations

_IAC = b"\xff"
_IAC_BYTE = 0xFF
_DO = 0xFD
_DONT = 0xFE
_WILL = 0xFB
_WONT = 0xFC
_SB = 0xFA
_SE = 0xF0

__all__ = [
    "_IAC",
    "_IAC_BYTE",
    "_DO",
    "_DONT",
    "_WILL",
    "_WONT",
    "_SB",
    "_SE",
]
