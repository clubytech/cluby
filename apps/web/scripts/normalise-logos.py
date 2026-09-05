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
  2. Fill or fit, depending on the shape of the mark.

     A roughly square mark is scaled to COVER the disc — it reaches every edge and no ground shows
     at all, which is what kills the white ring these had around them. A wide wordmark cannot do
     that without losing its own ends, so it is fitted instead, at a share large enough that the
     remaining margin is not read as a frame.
  3. Centre it on a disc whose colour is chosen from the mark, not assumed. Three of these logos are
     white-on-transparent — HIMS, QQQ, RBLX — and on a white disc they vanish completely, and
     Amazon's is a white wordmark with an orange swoosh, which no "is it almost all light?" rule
     catches. So both grounds are tried and the one that hides less of the mark wins. The disc is
     antialiased at 4x and downsampled so its edge is clean at any render size.

Run:  python3 apps/web/scripts/normalise-logos.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
LOGOS = HERE.parent / "public" / "logos"

SIZE = 256          # what we store; the page renders it at 36-56px
# A fitted wordmark takes this share of the disc. Higher than it looks: the disc crops the corners,
# so a mark inscribed at 0.66 looked stranded in the middle.
FIT_SHARE = 0.84
# Inside this aspect band a mark is square enough to cover the disc without losing anything that
# carries meaning.
#
# The upper bound was 1.38 and that was too generous. Covering scales by the SHORTER side, so a
# mark at 1.38 loses 27% of its own width to the crop — and 27% off a wordmark is the difference
# between Invesco's QQQ and an unreadable fragment of it. QQQ, TSM, TTWO, SNDK and SPCX all shipped
# as pieces of themselves. At 1.15 the worst case is a 13% trim, which a mark can absorb, and
# anything wider is fitted instead: a little ground shows, and the logo is still the logo.
SQUARE_BAND = (0.87, 1.15)
SS = 4              # supersampling for the disc edge
LIGHT_BG = (255, 255, 255, 255)
DARK_BG = (0, 43, 56, 255)     # --color-bg-strong, so a dark disc still belongs to the palette
# A mark pixel this close in luminance to its ground cannot be seen against it.
INVISIBLE_WITHIN = 46


def trim(img: Image.Image) -> Image.Image:
    """Drop the uniform border a source shipped with, whichever colour it is."""
    rgba = img.convert("RGBA")

    # Anything with alpha: trim to the pixels a person can actually see.
    #
    # `getbbox()` on the raw alpha counts a single pixel of anti-aliasing fringe as content, and
    # several of these sources carry a faint halo across otherwise empty areas. Amazon's swoosh came
    # out reported as a 250x212 square — "square" enough to be cropped to fill the disc — when the
    # mark itself is a thin arc across the bottom third. A threshold fixes the aspect and therefore
    # fixes the decision that depends on it.
    alpha = rgba.getchannel("A")
    if alpha.getextrema()[0] < 250:
        box = alpha.point(lambda v: 255 if v > 24 else 0).getbbox()
        return rgba.crop(box) if box else rgba

    # Otherwise the corner pixel is the background, and the margin is what matches it.
    corner = rgba.getpixel((0, 0))
    bg = Image.new("RGBA", rgba.size, corner)
    from PIL import ImageChops

    diff = ImageChops.difference(rgba.convert("RGB"), bg.convert("RGB")).convert("L")
    box = diff.point(lambda p: 255 if p > 12 else 0).getbbox()
    return rgba.crop(box) if box else rgba


def ground_for(mark: Image.Image) -> tuple[int, int, int, int]:
    """The ground that hides less of this mark.

    This used to be a threshold — "if more than 92% of the mark is light, give it a dark disc" —
    and the number was the problem rather than the idea. Amazon's mark from this source is a WHITE
    wordmark with an orange swoosh: 78% light, comfortably under the threshold, and on a white disc
    that 78% simply is not there. The check that catches a blank disc caught it; the rule that was
    supposed to prevent one did not.

    So the question is asked directly instead of approximated. For each candidate ground, count the
    mark's pixels that are too close to it in luminance to be seen, and keep the ground that loses
    fewer of them. It needs no tuning, it cannot be off by a few percent, and it answers the thing
    we actually care about rather than a proxy for it.
    """
    px = mark.load()
    w, h = mark.size
    step = max(1, min(w, h) // 60)

    def luminance(c: tuple[int, int, int, int]) -> float:
        return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]

    lost = {LIGHT_BG: 0, DARK_BG: 0}
    seen = 0
    for y in range(0, h, step):
        for x in range(0, w, step):
            r, g, b, a = px[x, y]
            if a < 200:
                continue
            seen += 1
            lum = luminance((r, g, b, a))
            for bg in lost:
                if abs(lum - luminance(bg)) < INVISIBLE_WITHIN:
                    lost[bg] += 1
    if seen == 0:
        return LIGHT_BG
    # White on a tie: it is the site's default and the one most of these were drawn for.
    return DARK_BG if lost[DARK_BG] < lost[LIGHT_BG] else LIGHT_BG


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

    aspect = mark.width / max(1, mark.height)
    fills = SQUARE_BAND[0] <= aspect <= SQUARE_BAND[1]

    if fills:
        # Cover: scale by the SHORTER side so the mark reaches every edge of the disc, then centre
        # crop. Nothing of the ground remains visible, which is the whole point.
        scale = SIZE / min(mark.width, mark.height)
    else:
        scale = (SIZE * FIT_SHARE) / max(mark.width, mark.height)

    w, h = max(1, round(mark.width * scale)), max(1, round(mark.height * scale))
    mark = mark.resize((w, h), Image.LANCZOS)

    bg = ground_for(mark)
    canvas = Image.new("RGBA", (SIZE, SIZE), bg)
    canvas.paste(mark, ((SIZE - w) // 2, (SIZE - h) // 2), mark)
    canvas.putalpha(mask)
    canvas.save(path, "PNG", optimize=True)
    how = "filled" if fills else "fitted"
    ground = "dark" if bg == DARK_BG else "white"
    return f"{src.width}x{src.height} -> {SIZE}x{SIZE}, {how}, {ground} ground"


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
