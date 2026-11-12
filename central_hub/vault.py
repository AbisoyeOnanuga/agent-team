"""Encrypt provider keys with Windows DPAPI. Only this Windows account on this PC can read them back."""

from __future__ import annotations

import ctypes
import sys
from ctypes import wintypes


class _Blob(ctypes.Structure):
    _fields_ = [("size", wintypes.DWORD), ("data", ctypes.POINTER(ctypes.c_char))]


def available() -> bool:
    return sys.platform == "win32"


def _run(protect: bool, data: bytes) -> bytes:
    if not available():
        raise OSError("Saving keys from the phone needs Windows. Put the key in .env on this machine instead.")
    crypt = ctypes.windll.crypt32
    fn = crypt.CryptProtectData if protect else crypt.CryptUnprotectData
    buffer = ctypes.create_string_buffer(data, len(data))
    source = _Blob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_char)))
    out = _Blob()
    if not fn(ctypes.byref(source), None, None, None, None, 0x1, ctypes.byref(out)):
        raise OSError("Windows could not encrypt or decrypt the key")
    try:
        return ctypes.string_at(out.data, out.size)
    finally:
        ctypes.windll.kernel32.LocalFree(out.data)


def seal(text: str) -> bytes:
    return _run(True, text.encode("utf-8"))


def open_(blob: bytes) -> str:
    return _run(False, blob).decode("utf-8")
