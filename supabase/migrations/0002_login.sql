-- Password logins: the same handle + password gets back into the same account
-- from any device. Safe to run more than once.
--
-- The client sends PBKDF2(password, salt=handle) and never the password itself,
-- so this function only ever compares derived hashes.

create or replace function verify_login(p_handle text, p_secret_hash text)
returns boolean language sql security definer as $$
  select exists (
    select 1 from players
    where handle = p_handle and secret_hash = p_secret_hash
  );
$$;
