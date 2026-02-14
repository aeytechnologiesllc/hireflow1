

# Fix: "Subscribe to Growth" Button Styling

## Problem
The "Subscribe to Growth" button on the Trial Expired overlay appears white/light gray, which is inconsistent with the dark theme.

## Solution
Update the non-popular plan button styling in `src/components/subscription/TrialExpiredOverlay.tsx` to use a darker, more consistent style matching the dark theme -- similar to the Business button but without the emerald gradient.

## Change

**File: `src/components/subscription/TrialExpiredOverlay.tsx`** (line ~155)
- Change the non-popular button class from:
  `bg-gray-700 hover:bg-gray-600 text-white`
- To:
  `bg-gray-800 hover:bg-gray-700 text-emerald-400 border border-gray-600 hover:border-emerald-500/50`

This gives the Growth button a dark background with emerald text and a subtle border, keeping it visually distinct from the Business button while staying on-theme.

