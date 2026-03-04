
# Premium Job Creation Workflow UI/UX Upgrade

## Overview

Upgrade the workflow step (step 4) of CreateJob.tsx and simplify the AvaWorkflowGenerationOverlay animation. Two files changed.

## File 1: `src/components/AvaWorkflowGenerationOverlay.tsx`

### Simplify Animation
- Remove the neural network visualization entirely (SVG connection lines, NEURAL_NODES array, node circles, data pulse dots, energy pulses)
- Keep only: central AVA orb with progress ring, single rotating orbit ring around it, subtle background particles (reduce from 60 to 20)
- Remove the 3 floating content cards (Application Questions / Screening Quiz / Workflow Phases) and all typing animation logic

### Add Smart Status Messages
- Add a rotating status message below the orb that cycles through:
  - "Analyzing job role..." (0-3s)
  - "Generating screening questions..." (3-6s)
  - "Designing skill assessments..." (6-9s)
  - "Building hiring workflow..." (9-13s)
  - "Finalizing workflow..." (13s+)
- Each message fades in/out with AnimatePresence
- Replace the phase system (awakening/creation/completion) with a simpler timer-based message index

### Layout Fix
- Ensure the title section ("Creating your workflow" + job title) has explicit `mt-10` spacing from the orb container
- Orb container gets a fixed height so it doesn't overlap text

## File 2: `src/pages/CreateJob.tsx`

### Generate Button States (lines ~1762-1804)
- **Before generation**: Keep current gradient button with "✨ Generate with AVA"
- **While generating**: Disabled, "Generating with AVA..." (already works)
- **After generation** (`workflowGenerated === true`): Change to secondary/outline variant, "↻ Regenerate Workflow". Remove the pulsing glow animation wrapper when workflow is already generated

### Success Confirmation (after generation completes)
- Add a success banner at the top of the generated workflow section (line ~1811):
  ```
  ✓ Workflow generated successfully
  Your hiring process is ready to review.
  ```
- Uses a motion.div that fades in, with green accent styling
- Auto-dismisses after 5 seconds or stays until user scrolls past

### Group Workflow Sections with Headers (lines ~1810-2227)
- Add subtle section group headers above the cards:
  - `APPLICATION` header above Application Questions card
  - `SCREENING` header above Quiz Questions card  
  - `ASSESSMENTS` header above Additional Workflow Steps card
- Headers styled as: `text-[11px] font-semibold tracking-widest uppercase text-muted-foreground/60 mb-2`

### Collapse Additional Workflow Steps
- Wrap the workflow steps card content in a Collapsible component (already imported via radix)
- Default state: collapsed, showing just "Additional Assessments ▼" with step count
- Expanded: shows full step list + Add Step button

### Simplify Quiz Question Preview (lines ~1939-2005)
- In the AccordionTrigger, simplify to show: `{index + 1}. {truncatedQuestion}` + `{time}s • {category}` on the right
- Remove the large amber icon box from the trigger, use just text
- Keep the expanded AccordionContent unchanged

### Mobile Spacing
- Add `gap-6` between the section group headers and cards
- Ensure minimum `space-y-6` between all workflow section cards

## Files Changed
1. `src/components/AvaWorkflowGenerationOverlay.tsx` — simplified animation, smart status messages, layout fix
2. `src/pages/CreateJob.tsx` — button states, success banner, section headers, collapsible assessments, simplified quiz preview
