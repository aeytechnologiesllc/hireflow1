

# Create 1024x1024 App Icon from Reference

## What
Take the uploaded screenshot of the "H" icon (dark background, teal/emerald glowing geometric H with diagonal slash) and produce a clean 1024x1024px PNG app icon ready for Natively.

## How

1. **Use AI image editing** (`google/gemini-3-pro-image-preview`) to take the uploaded reference image and regenerate it as a clean, perfectly centered 1024x1024 app icon — removing the extra dark border/background visible in the screenshot, ensuring the rounded-square icon fills the full canvas edge-to-edge as Natively expects.

2. **Create a backend function** (`generate-app-icon`) that:
   - Takes the reference image as input
   - Prompts the model to recreate the exact same design: dark charcoal rounded-square, geometric "H" with diagonal slash, teal/emerald neon glow — but properly formatted as a 1024x1024 app icon with no margins
   - Returns the base64 PNG

3. **Save the result** as `public/app-icon.png` (replacing the current one) and update `index.html` favicon references.

4. **Create a simple page** (`/generate-icon`) to trigger generation, preview the result, and confirm — so you can see it before it becomes the final icon.

## Technical Notes
- Output format: PNG, exactly 1024x1024px, no transparency (solid dark background)
- The rounded corners should be baked into the design (Natively handles masking)
- Model: `google/gemini-3-pro-image-preview` for highest quality reproduction

