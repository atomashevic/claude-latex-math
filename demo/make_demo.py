#!/usr/bin/env python3
"""Renders the latex-math demo video: a Claude Code session in Ghostty asks about attention,
and the math in the reply is typeset in place, display and inline.

The formulas come from the plugin's own renderer, bin/render.sh, at 2.4 times its resolution.
The terminal is drawn to the measurements of the author's Ghostty: JetBrains Mono, a 1:2.2 cell,
GitHub's dark colours, and pictures fitted into their cells with their aspect kept. The frame
shows the terminal only, with no window around it.

usage: make_demo.py [--stills t1,t2,...] [--fps N] [--size WxH]
"""
import argparse
import hashlib
import math
import os
import random
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
BUILD = HERE / 'build'

# One terminal cell in scene pixels: 2.4 times the cell of the author's Ghostty (20 x 44 at 1x).
CW, CH, BASELINE = 48, 106, 82
RESOLUTION = '2.4'
PICTURE_CELL_H = 96  # at that resolution, render.sh pads each picture to 48 x 96 per cell
COLS = 64
FONT = ImageFont.truetype('/usr/share/fonts/TTF/JetBrainsMonoNerdFont-Regular.ttf', 80)
FALLBACK = ImageFont.truetype('/usr/share/fonts/TTF/IosevkaTermNerdFontMono-Regular.ttf', 88)
FALLBACK_CHARS = set('✢✻✽')

# GitHub Dark: canvas #0d1117, text #e6edf3, muted text #8b949e, border #30363d, raised surface #21262d.
BG = (13, 17, 23)
TEXT = (230, 237, 243)
WHITE = (255, 255, 255)
DIM = (139, 148, 158)
RULE = (48, 54, 61)
USER_BAR = (33, 38, 45)
CLAUDE = (215, 119, 87)
CLAUDE_LIGHT = (245, 182, 160)
FOREGROUND_HEX = '%02x%02x%02x' % TEXT

PROMPT = 'explain the attention mechanism'
REPLY = [
    ('paragraph', 'Attention lets each token read from every other token. For queries $Q$, keys $K$ and '
                  'values $V$, each with dimension $d_k$, scaled dot-product attention is'),
    ('display', r'\mathrm{Attention}(Q, K, V) = \mathrm{softmax}\!\left( \frac{Q K^\top}{\sqrt{d_k}} \right) V'),
    ('paragraph', 'Each row of the softmax is a set of weights. Token $i$ gives token $j$ the weight'),
    ('display', r'\alpha_{ij} = \frac{\exp\left( q_i^\top k_j / \sqrt{d_k} \right)}'
                r'{\sum_{l=1}^{n} \exp\left( q_i^\top k_l / \sqrt{d_k} \right)}'),
    ('paragraph', r'With $h$ heads, each $\mathrm{head}_i = \mathrm{Attention}(Q W_i^Q, K W_i^K, V W_i^V)$ '
                  r'attends in its own subspace, and the layer joins them:'),
    ('display', r'\mathrm{MultiHead}(Q, K, V) = \mathrm{Concat}(\mathrm{head}_1, \dots, \mathrm{head}_h)\, W^O'),
    ('list', [r'The output for token $i$ is the weighted mean $\sum_{j} \alpha_{ij} v_j$ of the values.',
              r'The factor $\sqrt{d_k}$ keeps the dot products small, so the softmax does not saturate.',
              r'A layer costs $O(n^2 d)$ for a sequence of $n$ tokens.']),
]


# Pictures from the plugin's renderer.

@dataclass(frozen=True)
class Picture:
    path: Path
    cols: int
    rows: int


def typeset(tex: str, mode: str) -> Picture:
    body = f'\\({tex}\\)' if mode == 'inline' else f'\\[ {tex} \\]'
    stem = hashlib.sha1(f'{FOREGROUND_HEX}\n{mode}\n{body}'.encode()).hexdigest()[:16]
    ran = subprocess.run(['bash', str(HERE.parent / 'bin' / 'render.sh'), str(BUILD / 'eq'), stem, FOREGROUND_HEX, mode],
                         input=body, capture_output=True, text=True, env={**os.environ, 'LATEX_MATH_RESOLUTION': RESOLUTION})
    if ran.returncode != 0:
        sys.exit(f'latex refused {tex!r}: {ran.stderr.strip()}')
    cols, rows = map(int, ran.stdout.split())
    return Picture(BUILD / 'eq' / f'{stem}.png', cols, rows)


