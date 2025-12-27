-- Complete data reset - truncate all public tables
-- Using CASCADE to handle foreign key dependencies

TRUNCATE TABLE 
  messages,
  notifications,
  document_audit_logs,
  documents,
  document_requests,
  document_packages,
  document_templates,
  interviews,
  applications,
  jobs,
  team_members,
  team_invitations,
  blueprint_purchases,
  voice_credits,
  subscription_usage,
  subscriptions,
  profiles,
  user_roles
CASCADE;