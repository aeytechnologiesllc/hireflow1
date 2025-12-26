import { Document, Page, View, Text, StyleSheet, Link } from '@react-pdf/renderer';
import type { ImprovementBlueprintData } from '@/hooks/useImprovementBlueprint';

export type { ImprovementBlueprintData };

// Color palette
const colors = {
  primary: '#4F46E5',
  primaryLight: '#6366F1',
  success: '#10B981',
  successBg: '#D1FAE5',
  coaching: '#F59E0B',
  coachingBg: '#FEF3C7',
  dark: '#1E293B',
  body: '#334155',
  muted: '#64748B',
  light: '#F1F5F9',
  white: '#FFFFFF',
  border: '#E2E8F0',
};

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: colors.body,
  },
  pageWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  contentContainer: {
    flex: 1,
  },
  // Header styles - compact
  header: {
    backgroundColor: colors.primary,
    marginLeft: -32,
    marginRight: -32,
    marginTop: -32,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 2,
    lineHeight: 1.2,
  },
  headerSubtitle: {
    fontSize: 9,
    color: colors.white,
    opacity: 0.9,
    lineHeight: 1.3,
  },
  headerDate: {
    fontSize: 9,
    color: colors.white,
    opacity: 0.9,
    textAlign: 'right',
    lineHeight: 1.3,
  },
  // Page header bar
  pageHeaderBar: {
    marginLeft: -32,
    marginRight: -32,
    marginTop: -32,
    height: 6,
    marginBottom: 12,
  },
  pageNumber: {
    fontSize: 7,
    color: colors.muted,
    textAlign: 'right',
    marginBottom: 6,
    lineHeight: 1.3,
  },
  // Section styles - tighter spacing
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
    lineHeight: 1.2,
  },
  sectionSubtitle: {
    fontSize: 8,
    color: colors.muted,
    marginBottom: 8,
    lineHeight: 1.4,
  },
  // Card styles - reduced padding and margins
  card: {
    backgroundColor: colors.light,
    borderRadius: 4,
    padding: 8,
    marginBottom: 6,
  },
  cardWithBorder: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    padding: 8,
    marginBottom: 6,
  },
  successCard: {
    backgroundColor: colors.successBg,
    borderRadius: 4,
    padding: 8,
    marginBottom: 6,
  },
  coachingCard: {
    backgroundColor: colors.coachingBg,
    borderRadius: 4,
    padding: 8,
    marginBottom: 6,
  },
  primaryCard: {
    backgroundColor: colors.primary,
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
  },
  // Score section - compact
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  scoreNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.white,
    lineHeight: 1.2,
  },
  scoreLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.dark,
    marginBottom: 2,
    lineHeight: 1.2,
  },
  scoreContext: {
    fontSize: 8,
    color: colors.muted,
    maxWidth: 400,
    lineHeight: 1.4,
  },
  // Insight box - compact
  insightLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 3,
    opacity: 0.9,
    lineHeight: 1.3,
  },
  insightText: {
    fontSize: 9,
    color: colors.white,
    lineHeight: 1.4,
  },
  // Strength card - compact
  strengthName: {
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.success,
    marginBottom: 4,
    lineHeight: 1.2,
  },
  evidenceText: {
    fontSize: 8,
    fontStyle: 'italic',
    color: colors.body,
    marginBottom: 4,
    lineHeight: 1.4,
  },
  strategyLabel: {
    fontSize: 7,
    color: colors.dark,
    lineHeight: 1.4,
  },
  strategyText: {
    fontSize: 7,
    color: colors.body,
    lineHeight: 1.4,
  },
  // Improvement card - compact
  improvementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  numberBadge: {
    backgroundColor: colors.coaching,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 6,
  },
  numberText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: colors.white,
    lineHeight: 1.2,
  },
  areaName: {
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.dark,
    flex: 1,
    lineHeight: 1.2,
  },
  observedText: {
    fontSize: 7,
    color: colors.body,
    marginBottom: 4,
    lineHeight: 1.4,
  },
  whyText: {
    fontSize: 7,
    fontStyle: 'italic',
    color: colors.muted,
    marginBottom: 5,
    lineHeight: 1.4,
  },
  strategySection: {
    marginTop: 2,
  },
  strategyHeading: {
    fontSize: 7,
    fontWeight: 'bold',
    color: colors.success,
    marginBottom: 2,
    lineHeight: 1.3,
  },
  habitText: {
    fontSize: 7,
    color: colors.body,
    marginBottom: 3,
    lineHeight: 1.4,
  },
  resourceText: {
    fontSize: 6,
    color: colors.primary,
    lineHeight: 1.4,
  },
  // Week grid - compact single column
  weekGrid: {
    marginBottom: 10,
  },
  weekCard: {
    backgroundColor: colors.light,
    borderRadius: 4,
    padding: 8,
    marginBottom: 5,
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  weekBadge: {
    backgroundColor: colors.primary,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 6,
  },
  weekLabel: {
    fontSize: 7,
    fontWeight: 'bold',
    color: colors.white,
    lineHeight: 1.2,
  },
  weekFocus: {
    fontSize: 8,
    fontWeight: 'bold',
    color: colors.dark,
    flex: 1,
    lineHeight: 1.2,
  },
  actionItem: {
    fontSize: 6,
    color: colors.body,
    marginBottom: 2,
    lineHeight: 1.4,
  },
  successMetric: {
    fontSize: 6,
    color: colors.success,
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    lineHeight: 1.3,
  },
  // Closing section - compact
  closingCard: {
    backgroundColor: colors.primary,
    borderRadius: 4,
    padding: 12,
    marginBottom: 10,
  },
  closingTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 6,
    lineHeight: 1.2,
  },
  closingNote: {
    fontSize: 8,
    color: colors.white,
    lineHeight: 1.5,
    marginBottom: 8,
  },
  finalThought: {
    fontSize: 8,
    fontStyle: 'italic',
    color: colors.white,
    opacity: 0.95,
    lineHeight: 1.4,
  },
  // Immediate actions - compact
  actionsTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.dark,
    marginBottom: 6,
    lineHeight: 1.2,
  },
  actionCheckItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  checkbox: {
    width: 8,
    height: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 2,
    marginTop: 1,
    marginRight: 6,
  },
  actionText: {
    fontSize: 8,
    color: colors.body,
    flex: 1,
    lineHeight: 1.4,
  },
  // Footer - compact
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 'auto',
  },
  footerText: {
    fontSize: 6,
    color: colors.muted,
    lineHeight: 1.3,
  },
  // Divider
  sectionDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginVertical: 10,
  },
});

