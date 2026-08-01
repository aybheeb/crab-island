-- Staff accounts (cashiers and managers), authenticated by PIN.
-- The PIN itself is the identifier a staff member types in — there is no
-- separate username. Never store the PIN itself, only its bcrypt hash.
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pin_hash text not null,
  role text not null check (role in ('cashier', 'manager')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- One row per cashier clock-in. Orders are attributed to whichever shift
-- was open when they were created. A cashier can only have one open shift
-- (clocked_out_at is null) at a time — enforced in application code, not
-- here, since a partial unique index needs care with concurrent logins.
create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id),
  clocked_in_at timestamptz not null default now(),
  clocked_out_at timestamptz
);

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
