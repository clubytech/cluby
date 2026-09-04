# Cluby launch video - MiniMax Agent prompt pack

Target: 22 s, 16:9, 1920x1080, 25 fps. Attached to the first X post.

## Brand, as measured from the new assets

| Role | Hex | Where it came from |
|---|---|---|
| Deep ground | `#002B38` | banner background, darkest zone |
| Mid ground | `#003F4F` | banner vignette |
| Brand teal | `#00788C` | logo.png plate |
| Bright cyan | `#40B0C0` | coin rim highlights |
| Silver metal | `#F0F0F0` | coin faces |

The identity is no longer monochrome. It is a single teal family plus brushed silver, lit like a
product shot: soft top key, hard rim, shallow depth of field.

**The mark is a sliced coin.** The Cluby C is built from horizontal bands with gaps between them,
which is the same geometry as the milled edge of the coins in the banner. That is the whole film:
a coin slices into bands, the bands become the logo.

## Assets to upload

| File | Role in MiniMax | Purpose |
|---|---|---|
| `assets/video-refs/ref1-logo-mark.png` | `reference_image`, Subject 1 | white sliced C on transparent, 1254px |
| `assets/video-refs/ref2-logo-plate.png` | `reference_image`, Picture 1 | the mark on brand teal, sets the exact colour |
| `assets/video-refs/ref3-coins.png` | `reference_image`, Picture 2 | coin row, sets material and lighting |
| `assets/video-refs/ref4-coin-macro.png` | `reference_image`, Picture 3 | square crop, coin detail at macro distance |

`banner.png` cannot be uploaded raw: it is 2172x724, a 3:1 ratio, and H3 rejects reference images
outside 2:5 to 5:2. `ref3-coins.png` is the same image centre-cropped to 2:1, which passes.

---

## PATH A (recommended): plates without text, text added in the editor

Generate 5 clips of motion background only, then lay every text card over them on the timeline in
MiniMax Design. Video models corrupt `min(feed, TWAP)` and `62.5%` often enough that one bad glyph
costs a rerun. Overlaid text stays crisp and stays editable when the ticker lands.

