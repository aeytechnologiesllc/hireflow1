import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useJobStats } from "@/hooks/useJobs";
import { useApplicationStats } from "@/hooks/useApplications";
import { useAdvancedAnalytics } from "@/hooks/useAdvancedAnalytics";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart3, TrendingUp, TrendingDown, Users, Briefcase, CheckCircle, Clock, 
  XCircle, Target, Zap, FileText, Calendar, Award, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Minus, Brain, UserCheck, FileCheck
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, RadarChart, PolarGrid, PolarAngleAxis, Radar,
  ComposedChart, Legend
} from "recharts";

const COLORS = ["hsl(var(--primary))", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4"];

export default function Analytics() {
  const { role } = useAuth();
  const isEmployer = role === "employer";
  const { data: jobStats, isLoading: isLoadingJobs } = useJobStats();
  const { data: appStats, isLoading: isLoadingApps } = useApplicationStats();
  const { data: advancedStats, isLoading: isLoadingAdvanced } = useAdvancedAnalytics();
  const [activeTab, setActiveTab] = useState("overview");

  const isLoading = isLoadingJobs || isLoadingApps || isLoadingAdvanced;

  if (!isEmployer) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="bg-card border-border max-w-md">
          <CardContent className="p-8 text-center">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Employer Access Only</h2>
            <p className="text-muted-foreground">This page is only accessible to employers.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hireRate = appStats?.total ? Math.round((appStats.hired / appStats.total) * 100) : 0;
  const rejectionRate = advancedStats?.totalApplications 
    ? Math.round((advancedStats.totalRejected / advancedStats.totalApplications) * 100) 
    : 0;

  const funnelData = [
    { name: "Applied", value: advancedStats?.totalApplications || 0, fill: "hsl(var(--primary))" },
    { name: "Reviewing", value: appStats?.reviewing || 0, fill: "#10b981" },
    { name: "Interview", value: appStats?.interview || 0, fill: "#8b5cf6" },
    { name: "Hired", value: appStats?.hired || 0, fill: "#f59e0b" },
  ];

  const statusPieData = [
    { name: "Pending", value: appStats?.pending || 0 },
    { name: "Reviewing", value: appStats?.reviewing || 0 },
    { name: "Interview", value: appStats?.interview || 0 },
    { name: "Hired", value: appStats?.hired || 0 },
    { name: "Rejected", value: advancedStats?.totalRejected || 0 },
  ].filter(d => d.value > 0);

  const TrendIndicator = ({ value, suffix = "" }: { value: number; suffix?: string }) => {
    if (value > 0) {
      return (
        <span className="flex items-center gap-1 text-sm text-success">
          <ArrowUpRight className="h-3 w-3" />
          +{value}{suffix}
        </span>
      );
    } else if (value < 0) {
      return (
        <span className="flex items-center gap-1 text-sm text-destructive">
          <ArrowDownRight className="h-3 w-3" />
          {value}{suffix}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-sm text-muted-foreground">
        <Minus className="h-3 w-3" />
        0{suffix}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Analytics Dashboard</h2>
          <p className="text-muted-foreground mt-1">Comprehensive hiring insights and performance metrics</p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Zap className="h-3 w-3" />
          Live Data
        </Badge>
      </div>

      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Briefcase className="h-4 w-4 text-primary" />
                  <TrendIndicator value={0} />
                </div>
                <p className="text-2xl font-bold text-foreground">{jobStats?.published || 0}</p>
                <p className="text-xs text-muted-foreground">Active Jobs</p>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Users className="h-4 w-4 text-blue-500" />
                  <TrendIndicator value={advancedStats?.weeklyComparison.change || 0} suffix="%" />
                </div>
                <p className="text-2xl font-bold text-foreground">{advancedStats?.totalApplications || 0}</p>
                <p className="text-xs text-muted-foreground">Total Applications</p>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Calendar className="h-4 w-4 text-purple-500" />
                </div>
                <p className="text-2xl font-bold text-foreground">{advancedStats?.interviewMetrics?.total || 0}</p>
                <p className="text-xs text-muted-foreground">Interviews Scheduled</p>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                </div>
                <p className="text-2xl font-bold text-foreground">{hireRate}%</p>
                <p className="text-xs text-muted-foreground">Hire Rate</p>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Brain className="h-4 w-4 text-amber-500" />
                </div>
                <p className="text-2xl font-bold text-foreground">{advancedStats?.candidateQualityScore || 0}</p>
                <p className="text-xs text-muted-foreground">Avg AI Score</p>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Clock className="h-4 w-4 text-cyan-500" />
                </div>
                <p className="text-2xl font-bold text-foreground">{advancedStats?.timeToHire?.avgDays || "—"}</p>
                <p className="text-xs text-muted-foreground">Avg Days to Hire</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Tabs for different analytics views */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="quality">Quality</TabsTrigger>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Application Trends */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg text-foreground flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Application Trends (Last 30 Days)
              </CardTitle>
              <CardDescription>Daily applications, hires, and rejections</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={advancedStats?.applicationTrends || []}>
                    <defs>
                      <linearGradient id="colorApps" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                    <Area type="monotone" dataKey="applications" stroke="hsl(var(--primary))" fill="url(#colorApps)" strokeWidth={2} />
                    <Line type="monotone" dataKey="hired" stroke="#10b981" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Hiring Funnel */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg text-foreground">Hiring Funnel</CardTitle>
                <CardDescription>Conversion through hiring stages</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={funnelData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis dataKey="name" type="category" tick={{ fill: "hsl(var(--muted-foreground))" }} width={80} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--card))", 
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px"
                        }}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {funnelData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Status Distribution */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg text-foreground">Application Status</CardTitle>
                <CardDescription>Current status breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : statusPieData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={statusPieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {statusPieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: "hsl(var(--card))", 
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px"
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap justify-center gap-3 mt-2">
                      {statusPieData.map((entry, index) => (
                        <div key={entry.name} className="flex items-center gap-1.5">
                          <div 
                            className="w-2.5 h-2.5 rounded-full" 
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="text-xs text-muted-foreground">
                            {entry.name}: {entry.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No data available yet</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Weekly Comparison Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">This Week</p>
                    <p className="text-xl font-bold text-foreground">{advancedStats?.weeklyComparison.thisWeek || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last Week</p>
                    <p className="text-xl font-bold text-foreground">{advancedStats?.weeklyComparison.lastWeek || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Pending Review</p>
                    <p className="text-xl font-bold text-foreground">{advancedStats?.pendingReview || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-destructive/20 flex items-center justify-center">
                    <XCircle className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Rejection Rate</p>
                    <p className="text-xl font-bold text-foreground">{rejectionRate}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Pipeline Tab */}
        <TabsContent value="pipeline" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Phase Distribution */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg text-foreground">Phase Distribution</CardTitle>
                <CardDescription>Where candidates are in the pipeline</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : advancedStats?.phaseDistribution && advancedStats.phaseDistribution.length > 0 ? (
                  <div className="space-y-4">
                    {advancedStats.phaseDistribution.slice(0, 8).map((phase, index) => (
                      <div key={phase.phase} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-foreground capitalize">{phase.phase}</span>
                          <span className="text-muted-foreground">{phase.count}</span>
                        </div>
                        <Progress 
                          value={(phase.count / (advancedStats.totalApplications || 1)) * 100} 
                          className="h-2"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">
                    No phase data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Interview Metrics */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg text-foreground flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-purple-500" />
                  Interview Analytics
                </CardTitle>
                <CardDescription>Interview scheduling and outcomes</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <p className="text-3xl font-bold text-foreground">{advancedStats?.interviewMetrics?.total || 0}</p>
                        <p className="text-sm text-muted-foreground">Total Scheduled</p>
                      </div>
                      <div className="text-center p-4 bg-success/10 rounded-lg">
                        <p className="text-3xl font-bold text-success">{advancedStats?.interviewMetrics?.completed || 0}</p>
                        <p className="text-sm text-muted-foreground">Completed</p>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Completion Rate</span>
                        <span className="text-sm font-medium text-foreground">{advancedStats?.interviewMetrics?.conversionRate || 0}%</span>
                      </div>
                      <Progress value={advancedStats?.interviewMetrics?.conversionRate || 0} className="h-2" />
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div className="p-3 bg-amber-500/10 rounded-lg">
                        <p className="text-lg font-bold text-amber-500">{advancedStats?.interviewMetrics?.cancelled || 0}</p>
                        <p className="text-xs text-muted-foreground">Cancelled</p>
                      </div>
                      <div className="p-3 bg-destructive/10 rounded-lg">
                        <p className="text-lg font-bold text-destructive">{advancedStats?.interviewMetrics?.noShow || 0}</p>
                        <p className="text-xs text-muted-foreground">No Shows</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Time to Hire */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg text-foreground flex items-center gap-2">
                <Clock className="h-5 w-5 text-cyan-500" />
                Time to Hire Metrics
              </CardTitle>
              <CardDescription>How long it takes to hire candidates</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : advancedStats?.timeToHire ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <p className="text-3xl font-bold text-foreground">{advancedStats.timeToHire.avgDays}</p>
                    <p className="text-sm text-muted-foreground">Average Days</p>
                  </div>
                  <div className="text-center p-4 bg-success/10 rounded-lg">
                    <p className="text-3xl font-bold text-success">{advancedStats.timeToHire.minDays}</p>
                    <p className="text-sm text-muted-foreground">Fastest Hire</p>
                  </div>
                  <div className="text-center p-4 bg-primary/10 rounded-lg">
                    <p className="text-3xl font-bold text-primary">{advancedStats.timeToHire.medianDays}</p>
                    <p className="text-sm text-muted-foreground">Median Days</p>
                  </div>
                  <div className="text-center p-4 bg-amber-500/10 rounded-lg">
                    <p className="text-3xl font-bold text-amber-500">{advancedStats.timeToHire.maxDays}</p>
                    <p className="text-sm text-muted-foreground">Longest Hire</p>
                  </div>
                </div>
              ) : (
                <div className="h-32 flex items-center justify-center text-muted-foreground">
                  No hiring data available yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
          {/* Job Performance */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg text-foreground flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                Job Performance Comparison
              </CardTitle>
              <CardDescription>Applications and conversions by job</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-80 w-full" />
              ) : advancedStats?.jobPerformance && advancedStats.jobPerformance.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={advancedStats.jobPerformance.slice(0, 8)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="title" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="applications" name="Applications" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="left" dataKey="hired" name="Hired" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="conversionRate" name="Conversion %" stroke="#f59e0b" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-80 flex items-center justify-center text-muted-foreground">
                  No job performance data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Performing Jobs */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg text-foreground flex items-center gap-2">
                <Award className="h-5 w-5 text-amber-500" />
                Top Performing Jobs
              </CardTitle>
              <CardDescription>Jobs with highest conversion rates</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : advancedStats?.topPerformingJobs && advancedStats.topPerformingJobs.length > 0 ? (
                <div className="space-y-4">
                  {advancedStats.topPerformingJobs.map((job, index) => (
                    <div key={job.id} className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-foreground">{job.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {job.applications} applications • {job.hired} hired
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-success">{job.conversionRate}%</p>
                        <p className="text-xs text-muted-foreground">Conversion</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-muted-foreground">
                  No performance data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Quality Tab */}
        <TabsContent value="quality" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* AI Score Distribution */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg text-foreground flex items-center gap-2">
                  <Brain className="h-5 w-5 text-purple-500" />
                  AI Score Distribution
                </CardTitle>
                <CardDescription>How candidates score on AI analysis</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : advancedStats?.aiScoreDistribution ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={advancedStats.aiScoreDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="range" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--card))", 
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px"
                        }}
                      />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                        {advancedStats.aiScoreDistribution.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={index < 2 ? "#ef4444" : index === 2 ? "#f59e0b" : "#10b981"} 
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">
                    No AI score data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Candidate Quality Score */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg text-foreground flex items-center gap-2">
                  <Target className="h-5 w-5 text-success" />
                  Candidate Quality Overview
                </CardTitle>
                <CardDescription>Overall quality metrics</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (
                  <div className="space-y-6">
                    <div className="text-center py-6">
                      <div className="relative inline-flex items-center justify-center w-32 h-32">
                        <svg className="w-32 h-32 -rotate-90">
                          <circle
                            cx="64"
                            cy="64"
                            r="56"
                            stroke="hsl(var(--muted))"
                            strokeWidth="8"
                            fill="none"
                          />
                          <circle
                            cx="64"
                            cy="64"
                            r="56"
                            stroke="hsl(var(--primary))"
                            strokeWidth="8"
                            fill="none"
                            strokeDasharray={`${(advancedStats?.candidateQualityScore || 0) * 3.52} 352`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-3xl font-bold text-foreground">{advancedStats?.candidateQualityScore || 0}</span>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">Average AI Score</p>
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="p-3 bg-success/10 rounded-lg">
                        <p className="text-lg font-bold text-success">
                          {advancedStats?.aiScoreDistribution?.slice(3).reduce((a, b) => a + b.count, 0) || 0}
                        </p>
                        <p className="text-xs text-muted-foreground">High Quality</p>
                      </div>
                      <div className="p-3 bg-amber-500/10 rounded-lg">
                        <p className="text-lg font-bold text-amber-500">
                          {advancedStats?.aiScoreDistribution?.[2]?.count || 0}
                        </p>
                        <p className="text-xs text-muted-foreground">Average</p>
                      </div>
                      <div className="p-3 bg-destructive/10 rounded-lg">
                        <p className="text-lg font-bold text-destructive">
                          {advancedStats?.aiScoreDistribution?.slice(0, 2).reduce((a, b) => a + b.count, 0) || 0}
                        </p>
                        <p className="text-xs text-muted-foreground">Low Quality</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Engagement Tab */}
        <TabsContent value="engagement" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Document Metrics */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg text-foreground flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-500" />
                  Document Analytics
                </CardTitle>
                <CardDescription>Document signing and engagement</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <p className="text-3xl font-bold text-foreground">{advancedStats?.documentMetrics?.total || 0}</p>
                        <p className="text-sm text-muted-foreground">Total Documents</p>
                      </div>
                      <div className="text-center p-4 bg-success/10 rounded-lg">
                        <p className="text-3xl font-bold text-success">{advancedStats?.documentMetrics?.signingRate || 0}%</p>
                        <p className="text-sm text-muted-foreground">Signing Rate</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-2">
                          <FileCheck className="h-4 w-4 text-success" />
                          <span className="text-sm">Signed</span>
                        </div>
                        <span className="font-medium">{advancedStats?.documentMetrics?.signed || 0}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-amber-500" />
                          <span className="text-sm">Pending</span>
                        </div>
                        <span className="font-medium">{advancedStats?.documentMetrics?.pending || 0}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-destructive" />
                          <span className="text-sm">Declined</span>
                        </div>
                        <span className="font-medium">{advancedStats?.documentMetrics?.declined || 0}</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Summary Stats */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg text-foreground flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-primary" />
                  Hiring Summary
                </CardTitle>
                <CardDescription>Key hiring outcomes</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-4 bg-success/10 rounded-lg">
                        <p className="text-3xl font-bold text-success">{advancedStats?.totalHired || 0}</p>
                        <p className="text-sm text-muted-foreground">Total Hired</p>
                      </div>
                      <div className="text-center p-4 bg-destructive/10 rounded-lg">
                        <p className="text-3xl font-bold text-destructive">{advancedStats?.totalRejected || 0}</p>
                        <p className="text-sm text-muted-foreground">Total Rejected</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Hire Rate</span>
                        <span className="text-sm font-medium text-success">{hireRate}%</span>
                      </div>
                      <Progress value={hireRate} className="h-2" />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Rejection Rate</span>
                        <span className="text-sm font-medium text-destructive">{rejectionRate}%</span>
                      </div>
                      <Progress value={rejectionRate} className="h-2 [&>div]:bg-destructive" />
                    </div>

                    <div className="pt-4 border-t border-border">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Active Pipeline</span>
                        <span className="text-lg font-bold text-foreground">
                          {(advancedStats?.totalApplications || 0) - (advancedStats?.totalHired || 0) - (advancedStats?.totalRejected || 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
