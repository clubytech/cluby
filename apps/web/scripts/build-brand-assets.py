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

    build_og()
    return 0


# A link preview is 1.91:1 almost everywhere that matters. The source art is 3:1.
OG_W, OG_H = 1200, 630


def build_og() -> None:
    """The link preview card, under a filename that changes when the picture does.

    Twitter kept serving the OLD teal banner for hours after the green one was live, because the
    file had the same name and their cache is keyed on the URL. Nothing was wrong with the deploy;
    there was simply no way for anyone downstream to notice. Naming the file after a hash of its own
    bytes makes that impossible to repeat: a new picture is a new URL, so every scraper on the
    internet — Twitter, Telegram, Discord, Slack — fetches it because it has never seen it before.

    The art is padded rather than cropped or upscaled. The source is 1080 wide, so filling a
    1.91:1 card by zooming would soften the coins and throw a third of them off the sides. Instead
    the banner's own top and bottom rows are stretched into the space above and below it — its
    background is a smooth vertical gradient there, so the seam does not exist and the render simply
    appears to continue.
    """
    src = ASSETS / "banner.jpeg"
    if not src.exists():
        print(f"  no {src.relative_to(ROOT)}, skipping the link preview")
        return

    art = Image.open(src).convert("RGB")
    art = art.resize((OG_W, round(OG_W * art.height / art.width)), Image.LANCZOS)

    card = Image.new("RGB", (OG_W, OG_H))
    top = (OG_H - art.height) // 2
    # Extend the artwork's own edge rows into the padding.
    card.paste(art.crop((0, 0, OG_W, 1)).resize((OG_W, top), Image.NEAREST), (0, 0))
    card.paste(
        art.crop((0, art.height - 1, OG_W, art.height)).resize((OG_W, OG_H - top - art.height), Image.NEAREST),
        (0, top + art.height),
    )
    card.paste(art, (0, top))

    from hashlib import sha256
    from io import BytesIO

    buf = BytesIO()
    card.save(buf, "PNG", optimize=True)
    data = buf.getvalue()
    name = f"og-{sha256(data).hexdigest()[:10]}.png"

    # One card at a time: the old one goes, so a stale URL 404s instead of quietly living on.
    for stale in (WEB / "public").glob("og-*.png"):
        if stale.name != name:
            stale.unlink()
    (WEB / "public" / name).write_bytes(data)

    # The name is written where the app can import it, so the metadata cannot drift from the file.
    ref = WEB / "src/lib/og-image.ts"
    ref.write_text(
        "// Generated by scripts/build-brand-assets.py. The hash is of the image's own bytes, so a\n"
        "// new picture is a new URL and no cache anywhere can serve the previous one.\n"
        f'export const OG_IMAGE = "/{name}";\n'
    )
    print(f"  public/{name}  {OG_W}x{OG_H}  (hashed, so caches cannot serve a stale card)")


if __name__ == "__main__":
    sys.exit(main())
