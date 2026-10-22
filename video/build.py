# HireFlow YouTube videos (from the LaunchSweeps pipeline): frames + camera + captions + voice -> finished MP4 (1920x1080, 30 fps).
#   python3 video/build.py <work> <out.mp4>
# Camera: eases in on whatever the film circled (never past maxZoom) and back out when the ring goes.
# Captions: one short phrase per step, popped in at the bottom (the hook question sits higher and bigger).
# Then each spoken line is laid at the moment its step started; the quiet after each line is printed.
import json, os, subprocess, sys
from bisect import bisect_right
from PIL import Image

work, out = sys.argv[1], sys.argv[2]
music = sys.argv[3] if len(sys.argv) > 3 else None  # optional background track (looped, quiet, dips under the voice)
tl = json.load(open(f'{work}/timeline.json'))
dur = json.load(open(f'{work}/clips/durations.json'))
t0, t1 = tl['filmStart'], tl['filmEnd']
frames = tl['frames']
# TALL=1: the upright phone version (1080x1920), filmed with TALL=1 node video/film.mjs
W, H, FPS = (1080, 1920, 30) if os.environ.get('TALL') else (1920, 1080, 30)
MAXZ = tl.get('maxZoom', 1.5)
MOVE = 0.7  # seconds for every camera move

def ff(*a): subprocess.run(['ffmpeg', '-y', '-v', 'error', *a], check=True)
def ease(x): return 4 * x * x * x if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2

# --- camera targets: (time, cx, cy, z) -----------------------------------------------------------
def target(ev):
    if not ev['rect']:
        return (W / 2, H / 2, 1.0)
    x, y, w, h = ev['rect']
    # generous room around the subject so nothing (a wheel's pointer, a card's edge) is ever cut off
    z = ev.get('zoom') or min(MAXZ, 0.70 * W / max(w, 1), 0.62 * H / max(h, 1))
    z = max(1.0, min(MAXZ, z))
    return (x + w / 2, y + h / 2, z)

cams = [((e['at'] - t0) / 1000, *target(e)) for e in tl.get('cams', [])]
def cam_at(t):
    state, prev, since = (W / 2, H / 2, 1.0), (W / 2, H / 2, 1.0), -99
    for (at, cx, cy, z) in cams:
        if at > t:
            break
        # where the camera actually was when this move started
        p = (prev[0] + (state[0] - prev[0]) * ease(min(1, (at - since) / MOVE)),
             prev[1] + (state[1] - prev[1]) * ease(min(1, (at - since) / MOVE)),
             prev[2] + (state[2] - prev[2]) * ease(min(1, (at - since) / MOVE)))
        prev, state, since = p, (cx, cy, z), at
    k = ease(min(1, max(0, (t - since) / MOVE)))
    cx = prev[0] + (state[0] - prev[0]) * k
    cy = prev[1] + (state[1] - prev[1]) * k
    z = prev[2] + (state[2] - prev[2]) * k
    vw, vh = W / z, H / z
    left = min(max(cx - vw / 2, 0), W - vw)
    top = min(max(cy - vh / 2, 0), H - vh)
    return (left, top, left + vw, top + vh)

# --- captions --------------------------------------------------------------------------------------
caps = []
for c in tl.get('caps', []):
    pth = f"{work}/caps/{c['key']}.png"
    # a step with no caption (the end card) clears the one before it
    caps.append(((c['at'] - t0) / 1000, c['key'], Image.open(pth).convert('RGBA') if os.path.exists(pth) else None))
cap_times = [c[0] for c in caps]

def caption(img, t):
    i = bisect_right(cap_times, t) - 1
    if i < 0:
        return
    at, key, pic = caps[i]
    if pic is None:
        return
    nxt = cap_times[i + 1] if i + 1 < len(caps) else 1e9
    age = t - at
    if key != 'opening' and nxt - t < 0.12:  # quick fade just before the next one
        return
    if key == 'opening' and age > (dur.get('opening', 3) + 0.6):
        return
    k = min(1, age / 0.18)
    s = 0.86 + 0.14 * ease(k)
    pw, ph = int(pic.width * s), int(pic.height * s)
    p = pic.resize((pw, ph), Image.BICUBIC) if s < 0.999 else pic
    if k < 1:
        a = p.getchannel('A').point(lambda v: int(v * k))
        p = p.copy(); p.putalpha(a)
    x = (W - pw) // 2
    y = H - ph - 28  # every caption at the bottom: the opening question used to sit on top of the page's own heading
    img.alpha_composite(p, (x, y))

