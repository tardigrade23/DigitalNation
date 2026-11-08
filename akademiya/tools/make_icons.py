"""Akademiya tətbiq ikonlarını yaradır: python3 akademiya/tools/make_icons.py"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'icons')
FONT = '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf'
BG, FG, DOT = (14, 107, 98), (255, 255, 255), (231, 178, 74)
os.makedirs(OUT, exist_ok=True)


def icon(size, maskable=False, radius=0.22):
    s = size * 4  # supersample
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, s, s], fill=BG)
        scale = 0.62  # keep the mark inside the maskable safe zone
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * radius), fill=BG)
        scale = 0.78
    font = ImageFont.truetype(FONT, int(s * 0.62 * scale))
    box = d.textbbox((0, 0), 'A', font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    x, y = (s - w) / 2 - box[0], (s - h) / 2 - box[1] - s * 0.03 * scale
    d.text((x, y), 'A', font=font, fill=FG)
    # three dots of “∴” under the letter: the course's first mark
    r = s * 0.035 * scale
    cy = (s + h) / 2 + s * 0.07 * scale
    for dx, dy in ((0, -1), (-1, 1), (1, 1)):
        cx = s / 2 + dx * s * 0.06 * scale
        yy = cy + dy * s * 0.035 * scale
        d.ellipse([cx - r, yy - r, cx + r, yy + r], fill=DOT)
    return img.resize((size, size), Image.LANCZOS)


icon(192).save(os.path.join(OUT, 'icon-192.png'))
icon(512).save(os.path.join(OUT, 'icon-512.png'))
icon(512, maskable=True).save(os.path.join(OUT, 'icon-maskable-512.png'))
icon(180, maskable=True).convert('RGB').save(os.path.join(OUT, 'apple-touch-icon.png'))
icon(64).save(os.path.join(OUT, 'favicon-64.png'))
print('ok')
