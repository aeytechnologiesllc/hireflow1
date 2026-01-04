import { motion } from "framer-motion";
import { 
  Activity, 
  Zap,
  Mic,
  FileText,
  MessageSquare,
  Clock,
  TrendingUp,
  BarChart3,
  Brain
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeveloperAnalytics } from "@/hooks/useDeveloperAnalytics";
import { AnimatedCounter } from "@/components/animations/AnimatedCounter";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  BarChart,
  Bar,
} from "recharts";
import { format } from "date-fns";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

export default function DeveloperActivity() {
  const { platformActivity, featureUsage, isLoading } = useDeveloperAnalytics();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="bg-card/50 border-border/50">
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-16" /></CardContent>
            </Card>
          ))}
        </div>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="pt-6"><Skeleton className="h-96 w-full" /></CardContent>
        </Card>
      </div>
    );
  }

  const workflowStepData = featureUsage?.workflowStepUsage 
    ? Object.entries(featureUsage.workflowStepUsage).map(([name, count]) => ({ name, count }))
    : [];

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Activity Stats */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-orange-400">
              <FileText className="h-4 w-4" />
              Total Applications
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              <AnimatedCounter value={platformActivity?.totalApplications || 0} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-blue-400">
              <MessageSquare className="h-4 w-4" />
              Interviews Conducted
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              <AnimatedCounter value={platformActivity?.totalInterviews || 0} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-green-400">
              <FileText className="h-4 w-4" />
              Documents Signed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              <AnimatedCounter value={platformActivity?.totalDocuments || 0} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-purple-400">
              <Mic className="h-4 w-4" />
              Voice Minutes Used
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              <AnimatedCounter value={Math.round(platformActivity?.voiceMinutesUsed || 0)} />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Activity Trend */}
      <motion.div variants={itemVariants}>
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-orange-400" />
              Platform Activity (30 days)
            </CardTitle>
            <CardDescription>Jobs created and applications submitted over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{ 
              jobs: { label: "Jobs Created", color: "hsl(var(--primary))" },
              applications: { label: "Applications", color: "hsl(24, 100%, 50%)" }
            }} className="h-72 w-full">
              <LineChart data={platformActivity?.activityTrend || []}>
                <XAxis 
                  dataKey="date" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickFormatter={(value) => format(new Date(value), 'MMM d')}
                  interval="preserveStartEnd"
                />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line 
                  type="monotone" 
                  dataKey="jobs" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={false}
                  name="Jobs Created"
                />
                <Line 
                  type="monotone" 
                  dataKey="applications" 
                  stroke="hsl(24, 100%, 50%)" 
                  strokeWidth={2}
                  dot={false}
                  name="Applications"
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </motion.div>

      {/* Feature Usage */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5 text-orange-400" />
              Feature Usage Stats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Brain className="h-5 w-5 text-orange-400" />
                </div>
                <p className="text-2xl font-bold text-foreground">{featureUsage?.aiAnalysisCount || 0}</p>
                <p className="text-sm text-muted-foreground">AI Analyses</p>
              </div>
              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Mic className="h-5 w-5 text-blue-400" />
                </div>
                <p className="text-2xl font-bold text-foreground">{featureUsage?.voiceInterviewCount || 0}</p>
                <p className="text-sm text-muted-foreground">Voice Interviews</p>
              </div>
              <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <FileText className="h-5 w-5 text-green-400" />
                </div>
                <p className="text-2xl font-bold text-foreground">{featureUsage?.documentSigningRate?.toFixed(0) || 0}%</p>
                <p className="text-sm text-muted-foreground">Doc Signing Rate</p>
              </div>
              <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <BarChart3 className="h-5 w-5 text-purple-400" />
                </div>
                <p className="text-2xl font-bold text-foreground">{featureUsage?.quizPhaseCount || 0}</p>
                <p className="text-sm text-muted-foreground">Quizzes Taken</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-orange-400" />
              Workflow Step Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            {workflowStepData.length > 0 ? (
              <ChartContainer config={{ count: { label: "Usage", color: "hsl(24, 100%, 50%)" } }} className="h-48 w-full">
                <BarChart data={workflowStepData} layout="vertical">
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} width={100} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="hsl(24, 100%, 50%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-center text-muted-foreground py-8">No workflow data available</p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Top Employers */}
      <motion.div variants={itemVariants}>
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-orange-400" />
              Top Employers by Activity
            </CardTitle>
            <CardDescription>Most active employers on the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {platformActivity?.topEmployers?.map((employer, index) => (
                <div 
                  key={employer.id} 
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white text-sm font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{employer.name}</p>
                      <p className="text-xs text-muted-foreground">{employer.email}</p>
                    </div>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <div className="text-center">
                      <p className="font-semibold text-foreground">{employer.jobCount}</p>
                      <p className="text-xs text-muted-foreground">Jobs</p>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-foreground">{employer.applicationCount}</p>
                      <p className="text-xs text-muted-foreground">Applications</p>
                    </div>
                  </div>
                </div>
              ))}
              {(!platformActivity?.topEmployers || platformActivity.topEmployers.length === 0) && (
                <p className="text-center text-muted-foreground py-8">No employer data available</p>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
