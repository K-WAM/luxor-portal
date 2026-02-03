-- Add email reminders log table
-- Rollback: drop table if exists email_reminders;

create table if not exists email_reminders (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  recipient_type text not null,
  target_month text not null,
  reminder_type text not null,
  bill_ids jsonb,
  sent_at timestamptz default now(),
  status text not null,
  provider_message_id text,
  error text
);

create unique index if not exists email_reminders_unique
  on email_reminders(recipient_email, target_month, reminder_type);