# Layout: what the plugin's ui.render hook draws, on a grid of cells.

@dataclass
class Word:
    text: str
    space: bool


@dataclass
class Math:
    picture: Picture
    space: bool


def tokens(text: str) -> list:
    out = []
    for match in re.finditer(r'\$[^$]+\$|[^\s$]+|\s+', text):
        piece = match.group()
        if piece.isspace():
            if out:
                out[-1].space = True
        elif piece.startswith('$'):
            out.append(Math(typeset(piece[1:-1], 'inline'), False))
        else:
            out.append(Word(piece, False))
    return out


def width(token) -> int:
    return len(token.text) if isinstance(token, Word) else token.picture.cols


def wrap(items: list, avail: int) -> list:
    """Lines of (column, token), as Yoga wraps a row of boxes with a one-cell right margin after a space."""
    lines, line, x = [], [], 0
    for token in items:
        outer = width(token) + (1 if token.space else 0)
        if line and x + outer > avail:
            lines.append(line)
            line, x = [], 0
        line.append((x, token))
        x += outer
    if line:
        lines.append(line)
    return lines


@dataclass
class Tile:
    image: Image.Image
    col: int
    row: int
    start: float = 0.0
    duration: float = 0.0
    reveal: str = 'cut'
    dy: int = 0  # extra downward offset in scene pixels, for pictures centred in their cells

    @property
    def end(self) -> float:
        return self.start + self.duration


def glyphs(draw: ImageDraw.ImageDraw, col: int, text: str, colour) -> None:
    for i, ch in enumerate(text):
        x = (col + i) * CW
        if ch in FALLBACK_CHARS:
            draw.text((x + CW / 2, BASELINE), ch, font=FALLBACK, fill=colour, anchor='ms')
        else:
            draw.text((x, BASELINE), ch, font=FONT, fill=colour, anchor='ls')


