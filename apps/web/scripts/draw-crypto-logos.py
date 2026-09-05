"""
Draw the marks that no equity-logo API can supply.

WETH is Ether, not a listed company. Asking a US-equity logo service about it returns whatever its
search matched — in our case a company called Wetouch, which shipped and looked entirely plausible
until someone read it. There is no lookup that fixes that; the mark has to come from somewhere that
knows what the asset is.

Ether's is a diamond of six flat facets, so it is drawn here rather than fetched: no third party, no
licence question, exact geometry, and it comes out already matching the disc treatment the other
logos get from `normalise-logos.py`.

Run:  python3 apps/web/scripts/draw-crypto-logos.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
LOGOS = HERE.parent / "public" / "logos"

SIZE = 256
SS = 4  # supersample, then downsample: the only way these diagonals come out clean
GROUND = (255, 255, 255, 255)


def ether(size: int) -> Image.Image:
    """The Ethereum diamond, on the canonical proportions: 1:1.63 wide to tall."""
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Normalised control points, y down. The waist sits at 0.62 of the height.
    cx, top, bot = 0.5, 0.06, 0.94
    waist, half = 0.615, 0.235
    kink = 0.70  # where the lower half's silhouette turns

    def p(x: float, y: float) -> tuple[float, float]:
        return (x * s, y * s)

    DARK = (60, 60, 61, 255)
    MID = (128, 128, 130, 255)
    LIGHT = (143, 143, 145, 255)
    PALE = (99, 99, 101, 255)

    # Upper half: two facets meeting at the vertical axis.
    d.polygon([p(cx, top), p(cx - half, waist), p(cx, waist * 0.86)], fill=DARK)
    d.polygon([p(cx, top), p(cx + half, waist), p(cx, waist * 0.86)], fill=MID)
    # The band across the waist.
    d.polygon([p(cx - half, waist), p(cx, waist * 0.86), p(cx + half, waist), p(cx, kink)], fill=PALE)
    # Lower half.
    d.polygon([p(cx, bot), p(cx - half, kink - 0.03), p(cx, kink)], fill=DARK)
    d.polygon([p(cx, bot), p(cx + half, kink - 0.03), p(cx, kink)], fill=LIGHT)

    return img.resize((size, size), Image.LANCZOS)


def disc(size: int, colour: tuple[int, int, int, int]) -> Image.Image:
    big = Image.new("L", (size * SS, size * SS), 0)
    ImageDraw.Draw(big).ellipse((0, 0, size * SS - 1, size * SS - 1), fill=255)
    mask = big.resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), colour)
    out.putalpha(mask)
    return out


def main() -> int:
    LOGOS.mkdir(parents=True, exist_ok=True)

    # Same share of the canvas the fetched logos get, so it sits in the row without standing out.
    mark_px = int(SIZE * 0.62)
    mark = ether(mark_px)

    canvas = disc(SIZE, GROUND)
    canvas.alpha_composite(mark, ((SIZE - mark_px) // 2, (SIZE - mark_px) // 2))
    # Re-apply the disc mask: the mark is inside it, but compositing can touch the soft edge.
    canvas.putalpha(Image.composite(canvas.getchannel("A"), canvas.getchannel("A"), disc(SIZE, GROUND).getchannel("A")))

    out = LOGOS / "WETH.png"
    canvas.save(out, "PNG", optimize=True)
    print(f"drew {out.name} at {SIZE}x{SIZE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
