#!/usr/bin/env python3
"""Generates icon assets for the EMEET PIXY Stream Deck plugin.

Everything is drawn programmatically with Pillow (no external assets), at
4x the final @2x size and downsampled with LANCZOS for both the @1x and @2x
variants -- that supersampling is what keeps curves and diagonal strokes
smooth instead of jagged.

Plugin and state icons (the ones shown on the physical key and in Stream
Deck's preferences) use a retro-synthwave look: near-black background, a
perspective grid floor, scattered stars, soft colored glow blobs, and a
neon-outline glyph rendered with a bloom pass behind a bright core, so it
reads like a glowing sign. Action-list and category icons stay flat
white-on-transparent, per Elgato's monochrome icon guidelines -- there's no
way to put a black background or color there.

Feel free to replace any of these with your own artwork later -- Stream
Deck only cares about the file names and sizes described in the manifest.
"""
import os
import random

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), "..", "com.emeetpixy.pixycontrol.sdPlugin", "imgs")

SUPERSAMPLE = 4  # draw at 4x the @2x target, then downsample twice

WHITE = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)
BG = (7, 6, 16, 255)

# Brand neon (plugin icon).
BRAND_NEON = (170, 90, 255)

# One neon color per action, grouped by what the action does, so related
# buttons are recognizable at a glance on a crowded deck. All in the
# purple/violet/magenta family (no blue or cyan) to match the reference style.
NEON = {
    "tracking": (150, 100, 255),
    "gesture": (188, 110, 255),
    "audio": (80, 240, 150),
    "auto-privacy": (255, 190, 60),
    "ptz-preset": (150, 80, 235),
    "ptz-nudge": (150, 80, 235),
    "ptz-center": (150, 80, 235),
    "image-control": (255, 80, 190),
    # Toggle Privacy has two live states, colored to read as "safe" vs "alert".
    "toggle-privacy-visible": (165, 120, 255),
    "toggle-privacy-hidden": (255, 70, 90),
    # Tracking Mode has two live states: green when this button's mode is the
    # one actually running, grey when it isn't. PTZ Nudge reuses the same
    # grey for its "AI Track is on, manual nudges are greyed out" state.
    "tracking-active": (70, 255, 120),
    "tracking-inactive": (75, 75, 85),
    "ptz-nudge-disabled": (75, 75, 85),
}

GRID_TINT = (140, 90, 220)


