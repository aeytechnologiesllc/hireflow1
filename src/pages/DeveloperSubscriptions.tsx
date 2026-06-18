import { useState } from "react";
import { motion } from "framer-motion";
import { 
  CreditCard, 
  Search,
  TrendingUp,
  Calendar,
  DollarSign,
  Users,
  Clock
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  AreaChart,
  Area,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
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

const COLORS = ['hsl(142, 76%, 36%)', 'hsl(221, 83%, 53%)', 'hsl(48, 96%, 53%)', 'hsl(0, 84%, 60%)'];

interface SubscriptionWithUser {
  id: string;
  user_id: string;
  plan_type: string;
  status: string;
  trial_start: string | null;
  trial_end: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  amount: number | null;
  currency: string | null;
  user_email: string;
  user_name: string | null;
}

export default function DeveloperSubscriptions() {
  const { role } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: subscriptions, isLoading } = useQuery({
    queryKey: ['developer-subscriptions'],
    queryFn: async () => {
      const { data: subs, error: subsError } = await supabase
        .from('subscriptions')
        .select('*')
        .order('created_at', { ascending: false });

      if (subsError) throw subsError;

      // Get profiles for user info
      const userIds = subs?.map(s => s.user_id) || [];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, email, full_name')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]));

      return subs?.map(s => ({
        ...s,
        user_email: profileMap.get(s.user_id)?.email || 'Unknown',
        user_name: profileMap.get(s.user_id)?.full_name || null
      })) as SubscriptionWithUser[];
    },
    enabled: role === 'developer',
    staleTime: 60000,
  });

  const { data: stats } = useQuery({
    queryKey: ['developer-subscription-stats'],
    queryFn: async () => {
      const { data: subs } = await supabase.from('subscriptions').select('status, plan_type, created_at, amount');

      const statusCounts = { trialing: 0, active: 0, expired: 0, canceled: 0 };
      const planCounts: Record<string, number> = {};
      let totalRevenue = 0;

      subs?.forEach(s => {
        if (s.status in statusCounts) {
          statusCounts[s.status as keyof typeof statusCounts]++;
        }
        planCounts[s.plan_type] = (planCounts[s.plan_type] || 0) + 1;
        if (s.status === 'active' && s.amount) {
          totalRevenue += s.amount;
        }
      });

      // Get subscription trend (30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const trendMap = new Map<string, number>();
      subs?.filter(s => new Date(s.created_at) >= thirtyDaysAgo).forEach(s => {
        const date = format(new Date(s.created_at), 'yyyy-MM-dd');
        trendMap.set(date, (trendMap.get(date) || 0) + 1);
      });

      const subscriptionTrend = Array.from(trendMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const planDistribution = Object.entries(planCounts).map(([name, value]) => ({ name, value }));

      return {
        ...statusCounts,
        totalRevenue,
        total: subs?.length || 0,
        subscriptionTrend,
        planDistribution
      };
    },
    enabled: role === 'developer',
    staleTime: 60000,
  });

  const filteredSubscriptions = subscriptions?.filter(sub => {
    const matchesSearch = 
      sub.user_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.plan_type.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'trialing': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'canceled': return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'expired': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
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
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-green-400">
              <CreditCard className="h-4 w-4" />
              Active Subscriptions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              <AnimatedCounter value={stats?.active || 0} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-blue-400">
              <Clock className="h-4 w-4" />
              Trialing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              <AnimatedCounter value={stats?.trialing || 0} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-orange-400">
              <Users className="h-4 w-4" />
              Total Subscriptions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              <AnimatedCounter value={stats?.total || 0} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-purple-400">
              <DollarSign className="h-4 w-4" />
              Monthly Revenue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              ${((stats?.totalRevenue || 0) / 100).toFixed(0)}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Status Breakdown */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
          <p className="text-2xl font-bold text-green-400">{stats?.active || 0}</p>
          <p className="text-sm text-muted-foreground">Active</p>
        </div>
        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
          <p className="text-2xl font-bold text-blue-400">{stats?.trialing || 0}</p>
          <p className="text-sm text-muted-foreground">Trialing</p>
        </div>
        <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-center">
          <p className="text-2xl font-bold text-yellow-400">{stats?.expired || 0}</p>
          <p className="text-sm text-muted-foreground">Expired</p>
        </div>
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
          <p className="text-2xl font-bold text-red-400">{stats?.canceled || 0}</p>
          <p className="text-sm text-muted-foreground">Canceled</p>
        </div>
      </motion.div>

      {/* Charts */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-orange-400" />
              Subscription Trend (30 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{ count: { label: "Subscriptions", color: "hsl(24, 100%, 50%)" } }} className="h-48 w-full">
              <AreaChart data={stats?.subscriptionTrend || []}>
                <defs>
                  <linearGradient id="subsGradient" x1="0" y1="0" x2="0" y2="1">
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
                  fill="url(#subsGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-orange-400" />
              Plan Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{ value: { label: "Subscriptions", color: "hsl(24, 100%, 50%)" } }} className="h-48 w-full">
              <BarChart data={stats?.planDistribution || []} layout="vertical">
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={10} />
                <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={10} width={80} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="hsl(24, 100%, 50%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </motion.div>

      {/* Subscriptions Table */}
      <motion.div variants={itemVariants}>
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-orange-400" />
                All Subscriptions
              </CardTitle>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search subscriptions..."
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
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="trialing">Trialing</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="canceled">Canceled</SelectItem>
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
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">User</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Plan</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Period End</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubscriptions?.map((sub) => (
                    <tr key={sub.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium text-foreground">{sub.user_name || 'No name'}</p>
                          <p className="text-xs text-muted-foreground">{sub.user_email}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="secondary">{sub.plan_type}</Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className={getStatusBadgeColor(sub.status)}>
                          {sub.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {sub.current_period_end 
                            ? format(new Date(sub.current_period_end), 'MMM d, yyyy')
                            : sub.trial_end 
                              ? format(new Date(sub.trial_end), 'MMM d, yyyy')
                              : '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(sub.created_at), 'MMM d, yyyy')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredSubscriptions?.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No subscriptions found</p>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
