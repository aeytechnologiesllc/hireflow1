import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Filter, MapPin, Briefcase, DollarSign, Clock } from "lucide-react";

export default function FindJobs() {
  const { role } = useAuth();
  const isEmployer = role === "employer";

  if (isEmployer) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="bg-card border-border max-w-md">
          <CardContent className="p-8 text-center">
            <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Candidate Access Only</h2>
            <p className="text-muted-foreground">
              This page is for job seekers. Use the Jobs section to manage your job postings.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground">Find Jobs</h2>
        <p className="text-muted-foreground mt-1">Discover opportunities that match your skills</p>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search jobs by title, company, or keywords..." 
            className="pl-10 bg-card border-border"
          />
        </div>
        <div className="relative w-64">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Location" 
            className="pl-10 bg-card border-border"
          />
        </div>
        <Button variant="outline" className="gap-2">
          <Filter className="h-4 w-4" />
          Filters
        </Button>
        <Button>Search</Button>
      </div>

      {/* Job Listings */}
      <div className="space-y-4">
        <Card className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-3">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Chat Support</h3>
                  <p className="text-sm text-muted-foreground">Souther Digital Tech</p>
                </div>
                
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    <span>Remote</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Briefcase className="h-4 w-4" />
                    <span>Full-Time</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <DollarSign className="h-4 w-4" />
                    <span>Competitive</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    <span>Posted 2 days ago</span>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground line-clamp-2">
                  We're looking for a passionate Chat Support specialist to join our growing team. You'll be responsible for providing excellent customer service through our chat platform...
                </p>
              </div>
              <Button>Apply Now</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
