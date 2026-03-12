

# Google Play Store Graphics — Generation Plan

Google Play requires these graphics for your store listing:

## Required Assets

| Asset | Size | Status |
|-------|------|--------|
| **App icon** | 512×512 PNG | ✅ Already have `app-icon.png` (1024×1024, Google will resize) |
| **Feature graphic** | 1024×500 PNG | ❌ Need to generate |
| **Phone screenshots** | 1080×1920 (min 2, recommend 4-8) | ❌ Need to generate |

## What I'll Build

### 1. Feature Graphic Generator Page
A utility page at `/generate-graphics` that uses the AI image generation API (Nano banana pro model) to create:

- **Feature graphic (1024×500)**: A branded banner with the HireFlow logo, tagline "AI-Powered Hiring Platform", and dark premium aesthetic matching the app's branding (dark background, emerald/teal accents)

### 2. Screenshot Capture Helper
Since screenshots need to show actual app UI, the best approach is:
- I'll create a **screenshot helper page** that renders key app screens in a phone frame mockup at the correct 1080×1920 resolution
- Screens to capture: Dashboard, Job Creation, Applicant Pipeline, AI Analysis, Candidate Portal, Messages

### 3. Implementation
- Create an edge function `generate-store-graphics` that calls the AI image generation API to produce the feature graphic
- Create a simple `/store-graphics` page with a button to generate and download each asset
- The feature graphic will be generated with the prompt describing HireFlow's dark premium branding with the glowing emerald "H" lettermark

### Technical Details
- Uses `google/gemini-3-pro-image-preview` model for high-quality image generation
- Feature graphic generated via AI with specific branding instructions
- All images downloadable as PNG files at exact required dimensions
- For screenshots: render app screens in a canvas at 1080×1920 and export as PNG

