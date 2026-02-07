
# Implementation Plan: Final Integration of ApplicantDetails Refactoring

## Overview

The sub-components have been created but are not yet integrated into `ApplicantDetails.tsx`. This plan covers:
1. Integrating the 4 created sub-components into the main page
2. Wrapping sections with CollapsibleSection for progressive disclosure
3. Adding remaining Feature Discovery tooltips (Job Code, Processing Mode)

---

## Phase 1: Integrate Existing Sub-Components

### 1.1 Replace Header Section with ApplicantHeader

**Current Location:** Lines ~1668-1759 in `ApplicantDetails.tsx`

The existing inline header code (back button, avatar, name, contact info, action icons) will be replaced with the `ApplicantHeader` component.

**Changes:**
```text
// Before: ~90 lines of inline header JSX
// After: Single component call

<ApplicantHeader
  name={profile?.full_name || profile?.email || "Unknown"}
  email={profile?.email || ""}
  phone={profile?.phone}
  avatarUrl={profile?.avatar_url}
  aiScore={application.ai_score}
  status={application.status}
  onBack={() => navigate("/applicants")}
  onAvatarClick={() => setShowAvatarLightbox(true)}
/>
```

**File:** `src/pages/ApplicantDetails.tsx`

---

### 1.2 Replace Quick Actions with ApplicantQuickActions

**Current Location:** Lines ~1693-1758 (the action buttons: Download Dossier, Notes, Message, Schedule)

Replace inline action buttons with the extracted component.

**Changes:**
```text
<ApplicantQuickActions
  onMessage={() => setShowMessageDialog(true)}
  onViewNotes={() => setShowNotesDialog(true)}
  onDownloadDossier={() => downloadDossier(application?.id ?? null)}
  onHire={() => setShowHireConfirmation(true)}
  onReject={() => setShowRejectConfirmation(true)}
  isGeneratingDossier={isGeneratingDossier}
  isRejected={isRejected}
  isHired={isHired}
  canMessage={canMessageCandidates}
  canManagePipeline={canManagePipeline}
  isMobile={isMobile}
/>
```

**File:** `src/pages/ApplicantDetails.tsx`

---

### 1.3 Add ApplicantAISummary Component

**Current Location:** Lines ~2343-2500 (the CondensedAIAnalysis card)

Add the new condensed AI summary component above the detailed analysis sections.

**Changes:**
```text
<ApplicantAISummary
  summary={application.ai_analysis}
  fullAnalysis={application.ai_analysis}
  aiScore={application.ai_score}
  trustLevel={application.ai_score >= 80 ? "high" : application.ai_score >= 60 ? "medium" : "low"}
  isAnalyzing={isAnalyzing}
  onReanalyze={handleReanalyze}
/>
```

**File:** `src/pages/ApplicantDetails.tsx`

---

## Phase 2: Add Collapsible Sections

### 2.1 Wrap Major Sections with CollapsibleSection

The following sections will be wrapped:

| Section | Icon | Default Open | Badge |
|---------|------|--------------|-------|
| Candidate Journey | Sparkles | ✅ Yes | - |
| Contact Details | Mail | ❌ No | - |
| Application Answers | FileCheck | ❌ No | Count badge |
| Submissions & Results | ClipboardList | ❌ No | Score badge |
| Full Ava Analysis | Sparkles | ❌ No | Score badge |
| Scheduled Interviews | Calendar | Conditional | Status badge |

**Example Implementation:**

```typescript
import { CollapsibleSection } from "@/components/applicant";

// Wrap the Journey card
<CollapsibleSection
  sectionId="journey"
  applicationId={id}
  title="Candidate Journey"
  icon={Sparkles}
  defaultOpen={true}
>
  {/* Existing journey slider content */}
</CollapsibleSection>

// Wrap the AI Analysis card
<CollapsibleSection
  sectionId="ai_analysis"
  applicationId={id}
  title="Full Ava Analysis"
  icon={Sparkles}
  defaultOpen={false}
  badge={<Badge variant="outline">{application.ai_score}/100</Badge>}
>
  {/* Existing CondensedAIAnalysis content */}
</CollapsibleSection>
```

**File:** `src/pages/ApplicantDetails.tsx`

---

### 2.2 Section Visibility Logic

**Always Visible (Not Collapsible):**
- ApplicantHeader (name, avatar, score ring)
- ApplicantQuickActions (Message, Notes, Hire/Reject)
- ApplicantAISummary (condensed 1-2 sentence version)
- Rejected Status Banner (when applicable)
- Processing Mode Indicator

**Collapsible Sections:**
- Candidate Journey / Phase Slider (default: expanded)
- Contact & Profile Details (default: collapsed)
- Workflow Badges / Submissions (default: collapsed)
- Full Ava Analysis (default: collapsed)
- Scheduled Interview Card (default: expanded if exists)

---

## Phase 3: Feature Discovery Tooltips

### 3.1 Job Code Tooltip

