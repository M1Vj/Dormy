alter table public.occupants
  add column if not exists home_address text,
  add column if not exists birthdate date,
  add column if not exists contact_mobile text,
  add column if not exists contact_email text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_mobile text,
  add column if not exists emergency_contact_relationship text;
