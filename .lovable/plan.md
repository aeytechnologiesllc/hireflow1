

# Fix Foreground Logo Transparency

## Problem
The generated `hireflow-foreground.png` has a white/light background instead of true transparency. When Natively places it on the `#0F172A` dark background, the colors don't match — you can see the white square behind the H logo.

## Fix
Regenerate `public/hireflow-foreground.png` using `google/gemini-3-pro-image-preview` with an explicit prompt emphasizing **transparent/alpha background** — only the glowing teal geometric H lettermark, no background whatsoever. Then verify the output actually has transparency before saving.

If the AI model cannot produce true PNG transparency (which is a known limitation of some image generation models), the fallback approach is:
- Generate the H logo on the exact `#0F172A` background color instead of transparent — so it blends perfectly with the Natively background color setting.

This fallback is simpler and guarantees a seamless result.

