-- Generator Rental Services: core schema
-- Tables, constraints and indexes. Business logic lives in 20261026000002_functions.sql.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'booking_status') then
    create type public.booking_status as enum ('confirmed', 'ongoing', 'completed', 'cancelled');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Generators
-- ---------------------------------------------------------------------------
create table if not exists public.generators (
  id                      uuid primary key default gen_random_uuid(),
  name                    text,
  capacity_kva            numeric(8,2)  not null check (capacity_kva > 0),
  hourly_rental_rate      numeric(12,2) not null check (hourly_rental_rate >= 0),
  diesel_consumption_lph  numeric(8,2)  not null check (diesel_consumption_lph >= 0),
  image_url               text,
  description             text check (char_length(description) <= 1000),
  is_active               boolean not null default true,
  under_maintenance       boolean not null default false,
  is_archived             boolean not null default false,
  sort_order              integer not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists generators_listing_idx on public.generators (is_archived, sort_order, capacity_kva);

-- ---------------------------------------------------------------------------
-- Customers (one row per normalised 10-digit Indian mobile number)
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null check (char_length(full_name) between 2 and 100),
  mobile_number  text not null unique check (mobile_number ~ '^[6-9][0-9]{9}$'),
  email          text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists customers_name_idx on public.customers (lower(full_name));

-- ---------------------------------------------------------------------------
-- Bookings. Every financial and diesel figure is a snapshot taken at booking
-- time, so later price edits never change an existing receipt or report.
-- ---------------------------------------------------------------------------
create table if not exists public.bookings (
  id                                 uuid primary key default gen_random_uuid(),
  booking_reference                  text not null unique,
  receipt_token                      text not null unique,
  customer_id                        uuid not null references public.customers(id) on delete restrict,
  generator_id                       uuid not null references public.generators(id) on delete restrict,
  start_at                           timestamptz not null,
  end_at                             timestamptz not null,
  rental_location                    text not null check (char_length(rental_location) between 5 and 500),
  landmark                           text check (char_length(landmark) <= 300),
  notes                              text check (char_length(notes) <= 1000),
  duration_seconds                   integer not null check (duration_seconds > 0),
  duration_hours                     numeric(12,4) not null,
  billable_hours                     numeric(12,4) not null,
  hourly_rate_at_booking             numeric(12,2) not null,
  rental_charge_at_booking           numeric(12,2) not null,
  additional_charges_at_booking      numeric(12,2) not null default 0,
  discount_at_booking                numeric(12,2) not null default 0,
  tax_at_booking                     numeric(12,2) not null default 0,
  total_amount_at_booking            numeric(12,2) not null,
  diesel_consumption_lph_at_booking  numeric(8,2)  not null,
  estimated_diesel_litres            numeric(12,2) not null,
  generator_capacity_at_booking      numeric(8,2)  not null,
  pricing_snapshot                   jsonb not null,
  status                             public.booking_status not null default 'confirmed',
  status_changed_at                  timestamptz not null default now(),
  created_at                         timestamptz not null default now(),
  updated_at                         timestamptz not null default now(),
  constraint bookings_period_valid check (end_at > start_at),
  -- Start-inclusive, end-exclusive: a booking may start exactly when another ends.
  -- Only confirmed and ongoing bookings hold the slot.
  constraint bookings_no_overlap exclude using gist (
    generator_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status in ('confirmed', 'ongoing'))
);

create index if not exists bookings_generator_period_idx on public.bookings (generator_id, start_at, end_at);
create index if not exists bookings_status_start_idx on public.bookings (status, start_at);
create index if not exists bookings_customer_idx on public.bookings (customer_id);

create table if not exists public.booking_events (
  id           bigint generated always as identity primary key,
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  from_status  public.booking_status,
  to_status    public.booking_status,
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists booking_events_booking_idx on public.booking_events (booking_id, created_at);

-- ---------------------------------------------------------------------------
-- Business settings (single row). Optional charges start disabled and at zero.
-- ---------------------------------------------------------------------------
create table if not exists public.business_settings (
  id                             boolean primary key default true check (id),
  business_name                  text not null default 'Generator Rental Services',
  tagline                        text not null default 'Reliable generator rental solutions for events, construction sites, businesses and emergency power needs.',
  contact_phone                  text,
  contact_whatsapp               text,
  contact_email                  text,
  contact_address                text,
  business_hours                 text,
  time_zone                      text not null default 'Asia/Kolkata',
  billing_mode                   text not null default 'exact'
                                   check (billing_mode in ('exact', 'round_up_half_hour', 'round_up_hour')),
  minimum_billable_hours         numeric(6,2) not null default 0 check (minimum_billable_hours >= 0),
  delivery_charge_enabled        boolean not null default false,
  delivery_charge                numeric(12,2) not null default 0 check (delivery_charge >= 0),
  delivery_charge_label          text not null default 'Delivery and pickup',
  discount_enabled               boolean not null default false,
  discount_percent               numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  discount_label                 text not null default 'Discount',
  tax_enabled                    boolean not null default false,
  tax_percent                    numeric(5,2) not null default 0 check (tax_percent between 0 and 100),
  tax_label                      text not null default 'GST',
  min_lead_minutes               integer not null default 0 check (min_lead_minutes >= 0),
  max_booking_days               integer not null default 60 check (max_booking_days between 1 and 366),
  admin_session_timeout_minutes  integer not null default 30 check (admin_session_timeout_minutes between 5 and 480),
  updated_at                     timestamptz not null default now()
);

insert into public.business_settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Admin credential and sessions. Never readable by public roles.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_credentials (
  id           boolean primary key default true check (id),
  pin_hash     text not null,
  pin_version  integer not null default 1,
  updated_at   timestamptz not null default now()
);

create table if not exists public.admin_sessions (
  id            uuid primary key default gen_random_uuid(),
  token_hash    text not null unique,
  pin_version   integer not null,
  client_ip     text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null
);

create table if not exists public.admin_login_attempts (
  id            bigint generated always as identity primary key,
  client_ip     text not null,
  success       boolean not null,
  attempted_at  timestamptz not null default now()
);

create index if not exists admin_login_attempts_time_idx on public.admin_login_attempts (attempted_at);
create index if not exists admin_login_attempts_ip_idx on public.admin_login_attempts (client_ip, attempted_at);
