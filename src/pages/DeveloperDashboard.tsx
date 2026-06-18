import { motion } from "framer-motion";
import { 
  Users, 
  CreditCard, 
  Briefcase, 
  FileText, 
  Mic, 
  TrendingUp,
  Activity,
  UserPlus,
  Clock,
  Zap
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
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

const COLORS = ['var(--primary)', 'var(--accent)', 'hsl(24, 100%, 50%)', 'hsl(0, 84%, 60%)'];

export default function DeveloperDashboard() {
  const { userStats, subscriptionStats, platformActivity, featureUsage, isLoading } = useDeveloperAnalytics();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="bg-card/50 border-border/50">
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Key Metrics */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20 shadow-lg shadow-orange-500/5">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-orange-400">
              <Users className="h-4 w-4" />
              Total Users
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              <AnimatedCounter value={userStats?.totalUsers || 0} />
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="secondary" className="text-xs">
                {userStats?.employers || 0} employers
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {userStats?.candidates || 0} candidates
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20 shadow-lg shadow-green-500/5">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-green-400">
              <CreditCard className="h-4 w-4" />
              Active Subscriptions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              <AnimatedCounter value={(subscriptionStats?.active || 0) + (subscriptionStats?.trialing || 0)} />
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-400">
                {subscriptionStats?.trialing || 0} trialing
              </Badge>
              <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-400">
                {subscriptionStats?.active || 0} active
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20 shadow-lg shadow-blue-500/5">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-blue-400">
              <Briefcase className="h-4 w-4" />
              Total Jobs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              <AnimatedCounter value={platformActivity?.totalJobs || 0} />
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="secondary" className="text-xs bg-blue-500/10 text-blue-400">
                {platformActivity?.activeJobs || 0} active
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20 shadow-lg shadow-purple-500/5">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-purple-400">
              <FileText className="h-4 w-4" />
              Applications
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              <AnimatedCounter value={platformActivity?.totalApplications || 0} />
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="secondary" className="text-xs bg-purple-500/10 text-purple-400">
                {platformActivity?.totalInterviews || 0} interviews
              </Badge>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Tabs for different analytics views */}
      <motion.div variants={itemVariants}>
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="bg-muted/50 border border-border/50">
            <TabsTrigger value="overview" className="data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-400">
              Overview
            </TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-400">
              Users
            </TabsTrigger>
            <TabsTrigger value="activity" className="data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-400">
              Activity
            </TabsTrigger>
            <TabsTrigger value="features" className="data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-400">
              Features
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Signup Trend */}
              <Card className="bg-card/50 border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-orange-400" />
                    User Signups (30 days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={{ count: { label: "Signups", color: "hsl(24, 100%, 50%)" } }} className="h-64 w-full">
                    <AreaChart data={userStats?.signupTrend || []}>
                      <defs>
                        <linearGradient id="signupGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(24, 100%, 50%)" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(24, 100%, 50%)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis 
                        dataKey="date" 
                        stroke="var(--muted-foreground)"
                        fontSize={10}
                        tickFormatter={(value) => format(new Date(value), 'MMM d')}
                        interval="preserveStartEnd"
                      />
                      <YAxis stroke="var(--muted-foreground)" fontSize={10} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Area 
                        type="monotone" 
                        dataKey="count" 
                        stroke="hsl(24, 100%, 50%)" 
                        fill="url(#signupGradient)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              {/* Role Distribution */}
              <Card className="bg-card/50 border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5 text-orange-400" />
                    User Roles Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={{ 
                    employers: { label: "Employers", color: COLORS[0] },
                    candidates: { label: "Candidates", color: COLORS[1] },
                    teamMembers: { label: "Team Members", color: COLORS[2] },
                    developers: { label: "Developers", color: COLORS[3] }
                  }} className="h-64 w-full">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Employers', value: userStats?.employers || 0 },
                          { name: 'Candidates', value: userStats?.candidates || 0 },
                          { name: 'Team Members', value: userStats?.teamMembers || 0 },
                          { name: 'Developers', value: userStats?.developers || 0 },
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {[0, 1, 2, 3].map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent />} />
                    </PieChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>

            {/* Platform Activity Trend */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-orange-400" />
                  Platform Activity (30 days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={{ 
                  jobs: { label: "Jobs Created", color: "var(--primary)" },
                  applications: { label: "Applications", color: "hsl(24, 100%, 50%)" }
                }} className="h-72 w-full">
                  <LineChart data={platformActivity?.activityTrend || []}>
                    <XAxis 
                      dataKey="date" 
                      stroke="var(--muted-foreground)"
                      fontSize={10}
                      tickFormatter={(value) => format(new Date(value), 'MMM d')}
                      interval="preserveStartEnd"
                    />
                    <YAxis stroke="var(--muted-foreground)" fontSize={10} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line 
                      type="monotone" 
                      dataKey="jobs" 
                      stroke="var(--primary)" 
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
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            {/* Top Employers */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-orange-400" />
                  Top Employers by Activity
                </CardTitle>
                <CardDescription>
                  Most active employers on the platform
                </CardDescription>
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

            {/* Subscription Status */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-orange-400" />
                  Subscription Status Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
                    <p className="text-2xl font-bold text-green-400">{subscriptionStats?.trialing || 0}</p>
                    <p className="text-sm text-muted-foreground">Trialing</p>
                  </div>
                  <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
                    <p className="text-2xl font-bold text-blue-400">{subscriptionStats?.active || 0}</p>
                    <p className="text-sm text-muted-foreground">Active</p>
                  </div>
                  <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-center">
                    <p className="text-2xl font-bold text-yellow-400">{subscriptionStats?.expired || 0}</p>
                    <p className="text-sm text-muted-foreground">Expired</p>
                  </div>
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
                    <p className="text-2xl font-bold text-red-400">{subscriptionStats?.canceled || 0}</p>
                    <p className="text-sm text-muted-foreground">Canceled</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Total Interviews
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{platformActivity?.totalInterviews || 0}</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Documents Sent
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{platformActivity?.totalDocuments || 0}</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <Mic className="h-4 w-4" />
                    Voice Minutes Used
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{Math.round(platformActivity?.voiceMinutesUsed || 0)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Activity Chart */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">Jobs vs Applications Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={{ 
                  jobs: { label: "Jobs", color: "var(--primary)" },
                  applications: { label: "Applications", color: "hsl(24, 100%, 50%)" }
                }} className="h-72 w-full">
                  <BarChart data={platformActivity?.activityTrend?.slice(-14) || []}>
                    <XAxis 
                      dataKey="date" 
                      stroke="var(--muted-foreground)"
                      fontSize={10}
                      tickFormatter={(value) => format(new Date(value), 'MMM d')}
                    />
                    <YAxis stroke="var(--muted-foreground)" fontSize={10} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="jobs" fill="var(--primary)" radius={[4, 4, 0, 0]} name="Jobs" />
                    <Bar dataKey="applications" fill="hsl(24, 100%, 50%)" radius={[4, 4, 0, 0]} name="Applications" />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="features" className="space-y-4">
            {/* Feature Usage Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    AI Analyses Run
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{featureUsage?.aiAnalysisCount || 0}</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <Mic className="h-4 w-4" />
                    Voice Interviews
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{featureUsage?.voiceInterviewCount || 0}</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardDescription>Document Signing Rate</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{(featureUsage?.documentSigningRate || 0).toFixed(1)}%</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardDescription>Quiz Phases Used</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{featureUsage?.quizPhaseCount || 0}</p>
                </CardContent>
              </Card>
            </div>

            {/* Workflow Step Usage */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-orange-400" />
                  Workflow Step Usage
                </CardTitle>
                <CardDescription>
                  Most popular workflow steps across all jobs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={{ 
                  count: { label: "Usage Count", color: "hsl(24, 100%, 50%)" }
                }} className="h-72 w-full">
                  <BarChart 
                    data={featureUsage?.workflowStepUsage || []} 
                    layout="vertical"
                  >
                    <XAxis type="number" stroke="var(--muted-foreground)" fontSize={10} />
                    <YAxis 
                      type="category" 
                      dataKey="step" 
                      stroke="var(--muted-foreground)" 
                      fontSize={10}
                      width={120}
                      tickFormatter={(value) => value.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar 
                      dataKey="count" 
                      fill="hsl(24, 100%, 50%)" 
                      radius={[0, 4, 4, 0]}
                      name="Usage Count"
                    />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </motion.div>
  );
}
