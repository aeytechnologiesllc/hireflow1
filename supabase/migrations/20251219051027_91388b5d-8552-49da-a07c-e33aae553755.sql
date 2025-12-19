-- Add 'in_progress' to the application_status enum
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'in_progress';