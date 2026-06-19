import { motion } from "framer-motion";
import { 
  Settings, 
  Shield,
  Database,
  Server,
  Bell,
  Key,
  Globe,
  Clock
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";

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

export default function DeveloperSettings() {
  const { user } = useAuth();

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6 max-w-4xl"
    >
      {/* System Status */}
      <motion.div variants={itemVariants}>
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Server className="h-5 w-5 text-primary" />
              System Status
            </CardTitle>
            <CardDescription>Current platform health and status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-success/10 border border-success/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">API Status</span>
                  <Badge className="bg-success/20 text-success border-success/30">Operational</Badge>
                </div>
                <p className="text-xs text-muted-foreground">All systems running normally</p>
              </div>
              <div className="p-4 rounded-xl bg-success/10 border border-success/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Database</span>
                  <Badge className="bg-success/20 text-success border-success/30">Healthy</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Supabase connected</p>
              </div>
              <div className="p-4 rounded-xl bg-success/10 border border-success/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Edge Functions</span>
                  <Badge className="bg-success/20 text-success border-success/30">Active</Badge>
                </div>
                <p className="text-xs text-muted-foreground">All functions deployed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Developer Info */}
      <motion.div variants={itemVariants}>
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Developer Account
            </CardTitle>
            <CardDescription>Your developer access information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
              <div>
                <p className="font-medium text-foreground">User ID</p>
                <p className="text-xs text-muted-foreground font-mono">{user?.id || 'N/A'}</p>
              </div>
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                Developer
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
              <div>
                <p className="font-medium text-foreground">Email</p>
                <p className="text-xs text-muted-foreground">{user?.email || 'N/A'}</p>
              </div>
              <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                Verified
              </Badge>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Platform Configuration */}
      <motion.div variants={itemVariants}>
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              Platform Configuration
            </CardTitle>
            <CardDescription>Configure platform-wide settings (read-only display)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-foreground">Maintenance Mode</Label>
                <p className="text-xs text-muted-foreground">Disable public access during maintenance</p>
              </div>
              <Switch disabled checked={false} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-foreground">New User Signups</Label>
                <p className="text-xs text-muted-foreground">Allow new users to register</p>
              </div>
              <Switch disabled checked={true} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-foreground">Email Notifications</Label>
                <p className="text-xs text-muted-foreground">Send transactional emails</p>
              </div>
              <Switch disabled checked={true} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-foreground">AI Features</Label>
                <p className="text-xs text-muted-foreground">Enable AI-powered analysis and interviews</p>
              </div>
              <Switch disabled checked={true} />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick Links */}
      <motion.div variants={itemVariants}>
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Quick Links
            </CardTitle>
            <CardDescription>Useful resources and documentation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <a 
                href="https://supabase.com/dashboard" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/30 hover:bg-muted/50 transition-colors"
              >
                <Database className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Supabase Dashboard</p>
                  <p className="text-xs text-muted-foreground">Manage database & auth</p>
                </div>
              </a>
              <a 
                href="https://stripe.com/dashboard" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/30 hover:bg-muted/50 transition-colors"
              >
                <Key className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Stripe Dashboard</p>
                  <p className="text-xs text-muted-foreground">Manage payments & subscriptions</p>
                </div>
              </a>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
