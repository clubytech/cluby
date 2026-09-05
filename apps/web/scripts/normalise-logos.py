"""
Make every market logo the same object.

The downloaded logos disagree about everything that matters visually: some are 100x100 and some
800x800, some carry a wide white margin baked in and some bleed to the edge, some are on white and
some are transparent. Dropped into identical circles they come out looking like a set of accidents —
one mark filling its circle, the next floating in the middle at half the size.

So each one is rebuilt rather than merely scaled:

  1. Trim the border the source shipped with, whatever colour it is. The margin is measured from the
     actual corner pixel, so a white-padded logo and a transparent-padded one both lose exactly
     their own padding and nothing else.
  2. Scale the trimmed mark to a fixed share of the canvas, fitting the LONGER side, so a wide
     wordmark and a square glyph end up carrying the same visual weight.
  3. Centre it on a white disc, alpha-antialiased at 4x and downsampled, so the circle edge is clean
     at any size the page renders it.

Run:  python3 apps/web/scripts/normalise-logos.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
LOGOS = HERE.parent / "public" / "logos"

SIZE = 256          # what we store; the page renders it at 36-56px
MARK_SHARE = 0.66   # how much of the circle the mark itself occupies
SS = 4              # supersampling for the disc edge
BG = (255, 255, 255, 255)


def trim(img: Image.Image) -> Image.Image:
    """Drop the uniform border a source shipped with, whichever colour it is."""
    rgba = img.convert("RGBA")

    # Anything with alpha: trim to the visible pixels.
    alpha = rgba.getchannel("A")
    if alpha.getextrema()[0] < 250:
        box = alpha.getbbox()
        return rgba.crop(box) if box else rgba

    # Otherwise the corner pixel is the background, and the margin is what matches it.
    corner = rgba.getpixel((0, 0))
    bg = Image.new("RGBA", rgba.size, corner)
    from PIL import ImageChops

    diff = ImageChops.difference(rgba.convert("RGB"), bg.convert("RGB")).convert("L")
    box = diff.point(lambda p: 255 if p > 12 else 0).getbbox()
    return rgba.crop(box) if box else rgba


def circle_mask(size: int) -> Image.Image:
    big = Image.new("L", (size * SS, size * SS), 0)
    ImageDraw.Draw(big).ellipse((0, 0, size * SS - 1, size * SS - 1), fill=255)
    return big.resize((size, size), Image.LANCZOS)


def normalise(path: Path, mask: Image.Image) -> str:
    src = Image.open(path)
    mark = trim(src)
    if mark.width == 0 or mark.height == 0:
        return "empty after trim, left alone"

    target = int(SIZE * MARK_SHARE)
    scale = target / max(mark.width, mark.height)
    w, h = max(1, round(mark.width * scale)), max(1, round(mark.height * scale))
    mark = mark.resize((w, h), Image.LANCZOS)

    canvas = Image.new("RGBA", (SIZE, SIZE), BG)
    canvas.paste(mark, ((SIZE - w) // 2, (SIZE - h) // 2), mark)
    canvas.putalpha(mask)
    canvas.save(path, "PNG", optimize=True)
    return f"{src.width}x{src.height} -> {SIZE}x{SIZE}, mark {w}x{h}"


def main() -> int:
    files = sorted(LOGOS.glob("*.png"))
    if not files:
        print(f"no logos in {LOGOS}; run fetch-logos.mjs first")
        return 1
    mask = circle_mask(SIZE)
    for f in files:
        print(f"  {f.stem:<6} {normalise(f, mask)}")
    print(f"{len(files)} logos normalised to {SIZE}px circles")
    return 0


if __name__ == "__main__":
    sys.exit(main())
