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
  3. Centre it on a disc whose colour is chosen from the mark, not assumed. Three of these logos are
     white-on-transparent — HIMS, QQQ, RBLX — and on a white disc they vanish completely. A logo
     that is almost entirely light gets the dark ground it was drawn for; everything else gets
     white. The disc is antialiased at 4x and downsampled so its edge is clean at any render size.

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
LIGHT_BG = (255, 255, 255, 255)
DARK_BG = (0, 43, 56, 255)     # --color-bg-strong, so a dark disc still belongs to the palette
# Above this share of light pixels, the mark needs a dark ground or it disappears.
LIGHT_MARK_THRESHOLD = 0.92


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


def ground_for(mark: Image.Image) -> tuple[int, int, int, int]:
    """White, unless the mark is so light it would disappear on it."""
    px = mark.load()
    w, h = mark.size
    step = max(1, min(w, h) // 40)
    light = seen = 0
    for y in range(0, h, step):
        for x in range(0, w, step):
            r, g, b, a = px[x, y]
            if a < 200:
                continue
            seen += 1
            if 0.299 * r + 0.587 * g + 0.114 * b > 200:
                light += 1
    if seen == 0:
        return LIGHT_BG
    return DARK_BG if light / seen >= LIGHT_MARK_THRESHOLD else LIGHT_BG


def circle_mask(size: int) -> Image.Image:
    big = Image.new("L", (size * SS, size * SS), 0)
    ImageDraw.Draw(big).ellipse((0, 0, size * SS - 1, size * SS - 1), fill=255)
    return big.resize((size, size), Image.LANCZOS)


def already_normalised(img: Image.Image) -> bool:
    """A file this script has already produced: exactly SIZE square, with a transparent corner
    outside the disc. Re-processing one is not a no-op — the disc becomes the mark, gets scaled to
    fit and re-masked, and the logo shrinks a little every run."""
    if img.size != (SIZE, SIZE) or img.mode != "RGBA":
        return False
    return img.getpixel((2, 2))[3] == 0 and img.getpixel((SIZE // 2, SIZE // 2))[3] == 255


def normalise(path: Path, mask: Image.Image) -> str:
    src = Image.open(path)
    if already_normalised(src):
        return "already normalised, left alone"
    mark = trim(src)
    if mark.width == 0 or mark.height == 0:
        return "empty after trim, left alone"

    target = int(SIZE * MARK_SHARE)
    scale = target / max(mark.width, mark.height)
    w, h = max(1, round(mark.width * scale)), max(1, round(mark.height * scale))
    mark = mark.resize((w, h), Image.LANCZOS)

    bg = ground_for(mark)
    canvas = Image.new("RGBA", (SIZE, SIZE), bg)
    canvas.paste(mark, ((SIZE - w) // 2, (SIZE - h) // 2), mark)
    canvas.putalpha(mask)
    canvas.save(path, "PNG", optimize=True)
    ground = "dark ground" if bg == DARK_BG else "white"
    return f"{src.width}x{src.height} -> {SIZE}x{SIZE}, mark {w}x{h}, {ground}"


def contrast_of(path: Path) -> float:
    """Share of pixels inside the disc that differ from the ground. Zero means invisible."""
    im = Image.open(path).convert("RGBA")
    px = im.load()
    w, h = im.size
    inset = w // 6
    seen = dark = 0
    for y in range(inset, h - inset, 3):
        for x in range(inset, w - inset, 3):
            r, g, b, a = px[x, y]
            if a < 200:
                continue
            seen += 1
            if 0.299 * r + 0.587 * g + 0.114 * b < 200:
                dark += 1
    return 0.0 if seen == 0 else dark / seen


def main() -> int:
    files = sorted(LOGOS.glob("*.png"))
    if not files:
        print(f"no logos in {LOGOS}; run fetch-logos.mjs first")
        return 1
    mask = circle_mask(SIZE)
    for f in files:
        print(f"  {f.stem:<6} {normalise(f, mask)}")

    # Check the result rather than trusting the process. A logo that came out the same colour as
    # its own ground looks like a missing image, and it is not visible in a diff — three of these
    # shipped that way before this check existed.
    blank = [f.stem for f in files if not 0.02 < contrast_of(f) < 0.985]
    print(f"{len(files)} logos normalised to {SIZE}px circles")
    if blank:
        print(f"  NO CONTRAST, would render as a blank disc: {' '.join(blank)}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
