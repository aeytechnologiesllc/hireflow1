

## Plan: Clean Up Applicant Details Page — Reduce Clutter and Redundancy

### Problem
The page shows too many overlapping sections with redundant information, especially for rejected candidates. The current order is:
1. Header (name, score gauge)
2. Quick Actions (Message, ...)
3. **ApplicantAISummary** (Ava's Summary with score, confidence, expandable text)
4. **Schedule Interview button** (visible even for rejected candidates)
5. **Rejected Banner** (with Reconsider button + Ava's Assessment)
6. **Candidate Journey** (with big REJECTED stamp)
7. Processing Mode indicator
8. Applicant Details card (name, email again — redundant with header)
9. **AVA's Analysis** (CondensedAIAnalysis with score ring, phase-by-phase — redundant with #3)

Score appears 3 times. Name appears twice. Analysis text appears in two places.

### Solution — Consolidate into a clean hierarchy

**Remove ApplicantAISummary from the top.** The full AVA's Analysis section lower down is more complete and already has the score ring, phase-by-phase breakdown, and hiring signal. Having both is the core redundancy.

**Hide Schedule Interview button for rejected candidates.** Add `!isRejected` to the condition.

**Move Rejected Banner above the Candidate Journey** (it already is, but tighten up — remove the separate Ava's Assessment sub-card when the same info is in the CondensedAIAnalysis below).

**Remove the redundant Applicant Details card** (lines ~2260-2353). The header already shows name, email, and score. The submission date can move into the header subtitle.

**Revised order for rejected candidates:**
```text
1. Header (name, email, score gauge, submitted date)
2. Quick Actions (Message, Notes, Dossier)
3. Rejected Banner (compact — who rejected, reason, Reconsider button)
4. Candidate Journey (with REJECTED stamp — keep)
5. Processing Mode (keep — one line)
6. AVA's Analysis (the one comprehensive section with score ring + phases)
```

### Changes to `src/pages/ApplicantDetails.tsx`

1. **Remove ApplicantAISummary render** (lines 1715-1725) — delete entirely. The CondensedAIAnalysis section is the single source of truth for analysis display.

2. **Add `!isRejected` to Schedule Interview button condition** (line 1728) — rejected candidates should not see this.

3. **Remove the redundant Applicant Details card** (lines ~2260-2353) — name, email, submission date are already in the header. Move "Submitted on" date into ApplicantHeader as a subtitle.

4. **Update ApplicantHeader** to accept and display `submittedDate` prop.

5. **Simplify the Rejected Banner** — remove the nested "Ava's Assessment" sub-card (lines 1797-1818) since the same info is in CondensedAIAnalysis. Keep it to: "Rejected by Ava at [phase]" + Reconsider button, one compact card.

### Files Modified
- `src/pages/ApplicantDetails.tsx` — remove redundant sections, add rejection guard to interview button
- `src/components/applicant/ApplicantHeader.tsx` — add optional `submittedDate` prop

### What stays unchanged
- CondensedAIAnalysis component (the comprehensive analysis section)
- Candidate Journey slider with REJECTED stamp
- All dialogs, routing, mobile behavior
- Processing mode indicator
- Quick Actions