**File:** `src/pages/JobDetails.tsx`

Find the Job Code badge and wrap it:

```typescript
import FeatureDiscoveryTooltip from "@/components/FeatureDiscoveryTooltip";
import { ClipboardList } from "lucide-react";

<FeatureDiscoveryTooltip
  featureId="job_code"
  title="Quick Apply Code"
  description="Share this code with candidates so they can apply directly at /apply without searching for the job."
  icon={<ClipboardList className="h-4 w-4" />}
  position="bottom"
>
  <Badge 
    variant="outline" 
    className="cursor-pointer"
    onClick={copyJobCode}
  >
    Code: {job.job_code}
  </Badge>
</FeatureDiscoveryTooltip>
```

---

### 3.2 Processing Mode Tooltip

**File:** `src/pages/Dashboard.tsx`

Find the ProcessingModeToggle or relevant toggle and wrap it:

```typescript
import FeatureDiscoveryTooltip from "@/components/FeatureDiscoveryTooltip";
import { Zap } from "lucide-react";

<FeatureDiscoveryTooltip
  featureId="processing_mode"
  title="Processing Mode"
  description="Autopilot lets Ava automatically screen and advance candidates. Manual mode requires your approval at each step."
  icon={<Zap className="h-4 w-4" />}
  position="bottom"
>
  <ProcessingModeToggle ... />
</FeatureDiscoveryTooltip>
```

---

## Implementation Order

```text
Step 1: Import sub-components into ApplicantDetails.tsx
├── Add imports for ApplicantHeader, ApplicantQuickActions, ApplicantAISummary, CollapsibleSection
└── No visual changes yet

Step 2: Replace header section with ApplicantHeader
├── Remove lines ~1668-1690 (back button + avatar inline code)
├── Add ApplicantHeader component
└── Test: Header should look identical

Step 3: Replace action buttons with ApplicantQuickActions
├── Simplify lines ~1693-1758
├── Add ApplicantQuickActions component
└── Test: Buttons should work identically

Step 4: Add ApplicantAISummary at top of content area
├── Insert after header, before journey slider
├── This provides the condensed "Ava's take" upfront
└── Test: Summary appears with expand/collapse

Step 5: Wrap Candidate Journey with CollapsibleSection
├── Wrap the journey slider Card with CollapsibleSection
├── defaultOpen={true}
└── Test: Section collapses and persists state

Step 6: Wrap remaining sections
├── AI Analysis section
├── Workflow badges/submissions section
└── Test each section independently

Step 7: Add Job Code tooltip to JobDetails.tsx
└── Test: Tooltip appears once on first visit

Step 8: Add Processing Mode tooltip to Dashboard.tsx
└── Test: Tooltip appears once on first visit
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/ApplicantDetails.tsx` | Import sub-components, replace header/actions, wrap sections |
| `src/pages/JobDetails.tsx` | Add FeatureDiscoveryTooltip to Job Code badge |
| `src/pages/Dashboard.tsx` | Add FeatureDiscoveryTooltip to Processing Mode toggle |

---

## Safety Considerations

1. **Incremental Integration**: Each component is integrated one at a time with testing between steps
2. **No Logic Changes**: All business logic remains in ApplicantDetails.tsx - only UI is extracted
3. **Dialog State Preserved**: All 17+ dialog state variables stay in the main file
4. **Fallback Behavior**: If sub-components fail to load, the page gracefully degrades
5. **localStorage Keys**: Using unique keys per section per application to avoid conflicts

---

## localStorage Keys

New keys added:
- `applicant_section_journey_{applicationId}`
- `applicant_section_contact_{applicationId}`
- `applicant_section_submissions_{applicationId}`
- `applicant_section_ai_analysis_{applicationId}`
- `applicant_section_interviews_{applicationId}`
- `feature_discovery_job_code`
- `feature_discovery_processing_mode`

---

## Expected Outcomes

After implementation:
1. ApplicantDetails page feels less overwhelming with collapsible sections
2. Critical info (header, actions, summary) always visible at top
3. Users can expand only the sections they care about
4. Section preferences persist across sessions
5. Employers discover Job Code and Processing Mode features on first use
6. Codebase is more maintainable with extracted components

---

## Technical Notes

### Component Props Summary

**ApplicantHeader:**
- `name`, `email`, `phone`, `avatarUrl`, `aiScore`, `status`
- `onBack()`, `onAvatarClick()`

**ApplicantQuickActions:**
- `onMessage()`, `onViewNotes()`, `onDownloadDossier()`, `onHire()`, `onReject()`
- `isGeneratingDossier`, `isRejected`, `isHired`, `canMessage`, `canManagePipeline`, `isMobile`

**ApplicantAISummary:**
- `summary`, `fullAnalysis`, `aiScore`, `trustLevel`
- `isAnalyzing`, `onReanalyze()`

**CollapsibleSection:**
- `sectionId`, `applicationId`, `title`, `icon`, `defaultOpen`, `badge`, `children`
