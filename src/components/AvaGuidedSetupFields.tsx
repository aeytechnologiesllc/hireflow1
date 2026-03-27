import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_GUIDED_JOB_SETUP,
  JOB_FAMILY_OPTIONS,
  PORTFOLIO_PREFERENCE_OPTIONS,
  URGENCY_OPTIONS,
  WORK_AUTHORIZATION_OPTIONS,
  type GuidedJobSetup,
} from "@/lib/hiringPlan";

interface AvaGuidedSetupFieldsProps {
  value: GuidedJobSetup;
  onChange: <K extends keyof GuidedJobSetup>(field: K, nextValue: GuidedJobSetup[K]) => void;
}

export function AvaGuidedSetupFields({
  value = DEFAULT_GUIDED_JOB_SETUP,
  onChange,
}: AvaGuidedSetupFieldsProps) {
  return (
    <div className="space-y-5 rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">Ava setup</h3>
        <p className="text-xs text-muted-foreground">
          These answers help Ava write the role and build the right screening plan automatically.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Job Family</Label>
          <Select value={value.job_family} onValueChange={(nextValue) => onChange("job_family", nextValue)}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Choose the closest fit" />
            </SelectTrigger>
            <SelectContent>
              {JOB_FAMILY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {JOB_FAMILY_OPTIONS.find((option) => option.value === value.job_family)?.description}
          </p>
        </div>

        <div className="space-y-2">
          <Label>Hiring Pace</Label>
          <Select value={value.urgency} onValueChange={(nextValue) => onChange("urgency", nextValue)}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="How fast do you need to hire?" />
            </SelectTrigger>
            <SelectContent>
              {URGENCY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {URGENCY_OPTIONS.find((option) => option.value === value.urgency)?.description}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="must-haves">Must-haves</Label>
          <Textarea
            id="must-haves"
            value={value.must_haves}
            onChange={(event) => onChange("must_haves", event.target.value)}
            className="min-h-[96px] bg-background"
            placeholder="List the non-negotiable skills, experience, or outcomes."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="deal-breakers">Deal-breakers</Label>
          <Textarea
            id="deal-breakers"
            value={value.deal_breakers}
            onChange={(event) => onChange("deal_breakers", event.target.value)}
            className="min-h-[96px] bg-background"
            placeholder="What should automatically disqualify an applicant?"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="certifications">Certifications or licenses</Label>
          <Textarea
            id="certifications"
            value={value.certifications}
            onChange={(event) => onChange("certifications", event.target.value)}
            className="min-h-[84px] bg-background"
            placeholder="Example: CDL, RN license, OSHA 30, Salesforce Admin."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="schedule-details">Schedule or shift details</Label>
          <Textarea
            id="schedule-details"
            value={value.schedule_details}
            onChange={(event) => onChange("schedule_details", event.target.value)}
            className="min-h-[84px] bg-background"
            placeholder="Example: weekends required, overnight, hybrid Tue-Thu."
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="language-requirements">Language requirements</Label>
          <Textarea
            id="language-requirements"
            value={value.language_requirements}
            onChange={(event) => onChange("language_requirements", event.target.value)}
            className="min-h-[84px] bg-background"
            placeholder="Example: fluent Spanish, bilingual English/French."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="travel-requirement">Travel requirement</Label>
          <Textarea
            id="travel-requirement"
            value={value.travel_requirement}
            onChange={(event) => onChange("travel_requirement", event.target.value)}
            className="min-h-[84px] bg-background"
            placeholder="Example: no travel, local routes, up to 25% travel."
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Work authorization</Label>
          <Select value={value.work_authorization} onValueChange={(nextValue) => onChange("work_authorization", nextValue)}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Select if this matters for the role" />
            </SelectTrigger>
            <SelectContent>
              {WORK_AUTHORIZATION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Portfolio preference</Label>
          <Select value={value.portfolio_preference} onValueChange={(nextValue) => onChange("portfolio_preference", nextValue)}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Let Ava decide if a portfolio is needed" />
            </SelectTrigger>
            <SelectContent>
              {PORTFOLIO_PREFERENCE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="compensation-guidance">Compensation notes for Ava</Label>
        <Textarea
          id="compensation-guidance"
          value={value.compensation_guidance}
          onChange={(event) => onChange("compensation_guidance", event.target.value)}
          className="min-h-[84px] bg-background"
          placeholder="Call out commission structure, OTE expectations, or what matters most in the offer."
        />
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background/70 px-3 py-2">
        <div className="space-y-0.5">
          <Label htmlFor="customer-facing-switch">Customer-facing role</Label>
          <p className="text-xs text-muted-foreground">
            Ava will bias communication and simulation choices when this is on.
          </p>
        </div>
        <Switch
          id="customer-facing-switch"
          checked={value.customer_facing}
          onCheckedChange={(nextChecked) => onChange("customer_facing", nextChecked)}
        />
      </div>
    </div>
  );
}
