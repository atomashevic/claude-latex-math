#!/usr/bin/env python3
"""Draws the plugin's icon: one formula typeset by LaTeX, in the mint of the demo, over a dark square,
with a terminal prompt in the corner.

usage: make_icon.py <out.png> [--formula TEX] [--size PX]
"""
import argparse
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

TEXT = (205, 242, 227)
ACCENT = (93, 255, 176)
INNER, OUTER = (18, 44, 37), (4, 10, 9)


def typeset(tex: str, height: int) -> Image.Image:
    """The formula as a mint glyph on a transparent background, scaled to `height` pixels."""
    with tempfile.TemporaryDirectory() as work:
        Path(work, 'f.tex').write_text(
            '\\documentclass{article}\\usepackage{amsmath,amssymb}\\pagestyle{empty}\\begin{document}'
            f'$\\displaystyle {tex}$\\end{{document}}\n')
        subprocess.run(['latex', '-interaction=nonstopmode', '-halt-on-error', 'f.tex'], cwd=work,
                       check=True, capture_output=True)
        subprocess.run(['dvipng', '-q', '-D', '3000', '-T', 'tight', '--truecolor', '-bg', 'Transparent',
                        '-fg', 'rgb %.3f %.3f %.3f' % tuple(c / 255 for c in TEXT), '-o', 'f.png', 'f.dvi'],
                       cwd=work, check=True, capture_output=True)
        glyph = Image.open(Path(work, 'f.png')).convert('RGBA')
    glyph = glyph.crop(glyph.getbbox())
    return glyph.resize((round(glyph.width * height / glyph.height), height), Image.LANCZOS)


def background(size: int) -> Image.Image:
    radial = Image.radial_gradient('L').resize((size, size), Image.BICUBIC)
    channels = [radial.point(lambda v, a=a, b=b: round(a + (b - a) * min(1, v / 220))) for a, b in zip(INNER, OUTER)]
    return Image.merge('RGB', channels).convert('RGBA')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('out')
    parser.add_argument('--formula', default='\\sum')
    parser.add_argument('--size', type=int, default=1024)
    args = parser.parse_args()
    size = args.size

    icon = background(size)
    glyph = typeset(args.formula, round(size * 0.56))
    if glyph.width > size * 0.74:
        glyph = glyph.resize((round(size * 0.74), round(glyph.height * size * 0.74 / glyph.width)), Image.LANCZOS)
    icon.alpha_composite(glyph, ((size - glyph.width) // 2, round(size * 0.44 - glyph.height / 2)))

    # The prompt and a block cursor, as Claude Code draws them, under the formula.
    font = ImageFont.truetype('/usr/share/fonts/TTF/JetBrainsMonoNerdFont-Bold.ttf', round(size * 0.13))
    draw = ImageDraw.Draw(icon)
    cell = font.getlength('M')
    x, baseline = (size - cell * 2.35) / 2, size * 0.885
    draw.text((x, baseline), '❯', font=font, fill=ACCENT + (255,), anchor='ls')
    left = x + cell * 1.45
    draw.rectangle((left, baseline - size * 0.1, left + cell * 0.9, baseline + size * 0.012), fill=TEXT + (255,))

    icon.convert('RGB').save(args.out, optimize=True)


if __name__ == '__main__':
    main()
