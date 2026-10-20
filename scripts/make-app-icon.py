"""Render the "Pressed S" icon set (direction F) as PNGs + a master SVG.

Usage: python3 -I scripts/make-app-icon.py \
  node_modules/@expo-google-fonts/dm-serif-display/400Regular/DMSerifDisplay_400Regular.ttf \
  assets/images
then copy assets/images/app-icon.png to web/public/icon.png.
Geometry is in a 100-unit box, matching the design canvas.
"""
import sys
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen

FONT, OUT = sys.argv[1], sys.argv[2]
SS = 4  # supersample

PAPER = "#FBF7F2"
INK = "#23222B"
TERRA = "#D9693F"

S_SIZE = 26.0      # font size in units
S_CENTER = (50.0, 50.4)  # optical centre of the glyph

VARIANTS = {
    # name: (background, record, groove, label, letter)
    "app-icon":        (PAPER, INK, PAPER, TERRA, PAPER),
    "app-icon-dark":   (INK, "#0A0807", "#F5F0EB", "#EE8B62", "#0A0807"),
    "app-icon-tinted": ("#000000", "#525252", None, "#FFFFFF", "#000000"),
    "app-icon-beta":   (PAPER, INK, PAPER, "#3C9684", PAPER),
}


def hexa(c, a=255):
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def draw_mark(img, px, colors, scale=1.0):
    """Draw record + label + S into img (size px*SS). scale shrinks the mark about the centre."""
    _, record, groove, label, letter = colors
    d = ImageDraw.Draw(img)
    u = px * SS / 100.0

    def circle(r, **kw):
        r = r * scale
        d.ellipse([(50 - r) * u, (50 - r) * u, (50 + r) * u, (50 + r) * u], **kw)

    circle(38, fill=hexa(record))
    if groove:
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        w = max(1, round(0.55 * scale * u))
        for r in (33, 28.5, 24):
            r = r * scale
            ld.ellipse([(50 - r) * u, (50 - r) * u, (50 + r) * u, (50 + r) * u],
                       outline=hexa(groove, round(255 * 0.12)), width=w)
        img.alpha_composite(layer)
        d = ImageDraw.Draw(img)
    circle(17.5, fill=hexa(label))

    font = ImageFont.truetype(FONT, round(S_SIZE * scale * u))
    l, t, r, b = d.textbbox((0, 0), "S", font=font, anchor="ls")
    cx = 50 + (S_CENTER[0] - 50) * scale
    cy = 50 + (S_CENTER[1] - 50) * scale
    x = cx * u - (l + r) / 2
    y = cy * u - (t + b) / 2
    d.text((x, y), "S", font=font, fill=hexa(letter), anchor="ls")


def render(name, colors, px, transparent=False, scale=1.0, opaque=True):
    size = px * SS
    bg = (0, 0, 0, 0) if transparent else hexa(colors[0])
    img = Image.new("RGBA", (size, size), bg)
    draw_mark(img, px, colors, scale)
    img = img.resize((px, px), Image.LANCZOS)
    if opaque and not transparent:
        img = img.convert("RGB")  # App Store rejects icons with alpha
    img.save(f"{OUT}/{name}.png", optimize=True)


def master_svg():
    f = TTFont(FONT)
    gs = f.getGlyphSet()
    gname = f.getBestCmap()[ord("S")]
    k = S_SIZE / f["head"].unitsPerEm
    bp = BoundsPen(gs)
    gs[gname].draw(bp)
    x0, y0, x1, y1 = bp.bounds
    tx = S_CENTER[0] - (x0 + x1) / 2 * k
    ty = S_CENTER[1] + (y0 + y1) / 2 * k
    pen = SVGPathPen(gs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
    gs[gname].draw(TransformPen(pen, (k, 0, 0, -k, tx, ty)))
    s_path = pen.getCommands()
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="1024" height="1024">
  <!-- Soundtracks app icon, "Pressed S". Ink record, terracotta label, the wordmark's DM Serif Display S. -->
  <rect width="100" height="100" fill="{PAPER}"/>
  <circle cx="50" cy="50" r="38" fill="{INK}"/>
  <g fill="none" stroke="{PAPER}" stroke-width=".55" opacity=".12">
    <circle cx="50" cy="50" r="33"/><circle cx="50" cy="50" r="28.5"/><circle cx="50" cy="50" r="24"/>
  </g>
  <circle cx="50" cy="50" r="17.5" fill="{TERRA}"/>
  <path fill="{PAPER}" d="{s_path}"/>
</svg>
'''
    open(f"{OUT}/app-icon.svg", "w").write(svg)
    mono = svg.replace(f'<rect width="100" height="100" fill="{PAPER}"/>\n', "")
    mono = mono.replace(f'fill="{TERRA}"', 'fill="#FFFFFF"').replace(f'fill="{PAPER}"', f'fill="{INK}"')
    mono = mono.replace('<g fill="none" stroke="#FBF7F2"', '<g fill="none" stroke="#FFFFFF"')
    mono = mono.replace("Ink record, terracotta label", "One-color print version: ink record, knocked-out label")
    open(f"{OUT}/app-icon-mono.svg", "w").write(mono)


for name, colors in VARIANTS.items():
    render(name, colors, 1024)
# Android adaptive foreground: transparent, mark inside the 66% safe zone.
render("adaptive-icon", VARIANTS["app-icon"], 1024, transparent=True, scale=0.82)
render("favicon", VARIANTS["app-icon"], 48)
master_svg()
print("done")
