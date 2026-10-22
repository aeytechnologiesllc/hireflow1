# HireFlow YouTube videos: speak every line FIRST and measure it (the voice sets the pace).
# Same free voice as the Zulu Royal guides (Kokoro af_heart, ~/.zulu-guide-voice), never the Mac `say`.
#   ~/.zulu-guide-voice/venv/bin/python video/voice.py video/scripts/<name>.json <work>/clips
import json, os, subprocess, sys
HOME = os.path.expanduser('~/.zulu-guide-voice')
os.environ['ESPEAK_DATA_PATH'] = HOME + '/ek'

def ff(*a): subprocess.run(['ffmpeg', '-y', '-v', 'error', *a], check=True)
def length(p): return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).decode().strip())

script_file, work = sys.argv[1], sys.argv[2]
script = json.load(open(script_file))
os.makedirs(work, exist_ok=True)
import soundfile as sf
from kokoro_onnx import Kokoro
k = Kokoro(f'{HOME}/kokoro-v1.0.onnx', f'{HOME}/voices-v1.0.bin')
lines = [('opening', script['opening'])] + [(s['id'], s['line']) for s in script['steps']] + [('closing', script['closing'])]
dur = {}
for key, text in lines:
    samples, rate = k.create(text, voice=script.get('voice', 'af_heart'), speed=script.get('speed', 1.05), lang='en-us')
    raw, clip = f'{work}/{key}.raw.wav', f'{work}/{key}.wav'
    sf.write(raw, samples, rate)
    ff('-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse', clip)
    os.remove(raw)
    dur[key] = round(length(clip), 3)
    print(f'{dur[key]:5.2f}s  {key}: {text}')
json.dump(dur, open(f'{work}/durations.json', 'w'), indent=1)
print('total speech', round(sum(dur.values()), 1), 's')
