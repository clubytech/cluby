"""
Build every shipped brand asset from the two files in `assets/`.

There is one source of truth for the mark — `assets/logo-nobg.png` — and everything the site serves
is derived from it here. Before this existed the icons were hand-made once and then went stale: the
rebrand found `icon.png`, `apple-icon.png`, `favicon.ico`, `cluby-mark.png` and `cluby-logo.png`
still carrying the previous logo entirely, months after it had been replaced everywhere else.

It also fixes something that was wrong the whole time. The favicon was a near-WHITE mark on a
TRANSPARENT ground, which is invisible in any browser tab that is not dark — the one place a favicon
has to work. Every icon that has to stand on someone else's background is given the brand's own
ground here; only `cluby-mark.png` stays transparent, because it is placed on our own dark surfaces
and needs to sit on them rather than in a box.

Run:  python3 apps/web/scripts/build-brand-assets.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
WEB = HERE.parent
ROOT = WEB.parent.parent
ASSETS = ROOT / "assets"

# --color-bg-strong. The icons belong to the same palette as the site rather than to a lighter
# green picked to look nice in isolation.
GROUND = (0, 44, 30, 255)
# Share of the canvas the mark occupies. Enough to read at 16px, with room so it is not cropped by
# the rounding iOS and Android apply for us.
MARK_SHARE = 0.66
SS = 4


def mark() -> Image.Image:
    """The mark alone, trimmed to its own ink and square."""
    src = Image.open(ASSETS / "logo-nobg.png").convert("RGBA")
    # A threshold rather than `getbbox()`: the mark carries a soft glow whose outermost pixels are
    # barely there, and trimming to those leaves it floating small inside its own halo.
    box = src.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    if box is None:
        raise SystemExit("assets/logo-nobg.png is empty")
    m = src.crop(box)

    side = max(m.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.alpha_composite(m, ((side - m.width) // 2, (side - m.height) // 2))
    return square


def compose(size: int, m: Image.Image, ground: tuple[int, int, int, int] | None) -> Image.Image:
    px = max(1, int(size * MARK_SHARE))
    scaled = m.resize((px, px), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), ground or (0, 0, 0, 0))
    canvas.alpha_composite(scaled, ((size - px) // 2, (size - px) // 2))
    return canvas


def main() -> int:
    if not (ASSETS / "logo-nobg.png").exists():
        print(f"no {ASSETS/'logo-nobg.png'} — put the mark there first")
        return 1

    m = mark()
    outputs: list[tuple[Path, int, tuple[int, int, int, int] | None]] = [
        # Served to other people's surfaces, so each carries our ground.
        (WEB / "src/app/icon.png", 512, GROUND),
        (WEB / "src/app/apple-icon.png", 180, GROUND),
        (WEB / "public/cluby-logo.png", 640, GROUND),
        # Placed on our own dark sections, so it stays a mark and not a tile.
        (WEB / "public/cluby-mark.png", 512, None),
    ]
    for path, size, ground in outputs:
        img = compose(size * SS, m, ground).resize((size, size), Image.LANCZOS)
        img.save(path, "PNG", optimize=True)
        print(f"  {path.relative_to(ROOT)}  {size}x{size}  {'ground' if ground else 'transparent'}")

    # A favicon carries several sizes; browsers and pinned tabs pick different ones.
    ico = WEB / "src/app/favicon.ico"
    base = compose(256 * SS, m, GROUND).resize((256, 256), Image.LANCZOS)
    base.save(ico, sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print(f"  {ico.relative_to(ROOT)}  16-256 multi-size")

    banner_src = ASSETS / "banner.jpeg"
    if banner_src.exists():
        b = Image.open(banner_src).convert("RGB")
        out = WEB / "public/cluby-banner.png"
        b.resize((1200, round(1200 * b.height / b.width)), Image.LANCZOS).save(out, "PNG", optimize=True)
        print(f"  {out.relative_to(ROOT)}  1200 wide, from assets/banner.jpeg")

    return 0


if __name__ == "__main__":
    sys.exit(main())