function getScoreLabel(score: number): string {
  if (score >= 80) return "Strong Performance";
  if (score >= 60) return "Room to Grow";
  if (score >= 40) return "Needs Development";
  return "Significant Gap";
}

function getScoreColor(score: number): string {
  return score >= 60 ? colors.success : colors.coaching;
}

export function ImprovementBlueprintPDF({ data }: { data: ImprovementBlueprintData }) {
  const { metadata, honestReflection, strengthsToLeverage, improvementCoaching, thirtyDayPlan, closingMessage } = data;
  
  const formattedDate = new Date(metadata.generatedAt).toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  });

  return (
    <Document>
      {/* PAGE 1: Summary, Honest Reflection & Strengths (merged) */}
      <Page size="A4" style={styles.page}>
        <View style={styles.pageWrapper}>
          <View style={styles.contentContainer}>
            <View style={styles.header}>
              <View style={styles.headerRow}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.headerTitle}>Personal Improvement Blueprint</Text>
                  <Text style={styles.headerSubtitle}>Prepared for {metadata.candidateName}</Text>
                </View>
                <Text style={styles.headerDate}>{formattedDate}</Text>
              </View>
            </View>

            {/* What Happened */}
            <Text style={[styles.sectionTitle, { color: colors.dark }]}>What Happened</Text>
            <View style={styles.card}>
              <Text style={{ lineHeight: 1.5, fontSize: 9 }}>
                {honestReflection?.whatHappened || "Application was not advanced to the next stage."}
              </Text>
            </View>

            {/* Score */}
            <View style={styles.cardWithBorder}>
              <View style={styles.scoreContainer}>
                <View style={[styles.scoreCircle, { backgroundColor: getScoreColor(metadata.overallScore) }]}>
                  <Text style={styles.scoreNumber}>{metadata.overallScore}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.scoreLabel}>{getScoreLabel(metadata.overallScore)}</Text>
                  <Text style={styles.scoreContext}>
                    {honestReflection?.scoreContext || ""}
                  </Text>
                </View>
              </View>
            </View>

            {/* Key Insight */}
            <View style={styles.primaryCard}>
              <Text style={styles.insightLabel}>KEY INSIGHT</Text>
              <Text style={styles.insightText}>
                {honestReflection?.keyInsight || "Focus on continuous improvement and learning from this experience."}
              </Text>
            </View>

            {/* Divider */}
            <View style={styles.sectionDivider} />

            {/* Strengths Section */}
            <Text style={[styles.sectionTitle, { color: colors.success }]}>Your Strengths to Leverage</Text>
            <Text style={styles.sectionSubtitle}>
              These are real advantages you demonstrated. Here's how to present them even better.
            </Text>

            {(strengthsToLeverage?.identified || []).slice(0, 3).map((item, idx) => (
              <View key={idx} style={styles.successCard} wrap={false}>
                <Text style={styles.strengthName}>{item.strength || "Strength"}</Text>
                <Text style={styles.evidenceText}>"{item.evidence || ''}"</Text>
                <Text style={styles.strategyLabel}>
                  → Future strategy: <Text style={styles.strategyText}>{item.futureStrategy || ''}</Text>
                </Text>
              </View>
            ))}

            {/* Hidden Edge */}
            <View style={styles.primaryCard}>
              <Text style={styles.insightLabel}>YOUR HIDDEN EDGE</Text>
              <Text style={styles.insightText}>
                {strengthsToLeverage?.hiddenEdge || ""}
              </Text>
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Personal Improvement Blueprint</Text>
            <Text style={styles.footerText}>Page 1 of 3</Text>
          </View>
        </View>
      </Page>

      {/* PAGE 2: What to Improve */}
      <Page size="A4" style={styles.page}>
        <View style={styles.pageWrapper}>
          <View style={styles.contentContainer}>
            <View style={[styles.pageHeaderBar, { backgroundColor: colors.coaching }]} />
            <Text style={styles.pageNumber}>Page 2 of 3</Text>

            <Text style={[styles.sectionTitle, { color: colors.coaching }]}>What to Improve</Text>
            <Text style={styles.sectionSubtitle}>
              Each area includes a specific strategy you can implement today.
            </Text>

            {(improvementCoaching || []).slice(0, 3).map((item, idx) => (
              <View key={idx} style={styles.coachingCard} wrap={false}>
                <View style={styles.improvementHeader}>
                  <View style={styles.numberBadge}>
                    <Text style={styles.numberText}>{idx + 1}</Text>
                  </View>
                  <Text style={styles.areaName}>{item.area || "Area"}</Text>
                </View>
                
                <Text style={styles.observedText}>
                  Observed: {item.whatWasObserved || ''}
                </Text>
                
                <Text style={styles.whyText}>
                  {item.whyThisMatters || ''}
                </Text>

                <View style={styles.strategySection}>
                  <Text style={styles.strategyHeading}>
                    Strategy: {item.improvementStrategy?.framework || ''}
                  </Text>
                  <Text style={styles.habitText}>
                    Daily habit: {item.improvementStrategy?.dailyHabit || ''}
                  </Text>
                  {item.resource?.url ? (
                    <Link src={item.resource.url} style={styles.resourceText}>
                      Resource: {item.resource.name || ''} ({item.resource.url})
                    </Link>
                  ) : (
                    <Text style={styles.resourceText}>
                      Resource: {item.resource?.name || ''}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Personal Improvement Blueprint</Text>
            <Text style={styles.footerText}>Page 2 of 3</Text>
          </View>
        </View>
      </Page>

      {/* PAGE 3: 30-Day Plan & Closing */}
      <Page size="A4" style={styles.page}>
        <View style={styles.pageWrapper}>
          <View style={styles.contentContainer}>
            <View style={[styles.pageHeaderBar, { backgroundColor: colors.primary }]} />
            <Text style={styles.pageNumber}>Page 3 of 3</Text>

            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Your 30-Day Improvement Plan</Text>

            <View style={styles.weekGrid}>
              {[
                { ...thirtyDayPlan?.week1, label: "Week 1" },
                { ...thirtyDayPlan?.week2, label: "Week 2" },
                { ...thirtyDayPlan?.week3, label: "Week 3" },
                { ...thirtyDayPlan?.week4, label: "Week 4" },
              ].map((week, idx) => (
                <View key={idx} style={styles.weekCard} wrap={false}>
                  <View style={styles.weekHeader}>
                    <View style={styles.weekBadge}>
                      <Text style={styles.weekLabel}>{week.label}</Text>
                    </View>
                    <Text style={styles.weekFocus}>{week.focus || "Focus area"}</Text>
                  </View>
                  
                  {(week.dailyActions || []).slice(0, 3).map((action, actionIdx) => (
                    <Text key={actionIdx} style={styles.actionItem}>• {action}</Text>
                  ))}
                  
                  <Text style={styles.successMetric}>✓ {week.successMetric || ""}</Text>
                </View>
              ))}
            </View>

            <View style={styles.closingCard}>
              <Text style={styles.closingTitle}>A Note From Your Career Coach</Text>
              <Text style={styles.closingNote}>
                {closingMessage?.personalNote || "Keep pushing forward!"}
              </Text>
              <Text style={styles.finalThought}>
                {closingMessage?.finalThought || ""}
              </Text>
            </View>

            <Text style={styles.actionsTitle}>Do This Today</Text>
            {(closingMessage?.immediateActions || []).slice(0, 5).map((action, idx) => (
              <View key={idx} style={styles.actionCheckItem}>
                <View style={styles.checkbox} />
                <Text style={styles.actionText}>{action}</Text>
              </View>
            ))}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Personal Improvement Blueprint</Text>
            <Text style={styles.footerText}>Page 3 of 3</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
