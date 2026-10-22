#!/usr/bin/env python3
"""Android launcher icons from the app icon (src-tauri/icons/icon.png). Needs Pillow.

    python3 scripts/android-icons.py

The desktop icon is a rounded square with the dial on a navy gradient. Android masks icons to
its own shape (a circle, a squircle…), so this cuts the dial out on a soft edge and lays it over
the same gradient, continued to the full 108 dp adaptive-icon canvas, so no seam shows:

  ic_launcher_foreground   the dial, inside the 66 dp safe zone
  ic_launcher_background   the navy gradient, full bleed
  ic_launcher_monochrome   the dial's light parts as a silhouette, for themed icons (Android 13+)
  ic_launcher(_round)      flat icons for launchers that don't use adaptive icons
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'src-tauri/icons/icon.png'
RES = ROOT / 'src-tauri/gen/android/app/src/main/res'
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

TRACK = 177  # outer radius of the dial's track in icon.png (512 px)
CUT = 190  # where the cut-out fades into the background
DIAL_DP = 64  # the track's diameter on the 108 dp canvas (safe zone: 66 dp)


def fit_gradient(im):
    """A plane through the navy around the dial: (r, g, b) = a + b·x + c·y."""
    pts = []
    for y in range(110, 402, 4):
        for x in (58, 62, 66, 446, 450):
            pts.append((x, y, im.getpixel((x, y))))
    for x in range(140, 372, 4):
        for y in (58, 62, 66, 448, 452):
            pts.append((x, y, im.getpixel((x, y))))
    # Least squares by the normal equations (3×3), one channel at a time.
    sx = sum(p[0] for p in pts); sy = sum(p[1] for p in pts); n = len(pts)
    sxx = sum(p[0] ** 2 for p in pts); syy = sum(p[1] ** 2 for p in pts); sxy = sum(p[0] * p[1] for p in pts)
    m = [[n, sx, sy], [sx, sxx, sxy], [sy, sxy, syy]]

    def solve(v):
        import copy
        a = copy.deepcopy(m); b = list(v)
        for i in range(3):
            for j in range(i + 1, 3):
                f = a[j][i] / a[i][i]
                for k in range(3): a[j][k] -= f * a[i][k]
                b[j] -= f * b[i]
        out = [0.0] * 3
        for i in (2, 1, 0):
            out[i] = (b[i] - sum(a[i][k] * out[k] for k in range(i + 1, 3))) / a[i][i]
        return out

    return [solve([sum(p[2][c] for p in pts), sum(p[0] * p[2][c] for p in pts), sum(p[1] * p[2][c] for p in pts)]) for c in range(3)]


def main():
    icon = Image.open(SRC).convert('RGBA')
    rgb = icon.convert('RGB')
    plane = fit_gradient(rgb)
    scale = 2 * TRACK / DIAL_DP  # icon px per dp
    side = round(108 * scale)
    off = (side - 512) / 2  # icon.png's origin on the canvas

    # Background: the plane, evaluated in icon.png's coordinates.
    bg = Image.new('RGB', (side, side))
    px = bg.load()
    for y in range(side):
        for x in range(side):
            ix, iy = x - off, y - off
            px[x, y] = tuple(max(0, min(255, round(p[0] + p[1] * ix + p[2] * iy))) for p in plane)

    # Foreground: the dial on a soft round edge (supersampled for a smooth rim).
    ss = 4
    mask = Image.new('L', (512 * ss, 512 * ss), 0)
    d = ImageDraw.Draw(mask)
    steps = 12
    for i in range(steps):
        r = (CUT - (CUT - TRACK - 2) * i / steps) * ss
        d.ellipse((256 * ss - r, 256 * ss - r, 256 * ss + r, 256 * ss + r), fill=round(255 * (i + 1) / steps))
    mask = mask.resize((512, 512), Image.LANCZOS)
    dial = icon.copy()
    dial.putalpha(ImageChops.multiply(icon.getchannel('A'), mask))
    fg = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    fg.paste(dial, (round(off), round(off)), dial)

    # Monochrome: the face and the coloured arcs are bright (150+), the navy, the track and the
    # hands are dark (90 or less), so brightness alone draws the silhouette.
    mono_a = Image.new('L', (512, 512), 0)
    ma = mono_a.load(); src = rgb.load()
    for y in range(512):
        for x in range(512):
            ma[x, y] = round(255 * max(0.0, min(1.0, (max(src[x, y]) - 100) / 40)))
    mono_a = ImageChops.multiply(mono_a, mask)
    mono = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    white = Image.new('RGBA', (512, 512), (255, 255, 255, 255))
    mono.paste(white, (round(off), round(off)), mono_a)

    # Flat icons: the full canvas in a circle, and the same with the system's rounded square.
    full = bg.convert('RGBA')
    full.alpha_composite(fg)
    inner = full.crop((round(side * 18 / 108), round(side * 18 / 108), round(side * 90 / 108), round(side * 90 / 108)))

    def rounded(im, radius):
        big = Image.new('L', (im.width * ss, im.height * ss), 0)
        ImageDraw.Draw(big).rounded_rectangle((0, 0, big.width - 1, big.height - 1), radius=radius * big.width, fill=255)
        out = im.copy()
        out.putalpha(big.resize(im.size, Image.LANCZOS))
        return out

    for name, k in DENSITIES.items():
        folder = RES / f'mipmap-{name}'
        folder.mkdir(parents=True, exist_ok=True)
        n = round(108 * k)
        fg.resize((n, n), Image.LANCZOS).save(folder / 'ic_launcher_foreground.png', optimize=True)
        bg.resize((n, n), Image.LANCZOS).save(folder / 'ic_launcher_background.png', optimize=True)
        mono.resize((n, n), Image.LANCZOS).save(folder / 'ic_launcher_monochrome.png', optimize=True)
        m = round(48 * k)
        flat = inner.resize((m, m), Image.LANCZOS)
        rounded(flat, 0.22).save(folder / 'ic_launcher.png', optimize=True)
        rounded(flat, 0.5).save(folder / 'ic_launcher_round.png', optimize=True)

    anydpi = RES / 'mipmap-anydpi-v26'
    anydpi.mkdir(exist_ok=True)
    xml = ('<?xml version="1.0" encoding="utf-8"?>\n'
           '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
           '    <background android:drawable="@mipmap/ic_launcher_background" />\n'
           '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
           '    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />\n'
           '</adaptive-icon>\n')
    for f in ('ic_launcher.xml', 'ic_launcher_round.xml'):
        (anydpi / f).write_text(xml)
    print('plane', [[round(v, 4) for v in p] for p in plane], 'canvas', side)


if __name__ == '__main__':
    main()
