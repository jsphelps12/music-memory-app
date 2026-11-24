#!/usr/bin/env python3
"""
Make short vertical videos (TikTok / Reels / Shorts) from the app.

    python3 scripts/video/make.py                    # every clip in clips.yaml
    python3 scripts/video/make.py ten-seconds        # just these clips
    python3 scripts/video/make.py --rerecord         # record shots again
    python3 scripts/video/make.py --compose-only     # never touch the simulator

For each clip in marketing/videos/clips.yaml:
  1. Record the shots its segments use, unless already recorded
     (marketing/videos/out/raw/): install this checkout's JS into the
     simulator app, fill the E2E account with the sample moments and photos
     (seed-demo.mjs, once per run), sign in with Maestro, then record the
     screen while each shot flow (marketing/videos/flows/<shot>.yaml) drives
     the app. A segment with `input:` uses that recording instead.
  2. Cut the segments together (each with its own speed and zoom) into a
     1080x1920 H.264 video: full-screen with caption pills, or the screen in a
     bezel under a serif headline; headlines change on each beat; an end card.
     Writes <id>.mp4, a cover <id>.jpg, and <id>.txt (caption + hashtags).

Needs: ffmpeg (brew install ffmpeg), Maestro, Pillow, PyYAML; a booted
simulator with the Soundtracks β build installed (scripts/e2e-local.sh puts
the current JS in it); E2E_PASSWORD in the environment or in
.maestro/.env.e2e.local. Videos are silent: add the song from the platform's
sound library when you post.
"""
import argparse
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import yaml
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent.parent
VIDEOS = ROOT / "marketing/videos"
OUT = VIDEOS / "out"
RAW = OUT / "raw"
FLOWS = VIDEOS / "flows"
BUNDLE_ID = "com.joshuaphelps.musicmemory.preview"

FONTS = ROOT / "node_modules/@expo-google-fonts"
SERIF = str(FONTS / "dm-serif-display/400Regular/DMSerifDisplay_400Regular.ttf")
SANS = str(FONTS / "dm-sans/500Medium/DMSans_500Medium.ttf")
SANS_BOLD = str(FONTS / "dm-sans/700Bold/DMSans_700Bold.ttf")
ICON = ROOT / "assets/images/app-icon.png"

W, H, FPS = 1080, 1920, 30
SCREEN_W = 780          # phone screen width in the frame
SCREEN_TOP = 560        # headline band above it; TikTok's top UI covers ~130px
BEZEL = 16
FADE = 0.25
RISE = 36                # px a headline slides up as it appears
CAPTION_Y = 420         # full layout: default centre of the caption pills (a clip's caption_y)
TAIL_HOLD = 1.5         # seconds of still screen kept after the motion ends
LEAD_IN = 0.8           # seconds of still screen kept before the motion starts

PALETTES = {
    "light": {"bg": "#FBF7F2", "ink": "#23222B", "soft": "#5E5C66", "bezel": "#23222B"},
    "dark": {"bg": "#0E0B0A", "ink": "#F5F0EB", "soft": "#ABA39E", "bezel": "#3A3330"},
}


def run(cmd, timeout=300, **kw):
    """Run a step; a stuck one (e.g. Maestro waiting on a simulator that shut down) fails after `timeout`."""
    shown = " ".join(str(c) for c in cmd)
    print("  $", re.sub(r"E2E_PASSWORD=\S+", "E2E_PASSWORD=…", shown), flush=True)
    return subprocess.run(cmd, check=True, timeout=timeout, **kw)


# ── Recording ────────────────────────────────────────────────────────────────

def e2e_password():
    pw = os.environ.get("E2E_PASSWORD")
    env_file = ROOT / ".maestro/.env.e2e.local"
    if not pw and env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("E2E_PASSWORD="):
                pw = line.split("=", 1)[1].strip().strip("'\"")
    if not pw:
        sys.exit("Set E2E_PASSWORD (or put it in .maestro/.env.e2e.local).")
    return pw


def find_device():
    booted = subprocess.run(["xcrun", "simctl", "list", "devices", "booted", "-j"], capture_output=True, text=True, check=True)
    for devices in json.loads(booted.stdout)["devices"].values():
        for d in devices:
            if d["state"] != "Booted":
                continue
            ok = subprocess.run(["xcrun", "simctl", "get_app_container", d["udid"], BUNDLE_ID], capture_output=True)
            if ok.returncode == 0:
                return d["udid"]
    sys.exit(f"No booted simulator has {BUNDLE_ID} installed.")


