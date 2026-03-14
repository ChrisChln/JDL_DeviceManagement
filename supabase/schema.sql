create extension if not exists pgcrypto;

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  warehouse text not null,
  model text not null,
  serial_number text not null unique,
  brand text not null,
  supplier text,
  status text not null check (status in ('lease', 'rent', 'owned', 'repair', 'idle')),
  monthly_rent numeric(12, 2),
  lease_start_date date,
  lease_end_date date,
  lease_resolution text,
  last_watered_at date,
  water_interval_days integer not null default 14 check (water_interval_days > 0),
  last_maintained_at date,
  maintenance_interval_days integer not null default 90 check (maintenance_interval_days > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  maintenance_date date not null,
  issue_description text not null,
  cost numeric(12, 2),
  provider text,
  photo_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_assets_serial_number on public.assets(serial_number);
create index if not exists idx_assets_warehouse on public.assets(warehouse);
create index if not exists idx_assets_status on public.assets(status);
create index if not exists idx_assets_lease_end_date on public.assets(lease_end_date);
create index if not exists idx_maintenance_asset_id on public.maintenance_records(asset_id);
create index if not exists idx_maintenance_date on public.maintenance_records(maintenance_date desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_assets_updated_at on public.assets;
create trigger trg_assets_updated_at
before update on public.assets
for each row
execute function public.set_updated_at();

alter table public.assets enable row level security;
alter table public.maintenance_records enable row level security;

drop policy if exists "Allow web full access to assets" on public.assets;
drop policy if exists "Allow authenticated access to assets" on public.assets;
create policy "Allow authenticated access to assets"
on public.assets
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Allow web full access to maintenance_records" on public.maintenance_records;
drop policy if exists "Allow authenticated access to maintenance_records" on public.maintenance_records;
create policy "Allow authenticated access to maintenance_records"
on public.maintenance_records
for all
to authenticated
using (true)
with check (true);

create or replace view public.asset_alerts as
select
  a.id,
  a.serial_number,
  a.warehouse,
  a.status,
  a.lease_end_date,
  a.last_watered_at,
  a.water_interval_days,
  a.last_maintained_at,
  a.maintenance_interval_days,
  case when a.lease_end_date is null then null else a.lease_end_date - current_date end as lease_days_until,
  case when a.last_watered_at is null then null else (a.last_watered_at + a.water_interval_days) - current_date end as water_days_until,
  case when a.last_maintained_at is null then null else (a.last_maintained_at + a.maintenance_interval_days) - current_date end as maintenance_days_until
from public.assets a;
