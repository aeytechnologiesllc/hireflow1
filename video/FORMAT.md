# HireFlow videos: the format (2026-10-21)

Copied from the LaunchSweeps pipeline (github aeytechnologiesllc/crownforge-site, `video/`), whose format the
owner approved on 2026-10-19 from its videos 4 and 5 ("your best work… future videos should follow the number four
and the number five format"). The reference builds are in `scenes/_ref/`.

## The owner's rules (2026-10-21)

- **No real people, no characters, no faces, no talking host, no lip-sync, no Higgsfield voice.** "We use animation,
  text, and make really nice video out of that."
- **The voice is "the Mac voice":** the free Kokoro voice installed on the Mac, `af_heart` at speed 1.2
  (`~/.zulu-guide-voice`, installed with Zulu Royal's `scripts/guide-video/setup-voice.sh`). Never Apple's built-in
  `say` voice (he called it "hella robotic").
- One searched question, answered in 30 to 45 seconds. The opening line is the question. 6 to 8 scenes, one 2 to 5
  second line each; every line gets its own animated picture, built in code in HireFlow's look (the landing page's
  night-to-morning world, ivory letterhead cards, Geist bold words with one gold italic accent).
- Real HireFlow screens only as pictures inside the animation; never a web page being scrolled or read. Captions
  off. No made-up numbers. Every video ends on the brand finale (hireflownow.com, "Post a job free").
- The CTA says **hireflownow.com** ("hire flow now dot com"): hireflow.com is a different company.
- The owner watches and listens to every video before it is uploaded.

## Making one

1. `scripts/NN-name.json`: `title`, `opening`, `steps` (`id` + `line`), `closing`, `finale`,
   `"scenePage": "/__scene/NN-name.html"`, `"captions": false`, `"zoom": 1`.
2. Speak and measure: `~/.zulu-guide-voice/venv/bin/python video/voice.py video/scripts/NN-name.json <work>/clips`
3. Build `scenes/NN-name.html` on `scenes/kit.css` + `scenes/kit.js`: one `<section class="scene" id="s-<id>">` per
   line plus `s-opening` and `<section class="scene finale" id="s-closing">`. Check each with `?show=<id>`.
4. Film: `node video/film.mjs video/scripts/NN-name.json <work>` (frame by frame; `TALL=1` for the upright ad).
5. `python3 video/glitch-check.py <work>`: must say none.
6. Music (two beds, the owner picks by ear): `HF_MUSIC=A|B ~/.zulu-guide-voice/venv/bin/python video/make-music.py 40 <work>/music-A.wav`
7. Build: `python3 video/build.py <work> <out.mp4> <work>/music-A.wav` (`TALL=1` for the upright ad).
8. Look at a contact sheet of every scene early and late in its line, then send it to the owner.

Video 1: `scripts/01-test-a-chat-agent.json` (YouTube, 1920x1080) and `scripts/01-test-a-chat-agent-ad.json`
(the 15-second upright ad: the opening, the HireFlow scene, the morning and the finale, same clips).
