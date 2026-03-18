create extension if not exists pgcrypto;

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  warehouse text not null,
  model text not null,
  serial_number text not null unique,
  brand text not null,
  supplier text,
  status text not null check (status in ('租赁', '月租', '自有', '维修中', '闲置')),
  monthly_rent numeric(12, 2),
  is_purchase_ordered boolean,
  lease_start_date date,
  lease_end_date date,
  lease_resolution text,
  operation_requirement text,
  current_status text,
  issue_feedback text,
  last_watered_at date,
  water_interval_days integer not null default 14 check (water_interval_days > 0),
  last_maintained_at date,
  maintenance_interval_days integer not null default 90 check (maintenance_interval_days > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.assets
  add column if not exists is_purchase_ordered boolean,
  add column if not exists operation_requirement text,
  add column if not exists current_status text,
  add column if not exists issue_feedback text;

alter table if exists public.assets
  drop constraint if exists assets_status_check;

update public.assets
set status = case status
  when 'lease' then '租赁'
  when 'rent' then '月租'
  when 'owned' then '自有'
  when 'repair' then '维修中'
  when 'idle' then '闲置'
  else status
end
where status in ('lease', 'rent', 'owned', 'repair', 'idle');

alter table if exists public.assets
  add constraint assets_status_check
  check (status in ('租赁', '月租', '自有', '维修中', '闲置'));

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

create table if not exists public.transfer_records (
  id uuid primary key default gen_random_uuid(),
  transfer_no text not null unique,
  asset_id uuid not null references public.assets(id) on delete cascade,
  asset_serial_number text not null,
  asset_model text not null,
  asset_brand text not null,
  from_warehouse text not null,
  to_warehouse text not null,
  requested_by_user_id uuid references auth.users(id) on delete set null,
  requested_by_name text not null,
  reason text not null,
  note text,
  status text not null default '已完成' check (status in ('待处理', '已完成', '已取消')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.operation_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  actor_email text not null default '',
  action text not null,
  target_type text not null,
  target_label text,
  details text,
  created_at timestamptz not null default now()
);

create index if not exists idx_assets_serial_number on public.assets(serial_number);
create index if not exists idx_assets_warehouse on public.assets(warehouse);
create index if not exists idx_assets_status on public.assets(status);
create index if not exists idx_assets_lease_end_date on public.assets(lease_end_date);
create index if not exists idx_maintenance_asset_id on public.maintenance_records(asset_id);
create index if not exists idx_maintenance_date on public.maintenance_records(maintenance_date desc);
create index if not exists idx_transfer_records_asset_id on public.transfer_records(asset_id);
create index if not exists idx_transfer_records_created_at on public.transfer_records(created_at desc);
create index if not exists idx_transfer_records_transfer_no on public.transfer_records(transfer_no);
create index if not exists idx_operation_logs_created_at on public.operation_logs(created_at desc);
create index if not exists idx_operation_logs_actor_user_id on public.operation_logs(actor_user_id);

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

create or replace function public.create_asset_transfer(
  p_asset_id uuid,
  p_to_warehouse text,
  p_requested_by_user_id uuid,
  p_requested_by_name text,
  p_reason text,
  p_note text default ''
)
returns public.transfer_records
language plpgsql
as $$
declare
  current_asset public.assets%rowtype;
  transfer_row public.transfer_records%rowtype;
  transfer_code text;
begin
  select * into current_asset
  from public.assets
  where id = p_asset_id;

  if not found then
    raise exception '资产不存在';
  end if;

  if coalesce(trim(p_to_warehouse), '') = '' then
    raise exception '调入仓库不能为空';
  end if;

  if trim(p_to_warehouse) = current_asset.warehouse then
    raise exception '调入仓库不能与当前仓库相同';
  end if;

  if coalesce(trim(p_requested_by_name), '') = '' then
    raise exception '调拨人不能为空';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception '调拨原因不能为空';
  end if;

  transfer_code := concat(
    'TRF-',
    to_char(now(), 'YYYYMMDD'),
    '-',
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  );

  update public.assets
  set warehouse = trim(p_to_warehouse),
      updated_at = now()
  where id = p_asset_id;

  insert into public.transfer_records (
    transfer_no,
    asset_id,
    asset_serial_number,
    asset_model,
    asset_brand,
    from_warehouse,
    to_warehouse,
    requested_by_user_id,
    requested_by_name,
    reason,
    note,
    status,
    completed_at
  ) values (
    transfer_code,
    current_asset.id,
    current_asset.serial_number,
    current_asset.model,
    current_asset.brand,
    current_asset.warehouse,
    trim(p_to_warehouse),
    p_requested_by_user_id,
    trim(p_requested_by_name),
    trim(p_reason),
    nullif(trim(coalesce(p_note, '')), ''),
    '已完成',
    now()
  )
  returning * into transfer_row;

  return transfer_row;
end;
$$;

alter table public.assets enable row level security;
alter table public.maintenance_records enable row level security;
alter table public.transfer_records enable row level security;
alter table public.user_profiles enable row level security;
alter table public.operation_logs enable row level security;

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

drop policy if exists "Allow authenticated access to transfer_records" on public.transfer_records;
create policy "Allow authenticated access to transfer_records"
on public.transfer_records
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Allow authenticated access to user_profiles" on public.user_profiles;
create policy "Allow authenticated access to user_profiles"
on public.user_profiles
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Allow authenticated access to operation_logs" on public.operation_logs;
create policy "Allow authenticated read access to operation_logs"
on public.operation_logs
for select
to authenticated
using (true);


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
