
# Implementation Plan: UX Clarity Phase 2 - Remaining Phases

## Overview

This plan covers the remaining implementation work:
- **Phase 5**: ApplicantDetails Page Simplification (Progressive Disclosure)
- **Phase 6**: Navigation Clarity for Dual Roles
- **Phase 4 Finalization**: Integrating Feature Discovery Tooltips into specific UI elements

---

## Phase 5: ApplicantDetails Page Simplification

### Problem
`ApplicantDetails.tsx` is 3,793 lines with:
- 17+ dialog state variables (lines 157-188)
- Complex phase slider logic
- Dense information display
- Overwhelming for first-time users

### Solution
Implement progressive disclosure using collapsible sections and extract key UI sections into sub-components.

### Technical Implementation

#### 5.1 Create Collapsible Section Wrapper Component
**New File:** `src/components/applicant/CollapsibleSection.tsx`

A reusable wrapper that:
- Uses Radix Collapsible primitive (already installed)
- Persists expand/collapse state to localStorage
- Provides consistent styling across all sections
- Includes section header with icon and expand/collapse indicator

```text
Props:
- sectionId: string (for localStorage persistence)
- title: string
- icon: React.ElementType
- defaultOpen?: boolean
- badge?: React.ReactNode (for counts/status)
- children: React.ReactNode
```

#### 5.2 Create Sub-Components

**5.2.1 ApplicantHeader Component**
**New File:** `src/components/applicant/ApplicantHeader.tsx`

Extracts lines ~1350-1500 (candidate name, avatar, score badge, contact info):
- Avatar with click-to-expand
- Candidate name and email
- AI score badge with colored ring
- Back button
- Quick action buttons (Message, Notes, Dossier)

**5.2.2 ApplicantQuickActions Component**
**New File:** `src/components/applicant/ApplicantQuickActions.tsx`

Extracts the primary action buttons:
- Message candidate
- View notes
- Download dossier
- Hire/Reject buttons (desktop visible, mobile in dropdown)

**5.2.3 ApplicantAISummary Component**
**New File:** `src/components/applicant/ApplicantAISummary.tsx`

Extracts the AI analysis card:
- Ava's 1-2 sentence summary
- Collapsible full analysis
- Trust badge visualization

#### 5.3 Implement Collapsible Sections in ApplicantDetails
**File:** `src/pages/ApplicantDetails.tsx`

Wrap existing sections with `CollapsibleSection`:

```text
Always Visible:
├── ApplicantHeader (name, avatar, score)
├── ApplicantQuickActions (Message, Notes, Hire/Reject)
└── ApplicantAISummary (condensed - 1-2 sentences)

Collapsible Sections:
├── ▼ Contact & Profile Details (defaultOpen: false)
│   └── Email, phone, resume link, location
├── ▼ Candidate Journey / Phase Slider (defaultOpen: true)
│   └── The existing phase slider UI
├── ▼ Application Answers (defaultOpen: false)
│   └── Quiz responses, form answers
├── ▼ Submissions & Results (defaultOpen: false)
│   └── Video, typing test, chat simulation results
├── ▼ Interview History (defaultOpen: conditional)
│   └── Scheduled/completed interviews
├── ▼ Full Ava Analysis (defaultOpen: false)
│   └── Detailed AI breakdown, trust scores
└── ▼ Documents (defaultOpen: false)
    └── Sent/received documents
```

#### 5.4 Persist Section States
Use localStorage key pattern: `applicant_section_{sectionId}_{applicationId}`

### Files to Create/Modify
| File | Action |
|------|--------|
| `src/components/applicant/CollapsibleSection.tsx` | **CREATE** |
| `src/components/applicant/ApplicantHeader.tsx` | **CREATE** |
| `src/components/applicant/ApplicantQuickActions.tsx` | **CREATE** |
| `src/components/applicant/ApplicantAISummary.tsx` | **CREATE** |
| `src/components/applicant/index.ts` | **CREATE** (barrel export) |
| `src/pages/ApplicantDetails.tsx` | **MODIFY** - Import sub-components, wrap sections |

### Safety Considerations
- Keep all dialog state variables in main file initially
- Extract pure UI components first (no business logic changes)
- Existing functionality unchanged
- Gradual refactoring approach

---

## Phase 6: Navigation Clarity for Dual Roles

### Problem
No visual indicator of which "mode" (Employer vs Candidate) the user is in. This causes confusion when users have both roles.

### Solution
Add a subtle role badge below the HireFlow logo in the sidebar.

### Technical Implementation

#### 6.1 Add Role Badge to AppSidebar
**File:** `src/components/AppSidebar.tsx`

Add a role indicator badge after the logo section (around line 231):

```tsx
{/* Role indicator badge */}
{(!collapsed || isMobile) && (
  <div className="relative z-10 px-6 pb-2">
    <Badge 
      variant="outline" 
      className={cn(
        "text-[10px] font-medium px-2 py-0.5",
        isTeamMember 
          ? "border-blue-500/30 text-blue-400 bg-blue-500/10"
          : isEmployer 
            ? "border-primary/30 text-primary bg-primary/10"
            : "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
      )}
    >
      {isTeamMember ? "Team Member" : isEmployer ? "Employer" : "Candidate"}
    </Badge>
  </div>
)}
```