# --- frames ---------------------------------------------------------------------------------------
cache = {}
def src(i):
    if i not in cache:
        if len(cache) > 6:
            cache.clear()
        cache[i] = Image.open(f'{work}/frames/f{i:05d}.jpg').convert('RGB')
    return cache[i]

silent = f'{work}/silent.mp4'
enc = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                        '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', silent], stdin=subprocess.PIPE)
n = int((t1 - t0) / 1000 * FPS)
for f in range(n):
    t = f / FPS
    i = max(0, bisect_right(frames, t0 + t * 1000) - 1)
    base = src(i)
    if base.size != (W, H):
        base = base.resize((W, H), Image.BICUBIC)
    box = cam_at(t)
    frame = base if box == (0, 0, W, H) or abs(box[2] - box[0] - W) < 0.5 else base.resize((W, H), Image.BICUBIC, box=box)
    frame = frame.convert('RGBA')
    caption(frame, t)
    enc.stdin.write(frame.convert('RGB').tobytes())
enc.stdin.close(); enc.wait()

# --- voice ----------------------------------------------------------------------------------------
voice = tl['voice']
inputs, filters = [], []
for i, v in enumerate(voice):
    at = (v['at'] - t0) / 1000
    nxt = (voice[i + 1]['at'] - t0) / 1000 if i + 1 < len(voice) else (t1 - t0) / 1000
    gap = nxt - at - dur[v['key']]
    print(f"{at:6.1f}s  said {dur[v['key']]:4.1f}s  then {gap:4.1f}s quiet  {v['key']}" + ('   <-- RUNS INTO NEXT' if gap < 0.15 else ''))
    inputs += ['-i', f"{work}/clips/{v['key']}.wav"]
    d = int(at * 1000)
    filters.append(f'[{i + 1}:a]aresample=48000,adelay={d}|{d}[a{i}]')
L = (t1 - t0) / 1000
vmix = ''.join(f'[a{i}]' for i in range(len(voice))) + f'amix=inputs={len(voice)}:normalize=0:dropout_transition=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad,atrim=0:{L:.3f}'
if not music:
    ff('-i', silent, *inputs, '-filter_complex', ';'.join(filters) + ';' + vmix + '[out]',
       '-map', '0:v', '-map', '[out]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out)
else:
    # 1. loop the track to the film's length with smooth 1.5 s crossfades at each seam
    one = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', music]).decode())
    X = 1.5
    k = max(1, int((L + X) // (one - X)) + 1)
    bed = f'{work}/music-bed.wav'
    ins = sum([['-i', music] for _ in range(k)], [])
    chain = '[0:a]aresample=48000[m0];' + ''.join(f'[{j}:a]aresample=48000[r{j}];' for j in range(1, k))
    last = 'm0'
    for j in range(1, k):
        chain += f'[{last}][r{j}]acrossfade=d={X}:c1=tri:c2=tri[m{j}];'
        last = f'm{j}'
    chain += f'[{last}]atrim=0:{L:.3f},afade=t=in:d=0.6,afade=t=out:st={max(0, L - 1.8):.3f}:d=1.8,loudnorm=I=-27:TP=-6:LRA=7[bed]'
    ff(*ins, '-filter_complex', chain, '-map', '[bed]', bed)
    # 2. music behind the voice: soft top end, ducked a few dB whenever she speaks
    n = len(voice)
    mix = vmix + ',asplit=2[v][key];' + f'[{n + 1}:a]highshelf=f=3000:g=-4[m];[m][key]sidechaincompress=threshold=0.03:ratio=3:attack=30:release=500[md];' + \
          '[v][md]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.89[out]'
    ff('-i', silent, *inputs, '-i', bed, '-filter_complex', ';'.join(filters) + ';' + mix,
       '-map', '0:v', '-map', '[out]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out)
print('wrote', out, f'{(t1 - t0) / 1000:.1f}s')
