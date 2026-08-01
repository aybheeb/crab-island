-- Staff accounts (cashiers and managers), authenticated by PIN.
-- The PIN itself is the identifier a staff member types in — there is no
-- separate username.
--
-- pin_hash (legacy, bcrypt, irreversible) is kept only for accounts created
-- before PINs became manager-viewable — it can never be decrypted back into
-- a PIN, by design of a hash. pin_encrypted (AES-256-GCM, lib/pinCipher.js)
-- is what every new account and every PIN reset writes now, since it can be
-- decrypted for display. A row has exactly one of the two populated;
-- findStaffByPin/isPinTaken in lib/staffAuth.js check whichever is present.
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pin_hash text,
  pin_encrypted text,
  role text not null check (role in ('cashier', 'manager')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table staff alter column pin_hash drop not null;
alter table staff add column if not exists pin_encrypted text;

-- One row per cashier clock-in. Orders are attributed to whichever shift
-- was open when they were created. A cashier can only have one open shift
-- (clocked_out_at is null) at a time — enforced in application code, not
-- here, since a partial unique index needs care with concurrent logins.
create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  clocked_in_at timestamptz not null default now(),
  clocked_out_at timestamptz
);

-- Idempotent, and needed even after the table already exists — a fresh
-- CREATE TABLE only runs once, but this fixes the FK on a database that had
-- the constraint before it included "on delete cascade" (deleting a staff
-- account was blocked entirely by their own shift history until this ran).
alter table shifts drop constraint if exists shifts_staff_id_fkey;
alter table shifts add constraint shifts_staff_id_fkey
  foreign key (staff_id) references staff(id) on delete cascade;

create index if not exists shifts_staff_open_idx
  on shifts (staff_id)
  where clocked_out_at is null;

-- Backs IP-based throttling on the login and step-up-authorize endpoints —
-- PINs are short, so the real defense against brute force is limiting how
-- many attempts a source IP gets in a time window, not the hash cost.
create table if not exists login_attempts (
  id bigserial primary key,
  ip text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists login_attempts_ip_time_idx
  on login_attempts (ip, created_at);
