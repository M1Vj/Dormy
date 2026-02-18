-- Final: Add detailed fields to dorm_applications and occupants
-- Removes 'school' and aligns with existing occupant profile fields

-- 1) Update dorm_applications
alter table public.dorm_applications
  drop column if exists school,
  add column if not exists year_level text,
  add column if not exists contact_number text, -- This is the user's mobile number
  add column if not exists home_address text,
  add column if not exists birthdate date,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_mobile text,
  add column if not exists emergency_contact_relationship text;

-- 2) Update occupants
alter table public.occupants
  drop column if exists school,
  add column if not exists year_level text,
  add column if not exists contact_number text; -- To match applications if needed, but we typically use contact_mobile

-- Note: occupants already has home_address, birthdate, contact_mobile, contact_email, emergency_contact_* from init schema.
-- We keep year_level as a new field for better tracking.