For collapsed sidebar, show as tooltip or small icon indicator.

#### 6.2 Color Coding
- **Employer Mode**: Primary color (purple/default theme)
- **Candidate Mode**: Emerald/green color
- **Team Member Mode**: Blue color

### Files to Modify
| File | Changes |
|------|---------|
| `src/components/AppSidebar.tsx` | Add role badge after logo |

### Safety Considerations
- Visual change only
- Uses existing `role` and `isTeamMember` from useAuth
- No navigation or logic changes

---

## Phase 4 Finalization: Feature Discovery Tooltips

### Current State
`FeatureDiscoveryTooltip` component exists but hasn't been integrated into specific features yet.

### Features to Add Tooltips

#### 4.1 AI Shortlist Button
**File:** `src/pages/Applicants.tsx` (lines 493-502)

Wrap the "AI Shortlist" button:

```tsx
<FeatureDiscoveryTooltip
  featureId="ai_shortlist"
  title="Ava's Shortlist"
  description="Let Ava analyze all applicants and rank them by fit for this role. She'll highlight top candidates and explain why."
  icon={<Sparkles className="h-4 w-4" />}
  position="bottom"
>
  <Button onClick={handleGenerateShortlist} ...>
    <Sparkles className="h-4 w-4" />
    AI Shortlist
  </Button>
</FeatureDiscoveryTooltip>
```

#### 4.2 Bulk Actions Toggle
**File:** `src/pages/Applicants.tsx`

Wrap the selection mode toggle button:

```tsx
<FeatureDiscoveryTooltip
  featureId="bulk_actions"
  title="Bulk Actions"
  description="Select multiple candidates to message, reject, or advance them all at once."
  icon={<CheckSquare className="h-4 w-4" />}
  position="bottom"
>
  <Button onClick={() => setIsSelectionMode(!isSelectionMode)} ...>
    {isSelectionMode ? <Square /> : <CheckSquare />}
  </Button>
</FeatureDiscoveryTooltip>
```

#### 4.3 Job Code Display
**File:** `src/pages/JobDetails.tsx` or job cards

Add tooltip when job code is displayed:

```tsx
<FeatureDiscoveryTooltip
  featureId="job_code"
  title="Quick Apply Code"
  description="Share this code with candidates so they can apply directly to this position at /apply."
  icon={<ClipboardList className="h-4 w-4" />}
  position="right"
>
  <Badge>Code: {job.job_code}</Badge>
</FeatureDiscoveryTooltip>
```

#### 4.4 Processing Mode Toggle (Dashboard)
**File:** `src/pages/Dashboard.tsx`

If there's a processing mode toggle visible, wrap it:

```tsx
<FeatureDiscoveryTooltip
  featureId="processing_mode"
  title="Processing Mode"
  description="Toggle between Autopilot (Ava handles screening) and Manual (you review each candidate)."
  icon={<Zap className="h-4 w-4" />}
  position="bottom"
>
  {/* ProcessingModeToggle component */}
</FeatureDiscoveryTooltip>
```

### Files to Modify
| File | Changes |
|------|---------|
| `src/pages/Applicants.tsx` | Wrap AI Shortlist + Bulk Actions buttons |
| `src/pages/JobDetails.tsx` | Wrap Job Code display |
| `src/pages/Dashboard.tsx` | Wrap Processing Mode toggle (if visible) |

---

## Implementation Order

```text
Step 1: Phase 6 - Navigation Role Badge (Quick Win)
├── Add role badge to AppSidebar.tsx
└── ~5 minutes of work

Step 2: Phase 4 Finalization - Feature Discovery Tooltips
├── Wrap AI Shortlist button in Applicants.tsx
├── Wrap Bulk Actions button in Applicants.tsx
├── Wrap Job Code in JobDetails.tsx
└── Wrap Processing Mode toggle in Dashboard.tsx

Step 3: Phase 5 - ApplicantDetails Simplification
├── Create CollapsibleSection.tsx wrapper
├── Create ApplicantHeader.tsx
├── Create ApplicantQuickActions.tsx
├── Create ApplicantAISummary.tsx
├── Create barrel export index.ts
└── Integrate into ApplicantDetails.tsx with collapsible sections
```

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Collapsible sections hide important info | Default "Candidate Journey" to expanded |
| Sub-component extraction breaks dialogs | Keep all dialog state in main file |
| Role badge clutters UI | Use very small, subtle badge styling |
| Tooltips are annoying | Auto-dismiss after 8s, one-time only |

---

## localStorage Keys

New keys introduced:
- `feature_discovery_ai_shortlist`
- `feature_discovery_bulk_actions`
- `feature_discovery_job_code`
- `feature_discovery_processing_mode`
- `applicant_section_{sectionId}_{applicationId}`

---

## Expected Outcomes

After implementation:
1. Users immediately know which portal/role they're in (sidebar badge)
2. Employers discover AI Shortlist and Bulk Actions on first use
3. ApplicantDetails page feels less overwhelming with collapsible sections
4. Information is organized into logical groups
5. User preferences for expanded/collapsed sections persist
