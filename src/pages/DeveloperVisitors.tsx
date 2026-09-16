import { motion } from "framer-motion";
import { Eye, Globe, Link2, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedCounter } from "@/components/animations/AnimatedCounter";
import { usePageViewAnalytics } from "@/hooks/usePageViewAnalytics";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis } from "recharts";
import { format, parseISO } from "date-fns";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

function RankedList({
  items,
  emptyLabel,
  icon: Icon,
}: {
  items: { label: string; count: number }[];
  emptyLabel: string;
  icon: typeof Globe;
}) {
  if (items.length === 0) {
    return <div className="text-sm text-muted-foreground py-6 text-center">{emptyLabel}</div>;
  }
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-sm">
              <span className="truncate text-foreground">{item.label}</span>
              <span className="text-muted-foreground font-medium ml-2">{item.count}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full"
                style={{ width: `${Math.max(4, (item.count / max) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DeveloperVisitors() {
  const { data, isLoading, error } = usePageViewAnalytics();

  const chartData = (data?.dailyTotals ?? []).map((d) => ({
    date: format(parseISO(d.date), "MMM d"),
    views: d.count,
  }));

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-primary">
              <Eye className="h-4 w-4" />
              Views (30 days)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              {isLoading ? <Skeleton className="h-8 w-16" /> : <AnimatedCounter value={data?.totalViews ?? 0} />}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Distinct Pages
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              {isLoading ? <Skeleton className="h-8 w-12" /> : (data?.topPages.length ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Referral Sources
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              {isLoading ? <Skeleton className="h-8 w-12" /> : (data?.topReferrers.length ?? 0)}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants}>
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Daily Visits (30 days)
            </CardTitle>
            <CardDescription>Cookieless, aggregated page-view counts from public/beacon.js</CardDescription>
          </CardHeader>
          <CardContent>
            {error != null ? (
              <div className="text-sm text-destructive">Could not load visitor analytics.</div>
            ) : isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ChartContainer config={{ views: { label: "Views", color: "hsl(var(--primary))" } }} className="h-64 w-full">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="visitorsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-views)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="var(--color-views)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area type="monotone" dataKey="views" stroke="var(--color-views)" fill="url(#visitorsFill)" strokeWidth={2} />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Top Pages</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-40 w-full" /> : (
              <RankedList
                icon={Globe}
                emptyLabel="No page views yet."
                items={(data?.topPages ?? []).map((p) => ({ label: p.path, count: p.count }))}
              />
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Top Referrers</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-40 w-full" /> : (
              <RankedList
                icon={Link2}
                emptyLabel="No cross-site referrers yet."
                items={(data?.topReferrers ?? []).map((r) => ({ label: r.host, count: r.count }))}
              />
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Top UTM Sources</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-40 w-full" /> : (
              <RankedList
                icon={TrendingUp}
                emptyLabel="No campaign traffic yet."
                items={(data?.topUtmSources ?? []).map((s) => ({ label: s.source, count: s.count }))}
              />
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
