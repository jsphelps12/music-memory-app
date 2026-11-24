# Short videos

Vertical 1080×1920 clips for TikTok, Reels and Shorts, cut from recordings of the app itself.

```bash
python3 scripts/video/make.py                 # every clip in clips.yaml
python3 scripts/video/make.py wedding-song    # one clip
python3 scripts/video/make.py --rerecord      # record the shots again
python3 scripts/video/make.py --compose-only  # re-cut after editing clips.yaml (no simulator)
```

Output lands in `out/` (gitignored): `<id>.mp4`, a cover `<id>.jpg`, and `<id>.txt` with the caption and hashtags to paste.

## How it works

1. **Sample data.** `scripts/video/seed-demo.mjs` resets the E2E account on production (the account the Maestro flows use, through RLS as itself) and fills it with `demo-moments.json`: twenty fictional moments with real song artwork (iTunes Search API), people, places, weather, and photos from `photos/` uploaded the way the app uploads them. Any E2E run resets the account, so every recording run seeds again.
2. **The app.** Before recording, `scripts/e2e-local.sh --install-only` puts this checkout's JS, pointed at production, into the Soundtracks β build on the simulator, so the app shows what was seeded.
3. **Recording.** For each shot, Maestro signs in (`flows/signin.yaml`, not recorded), then `xcrun simctl io recordVideo` captures the screen while `flows/<shot>.yaml` drives the app. The status bar is set to 9:41, and dark-palette clips record in dark mode. Raw takes go to `out/raw/<shot>.mp4`.
4. **Editing.** Each clip in `clips.yaml` is a list of segments: pieces of a shot with their own speed and optional zoom, cut together. Headlines change on each beat and slide in. Then the end card. Pillow draws the text in the app's fonts; ffmpeg does the rest.

## Editing a clip

- **Timing.** `from`/`to` count seconds from when the shot starts moving. To find cut points, sample the raw take through a constant-rate filter, as the composer does (`ffmpeg -i out/raw/<shot>.mp4 -vf fps=30,fps=1 f_%03d.png`). A plain `-ss` seek on these recordings shows the *next* change, not what's on screen, because the simulator writes frames only when something changes.
- **Zoom** only on photos. Any punch-in on a text screen crops the words.
- **Layouts.** `full` (screen fills the frame, caption pills) suits TikTok. `phone` (bezel and serif headline) is calmer. Pills default to 420px from the top; set `caption_y` per clip or `y` per beat to keep them off what matters (the search bar, the words being typed).
- **Length.** Aim for 8–12 seconds: the hook in the first second, the payoff before the end card.

## New footage

- **A new shot:** write `flows/<shot>.yaml` (no `launchApp`: it starts on the Journal, already signed in). Pause with `extendedWaitUntil` on `"__pause__"` and `optional: true`. Rows read out as one label ("Fast Car Tracy Chapman…"), so match them with `".*Fast Car.*"`. Typing can drop its first letters; wrap it in a `retry` that checks the result.
- **Your own phone recording:** screen-record on your iPhone (real journal, real music), AirDrop it here, and use `input: path/to/recording.mov` (with `trim:`) in a segment instead of `shot`. Usually the strongest footage.

## Posting

- The videos are **silent on purpose**. Add the song from the platform's sound library in its app when you post (TikTok, Instagram), or the Shorts audio picker. A song baked into an uploaded file can get muted or taken down.
- Scheduling: upload the mp4s and captions to Buffer (free: TikTok, Instagram, YouTube). Sounds still have to be added in each app.
- Photos are from Unsplash (free for commercial use, no credit required); `photos/CREDITS.txt` lists each one's page anyway.

## Needs

`brew install ffmpeg`, Maestro, Python with Pillow and PyYAML, a booted simulator with a Soundtracks β release build of the current version, `eas` signed in (for the production env), and `E2E_PASSWORD` in the environment or `.maestro/.env.e2e.local`.
