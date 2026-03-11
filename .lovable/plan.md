

# Create Transparent Foreground Logo for Natively Launch Screen

## What
Generate a transparent PNG of just the glowing teal/emerald geometric "H" lettermark — no dark square background — so Natively can overlay it on the `#0F172A` background seamlessly.

## How

1. **Generate transparent H logo** using AI image editing (`google/gemini-3-pro-image-preview`):
   - Take the existing `public/app-icon.png` as reference
   - Prompt: recreate only the glowing geometric H with diagonal slash on a fully transparent background
   - Output as 1024x1024 PNG with alpha transparency

2. **Save as** `public/hireflow-foreground.png` — upload this to Natively's "Image" field for the loading/launch screen instead of the full app icon

3. **Keep the original `app-icon.png` unchanged** — it's still needed as the actual app icon (with the dark square)

## Result
- `app-icon.png` → used as the app icon (has dark rounded square)
- `hireflow-foreground.png` → used as the Natively launch screen foreground image (transparent, just the H logo)
- Background color stays `#0F172A` → logo floats cleanly on the dark background with no visible square

