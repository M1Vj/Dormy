-- Alter level_override to be an integer instead of text
ALTER TABLE public.rooms ALTER COLUMN level_override TYPE integer USING level_override::integer;