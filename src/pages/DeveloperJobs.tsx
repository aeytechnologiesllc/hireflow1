import { useState } from "react";
import { motion } from "framer-motion";
import { 
  Briefcase, 
  Search,
  Eye,
  FileText,
  Calendar,
  MapPin,
  Building2
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AnimatedCounter } from "@/components/animations/AnimatedCounter";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
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

const COLORS = ['#1aa06a', '#9fe7c9', '#0c1c14', 'var(--muted-foreground)'];

interface JobWithDetails {
  id: string;
  title: string;
  employer_id: string;
  status: string;
  location: string | null;
  created_at: string;
  application_count: number;
  employer_name: string | null;
  company_name: string | null;
}

export default function DeveloperJobs() {
  const { role } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['developer-jobs'],
    queryFn: async () => {
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select('id, title, employer_id, status, location, created_at')
        .order('created_at', { ascending: false });

      if (jobsError) throw jobsError;

      // Get application counts for each job
      const { data: applications } = await supabase
        .from('applications')
        .select('job_id');

      const appCountMap = new Map<string, number>();
      applications?.forEach(app => {
        appCountMap.set(app.job_id, (appCountMap.get(app.job_id) || 0) + 1);
      });

      // Get employer profiles
      const employerIds = [...new Set(jobsData?.map(j => j.employer_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, company_name')
        .in('user_id', employerIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]));

      return jobsData?.map(j => ({
        ...j,
        application_count: appCountMap.get(j.id) || 0,
        employer_name: profileMap.get(j.employer_id)?.full_name || null,
        company_name: profileMap.get(j.employer_id)?.company_name || null
      })) as JobWithDetails[];
    },
    enabled: role === 'developer',
    staleTime: 60000,
  });

  const { data: stats } = useQuery({
    queryKey: ['developer-job-stats'],
    queryFn: async () => {
      const { data: jobsData } = await supabase.from('jobs').select('status, employer_id, created_at');
      const { data: applications } = await supabase.from('applications').select('job_id');

      const statusCounts = { draft: 0, published: 0, closed: 0, archived: 0 };
      jobsData?.forEach(j => {
        if (j.status in statusCounts) {
          statusCounts[j.status as keyof typeof statusCounts]++;
        }
      });

      // Top employers by job count
      const employerJobCount = new Map<string, number>();
      jobsData?.forEach(j => {
        employerJobCount.set(j.employer_id, (employerJobCount.get(j.employer_id) || 0) + 1);
      });

      const topEmployerIds = Array.from(employerJobCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id]) => id);

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, company_name')
        .in('user_id', topEmployerIds);

      const topEmployers = topEmployerIds.map(id => {
        const profile = profiles?.find(p => p.user_id === id);
        return {
          id,
          name: profile?.company_name || profile?.full_name || 'Unknown',
          jobCount: employerJobCount.get(id) || 0
        };
      });

      // Status distribution for pie chart
      const statusDistribution = [
        { name: 'Published', value: statusCounts.published },
        { name: 'Draft', value: statusCounts.draft },
        { name: 'Closed', value: statusCounts.closed },
        { name: 'Archived', value: statusCounts.archived },
      ];

      return {
        ...statusCounts,
        total: jobsData?.length || 0,
        totalApplications: applications?.length || 0,
        topEmployers,
        statusDistribution
      };
    },
    enabled: role === 'developer',
    staleTime: 60000,
  });

  const filteredJobs = jobs?.filter(job => {
    const matchesSearch = 
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.company_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.employer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.location?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'published': return 'bg-success/10 text-success border-success/20';
      case 'draft': return 'bg-warning/10 text-warning border-warning/20';
      case 'closed': return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'archived': return 'bg-muted text-muted-foreground border-border';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

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

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Stats Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-primary">
              <Briefcase className="h-4 w-4" />
              Total Jobs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              <AnimatedCounter value={stats?.total || 0} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-success/10 to-success/5 border-success/20">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-success">
              <Eye className="h-4 w-4" />
              Published
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              <AnimatedCounter value={stats?.published || 0} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-primary">
              <FileText className="h-4 w-4" />
              Total Applications
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              <AnimatedCounter value={stats?.totalApplications || 0} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-warning">
              <Briefcase className="h-4 w-4" />
              Draft Jobs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              <AnimatedCounter value={stats?.draft || 0} />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Charts */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Top Employers by Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{ jobCount: { label: "Jobs", color: "#1aa06a" } }} className="h-48 w-full">
              <BarChart data={stats?.topEmployers || []} layout="vertical">
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={10} />
                <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={10} width={100} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="jobCount" fill="#1aa06a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{ 
              published: { label: "Published", color: COLORS[0] },
              draft: { label: "Draft", color: COLORS[1] },
              closed: { label: "Closed", color: COLORS[2] },
              archived: { label: "Archived", color: COLORS[3] }
            }} className="h-48 w-full">
              <PieChart>
                <Pie
                  data={stats?.statusDistribution || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={60}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {stats?.statusDistribution?.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </motion.div>

      {/* Jobs Table */}
      <motion.div variants={itemVariants}>
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                All Jobs
              </CardTitle>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search jobs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-64 bg-background/50"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40 bg-background/50">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Job</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Employer</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Applications</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs?.map((job) => (
                    <tr key={job.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium text-foreground">{job.title}</p>
                          {job.location && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {job.location}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div>
                          <p className="text-sm text-foreground">{job.company_name || 'No company'}</p>
                          <p className="text-xs text-muted-foreground">{job.employer_name || 'Unknown'}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className={getStatusBadgeColor(job.status)}>
                          {job.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-foreground">{job.application_count}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(job.created_at), 'MMM d, yyyy')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredJobs?.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No jobs found</p>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