def make_thumbnails():
    """400px thumbnails of the sample photos, as the app uploads them (lib/storage.ts)."""
    out = OUT / "photo-thumbs"
    out.mkdir(parents=True, exist_ok=True)
    for src in sorted((VIDEOS / "photos").glob("*.jpg")):
        dst = out / src.name
        if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
            continue
        img = Image.open(src).convert("RGB")
        img.thumbnail((400, 400), Image.LANCZOS)
        img.save(dst, quality=80)


def seed_demo(password):
    make_thumbnails()
    print("── Filling the E2E account with sample moments")
    run(["npx", "eas-cli", "env:exec", "production", "node scripts/video/seed-demo.mjs", "--non-interactive"],
        cwd=ROOT, env={**os.environ, "E2E_PASSWORD": password})


def record_shot(shot, device, password, appearance="light"):
    flow = FLOWS / f"{shot}.yaml"
    if not flow.exists():
        sys.exit(f"No flow {flow}")
    RAW.mkdir(parents=True, exist_ok=True)
    out = RAW / f"{shot}.mp4"
    print(f"── Recording {shot}")
    env = {**os.environ, "E2E_PASSWORD": password}
    subprocess.run(["xcrun", "simctl", "status_bar", device, "override", "--time", "9:41", "--batteryState", "discharging",
                    "--batteryLevel", "100", "--cellularBars", "4", "--wifiBars", "3"], check=False)
    subprocess.run(["xcrun", "simctl", "ui", device, "appearance", appearance], check=False)
    subprocess.run(["xcrun", "simctl", "pbcopy", device], input=b"", check=False)
    run(["maestro", "--device", device, "test", str(FLOWS / "signin.yaml"), "--env", f"E2E_PASSWORD={password}"], env=env)
    rec = subprocess.Popen(["xcrun", "simctl", "io", device, "recordVideo", "--codec=h264", "--force", str(out)])
    started = time.monotonic()
    time.sleep(1.5)  # recordVideo needs a moment before the first frame
    try:
        run(["maestro", "--device", device, "test", str(flow)], env=env)
        time.sleep(0.5)
    finally:
        rec.send_signal(signal.SIGINT)
        seconds = time.monotonic() - started
        rec.wait(timeout=30)
    # simctl writes a frame only when the screen changes, so a still ending is
    # missing from the file; remember how long the recording really ran.
    out.with_suffix(".json").write_text(json.dumps({"seconds": round(seconds, 2)}))
    return out


def recorded_seconds(raw, probed):
    """The length a recording really ran: the sidecar's, else what ffprobe sees."""
    side = raw.with_suffix(".json")
    if side.exists():
        return max(probed, json.loads(side.read_text())["seconds"])
    return probed


# ── Composing ────────────────────────────────────────────────────────────────

def probe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration",
                        "-of", "json", str(path)], capture_output=True, text=True, check=True)
    j = json.loads(r.stdout)
    return j["streams"][0]["width"], j["streams"][0]["height"], float(j["format"]["duration"])


def frame_times(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time",
                        "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True)
    return [float(t.strip(",")) for t in r.stdout.split() if t.strip(",")]


def motion_start(path):
    """Seconds into a simulator recording where the screen starts moving.

    simctl writes a frame only when the screen changes, so Maestro's slow
    start shows up as a long gap after the first frame. Motion starts at the
    first frame followed closely by another (one stray frame doesn't count).
    """
    pts = frame_times(path)
    for a, b in zip(pts[1:], pts[2:]):
        if b - a < 0.5:
            return a
    return 0.0


def screen_geometry(src_w, src_h):
    sh = round(SCREEN_W * src_h / src_w) // 2 * 2
    return SCREEN_W, sh, (W - SCREEN_W) // 2, SCREEN_TOP, round(SCREEN_W * 0.125)


def draw_background(palette, sw, sh, x, y, radius, path):
    img = Image.new("RGBA", (W, H), palette["bg"])
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([x - BEZEL, y - BEZEL + 20, x + sw + BEZEL, y + sh + BEZEL + 20],
                                             radius + BEZEL, fill=(0, 0, 0, 70))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(36)))
    ImageDraw.Draw(img).rounded_rectangle([x - BEZEL, y - BEZEL, x + sw + BEZEL, y + sh + BEZEL], radius + BEZEL, fill=palette["bezel"])
    img.convert("RGB").save(path)


