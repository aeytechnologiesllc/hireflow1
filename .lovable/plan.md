

# Generate Dark & Premium App Icon for HireFlow

## Approach

Use the Lovable AI image generation model (`google/gemini-3-pro-image-preview`) via a backend function to generate a high-quality dark & premium app icon matching HireFlow's existing design language — dark charcoal base with emerald/teal accent glow, inspired by the Ava orb.

## Steps

1. **Create a backend function** (`generate-app-icon`) that calls the AI image model with a detailed prompt describing a dark premium app icon:
   - Dark charcoal/near-black background
   - Emerald/teal glowing "H" or abstract flow symbol
   - Rounded square shape (standard app icon format)
   - Subtle gradient and glow effects

2. **Create a simple page/button** to trigger generation, preview the result, and save it to storage.

3. **Update `index.html`** and `public/` with the generated icon as the new favicon and apple-touch-icon.

**Alternatively** (simpler, faster): Generate the icon directly in a one-off edge function call, save the base64 result to storage, then update the favicon reference. No new UI page needed.

## Technical Details

- Model: `google/gemini-3-pro-image-preview` for highest quality
- Prompt: "A premium dark app icon for a hiring/recruitment platform called HireFlow. Dark charcoal background with a glowing emerald/teal abstract 'H' monogram. Subtle light glow and depth. Rounded square app icon format, 1024x1024, no text besides the H, minimal and elegant."
- Save output as `public/app-icon.png` and update favicon references in `index.html`

