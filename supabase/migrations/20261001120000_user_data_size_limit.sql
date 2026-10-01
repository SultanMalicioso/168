-- Reject oversized payloads written to user_data (the app writes here
-- directly with the user's token). NOT VALID: existing rows are untouched,
-- only new inserts/updates are checked.
ALTER TABLE public.user_data
  ADD CONSTRAINT user_data_value_size_limit
  CHECK (octet_length(value::text) <= 2097152) NOT VALID;

ALTER TABLE public.user_data
  ADD CONSTRAINT user_data_key_format
  CHECK (char_length(key) BETWEEN 1 AND 100 AND key ~ '^[A-Za-z0-9._:-]+$') NOT VALID;
