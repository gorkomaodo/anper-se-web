"""Génère les icônes de l'application « ANPER Messagerie » (bulle de dialogue
blanche sur fond vert ANPER) : PNG 192/512, version « maskable » et .ico Windows."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
GREEN, GREEN_D, ORANGE = (0, 153, 68), (0, 90, 35), (255, 140, 0)


def draw(size, safe=1.0):
    s = size * 4  # suréchantillonnage pour des bords lisses
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if safe < 1:  # maskable : fond plein, motif réduit dans la zone sûre
        d.rectangle([0, 0, s, s], fill=GREEN)
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=GREEN)
    d.rectangle([0, int(s * 0.9), s, s], fill=GREEN_D) if safe < 1 else None
    c, k = s / 2, safe
    # bulle
    bw, bh = s * 0.62 * k, s * 0.44 * k
    x0, y0 = c - bw / 2, c - bh / 2 - s * 0.06 * k
    d.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], radius=int(bh * 0.32), fill='white')
    d.polygon([(x0 + bw * 0.22, y0 + bh - 2), (x0 + bw * 0.18, y0 + bh + s * 0.13 * k), (x0 + bw * 0.44, y0 + bh - 2)], fill='white')
    # trois points
    r = s * 0.038 * k
    for i in (-1, 0, 1):
        cx, cy = c + i * s * 0.13 * k, y0 + bh / 2
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ORANGE if i == 0 else GREEN)
    return img.resize((size, size), Image.LANCZOS)


draw(192).save(HERE / 'msg-192.png')
draw(512).save(HERE / 'msg-512.png')
draw(512, safe=0.72).save(HERE / 'msg-maskable-512.png')
draw(256).save(HERE / 'msg.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('icônes générées')