Overlay type: tight grotesque (Inter Tight, Suisse Int'l, Neue Haas), `#F0F0F0`, left-aligned,
40 px from the safe margin, vertically centred. No shadow, no glow. Hard cuts, never crossfades.

### Master brief for MiniMax Agent

```
Build a 22-second brand film for Cluby, 16:9, 1920x1080, 25fps.

Image 1 is the Cluby logo mark: a white letter C built from six horizontal bands with clean gaps
between them, like the milled slices of a coin. Preserve its geometry exactly, never redraw it,
never close the gaps, never restyle it into a solid C.
Image 2 is the exact brand colour: the white mark on teal #00788C.
Image 3 and Image 4 are the material and lighting reference: thick brushed-silver coins with
embossed faces and milled edges, overlapping in a row, lit by a soft top key and a hard cyan rim,
sitting on a deep teal gradient background with shallow depth of field.

Colour contract, every frame: deep teal ground #002B38 falling to #003F4F, brushed silver #F0F0F0
on the coins, bright cyan #40B0C0 on every rim highlight. Nothing warm, no gold, no orange, no
purple, no white background at any point.
Material contract: real machined metal with fine brushed grain and slight edge wear. Product
photography, not illustration. Studio lighting, one soft key from upper left, one hard cyan rim
from behind right, gentle falloff into the teal ground.
Motion contract: heavy and mechanical, as if the coins have real mass. Linear moves at constant
speed, hard cuts, short accelerations. No floaty drift, no orbiting hero camera, no bounce easing,
no slow-motion dust.

Cut the film into 5 shots of about 4.5 seconds each, exactly as listed.
Leave the frame clean: I will add all typography myself on a separate layer, so generate no text,
no letters, no numbers, no tickers, no UI, no watermark and no subtitles anywhere in the image.
The coin faces carry abstract embossed geometric glyphs only, never a real company logo.

Shot 1, 00:00.000: macro on a row of overlapping brushed-silver coins as in Image 3, filling the
lower two thirds of frame, drifting right to left at constant speed while the camera tracks with
them, shallow depth of field, the cyan rim light sliding along their milled edges.
Shot 2, 00:04.500: a single coin rises out of the row into centre frame and flips 180 degrees on
its horizontal axis to show its reverse face; as it flips, a second identical coin rises from below
frame and flips the opposite way, the two settling side by side, counter-rotating in place.
Shot 3, 00:09.000: the coin holds centre frame and two thin streams of small coins flow outward
from it, one to the left edge and one to the right edge, simultaneously and at the same speed. The
key light then dims to near darkness while the cyan rim light stays constant, so the coin remains
fully readable in the dark.
Shot 4, 00:13.500: the coin separates into six horizontal slices with clean gaps between them. The
slices step downward one at a time in sharp instant drops, hold misaligned for a beat, then snap
back into perfect alignment.
Shot 5, 00:18.000: the six slices slide together and lock into the exact Cluby mark from Image 1,
white and centred on the teal ground from Image 2, then hold perfectly still while one slow cyan
specular sweep crosses the background behind it.

Audio: a low sub-bass drone at -18 LUFS under the whole film. A dry metallic coin click on each
cut. A heavy machined clunk when the coin flips at 00:04.500 and again when the slices snap back at
00:16.000. One soft metallic swell as the mark locks at 00:20.000. No music bed, no voiceover, no
whoosh transitions, no risers.

Negative: no text, no numbers, no captions, no subtitles, no real company logos, no Apple or Tesla
or Intel or Nvidia marks, no gold or copper coins, no cryptocurrency symbols, no bitcoin, no
candlestick charts, no people, no hands, no offices, no city skylines, no lens flare, no bokeh
balls, no smoke, no particles, no glitch effects, no soft dissolves, no crossfades, no camera
shake, no AI-looking gradient glow, no white background.
```

### Overlay text, in cut order

| In | Out | Text |
|---|---|---|
| 0.0 | 1.5 | `Tokenized stocks are onchain.` |
| 1.5 | 3.0 | `Credit against them is not.` |
| 3.0 | 4.5 | `Cluby changes that.` |
| 4.5 | 6.0 | `Post your stock. Draw USDG.` |
| 6.0 | 7.5 | `Or post USDG. Borrow the stock. Sell it.` |
| 7.5 | 9.0 | `Long and short. One protocol.` |
| 9.0 | 10.5 | `Holders earn twice from one deposit.` |
| 10.5 | 12.0 | `Markets close. Prices don't.` |
| 12.0 | 13.5 | `min(feed, TWAP)` |
| 13.5 | 15.0 | `Weekend arbitrage: impossible by construction.` |
| 15.0 | 16.5 | `62.5% → 70% LTV` |
| 16.5 | 18.0 | `Soft liquidation before the hard one.` |
| 18.0 | 19.5 | `0% performance fee for 90 days.` |
| 19.5 | 22.0 | `Cluby` over `The credit layer for both sides of the stock.` |
| 21.0 | 22.0 | footer, smaller: `Built on Morpho Blue. Robinhood Chain.` |

Each card is timed to the beat its shot performs. The coin flip in shot 2 lands on
`Long and short. One protocol.` The key light dying in shot 3 lands on `Markets close. Prices don't.`
The slices stepping down in shot 4 land on `min(feed, TWAP)`. Do not retime the cards independently
of the footage, the sync is the point.

Card 12 `min(feed, TWAP)` is set in mono, one size up. Card 15 `62.5% → 70% LTV` rolls the number
odometer-style, never fades.

---

## PATH B: one-shot with baked text

Only if the editor route is unavailable. H3 caps at 15 s per clip, so this is still two clips.
Every readable string is spelled literally and every unwanted string negated, per the H3 guide.

### Clip B1, 0-11 s, reference generation

```
subject_definitions:
<Subject 1> the Cluby mark from Image 1: a white letter C of six horizontal bands with clean gaps,
geometry preserved exactly, gaps never closed.
<Picture 1> Image 2, the exact brand teal #00788C.
<Picture 2> Image 3, the material anchor: brushed-silver coins with milled edges on a deep teal
gradient, soft top key and hard cyan rim.

summary:
Generation task. An 11-second teal-and-silver motion-design title sequence, six typographic cards
cut hard over machined coin footage in the material language of <Picture 2>.

retention_analysis:
<Subject 1> fully_preserved. <Picture 1> fully_preserved for colour. <Picture 2> attribute_transfer
for material, lighting and palette only.

detailed_description:
Product-photography motion design, brushed silver on deep teal, shallow depth of field, camera
locked off unless stated, no warm tones anywhere.
[Shot 1] A row of coins from <Picture 2> drifts right to left across the lower frame. The line
"Tokenized stocks are onchain." types on in white left-aligned grotesque above them, holds, cuts.
[Shot 2] At 00:01.800, hard cut, same row now motionless, the line "Credit against them is not."
in the same position.
[Shot 3] At 00:03.600, hard cut, <Subject 1> locks into centre frame in white on the teal of
<Picture 1>, holding still, the line "Cluby changes that." beneath it.
[Shot 4] At 00:05.400, hard cut, a single coin lifts out of the row and the line
"Post your stock. Draw USDG." resolves beside it.
[Shot 5] At 00:07.200, hard cut, the coin flips 180 degrees on its horizontal axis and the line
"Or post USDG. Borrow the stock. Sell it." resolves beside it.
[Shot 6] At 00:09.000, hard cut, two coins counter-rotate side by side in centre frame and the line
"Long and short. One protocol." resolves beneath them, holding to the end.
Every string is spelled exactly as written. Do not misspell. Do not add any other text. Do not add
subtitles or captions.

overall_soundscape:
A low sub-bass drone throughout. A dry metallic coin click on each of the six cuts. A heavy
machined clunk on the flip at 00:07.200.

non_diegetic_music:
None.

negative:
no gold, no copper, no warm light, no white background, no real company logos, no bitcoin or
cryptocurrency symbols, no candlestick charts, no people, no hands, no lens flare, no bokeh balls,
no smoke, no particles, no glitch, no soft dissolves, no crossfades, no camera shake, no slow
motion, no extra text, no watermark, no subtitles, no misspelled words, no invented logos.
```

### Clip B2, 11-22 s, reference generation

Same `subject_definitions`, `retention_analysis`, `overall_soundscape`, `non_diegetic_music` and
`negative` blocks. Replace `detailed_description`:

```
detailed_description:
Same teal-and-silver contract as the preceding clip, camera locked off.
[Shot 1] A coin holds centre frame, two thin streams of small coins flow outward from it left and
right at once. The line "Holders earn twice from one deposit." in white, holds, cuts.
[Shot 2] At 00:01.800, hard cut, the key light dims to near darkness while the cyan rim light holds
constant on the coin, and the line "Markets close. Prices don't." resolves.
[Shot 3] At 00:03.600, hard cut, the string "min(feed, TWAP)" alone in centre frame in white
monospace, one size larger, the coin behind it separating into six horizontal slices that step
downward twice.
[Shot 4] At 00:05.400, hard cut, the slices snap back into alignment and the line
"Weekend arbitrage: impossible by construction." resolves.
[Shot 5] At 00:07.200, hard cut, the string "62.5%" in white numerals rolls upward and resolves to
"70% LTV" in centre frame.
[Shot 6] At 00:09.000, hard cut, the line "0% performance fee for 90 days." holds briefly, then the
six slices slide together and lock into <Subject 1> in centre frame on the teal of <Picture 1>,
with the word "Cluby" beneath it and the smaller line
"The credit layer for both sides of the stock." beneath that, all holding perfectly still to the end.
Every string is spelled exactly as written. Do not misspell. Do not add any other text. Do not add
subtitles or captions.
```

---

## Model settings

- Model: MiniMax H3, reference generation mode
- Resolution: 2K for the final, 768P for test passes
- Aspect ratio: 16:9 primary. Re-export a 1:1 centre crop for the feed and keep all type inside the
  central square, or the crop will decapitate it.
- Duration: 4-15 s per clip, integers only
- Prompt cap: 7000 characters
- Reference images: max 9, aspect ratio must sit between 2:5 and 5:2, each side 256-5760 px
- Iterate at the shortest duration until composition locks, then rerun at full length. Negative
  lists and spelled strings cost nothing, billing is per output second.

## Export

- H.264 MP4, 1920x1080, 25 fps, ~12 Mbps, AAC 128 kbps
- X compresses hard: keep type above 44 px cap height or it smears
- Burn in the captions, most of the feed watches muted, which this cut already assumes