def draw_mask(sw, sh, radius, path):
    mask = Image.new("L", (sw, sh), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, sw - 1, sh - 1], radius, fill=255)
    mask.save(path)


def wrap(draw, text, font, max_w):
    lines = []
    for para in text.split("\n"):
        line = ""
        for word in para.split():
            trial = f"{line} {word}".strip()
            if draw.textlength(trial, font=font) <= max_w or not line:
                line = trial
            else:
                lines.append(line)
                line = word
        lines.append(line)
    return lines


def fit_text(d, text, face, start, smallest, max_w, max_h, leading=1.15):
    """The largest size from `start` down at which `text` fits the box."""
    size = start
    while True:
        font = ImageFont.truetype(face, size)
        lines = wrap(d, text, font, max_w)
        lh = round(size * leading)
        if len(lines) * lh <= max_h or size <= smallest:
            return font, lines, lh
        size -= 4


def draw_headline(text, palette, path, hook):
    """Phone layout: serif headline in the band above the phone. The hook is bigger."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    band_top, band_bottom = 150, SCREEN_TOP - 40   # below TikTok's top UI, above the phone
    font, lines, lh = fit_text(d, text, SERIF, 104 if hook else 80, 52, W - 120, band_bottom - band_top)
    y = band_top + (band_bottom - band_top - len(lines) * lh) // 2
    for line in lines:
        d.text(((W - d.textlength(line, font=font)) / 2, y), line, font=font, fill=palette["ink"])
        y += lh
    img.save(path)


def draw_pill(text, palette, path, hook, center_y=CAPTION_Y):
    """Full layout: caption pills over the footage, TikTok style, one per line."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    font, lines, lh = fit_text(d, text, SANS_BOLD, 96 if hook else 76, 48, W - 160, 520, leading=1.3)
    pad_x, pad_y = 34, round(lh * 0.12)
    y = center_y - len(lines) * lh // 2
    fill, ink = (22, 20, 24, 235), (255, 255, 255, 255)  # dark pills read on cream screens and photos alike
    for line in lines:
        w = d.textlength(line, font=font)
        x = (W - w) / 2
        d.rounded_rectangle([x - pad_x, y - pad_y, x + w + pad_x, y + lh - pad_y], 22, fill=fill)
        d.text((x, y + (lh - font.size) / 2 - pad_y - 4), line, font=font, fill=ink)
        y += lh + 8
    img.save(path)