def text_row(spans: list, cols: int = COLS, fill=None) -> Image.Image:
    image = Image.new('RGBA', (cols * CW, CH), fill + (255,) if fill else (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for col, text, colour in spans:
        glyphs(draw, col, text, colour)
    return image


def flow_row(line: list, cols: int) -> Image.Image:
    image = Image.new('RGBA', (cols * CW, CH), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for col, token in line:
        if isinstance(token, Word):
            glyphs(draw, col, token.text, TEXT)
        else:
            picture = Image.open(token.picture.path).convert('RGBA')
            image.alpha_composite(picture, (col * CW, (CH - PICTURE_CELL_H) // 2))
    return image


@dataclass
class Layout:
    tiles: list
    displays: list    # (tile, picture) of each display formula
    rows: int         # transcript rows the reply ends at, the "done" line excluded
    list_rows: tuple  # first and last row of the list


def layout() -> Layout:
    tiles, displays = [], []
    tiles.append(Tile(text_row([(0, '❯', DIM), (2, PROMPT, WHITE)], fill=USER_BAR), 0, 0))
    row = 2
    first_list = last_list = row
    for index, (kind, content) in enumerate(REPLY):
        if index:
            row += 1
        if kind == 'paragraph':
            for i, line in enumerate(wrap(tokens(content), COLS - 2)):
                image = flow_row(line, COLS - 2)
                if index == 0 and i == 0:
                    bullet = text_row([(0, '●', WHITE)], cols=COLS)
                    bullet.alpha_composite(image, (2 * CW, 0))
                    tiles.append(Tile(bullet, 0, row))
                else:
                    tiles.append(Tile(image, 2, row))
                row += 1
        elif kind == 'display':
            picture = typeset(content, 'display')
            tile = Tile(Image.open(picture.path).convert('RGBA'), 2, row,
                        dy=picture.rows * (CH - PICTURE_CELL_H) // 2)
            tiles.append(tile)
            displays.append((tile, picture))
            row += picture.rows
        else:
            first_list = row
            for item in content:
                for i, line in enumerate(wrap(tokens(item), COLS - 4)):
                    image = text_row([(0, '-', TEXT)], cols=COLS - 2) if i == 0 else text_row([], cols=COLS - 2)
                    image.alpha_composite(flow_row(line, COLS - 4), (2 * CW, 0))
                    tiles.append(Tile(image, 2, row))
                    row += 1
            last_list = row - 1
    return Layout(tiles, displays, row, (first_list, last_list))


# The scene: background, window, terminal grid.

PAD_X, PAD_TOP, PAD_BOTTOM = 92, 80, 64


@dataclass
class Scene:
    rows: int
    prompt_row: int
    width: int
    height: int
    window: tuple  # left, top, right, bottom

    def x(self, col: float) -> float:
        return self.window[0] + PAD_X + col * CW

    def y(self, row: float) -> float:
        return self.window[1] + PAD_TOP + row * CH


def make_scene(transcript_rows: int) -> Scene:
    """The scene is the terminal and nothing around it: its padding, then the grid of cells."""
    done_row = transcript_rows + 1
    prompt_row = done_row + 3  # done line, blank, rule, prompt
    rows = prompt_row + 3      # rule, hint, and one spare row the hint leaves under itself
    width = COLS * CW + 2 * PAD_X
    height = rows * CH + PAD_TOP + PAD_BOTTOM
    return Scene(rows, prompt_row, width, height, (0, 0, width, height))


def base_image(scene: Scene) -> Image.Image:
    return Image.new('RGBA', (scene.width, scene.height), BG + (255,))


def prompt_box(typed: str, cursor: bool) -> Image.Image:
    """The prompt box, four rows from its top rule to the hint under it."""
    image = Image.new('RGBA', (COLS * CW, 4 * CH), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for row in (0, 2):
        y = round(row * CH + CH / 2)
        draw.rectangle((0, y - 1, COLS * CW - 1, y + 1), fill=RULE + (255,))
    image.alpha_composite(text_row([(0, '❯', DIM), (2, typed, TEXT)]), (0, CH))
    image.alpha_composite(text_row([(2, '? for shortcuts', DIM)]), (0, 3 * CH))
    if cursor:
        draw.rectangle(((2 + len(typed)) * CW, CH + 4, (3 + len(typed)) * CW - 1, 2 * CH - 4), fill=TEXT + (255,))
    return image


def tile_rows(tile: Tile) -> int:
    return max(1, round(tile.image.height / PICTURE_CELL_H))


def status_row(lay: Layout, t: float) -> int:
    """The row of the spinner, and of the line that replaces it when the turn ends."""
    head = max((tile.row + tile_rows(tile) for tile in lay.tiles if t >= tile.start), default=0)
    return head + 1


def prompt_row(lay: Layout, timeline, t: float) -> int:
    """The prompt box sits under the conversation, below a blank row; before the first message it is at the top."""
    return 1 if t < timeline.enter else status_row(lay, t) + 3


# Time: what appears when, and where the camera looks.

def smootherstep(u: float) -> float:
    u = min(1.0, max(0.0, u))
    return u * u * u * (u * (u * 6 - 15) + 10)


@dataclass
class Timeline:
    keys: list      # (time, typed text) while the prompt is typed
    enter: float
    done: float
    length: float
    crossfade: float
    moves: list     # (start, end, view before, view after); a view maps a time to (cx, cy, vw)


def build_timeline(scene: Scene, lay: Layout) -> Timeline:
    rng = random.Random(11)
    t = 1.0  # the empty prompt's cursor blinks first
    keys = []
    for i in range(len(PROMPT)):
        t += 0.026 + rng.random() * 0.032 + (0.025 if PROMPT[i] == ' ' else 0)
        keys.append((t, PROMPT[:i + 1]))
    enter = t + 0.35

    # The reply reveals tile by tile; a display formula fades in and stays a moment.
    lay.tiles[0].start = enter
    t = enter + 1.0
    displays = {id(tile) for tile, _ in lay.displays}
    for tile in lay.tiles[1:]:
        if id(tile) in displays:
            tile.start, tile.duration, tile.reveal = t, 0.5, 'fade'
            t += 0.5 + 0.55
        else:
            tile.start, tile.duration, tile.reveal = t, 0.16 + 0.0032 * tile.image.width / CW, 'wipe'
            t += tile.duration * 0.8
    done = t + 0.3

    def prompt_view(vw_cols, row):
        vw = vw_cols * CW
        return lambda t: (scene.x(-2.4) + vw / 2, scene.y(row + 1.2) + CH / 2, vw)

    def typing_view(t):
        u = smootherstep(t / enter)
        return prompt_view(44 + (40 - 44) * u, 1)(t)

    follow = follow_view(scene, lay, enter, done + 1.0)
    # After the reply, the view glides back to its top at the same zoom, past every formula.
    top = lambda t: (scene.width / 2, scene.width * 9 / 32, scene.width)

    moves = [
        (0.0, enter, typing_view, typing_view),
        (enter, enter + 0.9, prompt_view(40, 1), follow),
        (enter + 0.9, done + 1.0, follow, follow),
        (done + 1.0, done + 3.6, follow, top),
        (done + 3.6, done + 4.5, top, top),
    ]
    crossfade = 0.6
    return Timeline(keys, enter, done, done + 4.5 + crossfade, crossfade, moves)


def follow_view(scene: Scene, lay: Layout, start: float, end: float):
    """One fixed zoom that glides down with the reply: the newest line sits about 62% down the view.
    A critically damped spring carries the view, so a formula that adds several rows at once eases in."""
    vw = scene.width  # the whole width of the terminal
    vh = vw * 9 / 16
    cx = scene.width / 2
    highest = vh / 2
    lowest = scene.height - vh / 2

    def target(t):
        return min(max(scene.y(status_row(lay, t) + 1) - 0.12 * vh, highest), lowest)

    dt, omega = 0.005, 5.5
    y, v = target(start), 0.0
    path = []
    steps = int((end - start) / dt) + 2
    for n in range(steps):
        path.append(y)
        a = omega * omega * (target(start + n * dt) - y) - 2 * omega * v
        v += a * dt
        y += v * dt

    def view(t):
        i = min(max((t - start) / dt, 0), steps - 1.001)
        k = int(i)
        return cx, path[k] + (path[k + 1] - path[k]) * (i - k), vw

    return view


def camera(timeline: Timeline, scene: Scene, t: float):
    for begin, end, before, after in timeline.moves:
        if t < end or (begin, end) == timeline.moves[-1][:2]:
            break
    u = smootherstep((t - begin) / (end - begin)) if end > begin else 1.0
    ax, ay, aw = before(t)
    bx, by, bw = after(t)
    vw = math.exp(math.log(aw) + (math.log(bw) - math.log(aw)) * u)
    cx = ax + (bx - ax) * u
    cy = ay + (by - ay) * u
    vh = vw * 9 / 16
    x0 = min(max(cx - vw / 2, 0), scene.width - vw)
    y0 = min(max(cy - vh / 2, 0), scene.height - vh)
    return x0, y0, vw, vh


# Drawing one frame.

def with_alpha(image: Image.Image, factor: float) -> Image.Image:
    out = image.copy()
    out.putalpha(image.getchannel('A').point(lambda v: round(v * factor)))
    return out


def wiped(image: Image.Image, progress: float) -> Image.Image:
    """The tile shown up to a soft edge that moves from left to right."""
    w, h = image.size
    soft = 3 * CW
    edge = -soft + (w + soft) * progress
    mask = Image.new('L', (w, h), 0)
    if edge > 0:
        mask.paste(255, (0, 0, min(w, round(edge)), h))
    ramp = Image.linear_gradient('L').rotate(90, expand=True).transpose(Image.FLIP_LEFT_RIGHT).resize((soft, h))
    mask.paste(ramp, (round(edge), 0))
    out = image.copy()
    out.putalpha(ImageChops.multiply(image.getchannel('A'), mask))
    return out


SPINNER = ['·', '✢', '*', '✶', '✻', '✽', '✻', '✶', '*', '✢']


def spinner_tile(t: float) -> Image.Image:
    glyph = SPINNER[int(t / 0.11) % len(SPINNER)]
    word = 'Thinking…'
    image = text_row([(0, glyph, CLAUDE)], cols=12)
    draw = ImageDraw.Draw(image)
    sweep = (t * 9) % (len(word) + 8) - 4
    for i, ch in enumerate(word):
        k = max(0.0, 1 - abs(i - sweep) / 2.5)
        colour = tuple(round(a + (b - a) * k) for a, b in zip(CLAUDE, CLAUDE_LIGHT))
        glyphs(draw, 2 + i, ch, colour)
    return image


def cursor_on(timeline: Timeline, t: float) -> bool:
    typing = timeline.keys[0][0] - 0.1 <= t <= timeline.keys[-1][0] + 0.25
    near_loop = t < 0.5 or t > timeline.length - timeline.crossfade - 0.7
    return typing or near_loop or (t % 1.06) < 0.53


class Renderer:
    def __init__(self, scene: Scene, lay: Layout, timeline: Timeline, size):
        self.scene, self.lay, self.timeline, self.size = scene, lay, timeline, size
        self.canvas = base_image(scene)
        self.baked = set()

    def place(self, tile: Tile):
        return round(self.scene.x(tile.col)), round(self.scene.y(tile.row)) + tile.dy

    def frame(self, t: float) -> Image.Image:
        scene, timeline = self.scene, self.timeline
        for index, tile in enumerate(self.lay.tiles):
            if index not in self.baked and t >= tile.end and t >= tile.start:
                self.canvas.alpha_composite(tile.image, self.place(tile))
                self.baked.add(index)

        x0, y0, vw, vh = camera(timeline, scene, t)
        box = (max(0, math.floor(x0)), max(0, math.floor(y0)),
               min(scene.width, math.ceil(x0 + vw)), min(scene.height, math.ceil(y0 + vh)))
        region = self.canvas.crop(box)

        def put(image, x, y):
            region.alpha_composite(image, (x - box[0], y - box[1]))

        for index, tile in enumerate(self.lay.tiles):
            if index in self.baked or t < tile.start:
                continue
            u = (t - tile.start) / tile.duration
            x, y = self.place(tile)
            if tile.reveal == 'wipe':
                put(wiped(tile.image, u), x, y)
            else:
                k = smootherstep(u)
                put(with_alpha(tile.image, k), x, y + round((1 - k) * 0.35 * CH))

        status = status_row(self.lay, t)
        if timeline.enter <= t < timeline.done:
            put(spinner_tile(t), round(scene.x(0)), round(scene.y(status)))
        elif t >= timeline.done:
            put(text_row([(0, '*', DIM), (2, 'Cooked for 6s', DIM)], cols=20),
                round(scene.x(0)), round(scene.y(status)))

        typed = ''
        for when, text in timeline.keys:
            if when <= t < timeline.enter:
                typed = text
        row = prompt_row(self.lay, timeline, t)
        put(prompt_box(typed, cursor_on(timeline, t)), round(scene.x(0)), round(scene.y(row - 1)))

        return region.convert('RGB').resize(
            self.size, Image.LANCZOS, box=(x0 - box[0], y0 - box[1], x0 - box[0] + vw, y0 - box[1] + vh),
            reducing_gap=2.0)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--stills', help='comma-separated times to save as PNG instead of a video')
    parser.add_argument('--fps', type=int, default=50)
    parser.add_argument('--size', default='1920x1080')
    args = parser.parse_args()
    size = tuple(map(int, args.size.split('x')))

    lay = layout()
    scene = make_scene(lay.rows)
    timeline = build_timeline(scene, lay)
    print(f'scene {scene.width}x{scene.height}, {scene.rows} rows, length {timeline.length:.2f}s, '
          f'enter {timeline.enter:.2f}s, done {timeline.done:.2f}s', file=sys.stderr)
    renderer = Renderer(scene, lay, timeline, size)

    if args.stills:
        for t in sorted(float(v) for v in args.stills.split(',')):
            renderer.frame(t).save(BUILD / f'still-{t:05.2f}.png')
        return

    first = renderer.frame(0.0)
    frames = round(timeline.length * args.fps)
    ffmpeg = subprocess.Popen(
        ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{size[0]}x{size[1]}',
         '-r', str(args.fps), '-i', '-', '-c:v', 'ffv1', '-level', '3', str(BUILD / 'master.mkv')],
        stdin=subprocess.PIPE)
    fade_from = timeline.length - timeline.crossfade
    for n in range(frames):
        t = n / args.fps
        image = first if n == 0 else renderer.frame(t)
        if t > fade_from:
            image = Image.blend(image, first, smootherstep((t - fade_from) / timeline.crossfade))
        ffmpeg.stdin.write(image.tobytes())
        if n % 100 == 0:
            print(f'frame {n}/{frames}', file=sys.stderr)
    ffmpeg.stdin.close()
    sys.exit(ffmpeg.wait())


if __name__ == '__main__':
    main()