def save_pair(img_highres: Image.Image, path_no_ext: str, target_2x: int) -> None:
    os.makedirs(os.path.dirname(path_no_ext), exist_ok=True)
    img_2x = img_highres.resize((target_2x, target_2x), Image.LANCZOS)
    img_1x = img_highres.resize((target_2x // 2, target_2x // 2), Image.LANCZOS)
    img_2x.save(path_no_ext + "@2x.png")
    img_1x.save(path_no_ext + ".png")


# --- Synthwave background -------------------------------------------------


def draw_grid_and_stars(base: Image.Image, size: int, seed: int) -> None:
    layer = Image.new("RGBA", base.size, TRANSPARENT)
    d = ImageDraw.Draw(layer)
    horizon = size * 0.40

    # Horizontal lines, denser near the horizon (perspective).
    for i in range(1, 7):
        t = i / 6
        y = horizon + (size - horizon) * (t**1.7)
        alpha = int(85 * (1 - t * 0.55))
        d.line([0, y, size, y], fill=(*GRID_TINT, alpha), width=max(1, int(size * 0.0022)))

    # Vertical lines fanning out from a vanishing point on the horizon.
    cx = size / 2
    span = size * 1.6
    for i in range(9):
        t = i / 8 - 0.5
        x_bottom = cx + t * span
        d.line([cx, horizon, x_bottom, size], fill=(*GRID_TINT, 65), width=max(1, int(size * 0.0022)))

    layer = layer.filter(ImageFilter.GaussianBlur(size * 0.0015))
    base.alpha_composite(layer)

    # Stars, above the horizon, deterministic per icon.
    stars = Image.new("RGBA", base.size, TRANSPARENT)
    sd = ImageDraw.Draw(stars)
    rnd = random.Random(seed)
    for _ in range(22):
        sx = rnd.uniform(size * 0.03, size * 0.97)
        sy = rnd.uniform(size * 0.03, horizon * 0.92)
        r = rnd.uniform(size * 0.0025, size * 0.008)
        a = rnd.randint(110, 220)
        sd.ellipse([sx - r, sy - r, sx + r, sy + r], fill=(255, 255, 255, a))
    base.alpha_composite(stars)


def add_color_blobs(base: Image.Image, size: int, colors) -> None:
    overlay = Image.new("RGBA", base.size, TRANSPARENT)
    d = ImageDraw.Draw(overlay)
    positions = ((size * 0.14, size * 0.86, size * 0.30), (size * 0.90, size * 0.14, size * 0.24))
    for (bx, by, br), col in zip(positions, colors):
        d.ellipse([bx - br, by - br, bx + br, by + br], fill=(*col, 85))
    overlay = overlay.filter(ImageFilter.GaussianBlur(size * 0.07))
    base.alpha_composite(overlay)


def draw_neon_glyph(base: Image.Image, size: int, draw_fn, color, core_white: float = 0.55, intensity: float = 1.0) -> None:
    """Bloom-behind-core neon effect: a wide soft glow, a tighter glow, then
    a bright core on top, all from the same glyph strokes.

    `core_white` controls how much white gets blended into the core (0 keeps
    the glyph's true color, 1 makes it pure white) -- lower this for a color
    that needs to read as itself (e.g. a saturated green) rather than as a
    near-white highlight. `intensity` scales the glow/bloom alpha, so a
    genuinely dim/hidden-looking state can pull back the glow instead of
    just changing the hue.
    """
    bloom_alpha = max(0, min(255, int(255 * intensity)))
    bloom = Image.new("RGBA", base.size, TRANSPARENT)
    draw_fn(ImageDraw.Draw(bloom), size, (*color, bloom_alpha))
    bloom = bloom.filter(ImageFilter.GaussianBlur(size * 0.05))
    base.alpha_composite(bloom)

    glow = Image.new("RGBA", base.size, TRANSPARENT)
    draw_fn(ImageDraw.Draw(glow), size, (*color, bloom_alpha))
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.018))
    base.alpha_composite(glow)

    core_color = tuple(min(255, max(0, int(c * (1 - core_white) + 255 * core_white))) for c in color)
    core = Image.new("RGBA", base.size, TRANSPARENT)
    draw_fn(ImageDraw.Draw(core), size, (*core_color, 255))
    base.alpha_composite(core)


def neon_canvas(size: int, seed: int, neon_color) -> Image.Image:
    base = Image.new("RGBA", (size, size), BG)
    draw_grid_and_stars(base, size, seed)
    add_color_blobs(base, size, colors=(neon_color, BRAND_NEON))
    return base


def plugin_icon():
    size = 512 * SUPERSAMPLE
    img = neon_canvas(size, seed=1, neon_color=BRAND_NEON)
    draw_neon_glyph(img, size, lambda d, s, c: draw_camera_glyph(d, s / 2, s / 2, s * 0.26, c), BRAND_NEON)
    save_pair(img, os.path.join(ROOT, "plugin", "plugin"), 512)


def category_icon():
    # Monochrome white-on-transparent, per Elgato's guidelines -- no background/glow here.
    size = 56 * SUPERSAMPLE
    img = Image.new("RGBA", (size, size), TRANSPARENT)
    d = ImageDraw.Draw(img)
    draw_camera_glyph(d, size / 2, size / 2, size * 0.32, WHITE)
    save_pair(img, os.path.join(ROOT, "category", "category"), 56)


