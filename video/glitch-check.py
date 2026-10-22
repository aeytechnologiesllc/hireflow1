# Find glitches in a filmed video: a moment where the picture was MOVING and the capture skipped
# ahead (a stall), so the motion jumps. A still page also sends no frames, which is fine.
#   python3 video/glitch-check.py <work>
import json, sys
from PIL import Image, ImageChops, ImageStat
work = sys.argv[1]
tl = json.load(open(f'{work}/timeline.json')); f = tl['frames']; t0 = tl['filmStart']
def im(i): return Image.open(f'{work}/frames/f{i:05d}.jpg').convert('L').resize((480, 270))
def diff(a, b): return ImageStat.Stat(ImageChops.difference(im(a), im(b))).mean[0]
bad = []
for i in range(1, len(f) - 1):
    gap = f[i + 1] - f[i]
    if gap < 90: continue
    before = f[i] - f[i - 1]
    # moving just before (frames were arriving fast and changing) and a big change across the gap
    if before >= 40: continue
    moving, across = diff(i - 1, i), diff(i, i + 1)
    # a new page (across > 60) is a deliberate cut, not a glitch
    if moving > 0.1 and max(0.8, 3 * moving) < across < 60:
        bad.append((round((f[i] - t0) / 1000, 2), int(gap), round(across, 1)))
print(work.split('/')[-1], 'glitches:', bad if bad else 'none')

# One-frame flashes: a frame unlike BOTH neighbours while the neighbours match each other
# (the blank wheel on a world change was exactly this).
flash = []
for i in range(1, len(f) - 1):
    a, b = diff(i - 1, i), diff(i, i + 1)
    if a > 4 and b > 4 and diff(i - 1, i + 1) < min(a, b) / 3:
        flash.append(round((f[i] - t0) / 1000, 2))
print(work.split('/')[-1], 'one-frame flashes:', flash if flash else 'none')
