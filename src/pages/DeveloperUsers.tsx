import { useState } from "react";
import { motion } from "framer-motion";
import { 
  Users, 
  Search, 
  UserPlus,
  Shield,
  Mail,
  Calendar,
  MoreHorizontal,
  Crown,
  UserCheck
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
} from "recharts";
import { format } from "date-fns";
import { toast } from "sonner";

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

const COLORS = ['hsl(24, 100%, 50%)', 'hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(142, 76%, 36%)'];

interface UserWithRole {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  role: string | null;
  subscription_status: string | null;
  company_name: string | null;
}

export default function DeveloperUsers() {
  const { role } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const { data: users, isLoading, refetch } = useQuery({
    queryKey: ['developer-users'],
    queryFn: async () => {
      // Fetch all profiles with their roles and subscriptions
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, user_id, email, full_name, created_at, company_name')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      const { data: subscriptions, error: subsError } = await supabase
        .from('subscriptions')
        .select('user_id, status');

      if (subsError) throw subsError;

      // Map roles and subscriptions to users
      const roleMap = new Map(roles?.map(r => [r.user_id, r.role]));
      const subMap = new Map(subscriptions?.map(s => [s.user_id, s.status]));

      return profiles?.map(p => ({
        id: p.user_id,
        email: p.email,
        full_name: p.full_name,
        created_at: p.created_at,
        role: roleMap.get(p.user_id) || 'candidate',
        subscription_status: subMap.get(p.user_id) || null,
        company_name: p.company_name
      })) as UserWithRole[];
    },
    enabled: role === 'developer',
    staleTime: 60000,
  });

  const { data: stats } = useQuery({
    queryKey: ['developer-user-stats'],
    queryFn: async () => {
      const { data: roles } = await supabase.from('user_roles').select('role');
      const { count: totalUsers } = await supabase.from('profiles').select('*', { count: 'exact', head: true });

      const roleCounts = {
        employer: 0,
        candidate: 0,
        team_member: 0,
        developer: 0
      };

      roles?.forEach(r => {
        if (r.role in roleCounts) {
          roleCounts[r.role as keyof typeof roleCounts]++;
        }
      });

      // Get signup trend
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: signups } = await supabase
        .from('profiles')
        .select('created_at')
        .gte('created_at', thirtyDaysAgo.toISOString());

      const trendMap = new Map<string, number>();
      signups?.forEach(s => {
        const date = format(new Date(s.created_at), 'yyyy-MM-dd');
        trendMap.set(date, (trendMap.get(date) || 0) + 1);
      });

      const signupTrend = Array.from(trendMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return {
        totalUsers: totalUsers || 0,
        ...roleCounts,
        signupTrend
      };
    },
    enabled: role === 'developer',
    staleTime: 60000,
  });

  const handlePromoteToDeveloper = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: 'developer' });

      if (error) {
        if (error.code === '23505') {
          toast.error("User already has developer role");
        } else {
          throw error;
        }
      } else {
        toast.success("User promoted to developer");
        refetch();
      }
    } catch (error) {
      toast.error("Failed to promote user");
    }
  };

  const filteredUsers = users?.filter(user => {
    const matchesSearch = 
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.company_name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    
    return matchesSearch && matchesRole;
  });

  const getRoleBadgeColor = (role: string | null) => {
    switch (role) {
      case 'developer': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'employer': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'team_member': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      default: return 'bg-green-500/10 text-green-400 border-green-500/20';
    }
  };

  const getStatusBadgeColor = (status: string | null) => {
    switch (status) {
      case 'active': return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'trialing': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'canceled': return 'bg-red-500/10 text-red-400 border-red-500/20';
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
        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-orange-400">
              <Users className="h-4 w-4" />
              Total Users
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              <AnimatedCounter value={stats?.totalUsers || 0} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-blue-400">
              <Crown className="h-4 w-4" />
              Employers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              <AnimatedCounter value={stats?.employer || 0} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-green-400">
              <UserCheck className="h-4 w-4" />
              Candidates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              <AnimatedCounter value={stats?.candidate || 0} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-purple-400">
              <Shield className="h-4 w-4" />
              Developers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              <AnimatedCounter value={stats?.developer || 0} />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Charts */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-orange-400" />
              User Signups (30 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{ count: { label: "Signups", color: "hsl(24, 100%, 50%)" } }} className="h-48 w-full">
              <AreaChart data={stats?.signupTrend || []}>
                <defs>
                  <linearGradient id="usersSignupGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(24, 100%, 50%)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(24, 100%, 50%)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="date" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickFormatter={(value) => format(new Date(value), 'MMM d')}
                  interval="preserveStartEnd"
                />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area 
                  type="monotone" 
                  dataKey="count" 
                  stroke="hsl(24, 100%, 50%)" 
                  fill="url(#usersSignupGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-orange-400" />
              Role Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{ 
              employers: { label: "Employers", color: COLORS[0] },
              candidates: { label: "Candidates", color: COLORS[1] },
              teamMembers: { label: "Team Members", color: COLORS[2] },
              developers: { label: "Developers", color: COLORS[3] }
            }} className="h-48 w-full">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Employers', value: stats?.employer || 0 },
                    { name: 'Candidates', value: stats?.candidate || 0 },
                    { name: 'Team Members', value: stats?.team_member || 0 },
                    { name: 'Developers', value: stats?.developer || 0 },
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={60}
                  paddingAngle={5}
                  dataKey="value"
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
      </motion.div>

      {/* Users Table */}
      <motion.div variants={itemVariants}>
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-orange-400" />
                All Users
              </CardTitle>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-64 bg-background/50"
                  />
                </div>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-40 bg-background/50">
                    <SelectValue placeholder="Filter by role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="employer">Employers</SelectItem>
                    <SelectItem value="candidate">Candidates</SelectItem>
                    <SelectItem value="team_member">Team Members</SelectItem>
                    <SelectItem value="developer">Developers</SelectItem>
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
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Role</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Subscription</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Joined</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers?.map((user) => (
                    <tr key={user.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white text-sm font-medium">
                            {user.full_name?.charAt(0) || user.email.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{user.full_name || 'No name'}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className={getRoleBadgeColor(user.role)}>
                          {user.role || 'candidate'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className={getStatusBadgeColor(user.subscription_status)}>
                          {user.subscription_status || 'No subscription'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(user.created_at), 'MMM d, yyyy')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handlePromoteToDeveloper(user.id)}>
                              <Shield className="h-4 w-4 mr-2" />
                              Promote to Developer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredUsers?.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No users found</p>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