def action_list_icon(name, draw_fn):
    # Monochrome white-on-transparent, per Elgato's guidelines -- no background/glow here.
    size = 40 * SUPERSAMPLE
    img = Image.new("RGBA", (size, size), TRANSPARENT)
    d = ImageDraw.Draw(img)
    draw_fn(d, size, WHITE)
    save_pair(img, os.path.join(ROOT, "actions", name), 40)


def state_icon(name, draw_fn, neon_key=None, seed=None, core_white=0.55, intensity=1.0):
    size = 144 * SUPERSAMPLE
    neon_color = NEON[neon_key or name]
    img = neon_canvas(size, seed=seed if seed is not None else (hash(name) % 1000), neon_color=neon_color)
    draw_neon_glyph(img, size, draw_fn, neon_color, core_white=core_white, intensity=intensity)
    save_pair(img, os.path.join(ROOT, "states", name), 144)


# --- Glyphs -------------------------------------------------------------
# Every glyph function takes (draw, size, color) and draws in that single
# color -- draw_neon_glyph() calls each one three times (bloom, glow, core)
# to build the neon effect, so glyphs must not hardcode their own color.


def draw_camera_glyph(draw: ImageDraw.ImageDraw, cx, cy, r, color):
    """A simple PTZ-camera-ish glyph: a circular lens with a small dot,
    and two short "ears" suggesting a pan/tilt base."""
    lw = max(2, int(r // 6))
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=lw)
    inner = r * 0.42
    draw.ellipse([cx - inner, cy - inner, cx + inner, cy + inner], fill=color)
    ear_w = r * 0.28
    ear_h = r * 0.34
    draw.rounded_rectangle(
        [cx - r * 1.05 - ear_w, cy - ear_h / 2, cx - r * 1.05, cy + ear_h / 2], radius=ear_w * 0.35, outline=color, width=lw
    )
    draw.rounded_rectangle(
        [cx + r * 1.05, cy - ear_h / 2, cx + r * 1.05 + ear_w, cy + ear_h / 2], radius=ear_w * 0.35, outline=color, width=lw
    )


def _cap(draw, x, y, r, color):
    """A small filled circle to round off the end of a thick line."""
    draw.ellipse([x - r, y - r, x + r, y + r], fill=color)


def glyph_eye(d: ImageDraw.ImageDraw, size, color=WHITE):
    # A flat almond (not a circle) reads as an eye; a near-circular one just
    # reads as a ring. Width should be noticeably larger than height.
    cx, cy = size / 2, size / 2
    w, h = size * 0.33, size * 0.19
    lw = max(2, size // 15)
    d.ellipse([cx - w, cy - h, cx + w, cy + h], outline=color, width=lw)
    r = size * 0.115
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)


def glyph_eye_slash(d: ImageDraw.ImageDraw, size, color=WHITE):
    glyph_eye(d, size, color)
    lw = max(2, size // 13)
    pad = size * 0.16
    d.line([pad, size - pad, size - pad, pad], fill=color, width=lw)
    _cap(d, pad, size - pad, lw / 2, color)
    _cap(d, size - pad, pad, lw / 2, color)


def glyph_hand(d: ImageDraw.ImageDraw, size, color=WHITE):
    cx, cy = size / 2, size * 0.58
    palm_w, palm_h = size * 0.34, size * 0.30
    lw = max(2, size // 16)
    d.rounded_rectangle([cx - palm_w / 2, cy - palm_h / 2, cx + palm_w / 2, cy + palm_h / 2], radius=palm_w * 0.32, outline=color, width=lw)
    finger_w = size * 0.095
    finger_positions = [-0.32, -0.11, 0.11, 0.32]
    heights = [0.30, 0.42, 0.40, 0.28]
    top = cy - palm_h / 2
    for pos, hgt in zip(finger_positions, heights):
        fx = cx + pos * size
        fh = size * hgt
        d.rounded_rectangle(
            [fx - finger_w / 2, top - fh, fx + finger_w / 2, top + size * 0.05],
            radius=finger_w * 0.48,
            outline=color,
            width=max(2, size // 20),
        )
    thumb_w, thumb_h = size * 0.11, size * 0.22
    tx = cx - palm_w / 2 - thumb_w * 0.25
    ty = cy + palm_h * 0.05
    d.rounded_rectangle(
        [tx - thumb_w / 2, ty - thumb_h / 2, tx + thumb_w / 2, ty + thumb_h / 2],
        radius=thumb_w * 0.48,
        outline=color,
        width=max(2, size // 20),
    )


def glyph_audio(d: ImageDraw.ImageDraw, size, color=WHITE):
    cx, cy = size / 2, size / 2
    bar_w = size * 0.10
    heights = [0.26, 0.52, 0.82, 0.52, 0.26]
    gap = size * 0.045
    total_w = len(heights) * bar_w + (len(heights) - 1) * gap
    start_x = cx - total_w / 2
    for i, hfrac in enumerate(heights):
        h = size * hfrac
        x0 = start_x + i * (bar_w + gap)
        d.rounded_rectangle([x0, cy - h / 2, x0 + bar_w, cy + h / 2], radius=bar_w * 0.5, fill=color)


def glyph_clock_shield(d: ImageDraw.ImageDraw, size, color=WHITE):
    cx, cy = size / 2, size / 2
    r = size * 0.34
    lw = max(2, size // 15)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=lw)
    d.line([cx, cy, cx, cy - r * 0.6], fill=color, width=lw)
    _cap(d, cx, cy - r * 0.6, lw / 2, color)
    d.line([cx, cy, cx + r * 0.42, cy + r * 0.16], fill=color, width=lw)
    _cap(d, cx + r * 0.42, cy + r * 0.16, lw / 2, color)
    dot_r = size * 0.04
    d.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill=color)


def glyph_target(d: ImageDraw.ImageDraw, size, color=WHITE):
    cx, cy = size / 2, size / 2
    lw = max(2, size // 17)
    for frac in (0.36, 0.22):
        r = size * frac
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=lw)
    dot_r = size * 0.06
    d.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill=color)
    tick = size * 0.12
    edge = size * 0.46
    for x0, y0, x1, y1 in (
        (cx, cy - edge, cx, cy - edge + tick),
        (cx, cy + edge, cx, cy + edge - tick),
        (cx - edge, cy, cx - edge + tick, cy),
        (cx + edge, cy, cx + edge - tick, cy),
    ):
        d.line([x0, y0, x1, y1], fill=color, width=lw)
        _cap(d, x0, y0, lw / 2, color)


def _glyph_single_arrow(d: ImageDraw.ImageDraw, size, color, dx, dy):
    """One bold arrow pointing (dx, dy) from center -- used for PTZ Nudge
    buttons that are configured for a single specific direction."""
    cx, cy = size / 2, size / 2
    length = size * 0.32
    head = size * 0.15
    w = max(3, size // 11)
    x0, y0 = cx - dx * length, cy - dy * length
    x1, y1 = cx + dx * length, cy + dy * length
    d.line([x0, y0, x1, y1], fill=color, width=w)
    _cap(d, x0, y0, w / 2, color)
    if dx:
        d.line([x1, y1, x1 - dx * head, y1 - head], fill=color, width=w)
        d.line([x1, y1, x1 - dx * head, y1 + head], fill=color, width=w)
        _cap(d, x1 - dx * head, y1 - head, w / 2, color)
        _cap(d, x1 - dx * head, y1 + head, w / 2, color)
    else:
        d.line([x1, y1, x1 - head, y1 - dy * head], fill=color, width=w)
        d.line([x1, y1, x1 + head, y1 - dy * head], fill=color, width=w)
        _cap(d, x1 - head, y1 - dy * head, w / 2, color)
        _cap(d, x1 + head, y1 - dy * head, w / 2, color)
    _cap(d, x1, y1, w / 2, color)


def glyph_arrow_up(d: ImageDraw.ImageDraw, size, color=WHITE):
    _glyph_single_arrow(d, size, color, dx=0, dy=-1)


def glyph_arrow_down(d: ImageDraw.ImageDraw, size, color=WHITE):
    _glyph_single_arrow(d, size, color, dx=0, dy=1)


def glyph_arrow_left(d: ImageDraw.ImageDraw, size, color=WHITE):
    _glyph_single_arrow(d, size, color, dx=-1, dy=0)


def glyph_arrow_right(d: ImageDraw.ImageDraw, size, color=WHITE):
    _glyph_single_arrow(d, size, color, dx=1, dy=0)


def _glyph_zoom(d: ImageDraw.ImageDraw, size, color, plus: bool):
    """A magnifying glass with a +/- in the lens, for zoom in/out."""
    cx, cy = size * 0.43, size * 0.43
    r = size * 0.20
    w = max(3, size // 13)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=w)
    hx0, hy0 = cx + r * 0.74, cy + r * 0.74
    hx1, hy1 = size * 0.78, size * 0.78
    d.line([hx0, hy0, hx1, hy1], fill=color, width=w)
    _cap(d, hx1, hy1, w / 2, color)
    arm = r * 0.5
    d.line([cx - arm, cy, cx + arm, cy], fill=color, width=w)
    if plus:
        d.line([cx, cy - arm, cx, cy + arm], fill=color, width=w)


def glyph_zoom_in(d: ImageDraw.ImageDraw, size, color=WHITE):
    _glyph_zoom(d, size, color, plus=True)


def glyph_zoom_out(d: ImageDraw.ImageDraw, size, color=WHITE):
    _glyph_zoom(d, size, color, plus=False)


def glyph_move_arrows(d: ImageDraw.ImageDraw, size, color=WHITE):
    cx, cy = size / 2, size / 2
    arm = size * 0.30
    head = size * 0.10
    w = max(2, size // 15)
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        x1, y1 = cx + dx * arm, cy + dy * arm
        d.line([cx, cy, x1, y1], fill=color, width=w)
        if dx:
            d.line([x1, y1, x1 - dx * head, y1 - head], fill=color, width=w)
            d.line([x1, y1, x1 - dx * head, y1 + head], fill=color, width=w)
            _cap(d, x1 - dx * head, y1 - head, w / 2, color)
            _cap(d, x1 - dx * head, y1 + head, w / 2, color)
        else:
            d.line([x1, y1, x1 - head, y1 - dy * head], fill=color, width=w)
            d.line([x1, y1, x1 + head, y1 - dy * head], fill=color, width=w)
            _cap(d, x1 - head, y1 - dy * head, w / 2, color)
            _cap(d, x1 + head, y1 - dy * head, w / 2, color)
        _cap(d, x1, y1, w / 2, color)
    dot_r = size * 0.05
    d.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill=color)


def glyph_center_frame(d: ImageDraw.ImageDraw, size, color=WHITE):
    cx, cy = size / 2, size / 2
    half = size * 0.34
    corner = size * 0.15
    w = max(2, size // 15)
    for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        x, y = cx + sx * half, cy + sy * half
        d.line([x, y, x - sx * corner, y], fill=color, width=w)
        d.line([x, y, x, y - sy * corner], fill=color, width=w)
        _cap(d, x, y, w / 2, color)
        _cap(d, x - sx * corner, y, w / 2, color)
        _cap(d, x, y - sy * corner, w / 2, color)
    dot_r = size * 0.055
    d.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill=color)


def glyph_sliders(d: ImageDraw.ImageDraw, size, color=WHITE):
    rows = (0.32, 0.5, 0.68)
    knob_x_frac = (0.68, 0.35, 0.55)
    left, right = size * 0.18, size * 0.82
    w = max(2, size // 22)
    knob_r = size * 0.065
    for row_frac, knob_frac in zip(rows, knob_x_frac):
        y = size * row_frac
        d.line([left, y, right, y], fill=color, width=w)
        _cap(d, left, y, w / 2, color)
        _cap(d, right, y, w / 2, color)
        kx = left + (right - left) * knob_frac
        d.ellipse([kx - knob_r, y - knob_r, kx + knob_r, y + knob_r], fill=color)


if __name__ == "__main__":
    plugin_icon()
    category_icon()

    action_list_icon("tracking", glyph_eye)
    action_list_icon("gesture", glyph_hand)
    action_list_icon("audio", glyph_audio)
    action_list_icon("auto-privacy", glyph_clock_shield)
    action_list_icon("toggle-privacy", glyph_eye_slash)
    action_list_icon("ptz-preset", glyph_target)
    action_list_icon("ptz-nudge", glyph_move_arrows)
    action_list_icon("ptz-center", glyph_center_frame)
    action_list_icon("image-control", glyph_sliders)

    state_icon("gesture", glyph_hand, seed=3)
    state_icon("audio", glyph_audio, seed=4)
    state_icon("auto-privacy", glyph_clock_shield, seed=5)
    state_icon("ptz-preset", glyph_target, seed=6)
    state_icon("ptz-nudge", glyph_move_arrows, seed=7)
    state_icon("ptz-center", glyph_center_frame, seed=8)
    state_icon("image-control", glyph_sliders, seed=9)

    # Toggle Privacy gets two live states -- see actions/toggle-privacy.ts,
    # which queries the camera's real status and picks between these.
    state_icon("toggle-privacy-visible", glyph_eye, neon_key="toggle-privacy-visible", seed=10)
    state_icon("toggle-privacy-hidden", glyph_eye_slash, neon_key="toggle-privacy-hidden", seed=11)

    # Tracking Mode gets two live states (active/inactive) instead of one
    # static icon -- see actions/tracking-mode.ts + tracking-sync.ts. Active
    # stays close to true, saturated green (little white mixed in) so it
    # reads as "on"; inactive keeps almost none of its color's own light and
    # dims its glow so it visually recedes.
    state_icon("tracking-active", glyph_eye, neon_key="tracking-active", seed=12, core_white=0.15, intensity=1.15)
    state_icon("tracking-inactive", glyph_eye, neon_key="tracking-inactive", seed=13, core_white=0.1, intensity=0.55)

    # PTZ Nudge's "AI Track is on, this is greyed out" state -- same dim,
    # dark treatment as tracking-inactive. This generic 4-way icon is only
    # the fallback shown before a button has been configured; once a button
    # has a control+direction, the plugin swaps in one of the specific
    # directional icons below (see actions/ptz-nudge.ts).
    state_icon("ptz-nudge-disabled", glyph_move_arrows, neon_key="ptz-nudge-disabled", seed=14, core_white=0.1, intensity=0.55)

    # Per-direction PTZ Nudge icons: pan increase/decrease = right/left
    # arrow, tilt increase/decrease = up/down arrow, zoom increase/decrease =
    # a magnifying glass with +/-. Each needs an enabled (purple) and
    # disabled (dim grey, matching ptz-nudge-disabled) version.
    NUDGE_COMBOS = (
        ("ptz-nudge-pan-increase", glyph_arrow_right, 15),
        ("ptz-nudge-pan-decrease", glyph_arrow_left, 16),
        ("ptz-nudge-tilt-increase", glyph_arrow_up, 17),
        ("ptz-nudge-tilt-decrease", glyph_arrow_down, 18),
        ("ptz-nudge-zoom-increase", glyph_zoom_in, 19),
        ("ptz-nudge-zoom-decrease", glyph_zoom_out, 20),
    )
    for combo_name, glyph_fn, combo_seed in NUDGE_COMBOS:
        state_icon(combo_name, glyph_fn, neon_key="ptz-nudge", seed=combo_seed)
        state_icon(
            f"{combo_name}-disabled",
            glyph_fn,
            neon_key="ptz-nudge-disabled",
            seed=combo_seed,
            core_white=0.1,
            intensity=0.55,
        )

    print("Icons generated.")
