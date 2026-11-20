"""
Frame raw simulator captures into 6.9" App Store screenshots (1320x2868).

Usage: python3 scripts/frame-screenshots.py <raw-dir> <out-dir>

Writes the 6.9" set to <out-dir> and the 6.3" set (1206x2622, the size App
Store Connect requires) to <out-dir>/6.3-inch. A frame whose mode is
"existing" reuses an already framed image (the widget frame, whose raw
captures aren't kept).

Each frame is a headline in DM Serif Display, a line of DM Sans, and the
screen in a thin bezel bleeding off the bottom edge. Raw captures come from
`xcrun simctl io <udid> screenshot` (any modern iPhone; they're scaled).
Fonts are read from node_modules/@expo-google-fonts, the same files the app
ships, so the type matches the screenshots.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1320, 2868
ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "node_modules/@expo-google-fonts"
SERIF = str(FONTS / "dm-serif-display/400Regular/DMSerifDisplay_400Regular.ttf")
SANS = str(FONTS / "dm-sans/500Medium/DMSans_500Medium.ttf")

LIGHT = {"bg": "#FBF7F2", "ink": "#23222B", "soft": "#5E5C66", "bezel": "#23222B"}
DARK = {"bg": "#0E0B0A", "ink": "#F5F0EB", "soft": "#ABA39E", "bezel": "#3A3330"}

# (raw file, output name, headline, subline, palette, mode)
FRAMES = [
    ("01-journal.png", "1-journal", "Your life, one song\nat a time.", "A journal for the songs that mark your days.", LIGHT, "phone"),
    # Unchanged since 1.4.0; their raw captures weren't kept, so the framed
    # image is reused as is ("existing").
    ("docs/app-store/screenshots/2-entry.png", "2-entry", None, None, LIGHT, "existing"),
    ("07-start-from.png", "3-start-from", "Hold + for more\nways to start.", "Last week, From before, or what's playing now.", LIGHT, "phone"),
    ("04-capture.png", "4-capture", "Capture it in\ntwo taps.", "Song first. Write a line, pages, or nothing.", LIGHT, "phone"),
    ("docs/app-store/screenshots/5-widget.png", "5-widget", None, None, LIGHT, "existing"),
    # Recaptured for 1.4.1 (three tabs) on a day with no On this day, so the
    # headline names what the screen shows: search and browse.
    ("03-rediscover.png", "6-rediscover", "Find it again,\nyears later.", "Search what you wrote, or browse by mood.", LIGHT, "phone"),
    ("docs/app-store/screenshots/7-year.png", "7-year", None, None, DARK, "existing"),
    ("docs/app-store/screenshots/8-dark.png", "8-dark", None, None, DARK, "existing"),
    # 1.4.1: Insights, from You's preview (covers carry the color).
    ("09b-you.png", "9-insights", "What your journal\nsays about you.", "The artists, people and moods that run through it.", LIGHT, "phone"),
]


def rounded(img, radius, corners=(True, True, True, True)):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0], img.size[1]], radius, fill=255, corners=corners)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def draw_text(draw, palette):
    serif = ImageFont.truetype(SERIF, 124)
    sans = ImageFont.truetype(SANS, 50)
    y = 190
    for line in HEADLINE.split("\n"):
        w = draw.textlength(line, font=serif)
        draw.text(((W - w) / 2, y), line, font=serif, fill=palette["ink"])
        y += 140
    w = draw.textlength(SUB, font=sans)
    draw.text(((W - w) / 2, y + 26), SUB, font=sans, fill=palette["soft"])
    return y + 26 + 70


def shadow(canvas, box, radius, strength=60):
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle(box, radius, fill=(0, 0, 0, strength))
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(40)))


def frame_phone(raw, palette):
    canvas = Image.new("RGBA", (W, H), palette["bg"])
    text_bottom = draw_text(ImageDraw.Draw(canvas), palette)
    screen_w = 1040
    screen = raw.resize((screen_w, round(raw.height * screen_w / raw.width)), Image.LANCZOS)
    bezel = 22
    top = text_bottom + 70
    x = (W - screen_w) // 2
    shadow(canvas, [x - bezel, top - bezel + 30, x + screen_w + bezel, H + 200], 120)
    frame = Image.new("RGBA", (screen_w + 2 * bezel, screen.height + 2 * bezel), palette["bezel"])
    canvas.alpha_composite(rounded(frame, 128), (x - bezel, top - bezel))
    canvas.alpha_composite(rounded(screen, 108), (x, top))
    return canvas


def frame_widget(raw, palette, raw_dir):
    canvas = Image.new("RGBA", (W, H), palette["bg"])
    text_bottom = draw_text(ImageDraw.Draw(canvas), palette)
    # The medium widget on the wallpaper, cropped above the app-name label
    # (which says "β" on the beta build)...
    scale = raw.width / 1206
    crop = raw.crop((int(30 * scale), int(190 * scale), int(1176 * scale), int(762 * scale)))
    target_w = 1200
    crop = crop.resize((target_w, round(crop.height * target_w / crop.width)), Image.LANCZOS)
    x = (W - target_w) // 2
    top = text_bottom + 80
    # ...over what tapping Identify opens: capture, already listening.
    listening = Image.open(raw_dir / "07-listening.png").convert("RGBA")
    phone = frame_phone_at(canvas, listening, palette, top + crop.height - 120, 960)
    shadow(canvas, [x, top + 30, x + target_w, top + crop.height + 30], 70, 60)
    canvas.alpha_composite(rounded(crop, 70), (x, top))
    return canvas


def frame_phone_at(canvas, raw, palette, top, screen_w):
    screen = raw.resize((screen_w, round(raw.height * screen_w / raw.width)), Image.LANCZOS)
    bezel = 22
    x = (W - screen_w) // 2
    shadow(canvas, [x - bezel, top - bezel + 30, x + screen_w + bezel, H + 200], 120)
    frame = Image.new("RGBA", (screen_w + 2 * bezel, screen.height + 2 * bezel), palette["bezel"])
    canvas.alpha_composite(rounded(frame, 128), (x - bezel, top - bezel))
    canvas.alpha_composite(rounded(screen, 108), (x, top))


def main():
    raw_dir, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    small_dir = out_dir / "6.3-inch"
    small_dir.mkdir(parents=True, exist_ok=True)
    global HEADLINE, SUB
    # Read every "existing" frame before writing anything: it may live in out_dir.
    existing = {
        name: Image.open(ROOT / raw).convert("RGBA").copy()
        for raw, name, _, _, _, mode in FRAMES
        if mode == "existing"
    }
    for raw_name, out_name, HEADLINE, SUB, palette, mode in FRAMES:
        if mode == "existing":
            img = existing[out_name]
        else:
            raw = Image.open(raw_dir / raw_name).convert("RGBA")
            img = frame_widget(raw, palette, raw_dir) if mode == "widget" else frame_phone(raw, palette)
        img.convert("RGB").save(out_dir / f"{out_name}.png", optimize=True)
        img.convert("RGB").resize((1206, 2622), Image.LANCZOS).save(small_dir / f"{out_name}.png", optimize=True)
        print(out_dir / f"{out_name}.png", img.size)


if __name__ == "__main__":
    main()
