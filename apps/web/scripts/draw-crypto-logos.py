"""
Draw the marks that no logo service can supply.

WETH is Ether, not a listed company. Asking a US-equity logo service about it returns whatever its
search matched — in our case a company called Wetouch, which shipped and looked entirely plausible
until someone read it. There is no lookup that fixes that; the mark has to come from somewhere that
knows what the asset is.

Ether's is a diamond of six flat facets, so it is drawn here rather than fetched: no third party, no
licence question, exact geometry, and it comes out already matching the disc treatment the other
logos get from `normalise-logos.py`.

Two equities are here for a related reason, and it is worth writing down because "just fetch it"
sounds like it should always work:

  GLD is SPDR Gold Shares. Every source returns either a three-line text card — "SPDR Gold Shares /
  an Exchange Traded Gold security" — or State Street's own stacked wordmark, and at the 36px this
  renders at both are a grey smear. The State Street mark is also what SPY would carry, so the two
  funds would become indistinguishable in the same list. What the fund actually IS reads instantly
  at any size: a gold bar.

  DJT is Trump Media. The equity service still ships Digital World Acquisition Corp's blue block —
  the SPAC it merged out of in 2024 — which is not a poor logo, it is the wrong company's. A
  lettermark of the company's own initials is correct, legible small, and cannot be out of date in
  the way a stale brand asset is.

Neither is a trademark reproduction: one is the metal, the other is four letters set in our own
type. Both beat a confidently wrong mark, and both beat a placeholder.

Run:  python3 apps/web/scripts/draw-crypto-logos.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

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


def gold_bar(size: int) -> Image.Image:
    """A trapezoidal ingot, lit from the upper left. Three faces, no outline, no text."""
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    TOP = (255, 224, 130, 255)
    FRONT = (242, 185, 46, 255)
    SIDE = (198, 140, 22, 255)

    def p(x: float, y: float) -> tuple[float, float]:
        return (x * s, y * s)

    # The top face, a parallelogram seen at a shallow angle.
    d.polygon([p(0.20, 0.40), p(0.68, 0.28), p(0.92, 0.40), p(0.44, 0.53)], fill=TOP)
    # The front face, taller on the left where the bar is nearer.
    d.polygon([p(0.20, 0.40), p(0.44, 0.53), p(0.44, 0.78), p(0.20, 0.65)], fill=SIDE)
    # The long face.
    d.polygon([p(0.44, 0.53), p(0.92, 0.40), p(0.92, 0.62), p(0.44, 0.78)], fill=FRONT)

    return img.resize((size, size), Image.LANCZOS)


def lettermark(size: int, text: str, colour: tuple[int, int, int, int]) -> Image.Image:
    """Four letters, as wide as they can be without touching the disc."""
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # A bundled face if one is there, the default bitmap font if not — the fallback is ugly but it
    # never fails to render, and a build that dies on a missing font is worse than a plain one.
    font = None
    for candidate in (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ):
        if Path(candidate).exists():
            try:
                font = ImageFont.truetype(candidate, int(s * 0.30))
                break
            except OSError:
                continue
    if font is None:
        font = ImageFont.load_default()

    box = d.textbbox((0, 0), text, font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text(((s - w) / 2 - box[0], (s - h) / 2 - box[1]), text, font=font, fill=colour)
    return img.resize((size, size), Image.LANCZOS)


def main() -> int:
    LOGOS.mkdir(parents=True, exist_ok=True)

    # Same share of the canvas the fetched logos get, so these sit in the row without standing out.
    mark_px = int(SIZE * 0.62)

    drawn: list[tuple[str, Image.Image, tuple[int, int, int, int]]] = [
        ("WETH", ether(mark_px), GROUND),
        ("GLD", gold_bar(int(SIZE * 0.92)), (28, 30, 34, 255)),
        ("DJT", lettermark(int(SIZE * 0.92), "TMTG", (36, 46, 120, 255)), GROUND),
    ]

    for name, mark, ground in drawn:
        canvas = disc(SIZE, ground)
        px = mark.size[0]
        canvas.alpha_composite(mark, ((SIZE - px) // 2, (SIZE - px) // 2))
        # Re-apply the disc mask: the mark is inside it, but compositing can touch the soft edge.
        canvas.putalpha(
            Image.composite(canvas.getchannel("A"), canvas.getchannel("A"), disc(SIZE, ground).getchannel("A"))
        )
        out = LOGOS / f"{name}.png"
        canvas.save(out, "PNG", optimize=True)
        print(f"drew {out.name} at {SIZE}x{SIZE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
