---
name: Soundtracks
description: A personal music journal. Paper and ink, one terracotta signal, and the album artwork as the color.
colors:
  paper: "#FBF7F2"
  paper-deep: "#F3EDE6"
  paper-tertiary: "#EBE4DC"
  paper-input: "#F8F3EE"
  elevated: "#FFFFFF"
  ink: "#23222B"
  ink-body: "#3A3943"
  ink-secondary: "#5E5C66"
  ink-tertiary: "#736A63"
  divider: "#E9E2D9"
  border: "#E0D8CF"
  chip: "#F0EAE3"
  terracotta: "#D9693F"
  terracotta-wash: "#FDF0EB"
  slate-violet: "#6B5F8C"
  night: "#0E0B0A"
  night-raised: "#1E1A18"
  night-tertiary: "#2A2422"
  night-text: "#F5F0EB"
  night-soft: "#C9C0B9"
  night-secondary: "#ABA39E"
  night-terracotta: "#EE8B62"
  night-button: "#F5EEE8"
  destructive: "#D32F2F"
  success: "#2E7D32"
typography:
  display:
    fontFamily: "DM Serif Display, Georgia, serif"
    fontSize: "clamp(52px, 7.2vw, 96px)"
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "DM Serif Display, Georgia, serif"
    fontSize: "34px"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-0.3px"
  title:
    fontFamily: "DM Serif Display, Georgia, serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.2
  reading:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.47
  body:
    fontFamily: "DM Sans, -apple-system, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  body-strong:
    fontFamily: "DM Sans, -apple-system, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.4
  label:
    fontFamily: "DM Sans, -apple-system, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "1px"
  meta:
    fontFamily: "DM Sans, -apple-system, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "\"tnum\""
rounded:
  sm: "8px"
  md: "12px"
  button: "14px"
  lg: "20px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
  4xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.button}"
    height: "52px"
  button-pill:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.full}"
    padding: "0 18px"
  button-capture:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.full}"
    size: "60px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "8px 12px"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.full}"
    padding: "8px 12px"
  entry-row:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    padding: "16px 0"
  sheet:
    backgroundColor: "{colors.paper-deep}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
  tab-bar:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  search-field:
    backgroundColor: "{colors.chip}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
---

# Design System: Soundtracks

## Overview

**Creative North Star: "The Liner Notes"**

Soundtracks reads like the paper insert inside a record sleeve: warm paper, dark ink, a serif title, a tracklist ruled with hairlines, and the album cover carrying all the color. The interface steps back so the artwork and the person's own words lead. It is a journal first, so the type system separates three voices: DM Serif Display names things, Newsreader sets anything a person wrote, DM Sans runs the interface.