def draw_end_card(spec, palette, path):
    img = Image.new("RGBA", (W, H), palette["bg"])
    d = ImageDraw.Draw(img)
    icon_size = 260
    icon = Image.open(ICON).convert("RGBA").resize((icon_size, icon_size), Image.LANCZOS)
    mask = Image.new("L", icon.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, icon_size - 1, icon_size - 1], round(icon_size * 0.225), fill=255)
    top = 640
    img.paste(icon, ((W - icon_size) // 2, top), mask)
    serif, sans = ImageFont.truetype(SERIF, 104), ImageFont.truetype(SANS, 46)
    for text, font, fill, y in ((spec["title"], serif, palette["ink"], top + icon_size + 70),
                                (spec["line"], sans, palette["soft"], top + icon_size + 210)):
        d.text(((W - d.textlength(text, font=font)) / 2, y), text, font=font, fill=fill)
    img.convert("RGB").save(path)


def segments_of(clip):
    """A clip's segments; a clip with just `shot`/`input` is one segment of the whole take."""
    if clip.get("segments"):
        return clip["segments"]
    return [{k: clip[k] for k in ("shot", "input", "speed", "trim") if k in clip}]


def source_of(seg):
    return ROOT / seg["input"] if seg.get("input") else RAW / f"{seg['shot']}.mp4"


def plan_segment(seg):
    """Where a segment starts and ends in its recording, and how it's cropped.

    `from`/`to` are seconds from the moment the shot starts moving (minus a
    short lead-in), so they survive a re-record with a slower Maestro start.
    """
    raw = source_of(seg)
    src_w, src_h, probed = probe(raw)
    end = recorded_seconds(raw, probed)
    if seg.get("input"):
        origin = float(seg.get("trim", 0))
    else:
        origin = max(0.0, motion_start(raw) - LEAD_IN)
        end = min(end, frame_times(raw)[-1] + TAIL_HOLD)  # drop the still tail while Maestro quits
    start = origin + float(seg.get("from", 0))
    stop = min(end, origin + float(seg["to"])) if "to" in seg else end
    speed = float(seg.get("speed", 1.0))
    zoom = float(seg.get("zoom", 1.0))
    cx, cy = seg.get("focus", [0.5, 0.5])
    cw, ch = round(src_w / zoom) // 2 * 2, round(src_h / zoom) // 2 * 2
    crop = (cw, ch, min(max(0, round(cx * src_w - cw / 2)), src_w - cw), min(max(0, round(cy * src_h - ch / 2)), src_h - ch))
    return {"raw": raw, "src": (src_w, src_h), "start": start, "stop": stop, "speed": speed,
            "crop": crop, "length": round((stop - start) / speed, 3)}


def compose(clip, end_card, hashtags):
    palette = PALETTES[clip.get("palette", "light")]
    layout = clip.get("layout", "phone")
    plans = [plan_segment(s) for s in segments_of(clip)]
    clip_len = round(sum(p["length"] for p in plans), 2)
    end_len = float(end_card["seconds"])
    total = clip_len + end_len
    src_w, src_h = plans[0]["src"]
    beats = sorted(clip["beats"], key=lambda b: b["at"])

    if layout == "full":
        tw, th = W, round(W * src_h / src_w) // 2 * 2
        place = (0, -round((th - H) * float(clip.get("full_offset", 0.0))))
    else:
        tw, th, x, y, radius = screen_geometry(src_w, src_h)
        place = (x, y)

    print(f"── Composing {clip['id']} ({len(plans)} segment(s), {clip_len:.1f}s + {end_len:.1f}s end card)")
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        if layout == "full":
            Image.new("RGB", (W, H), palette["bg"]).save(tmp / "bg.png")
        else:
            draw_background(palette, tw, th, x, y, radius, tmp / "bg.png")
            draw_mask(tw, th, radius, tmp / "mask.png")
        draw_end_card(end_card, palette, tmp / "end.png")
        for i, b in enumerate(beats):
            if layout == "full":
                center_y = int(b.get("y", clip.get("caption_y", CAPTION_Y)))
                draw_pill(b["text"], palette, tmp / f"beat{i}.png", hook=i == 0, center_y=center_y)
            else:
                draw_headline(b["text"], palette, tmp / f"beat{i}.png", hook=i == 0)

        still = lambda p: ["-loop", "1", "-framerate", str(FPS), "-t", f"{total}", "-i", str(p)]
        inputs, f, n = [], [], 0

        def add(args):
            nonlocal n
            inputs.extend(args)
            n += 1
            return n - 1

        bg = add(still(tmp / "bg.png"))
        # Each segment: its own read of the recording, made constant-rate first
        # (simctl frames are sparse), cut, sped up, punched in, held to length.
        for i, p in enumerate(plans):
            k = add(["-i", str(p["raw"])])
            cw, ch, cx, cy = p["crop"]
            f.append(f"[{k}:v]fps={FPS},trim=start={p['start']:.3f}:end={p['stop']:.3f},"
                     f"setpts=(PTS-STARTPTS)/{p['speed']},fps={FPS},crop={cw}:{ch}:{cx}:{cy},scale={tw}:{th},"
                     f"tpad=stop_mode=clone:stop_duration=3,trim=duration={p['length']},setpts=PTS-STARTPTS,"
                     f"format=rgba[s{i}]")
        cat = "".join(f"[s{i}]" for i in range(len(plans)))
        # The last frame holds under the end card.
        f.append(f"{cat}concat=n={len(plans)}:v=1:a=0,tpad=stop_mode=clone:stop_duration={end_len + 1}[seq]")
        if layout == "full":
            f.append(f"[{bg}:v][seq]overlay={place[0]}:{place[1]}[v0]")
        else:
            m = add(still(tmp / "mask.png"))
            f.append(f"[{m}:v]format=gray[m]")
            f.append("[seq][m]alphamerge[scr]")
            f.append(f"[{bg}:v][scr]overlay={place[0]}:{place[1]}[v0]")
        for i, b in enumerate(beats):
            k = add(still(tmp / f"beat{i}.png"))
            start = float(b["at"])
            stop = float(beats[i + 1]["at"]) if i + 1 < len(beats) else clip_len
            fades = [] if start == 0 else [f"fade=t=in:st={start}:d={FADE}:alpha=1"]
            fades.append(f"fade=t=out:st={max(start, stop - FADE)}:d={FADE}:alpha=1")
            f.append(f"[{k}:v]format=rgba,{','.join(fades)}[b{i}]")
            # Slides up into place as it fades in (the first one is already there).
            rise = "0" if start == 0 else f"if(lt(t,{start}),0,max(0,({start}+{FADE}-t)/{FADE}*{RISE}))"
            f.append(f"[v{i}][b{i}]overlay=x=0:y='{rise}'[v{i + 1}]")
        e = add(still(tmp / "end.png"))
        f.append(f"[{e}:v]format=rgba,fade=t=in:st={clip_len}:d=0.35:alpha=1[e]")
        f.append(f"[v{len(beats)}][e]overlay=0:0,format=yuv420p[out]")

        OUT.mkdir(parents=True, exist_ok=True)
        mp4 = OUT / f"{clip['id']}.mp4"
        run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", ";".join(f), "-map", "[out]", "-t", f"{total}",
             "-r", str(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-movflags", "+faststart", "-an", str(mp4)])
        run(["ffmpeg", "-y", "-v", "error", "-ss", "0.4", "-i", str(mp4), "-frames:v", "1", "-q:v", "3", str(OUT / f"{clip['id']}.jpg")])
    (OUT / f"{clip['id']}.txt").write_text(f"{clip['caption'].strip()}\n\n{hashtags}\n")
    return mp4


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("clips", nargs="*", help="clip ids (default: all)")
    ap.add_argument("--rerecord", action="store_true", help="record shots even if already recorded")
    ap.add_argument("--compose-only", action="store_true", help="only compose from existing recordings")
    ap.add_argument("--no-seed", action="store_true", help="don't refill the E2E account with sample moments")
    args = ap.parse_args()

    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            sys.exit(f"{tool} not found: brew install ffmpeg")
    spec = yaml.safe_load((VIDEOS / "clips.yaml").read_text())
    clips = spec["clips"]
    if args.clips:
        unknown = set(args.clips) - {c["id"] for c in clips}
        if unknown:
            sys.exit(f"Unknown clip(s): {', '.join(sorted(unknown))}")
        clips = [c for c in clips if c["id"] in args.clips]

    to_record = []
    appearance = {}  # a shot records in the palette of the first clip using it
    for c in clips:
        for seg in segments_of(c):
            if seg.get("input"):
                continue
            appearance.setdefault(seg["shot"], c.get("palette", "light"))
            if (args.rerecord or not source_of(seg).exists()) and seg["shot"] not in to_record:
                to_record.append(seg["shot"])
    # A shot that adds a moment (capture) records last, so the others don't show it.
    to_record.sort(key=lambda shot: shot == "capture")

    if to_record and not args.compose_only:
        password, device = e2e_password(), find_device()
        # The seed writes to production; make sure the app talks to it too
        # (a local build carries .env's staging values).
        print("── Installing this checkout's JS (production backend) into the simulator app")
        run(["scripts/e2e-local.sh", "--install-only"], cwd=ROOT, timeout=900,
            env={**os.environ, "E2E_PASSWORD": password})
        if not args.no_seed:
            seed_demo(password)
        for shot in to_record:
            try:
                record_shot(shot, device, password, appearance[shot])
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
                # One broken shot shouldn't cost the others; drop its partial file.
                # Not `e` itself: its command line carries the E2E password.
                why = f"exit {e.returncode}" if isinstance(e, subprocess.CalledProcessError) else "timed out"
                print(f"── Shot {shot} failed ({why} in {Path(e.cmd[-1] if 'test' not in e.cmd else e.cmd[e.cmd.index('test') + 1]).name}); skipping its clips")
                for p in (RAW / f"{shot}.mp4", RAW / f"{shot}.json"):
                    p.unlink(missing_ok=True)
        subprocess.run(["xcrun", "simctl", "status_bar", device, "clear"], check=False)
        subprocess.run(["xcrun", "simctl", "ui", device, "appearance", "light"], check=False)

    made = []
    for c in clips:
        missing = [source_of(s) for s in segments_of(c) if not source_of(s).exists()]
        if missing:
            print(f"── Skipping {c['id']}: no recording at {missing[0].relative_to(ROOT)}")
            continue
        made.append(compose(c, spec["end_card"], spec["hashtags"]))
    print("── Done:" if made else "── Nothing made.")
    for m in made:
        print(f"   {m.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
