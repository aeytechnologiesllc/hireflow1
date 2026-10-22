"""
HIREFLOW VIDEO MUSIC, made in code (copied from Zulu Royal's guide-film music maker; no licence, no service).
Two HireFlow beds, so the owner can pick by ear: HF_MUSIC=A (night: slower, deeper) or HF_MUSIC=B (morning: lighter).

Zulu Royal's original notes:
THE GUIDE FILMS' BACKGROUND MUSIC (docs/STAFF_VIDEO_GUIDES.md).

The Admin, 2026-10-19: "we should have some kind of a background music starting now on all the guides ... It just
sounds too boring when it's nobody saying anything." No music service is on this account (Higgsfield's audio is
speech only), and a downloaded track brings a licence with it, so the bed is made here, by code: a slow warm chord
loop (soft keys, a pad, a quiet bass, a light pulse). Same seed, same music, so every guide sounds like one series.

  python3 scripts/guide-video/make-music.py <seconds> <out.wav>
  python3 scripts/guide-video/make-music.py lay <film.mp4> <out.mp4>   # makes the bed and lays it under the voice

`lay` ducks the music under the voice (sidechain), so it fills the quiet gaps and gets out of the way when the guide
speaks, then sets the whole film to -16 LUFS, the level the Autoload film was released at.
"""
import subprocess, sys, tempfile, wave, os
import numpy as np

SR = 44100
BPM = 98
BEAT = 60 / BPM
BAR = BEAT * 4

VARIANT = os.environ.get("HF_MUSIC", "A")
if VARIANT == "B":
    # morning: Fmaj9 - Dm9 - Bbmaj9 - C6/9, a little quicker and brighter
    BPM = 96
    CHORDS = [(41, [65, 69, 72, 76, 79]), (38, [62, 65, 69, 72, 76]), (34, [62, 65, 69, 70, 74]), (36, [64, 67, 69, 72, 74])]
else:
    # night: Dmaj9 - Bm9 - Gmaj9 - A6/9, slower and deeper
    BPM = 84
    CHORDS = [(38, [62, 66, 69, 73, 76]), (35, [59, 62, 66, 69, 73]), (31, [59, 62, 66, 67, 71]), (33, [61, 64, 66, 69, 71])]
BEAT = 60 / BPM
BAR = BEAT * 4


def hz(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def env(n, a, d):
    t = np.arange(n) / SR
    e = np.minimum(1.0, t / max(a, 1e-4)) * np.exp(-t / d)
    return e


def keys(note, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(note)
    # soft electric-piano: a sine with a little 2nd harmonic and a bell partial that dies fast
    s = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(4 * np.pi * f * t) * np.exp(-t / 0.4) + 0.06 * np.sin(2 * np.pi * f * 3.5 * t) * np.exp(-t / 0.12)
    return s * env(n, 0.006, 1.1)


def pad(notes, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for note in notes:
        for det in (-0.12, 0.0, 0.11):
            f = hz(note + det)
            s += np.sin(2 * np.pi * f * t + det * 7)
    s /= len(notes) * 3
    a = np.minimum(1.0, t / 0.9) * np.minimum(1.0, (dur - t) / 0.9)
    return s * np.clip(a, 0, 1)


def bass(note, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * hz(note) * t) * env(n, 0.02, 1.6)


def pulse(dur):
    # a soft felt thump on 1 and 3: a falling sine, no click
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 55 + 60 * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.18)


def reverb(x, seconds=2.2, seed=7):
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR / (seconds / 5))
    ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return y


def make(seconds):
    total = int(seconds * SR) + SR
    L = np.zeros(total)
    R = np.zeros(total)
    rng = np.random.default_rng(11)

    def put(buf, start, sig, gain):
        i = int(start * SR)
        j = min(total, i + len(sig))
        if i < total:
            buf[i:j] += sig[: j - i] * gain

    bar = 0
    t0 = 0.0
    # a short arpeggio shape per bar, varied a little by bar so the loop does not tick like a clock
    shapes = [[0, 2, 1, 3, 2, 4, 3, 2], [0, 1, 2, 4, 3, 2, 1, 2], [1, 2, 3, 4, 3, 1, 2, 0], [0, 2, 3, 2, 4, 2, 1, 3]]
    while t0 < seconds:
        root, notes = CHORDS[bar % 4]
        p = pad(notes, BAR + 1.2)
        put(L, t0, p, 0.22)
        put(R, t0, p, 0.22)
        b = bass(root, BAR * 0.95)
        put(L, t0, b, 0.30)
        put(R, t0, b, 0.30)
        for k in (0, 2):
            th = pulse(0.6)
            put(L, t0 + k * BEAT, th, 0.20)
            put(R, t0 + k * BEAT, th, 0.20)
        shape = shapes[(bar // 4) % len(shapes)]
        for i, idx in enumerate(shape):
            if bar % 8 == 7 and i >= 6:
                continue  # breathe at the end of each phrase
            note = notes[idx] + 12
            when = t0 + i * BEAT / 2 + rng.uniform(0, 0.012)
            vel = 0.10 if i % 2 else 0.14
            k = keys(note, 1.6)
            pan = 0.35 + 0.3 * (idx / 4)
            put(L, when, k, vel * (1 - pan) * 2)
            put(R, when, k, vel * pan * 2)
        bar += 1
        t0 += BAR

    L = 0.78 * L + 0.32 * reverb(L, seed=7)
    R = 0.78 * R + 0.32 * reverb(R, seed=8)
    out = np.stack([L, R], axis=1)[: int(seconds * SR)]
    n = len(out)
    fade_in = np.minimum(1.0, np.arange(n) / SR / 1.5)
    fade_out = np.minimum(1.0, (n - np.arange(n)) / SR / 3.0)
    out *= (fade_in * fade_out)[:, None]
    out /= max(1e-9, np.max(np.abs(out))) / 0.89
    return out


def write(path, data):
    pcm = (np.clip(data, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def duration(path):
    out = subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path])
    return float(out.strip())


def lay(film, out):
    seconds = duration(film)
    with tempfile.TemporaryDirectory() as tmp:
        bed = os.path.join(tmp, 'bed.wav')
        write(bed, make(seconds))
        graph = (
            '[0:a]aresample=44100,aformat=channel_layouts=stereo,asplit=2[voice][key];'
            '[1:a]volume=-10dB[music];'
            '[music][key]sidechaincompress=threshold=0.03:ratio=2.5:attack=60:release=500:makeup=1[ducked];'
            '[voice][ducked]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]'
        )
        subprocess.check_call(['ffmpeg', '-loglevel', 'error', '-y', '-i', film, '-i', bed, '-filter_complex', graph,
                               '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', out])


if __name__ == '__main__':
    if len(sys.argv) == 4 and sys.argv[1] == 'lay':
        lay(sys.argv[2], sys.argv[3])
    elif len(sys.argv) == 3:
        write(sys.argv[2], make(float(sys.argv[1])))
    else:
        sys.exit(__doc__)
