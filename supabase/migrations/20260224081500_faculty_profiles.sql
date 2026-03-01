-- Create faculty_profiles table
create table public.faculty_profiles (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  department text,
  position text,
  specialization text,
  bio text,
  faculty_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.faculty_profiles enable row level security;

-- Policies
create policy "Faculty profiles are viewable by everyone"
  on public.faculty_profiles for select
  using (true);

create policy "Users can update their own faculty profile"
  on public.faculty_profiles for update
  using (auth.uid() = user_id);

create policy "Users can insert their own faculty profile"
  on public.faculty_profiles for insert
  with check (auth.uid() = user_id);

-- Ensure the updated_at trigger function exists
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger for updated_at
create trigger handle_faculty_profiles_updated_at
  before update on public.faculty_profiles
  for each row execute procedure public.handle_updated_at();