Density is calm and list-shaped. Entries are rows on paper separated by hairline dividers, not cards in a grid. Color is rationed: neutrals are warm-tinted (no pure grays), terracotta appears as one signal at a time (an unread dot, an active indicator, a focus ring), and saturated color otherwise only arrives through album artwork and photographs. Night (#0E0B0A) is the second material: the app's dark theme, and on the web the full-bleed photographic sections where a song was heard.

The system is shared across the iOS app (the authority, `constants/theme.ts`) and its web surfaces in `web/`, which carry the same values as CSS custom properties.

**Key Characteristics:**
- Paper and ink, warm-tinted neutrals, never pure gray.
- One terracotta signal per view; artwork is the color.
- Three type voices: serif display for names, Newsreader for writing, DM Sans for UI.
- Hairline-ruled rows instead of boxed cards.
- Flat at rest; shadow only on things that float or lift (the capture button, artwork, a device).
- Dark mode is a true night, not inverted gray.

## Colors

Warm paper and blue-black ink, with a single terracotta signal and a muted slate-violet held in reserve.

### Primary
- **Terracotta** (`terracotta`): the signal. Unread and "something new" dots (8px, 4px radius), active indicators, playing state, focus rings, text selection tint at 24% opacity. Darkened in the 2026-10 redesign so it holds 3:1 as an indicator; it is not a text color at body sizes. Its night counterpart is **Ember** (`night-terracotta`). When terracotta must carry small text on paper (the landing page's dates), use **Terracotta Text** #B04F2A (4.9:1), never #D9693F (3.3:1).
- **Terracotta Wash** (`terracotta-wash`): the faint ground behind an accent-tinted element when a signal needs a surface.

### Secondary
- **Slate Violet** (`slate-violet`): the cool end of the old app-icon gradient (retired 2026-10). Reserved for brand moments; used sparingly and never alongside terracotta as a second accent on ordinary screens.

### App icon
"Pressed S" (2026-10): an ink record on paper, terracotta label, the wordmark's DM Serif Display S in paper. No gradient: it follows the same paper, ink and one-accent rules as the screens. Dark: ink tile, ember label. Tinted: grayscale for iOS to tint. Beta: same mark with a green label. Masters in `assets/images/app-icon.svg` (and `app-icon-mono.svg` for one-color print); every PNG is drawn by `scripts/make-app-icon.py`.

### Neutral
- **Paper** (`paper`): the page. App background, tab bar, the web landing's base.
- **Deep Paper** (`paper-deep`): sheets and secondary surfaces one step down from the page.
- **Paper Shade** (`paper-tertiary`) and **Chip Paper** (`chip`): segmented controls, search fields, quiet filled chips.
- **Paper Input** (`paper-input`): text field ground.
- **Raised White** (`elevated`): surfaces that float over content (mini player, sheets over imagery).
- **Ink** (`ink`): titles, primary text, and the primary button fill. The same ink fills selected chips and the capture button.
- **Body Ink** (`ink-body`): long running UI prose on the web (chapter body, section body) where full ink is too heavy.
- **Graphite** (`ink-secondary`): artist lines, metadata, secondary copy; passes AA on paper.
- **Umber Gray** (`ink-tertiary`): tertiary metadata such as mood words on a row.
- **Hairline** (`divider`): the 1px (hairline on iOS) rule between rows, under headers, above the tab bar.
- **Edge** (`border`): outlines on unselected chips and the sheet grabber.
- **Night** (`night`), **Night Raised** (`night-raised`), **Night Shade** (`night-tertiary`): dark-theme page, raised surface, and dividers; on the web, the ground of photographic sections.
- **Night Paper** (`night-text`), **Night Soft** (`night-soft`), **Night Gray** (`night-secondary`): text on night, from primary to supporting.
- **Night Button** (`night-button`): the inverted primary fill in dark mode (ink becomes paper).
- **Destructive** (`destructive`) and **Success** (`success`): status only.

### Named Rules
**The One Signal Rule.** Terracotta marks one thing at a time on a view: a dot, an indicator, a focus ring. If two terracotta elements compete, one of them should be ink.

**The Artwork Is the Color Rule.** No decorative color fields, gradients, or tinted panels. Saturation comes from album art and photographs; everything the system draws is paper, ink, or night.

**The Warm Neutral Rule.** Every gray is tinted warm. Do not introduce neutral `#999`-style grays or pure-white text on night; use the named neutrals.

## Typography

**Display Font:** DM Serif Display (with Georgia, serif)
**Reading Font:** Newsreader (with Georgia, serif)
**Body Font:** DM Sans (with -apple-system, system-ui, sans-serif)
**Mono Font:** Space Mono (rare; technical readouts only)

**Character:** A high-contrast display serif for names (songs, screens, headlines) against a plain geometric sans for the machinery, with a book-like roman serif reserved for the person's own words. The split tells you at a glance who is speaking: the app or you.

### Hierarchy
- **Display** (400, clamp(52px, 7.2vw, 96px), 0.98, -0.02em): web hero headlines only. Closing statements step down to clamp(40px, 5.6vw, 76px).
- **Headline** (400, 34px, 40px line): app screen titles and the hero song title on an entry; web section titles at clamp(34px, 4vw, 52px) with 1.05 leading and `text-wrap: balance`.
- **Title** (400, 22px): card and section names inside screens (Rediscover cards, album names, a tracklist title at 30 to 34px on web).
- **Reading** (Newsreader 400, 17px/25px in the app list; 22px/33px in the writer; clamp(21px, 2vw, 26px) at 1.45 to 1.55 on web): reflections, excerpts, a founder note, contributor notes. Never italic, never the display face. Keep measure near 36em.
- **Body** (DM Sans 400, 16px app; 17px web at 1.55): UI copy and explanatory prose, 40 to 44ch on web.
- **Body Strong** (DM Sans 600, 15 to 17px): song names in rows and button labels. The artist follows in 400 weight, Graphite.
- **Label** (DM Sans 600, 13px, 1px tracking): list section headers such as the month in the timeline, set in the text's own case.
- **Meta** (DM Sans 400, 13px, tabular figures): dates, counts, word counts, footnotes like "Entries from a demo journal."

### Named Rules
**The Who's Speaking Rule.** Newsreader is only for words a person wrote. UI copy never borrows it, and a reflection is never set in DM Sans or the display face.

**The Song Then Artist Rule.** A song is always shown as name in Body Strong, then artist in regular weight and Graphite, on one line.

## Layout

**App:** single column, 20px (`xl`) horizontal page padding, screen titles at 34px with generous top inset, content in full-width rows. Spacing runs on a 4px base (`xs` 4 to `4xl` 40). Bottom padding clears the floating tab bar and capture button (110 to 120px).

**Web:** a fluid gutter of clamp(20px, 5vw, 72px); content capped at 1360px for two-column story and hero layouts (1.1fr copy, 0.9fr device, gap clamp(32px, 6vw, 96px)) and 1200px for list sections. Section rhythm is large and vertical: clamp(96px, 12vw, 160px) between sections. One breakpoint at 900px: below it, every two-column layout stacks, sticky devices are removed, and each chapter carries its own image and date inline so the page reads fully without motion.

**The Rows Not Boxes Rule.** Collections of entries are rows on the page ruled by hairlines (top border on the list, bottom border per row), never a grid of filled cards.

## Elevation & Depth

Flat by default, with depth by tonal step: paper, deep paper, raised white; night, night raised. Lists and headers carry no shadow, only hairlines. Shadow appears on objects that physically float or lift: the floating capture button, the hero artwork on an entry, the active segment of a segmented control, sheets over a dimmed scrim, and on the web the drawn iPhone.

### Shadow Vocabulary
- **Segment lift** (`0 1px 2px rgba(0,0,0,0.08)`, none in dark): the selected segment in a segmented control.
- **Card hint** (`0 1px 4px rgba(0,0,0,0.08)`): the theme's card shadow; rarely used now that rows replaced cards.
- **Float** (`0 8px 12px rgba(0,0,0,0.2)`, 0.5 in dark): the capture button above the tab bar.
- **Artwork lift** (`0 18px 24px rgba(0,0,0,0.25)`): album artwork shown large on an entry.
- **Device** (`inset 0 0 0 1.5px #3b3a40, 0 2px 4px rgba(0,0,0,0.18), 0 34px 70px -18px rgba(0,0,0,0.55)`): the iPhone drawn on web.
- **Night scrim** (gradients of `rgba(14,11,10,0.08 to 0.94)`): over photographs so night text holds contrast; directional on wide screens, near-solid on small.

**The Lift Means Physical Rule.** Shadow is reserved for things that sit above the page in the real world. If it is part of the page, it is flat and divided by a hairline.

## Shapes

Gently rounded, never sharp and never bubbly. Artwork thumbnails and photo tiles use 6 to 10px corners (`sm` 8px typical); search fields and quiet panels 12px (`md`); full-width primary buttons 14px (`button`); bottom sheets round only their top corners at 20px (`lg`). Anything compact and tappable (chips, the save pill, the capture button, segmented controls, glass buttons over imagery) is a full pill or circle. Dots are 8px circles. Borders are hairlines; the only heavier rule is a 2px ink top border that heads a tracklist.

## Components

### Buttons
Quiet, solid, ink.
- **Shape:** full-width primary at 14px radius and 52px tall; header actions (Save) are pills, 18px horizontal padding.
- **Primary:** ink fill with paper text in DM Sans 600 at 15 to 16px; inverts to Night Button with near-black text in dark mode.
- **Capture:** a 60px ink circle floating above the tab bar on the right, with the Float shadow. The app's one persistent call to action.
- **Disabled:** 0.6 opacity. Button-embedded spinners take the button's text color; all other spinners are Graphite, never terracotta.
- **Text links:** inherit color, 1px underline offset 3px; on night, underline at 40% then full on hover.

### Chips
- **Style:** pill, 8px by 12px padding, transparent with an Edge outline, DM Sans 500 at 14px.
- **Selected:** ink fill, paper text, ink border. The "add" chip is Chip Paper with a dashed Edge outline and Graphite text.
- **Moods are words.** Mood tags render as text, not emoji pills, wherever they summarize a row.

### Entry Row (signature)
The core unit of the journal. Full width, 16px vertical padding, hairline bottom divider. Artwork thumbnail at 8px radius, song in Body Strong with artist in Graphite, the reflection in Newsreader, then Meta (date, contributor, mood words in Umber Gray). On web the same row becomes a two-column ruled list: a short descriptor left, song, reflection at reading size, and date right.

### Tracklist
A shared album shown as a record's tracklist: 2px ink top rule, serif title with a Meta count ("4 songs · 4 people"), numbered rows in tabular figures, song then artist, and the contributor's words in Newsreader.

### Inputs / Fields
- **Style:** Chip Paper or Paper Input ground, no border, 12px radius, DM Sans 15 to 16px; placeholder in its own warm gray.
- **Writer:** the full-page writer has no field chrome at all: Newsreader at 22px/33px on paper, dividers only between sections.
- **Focus (web):** 2px terracotta outline, 4px offset, 6px radius.

### Navigation
- **Tab bar:** paper ground, hairline top border, four slots with 11px DM Sans labels (500, 600 when active); active in ink, inactive in warm gray. New activity is an 8px terracotta dot on the icon, never a count.
- **Web nav:** the app icon tile (30px, 22.5% corners) beside the serif wordmark (24px DM Serif Display), on the night hero. Once the hero scrolls away, a frosted paper bar slides in with the same lockup and the App Store badge.
- **Record mark (web):** the icon's record (ink disc, terracotta label, serif S) drawn without its tile. The hero shows it sliding out of a song's sleeve; keep the S label visible whenever it appears.
- **Surfaces:** every surface is a full screen or a compact bottom sheet sized to content (Deep Paper, 20px top radius, grabber in Edge). No page-sheet cards that cover most of a screen.

### Device (web)
Real app screens shown in a CSS iPhone at true proportions (393:852, corner radius 16.5% of width), never mockup art. Its Lock Screen depicts iOS faithfully (system type for the clock, frosted widgets), with the Soundtracks widget title in DM Serif Display. Screens cross-fade with blur over 0.7s on `cubic-bezier(0.16, 1, 0.3, 1)`; with reduced motion they swap without transition.

### App Store Badge
Apple's official black badge artwork, unmodified, 50px tall, hover to 0.85 opacity. It is the web's primary button; no custom download buttons.

## Do's and Don'ts

### Do:
- **Do** take every value from `constants/theme.ts` (app) or the matching custom properties (web); paper is #FBF7F2 and ink #23222B on both.
- **Do** separate list items with hairline dividers in `divider` and let rows run full width.
- **Do** set anything a person wrote in Newsreader, upright, at reading size.
- **Do** show a song as name (600) then artist (400, Graphite).
- **Do** let artwork and photographs carry the color; keep the chrome paper, ink, or night.
- **Do** use an 8px terracotta dot for "something new", and Graphite for spinners.
- **Do** make every web section read fully without motion and on a phone.

### Don't:
- **Don't** use terracotta for body-size text or for more than one element per view.
- **Don't** box entries in filled cards or shadowed tiles; rows and hairlines only.
- **Don't** use pure grays (#999, rgba of black on white) or pure white text on night.
- **Don't** set UI copy in Newsreader or a reflection in DM Sans or the display face.
- **Don't** add shadows to things that are part of the page; shadow is for the capture button, lifted artwork, sheets and devices.
- **Don't** stack an uppercase tracked label above a title; let the serif title and Meta line carry hierarchy.
- **Don't** show counts on badges; a dot is the signal.
