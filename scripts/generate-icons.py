"""
Generates placeholder PNG icons for WTT-RX.

Usage:
    python3 scripts/generate-icons.py

Outputs:
    assets/icons/icon16.png
    assets/icons/icon32.png
    assets/icons/icon48.png
    assets/icons/icon128.png

Replace these with proper branded icons before distribution.
"""
import struct
import zlib
import pathlib

ICON_COLOR = (30, 136, 229)  # #1e88e5 — WTT-RX blue


def make_png(width: int, height: int, r: int, g: int, b: int) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)

    scanline = b'\x00' + bytes([r, g, b]) * width
    raw = scanline * height
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)

    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', ihdr)
        + chunk(b'IDAT', zlib.compress(raw))
        + chunk(b'IEND', b'')
    )


def main() -> None:
    output_dir = pathlib.Path(__file__).parent.parent / 'assets' / 'icons'
    output_dir.mkdir(parents=True, exist_ok=True)

    for size in (16, 32, 48, 128):
        path = output_dir / f'icon{size}.png'
        path.write_bytes(make_png(size, size, *ICON_COLOR))
        print(f'  {path} ({size}x{size})')

    print('Ícones gerados com sucesso.')


if __name__ == '__main__':
    main()
