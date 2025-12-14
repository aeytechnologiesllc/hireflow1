import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Briefcase,
  Users,
  Calendar,
  MessageSquare,
  FileText,
  User,
  TrendingUp,
  Clock,
  CheckCircle2,
  Plus,
} from "lucide-react";

export default function Dashboard() {
  const { user, role } = useAuth();
  const isEmployer = role === "employer";
  const userName = user?.user_metadata?.full_name?.split(" ")[0] || "there";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Welcome Section */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">
              Welcome back, {userName}!
            </h2>
            <p className="text-muted-foreground mt-1">
              {isEmployer
                ? "Here's what's happening with your hiring process today."
                : "Here's an overview of your job search progress."}
            </p>
          </div>
          {isEmployer && (
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Post New Job
            </Button>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {isEmployer ? (
            <>
              <Card className="bg-card border-border">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Active Jobs</p>
                      <p className="text-3xl font-bold text-foreground mt-1">12</p>
                      <p className="text-xs text-success flex items-center gap-1 mt-2">
                        <TrendingUp className="h-3 w-3" />
                        +2 this week
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Briefcase className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Applicants</p>
                      <p className="text-3xl font-bold text-foreground mt-1">248</p>
                      <p className="text-xs text-success flex items-center gap-1 mt-2">
                        <TrendingUp className="h-3 w-3" />
                        +18 this week
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                      <Users className="h-6 w-6 text-accent" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Interviews Scheduled</p>
                      <p className="text-3xl font-bold text-foreground mt-1">8</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-2">
                        <Clock className="h-3 w-3" />
                        3 today
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
                      <Calendar className="h-6 w-6 text-success" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Unread Messages</p>
                      <p className="text-3xl font-bold text-foreground mt-1">5</p>
                      <p className="text-xs text-warning flex items-center gap-1 mt-2">
                        <MessageSquare className="h-3 w-3" />
                        Reply needed
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center">
                      <MessageSquare className="h-6 w-6 text-warning" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              <Card className="bg-card border-border">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Applications</p>
                      <p className="text-3xl font-bold text-foreground mt-1">15</p>
                      <p className="text-xs text-success flex items-center gap-1 mt-2">
                        <CheckCircle2 className="h-3 w-3" />
                        5 in review
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Interviews</p>
                      <p className="text-3xl font-bold text-foreground mt-1">3</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-2">
                        <Clock className="h-3 w-3" />
                        1 tomorrow
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                      <Calendar className="h-6 w-6 text-accent" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Saved Jobs</p>
                      <p className="text-3xl font-bold text-foreground mt-1">24</p>
                      <p className="text-xs text-success flex items-center gap-1 mt-2">
                        <TrendingUp className="h-3 w-3" />
                        +5 new matches
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
                      <Briefcase className="h-6 w-6 text-success" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Messages</p>
                      <p className="text-3xl font-bold text-foreground mt-1">2</p>
                      <p className="text-xs text-warning flex items-center gap-1 mt-2">
                        <MessageSquare className="h-3 w-3" />
                        Reply needed
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center">
                      <MessageSquare className="h-6 w-6 text-warning" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Quick Actions & Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Actions */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
              <CardDescription>
                {isEmployer ? "Common hiring tasks" : "Jump back in"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isEmployer ? (
                <>
                  <Button variant="outline" className="w-full justify-start gap-3 h-12">
                    <Briefcase className="h-5 w-5 text-primary" />
                    Create New Job Posting
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-3 h-12">
                    <Users className="h-5 w-5 text-accent" />
                    Review Pending Applications
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-3 h-12">
                    <Calendar className="h-5 w-5 text-success" />
                    Schedule Interview
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-3 h-12">
                    <User className="h-5 w-5 text-muted-foreground" />
                    Invite Team Member
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" className="w-full justify-start gap-3 h-12">
                    <Briefcase className="h-5 w-5 text-primary" />
                    Browse New Jobs
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-3 h-12">
                    <FileText className="h-5 w-5 text-accent" />
                    Update Resume
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-3 h-12">
                    <Calendar className="h-5 w-5 text-success" />
                    Prepare for Interview
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-3 h-12">
                    <User className="h-5 w-5 text-muted-foreground" />
                    Complete Profile
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg">Recent Activity</CardTitle>
              <CardDescription>Latest updates and notifications</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {isEmployer ? (
                  <>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                        <Users className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-foreground">New application received</p>
                        <p className="text-xs text-muted-foreground">John Smith applied for Senior Developer</p>
                        <p className="text-xs text-muted-foreground mt-1">2 hours ago</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center mt-0.5">
                        <Calendar className="h-4 w-4 text-success" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-foreground">Interview completed</p>
                        <p className="text-xs text-muted-foreground">Sarah Johnson - Product Manager</p>
                        <p className="text-xs text-muted-foreground mt-1">5 hours ago</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-warning/10 flex items-center justify-center mt-0.5">
                        <MessageSquare className="h-4 w-4 text-warning" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-foreground">New message</p>
                        <p className="text-xs text-muted-foreground">Mike Chen sent you a message</p>
                        <p className="text-xs text-muted-foreground mt-1">Yesterday</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center mt-0.5">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-foreground">Application reviewed</p>
                        <p className="text-xs text-muted-foreground">TechCorp reviewed your application</p>
                        <p className="text-xs text-muted-foreground mt-1">1 hour ago</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                        <Calendar className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-foreground">Interview invitation</p>
                        <p className="text-xs text-muted-foreground">StartupXYZ invited you for an interview</p>
                        <p className="text-xs text-muted-foreground mt-1">3 hours ago</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center mt-0.5">
                        <Briefcase className="h-4 w-4 text-accent" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-foreground">New job match</p>
                        <p className="text-xs text-muted-foreground">5 new jobs match your profile</p>
                        <p className="text-xs text-muted-foreground mt-1">Yesterday</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
