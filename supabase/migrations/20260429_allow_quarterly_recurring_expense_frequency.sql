alter table if exists public.property_recurring_expense_schedules
  drop constraint if exists property_recurring_expense_schedules_frequency_check;

alter table if exists public.property_recurring_expense_schedules
  add constraint property_recurring_expense_schedules_frequency_check
    check (frequency in ('monthly', 'quarterly', 'annual'));

-- rollback guidance:
-- alter table if exists public.property_recurring_expense_schedules
--   drop constraint if exists property_recurring_expense_schedules_frequency_check;
-- alter table if exists public.property_recurring_expense_schedules
--   add constraint property_recurring_expense_schedules_frequency_check
--     check (frequency in ('monthly', 'annual'));
