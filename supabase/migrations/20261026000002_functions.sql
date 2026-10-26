-- Generator Rental Services: server-side logic
--
-- Every function the website calls is a SECURITY DEFINER function. The public
-- roles (anon, authenticated) have no table privileges at all, so these
-- functions are the only way in, and they validate everything themselves.
--
-- Errors are raised with MESSAGE = a stable code (e.g. SLOT_TAKEN) and
-- DETAIL = a sentence that can be shown to the person.

-- ===========================================================================
-- Internal helpers (not executable by public roles; see security migration)
-- ===========================================================================

create or replace function public.app_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists generators_touch on public.generators;
create trigger generators_touch before update on public.generators
  for each row execute function public.app_touch_updated_at();
drop trigger if exists customers_touch on public.customers;
create trigger customers_touch before update on public.customers
  for each row execute function public.app_touch_updated_at();
drop trigger if exists bookings_touch on public.bookings;
create trigger bookings_touch before update on public.bookings
  for each row execute function public.app_touch_updated_at();
drop trigger if exists settings_touch on public.business_settings;
create trigger settings_touch before update on public.business_settings
  for each row execute function public.app_touch_updated_at();

create or replace function public.app_fail(p_code text, p_detail text)
returns void language plpgsql as $$
begin
  raise exception using message = p_code, detail = p_detail, errcode = 'P0001';
end $$;

create or replace function public.app_settings()
returns public.business_settings
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select * from public.business_settings where id = true;
$$;

-- Accepts 98765 43210, +91 98765 43210, 919876543210, 09876543210 ...
-- Returns the 10-digit number, or null when it is not a valid Indian mobile.
create or replace function public.app_normalize_mobile(p_mobile text)
returns text language plpgsql immutable as $$
declare
  v text := regexp_replace(coalesce(p_mobile, ''), '[\s\-().]', '', 'g');
begin
  if v like '+91%' then
    v := substr(v, 4);
  elsif length(v) = 12 and v like '91%' then
    v := substr(v, 3);
  elsif length(v) = 11 and v like '0%' then
    v := substr(v, 2);
  end if;
  if v ~ '^[6-9][0-9]{9}$' then
    return v;
  end if;
  return null;
end $$;

create or replace function public.app_clean_text(p text, p_max integer)
returns text language sql immutable as $$
  select nullif(left(btrim(regexp_replace(coalesce(p, ''), '[\x01-\x09\x0b-\x1f\x7f]', '', 'g')), p_max), '');
$$;

-- The pricing rules that apply right now, with disabled charges zeroed.
-- This exact object is stored on each booking as pricing_snapshot.
create or replace function public.app_current_pricing()
returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select jsonb_build_object(
    'billing_mode', s.billing_mode,
    'minimum_billable_hours', s.minimum_billable_hours,
    'delivery_charge', case when s.delivery_charge_enabled then s.delivery_charge else 0 end,
    'delivery_charge_label', s.delivery_charge_label,
    'discount_percent', case when s.discount_enabled then s.discount_percent else 0 end,
    'discount_label', s.discount_label,
    'tax_percent', case when s.tax_enabled then s.tax_percent else 0 end,
    'tax_label', s.tax_label,
    'time_zone', s.time_zone
  )
  from public.business_settings s where s.id = true;
$$;

-- Rental charge and diesel estimate for a period.
-- Mirrors src/lib/pricing.ts exactly (both work in whole seconds).
create or replace function public.app_compute_quote(
  p_start timestamptz, p_end timestamptz, p_rate numeric, p_lph numeric, p_pricing jsonb
) returns jsonb language plpgsql immutable as $$
declare
  v_secs      bigint := extract(epoch from (p_end - p_start))::bigint;
  v_min_secs  bigint := round(coalesce((p_pricing->>'minimum_billable_hours')::numeric, 0) * 3600);
  v_bill_secs bigint;
  v_rental    numeric;
  v_extra     numeric := coalesce((p_pricing->>'delivery_charge')::numeric, 0);
  v_disc_pct  numeric := coalesce((p_pricing->>'discount_percent')::numeric, 0);
  v_tax_pct   numeric := coalesce((p_pricing->>'tax_percent')::numeric, 0);
  v_subtotal  numeric;
  v_discount  numeric;
  v_tax       numeric;
begin
  if v_secs <= 0 then
    perform public.app_fail('INVALID_PERIOD', 'The rental end must be later than the rental start.');
  end if;

  v_bill_secs := case coalesce(p_pricing->>'billing_mode', 'exact')
    when 'round_up_hour' then ceil(v_secs / 3600.0)::bigint * 3600
    when 'round_up_half_hour' then ceil(v_secs / 1800.0)::bigint * 1800
    else v_secs
  end;
  v_bill_secs := greatest(v_bill_secs, v_min_secs);

  v_rental   := round(p_rate * v_bill_secs / 3600.0, 2);
  v_subtotal := v_rental + v_extra;
  v_discount := round(v_subtotal * v_disc_pct / 100.0, 2);
  v_tax      := round((v_subtotal - v_discount) * v_tax_pct / 100.0, 2);

  return jsonb_build_object(
    'duration_seconds', v_secs,
    'duration_hours', round(v_secs / 3600.0, 4),
    'billable_seconds', v_bill_secs,
    'billable_hours', round(v_bill_secs / 3600.0, 4),
    'hourly_rate', p_rate,
    'rental_charge', v_rental,
    'additional_charges', v_extra,
    'discount', v_discount,
    'tax', v_tax,
    'total_amount', v_subtotal - v_discount + v_tax,
    'diesel_consumption_lph', p_lph,
    'estimated_diesel_litres', round(p_lph * v_secs / 3600.0, 2)
  );
end $$;

-- Rejects reversed, past or over-long periods. Times are truncated to the minute.
create or replace function public.app_validate_period(p_start timestamptz, p_end timestamptz)
returns void
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare
  s public.business_settings := public.app_settings();
begin
  if p_start is null or p_end is null then
    perform public.app_fail('INVALID_PERIOD', 'Choose a rental start and end date and time.');
  end if;
  if p_end <= p_start then
    perform public.app_fail('INVALID_PERIOD', 'The rental end must be later than the rental start.');
  end if;
  -- two minutes of grace for clock differences between the phone and the server
  if p_start < now() + make_interval(mins => s.min_lead_minutes) - interval '2 minutes' then
    perform public.app_fail('PAST_PERIOD',
      case when s.min_lead_minutes > 0
        then format('Rentals must start at least %s minutes from now.', s.min_lead_minutes)
        else 'The rental start time has already passed. Choose a later time.' end);
  end if;
  if p_end - p_start > make_interval(days => s.max_booking_days) then
    perform public.app_fail('TOO_LONG', format('A single booking can be at most %s days long.', s.max_booking_days));
  end if;
end $$;

-- Latest end time of any blocking booking that overlaps the period, or null when free.
create or replace function public.app_conflict_until(
  p_generator_id uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid default null
) returns timestamptz
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select max(b.end_at)
  from public.bookings b
  where b.generator_id = p_generator_id
    and b.status in ('confirmed', 'ongoing')
    and b.start_at < p_end
    and b.end_at > p_start
    and (p_exclude is null or b.id <> p_exclude);
$$;

create or replace function public.app_generator_json(g public.generators)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', g.id,
    'name', g.name,
    'capacity_kva', g.capacity_kva,
    'hourly_rental_rate', g.hourly_rental_rate,
    'diesel_consumption_lph', g.diesel_consumption_lph,
    'image_url', g.image_url,
    'description', g.description,
    'is_active', g.is_active,
    'under_maintenance', g.under_maintenance,
    'sort_order', g.sort_order
  );
$$;

create or replace function public.app_new_reference(p_tz text)
returns text
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_suffix text;
  v_ref text;
begin
  loop
    v_bytes := extensions.gen_random_bytes(5);
    v_suffix := '';
    for i in 0..4 loop
      v_suffix := v_suffix || substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1);
    end loop;
    v_ref := 'GR' || to_char(now() at time zone p_tz, 'YYMMDD') || '-' || v_suffix;
    exit when not exists (select 1 from public.bookings where booking_reference = v_ref);
  end loop;
  return v_ref;
end $$;

-- Everything a receipt shows, built only from the saved booking snapshot.
create or replace function public.app_receipt_json(p_booking_id uuid)
returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select jsonb_build_object(
    'booking_reference', b.booking_reference,
    'receipt_token', b.receipt_token,
    'status', b.status,
    'created_at', b.created_at,
    'start_at', b.start_at,
    'end_at', b.end_at,
    'customer', jsonb_build_object(
      'full_name', c.full_name,
      'mobile_number', c.mobile_number,
      'email', c.email
    ),
    'generator', jsonb_build_object(
      'name', g.name,
      'capacity_kva', b.generator_capacity_at_booking
    ),
    'rental_location', b.rental_location,
    'landmark', b.landmark,
    'notes', b.notes,
    'duration_seconds', b.duration_seconds,
    'duration_hours', b.duration_hours,
    'billable_hours', b.billable_hours,
    'hourly_rate', b.hourly_rate_at_booking,
    'rental_charge', b.rental_charge_at_booking,
    'additional_charges', b.additional_charges_at_booking,
    'discount', b.discount_at_booking,
    'tax', b.tax_at_booking,
    'total_amount', b.total_amount_at_booking,
    'diesel_consumption_lph', b.diesel_consumption_lph_at_booking,
    'estimated_diesel_litres', b.estimated_diesel_litres,
    'pricing', b.pricing_snapshot,
    'business', (
      select jsonb_build_object(
        'business_name', s.business_name,
        'contact_phone', s.contact_phone,
        'contact_email', s.contact_email,
        'contact_address', s.contact_address,
        'time_zone', s.time_zone
      ) from public.business_settings s where s.id = true
    )
  )
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  join public.generators g on g.id = b.generator_id
  where b.id = p_booking_id;
$$;

-- ===========================================================================
-- Public API (anon role)
-- ===========================================================================

create or replace function public.get_public_settings()
returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select jsonb_build_object(
    'business_name', s.business_name,
    'tagline', s.tagline,
    'contact_phone', s.contact_phone,
    'contact_whatsapp', s.contact_whatsapp,
    'contact_email', s.contact_email,
    'contact_address', s.contact_address,
    'business_hours', s.business_hours,
    'time_zone', s.time_zone,
    'min_lead_minutes', s.min_lead_minutes,
    'max_booking_days', s.max_booking_days,
    'pricing', public.app_current_pricing()
  )
  from public.business_settings s where s.id = true;
$$;

-- All non-archived generators with their availability for the requested period.
create or replace function public.list_generators(p_start timestamptz default null, p_end timestamptz default null)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare
  v_has_period boolean := p_start is not null and p_end is not null and p_end > p_start;
begin
  return coalesce((
    select jsonb_agg(item order by sort_order, capacity_kva)
    from (
      select g.sort_order, g.capacity_kva,
        public.app_generator_json(g) || jsonb_build_object(
          'availability', case
            when not g.is_active then 'inactive'
            when g.under_maintenance then 'unavailable'
            when v_has_period and public.app_conflict_until(g.id, p_start, p_end) is not null then 'booked'
            else 'available' end,
          'booked_until', case when v_has_period and g.is_active
            then public.app_conflict_until(g.id, p_start, p_end) end
        ) as item
      from public.generators g
      where not g.is_archived
    ) x
  ), '[]'::jsonb);
end $$;

-- Trusted estimate and live availability for one generator and period.
create or replace function public.get_booking_quote(p_generator_id uuid, p_start timestamptz, p_end timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare
  g public.generators;
  v_start timestamptz := date_trunc('minute', p_start);
  v_end timestamptz := date_trunc('minute', p_end);
  v_until timestamptz;
begin
  select * into g from public.generators where id = p_generator_id and not is_archived;
  if not found then
    perform public.app_fail('GENERATOR_NOT_FOUND', 'This generator is no longer listed. Choose another one.');
  end if;
  perform public.app_validate_period(v_start, v_end);
  v_until := public.app_conflict_until(g.id, v_start, v_end);
  return jsonb_build_object(
    'generator', public.app_generator_json(g),
    'availability', case
      when not g.is_active then 'inactive'
      when g.under_maintenance then 'unavailable'
      when v_until is not null then 'booked'
      else 'available' end,
    'booked_until', v_until,
    'pricing', public.app_current_pricing(),
    'quote', public.app_compute_quote(v_start, v_end, g.hourly_rental_rate, g.diesel_consumption_lph, public.app_current_pricing())
  );
end $$;

-- Validates input, re-checks availability under a row lock, prices the booking
-- from database values and stores it. Concurrent requests for the same generator
-- are serialised by the lock; the exclusion constraint is the final backstop.
create or replace function public.create_booking(p_booking jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  s public.business_settings := public.app_settings();
  g public.generators;
  v_generator_id uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_name text := public.app_clean_text(p_booking->>'full_name', 100);
  v_mobile text := public.app_normalize_mobile(p_booking->>'mobile_number');
  v_email text := lower(public.app_clean_text(p_booking->>'email', 254));
  v_location text := public.app_clean_text(p_booking->>'rental_location', 500);
  v_landmark text := public.app_clean_text(p_booking->>'landmark', 300);
  v_notes text := public.app_clean_text(p_booking->>'notes', 1000);
  v_pricing jsonb;
  v_quote jsonb;
  v_customer_id uuid;
  v_booking_id uuid;
begin
  begin
    v_generator_id := (p_booking->>'generator_id')::uuid;
    v_start := date_trunc('minute', (p_booking->>'start_at')::timestamptz);
    v_end := date_trunc('minute', (p_booking->>'end_at')::timestamptz);
  exception when others then
    perform public.app_fail('VALIDATION', 'The generator or rental dates could not be read. Please choose them again.');
  end;

  if v_name is null or char_length(v_name) < 2 then
    perform public.app_fail('VALIDATION', 'Enter your full name.');
  end if;
  if v_mobile is null then
    perform public.app_fail('VALIDATION', 'Enter a valid 10-digit Indian mobile number.');
  end if;
  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform public.app_fail('VALIDATION', 'Enter a valid email address or leave it empty.');
  end if;
  if v_location is null or char_length(v_location) < 5 then
    perform public.app_fail('VALIDATION', 'Enter the complete delivery address.');
  end if;

  perform public.app_validate_period(v_start, v_end);

  select * into g from public.generators where id = v_generator_id for update;
  if not found or g.is_archived then
    perform public.app_fail('GENERATOR_NOT_FOUND', 'This generator is no longer listed. Choose another one.');
  end if;
  if not g.is_active then
    perform public.app_fail('GENERATOR_INACTIVE', 'This generator is not taking bookings right now.');
  end if;
  if g.under_maintenance then
    perform public.app_fail('GENERATOR_UNAVAILABLE', 'This generator is unavailable right now. Choose another one.');
  end if;
  if public.app_conflict_until(g.id, v_start, v_end) is not null then
    perform public.app_fail('SLOT_TAKEN', 'This generator was just booked for part of that period. Choose another time or generator.');
  end if;

  v_pricing := public.app_current_pricing();
  v_quote := public.app_compute_quote(v_start, v_end, g.hourly_rental_rate, g.diesel_consumption_lph, v_pricing);

  insert into public.customers (full_name, mobile_number, email)
  values (v_name, v_mobile, v_email)
  on conflict (mobile_number) do update
    set full_name = excluded.full_name,
        email = coalesce(excluded.email, public.customers.email)
  returning id into v_customer_id;

  begin
    insert into public.bookings (
      booking_reference, receipt_token, customer_id, generator_id, start_at, end_at,
      rental_location, landmark, notes,
      duration_seconds, duration_hours, billable_hours,
      hourly_rate_at_booking, rental_charge_at_booking, additional_charges_at_booking,
      discount_at_booking, tax_at_booking, total_amount_at_booking,
      diesel_consumption_lph_at_booking, estimated_diesel_litres, generator_capacity_at_booking,
      pricing_snapshot, status
    ) values (
      public.app_new_reference(s.time_zone), encode(extensions.gen_random_bytes(18), 'hex'),
      v_customer_id, g.id, v_start, v_end,
      v_location, v_landmark, v_notes,
      (v_quote->>'duration_seconds')::integer, (v_quote->>'duration_hours')::numeric, (v_quote->>'billable_hours')::numeric,
      g.hourly_rental_rate, (v_quote->>'rental_charge')::numeric, (v_quote->>'additional_charges')::numeric,
      (v_quote->>'discount')::numeric, (v_quote->>'tax')::numeric, (v_quote->>'total_amount')::numeric,
      g.diesel_consumption_lph, (v_quote->>'estimated_diesel_litres')::numeric, g.capacity_kva,
      v_pricing, 'confirmed'
    ) returning id into v_booking_id;
  exception when exclusion_violation then
    perform public.app_fail('SLOT_TAKEN', 'This generator was just booked for part of that period. Choose another time or generator.');
  end;

  insert into public.booking_events (booking_id, from_status, to_status, note)
  values (v_booking_id, null, 'confirmed', 'Booked online');

  return public.app_receipt_json(v_booking_id);
end $$;

-- Receipt by reference plus the unguessable receipt token from the confirmation link.
create or replace function public.get_booking_receipt(p_reference text, p_token text)
returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select public.app_receipt_json(b.id)
  from public.bookings b
  where b.booking_reference = upper(btrim(p_reference))
    and b.receipt_token = btrim(p_token);
$$;

-- "My booking" lookup: reference plus the mobile number used to book.
create or replace function public.find_booking(p_reference text, p_mobile text)
returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select public.app_receipt_json(b.id)
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  where b.booking_reference = upper(btrim(p_reference))
    and c.mobile_number = public.app_normalize_mobile(p_mobile);
$$;

-- ===========================================================================
-- Admin authentication
-- ===========================================================================

create or replace function public.app_client_ip()
returns text language plpgsql stable as $$
declare
  h jsonb;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    h := null;
  end;
  return coalesce(
    nullif(btrim(split_part(h->>'x-forwarded-for', ',', 1)), ''),
    nullif(h->>'cf-connecting-ip', ''),
    nullif(h->>'x-real-ip', ''),
    'unknown'
  );
end $$;

-- Owner-only: set or reset the PIN from the Supabase SQL editor.
--   select public.admin_setup_pin('4826');
-- Not executable by the website's roles. Signs out every admin session.
create or replace function public.admin_setup_pin(p_pin text)
returns text
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'The PIN must be exactly four digits.';
  end if;
  if p_pin in ('0000', '1111', '1234', '4321', '2222', '9999', '1212', '0123') then
    raise exception 'Choose a less predictable PIN.';
  end if;
  insert into public.admin_credentials (id, pin_hash, pin_version)
  values (true, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), 1)
  on conflict (id) do update
    set pin_hash = excluded.pin_hash,
        pin_version = public.admin_credentials.pin_version + 1,
        updated_at = now();
  delete from public.admin_sessions;
  delete from public.admin_login_attempts;
  return 'Admin PIN saved. All admin sessions were signed out.';
end $$;

-- Login never raises on a wrong PIN: raising would roll back the failed-attempt
-- record that rate limiting depends on. It returns { ok: false, ... } instead.
create or replace function public.admin_login(p_pin text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  c_ip_max      constant integer := 5;                 -- failures per IP ...
  c_ip_window   constant interval := '15 minutes';     -- ... within this window
  c_all_max     constant integer := 10;                -- failures from anywhere ...
  c_all_window  constant interval := '60 minutes';     -- ... within this window
  c_lock        constant interval := '15 minutes';     -- lock after the latest failure
  c_absolute    constant interval := '12 hours';       -- session hard limit
  v_ip text := left(public.app_client_ip(), 100);
  v_cred public.admin_credentials;
  v_ip_fails integer;
  v_ip_last timestamptz;
  v_all_fails integer;
  v_all_last timestamptz;
  v_retry integer;
  v_token text;
  v_timeout integer := (public.app_settings()).admin_session_timeout_minutes;
begin
  -- one login check at a time, so parallel guesses cannot outrun the counters
  perform pg_advisory_xact_lock(hashtext('generator_admin_login'));

  delete from public.admin_login_attempts where attempted_at < now() - interval '7 days';
  delete from public.admin_sessions where expires_at < now() or last_seen_at < now() - interval '1 day';

  select count(*), max(attempted_at) into v_ip_fails, v_ip_last
  from public.admin_login_attempts a
  where a.client_ip = v_ip and not a.success
    and a.attempted_at > now() - c_ip_window
    and a.attempted_at > coalesce((select max(attempted_at) from public.admin_login_attempts
                                   where client_ip = v_ip and success), '-infinity');

  select count(*), max(attempted_at) into v_all_fails, v_all_last
  from public.admin_login_attempts a
  where not a.success
    and a.attempted_at > now() - c_all_window
    and a.attempted_at > coalesce((select max(attempted_at) from public.admin_login_attempts where success), '-infinity');

  if v_ip_fails >= c_ip_max and v_ip_last + c_lock > now() then
    v_retry := ceil(extract(epoch from (v_ip_last + c_lock - now())));
    return jsonb_build_object('ok', false, 'error', 'LOCKED', 'retry_after_seconds', v_retry);
  end if;
  if v_all_fails >= c_all_max and v_all_last + c_lock > now() then
    v_retry := ceil(extract(epoch from (v_all_last + c_lock - now())));
    return jsonb_build_object('ok', false, 'error', 'LOCKED', 'retry_after_seconds', v_retry);
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'error', 'INVALID_FORMAT');
  end if;

  select * into v_cred from public.admin_credentials where id = true;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_CONFIGURED');
  end if;

  if extensions.crypt(p_pin, v_cred.pin_hash) <> v_cred.pin_hash then
    insert into public.admin_login_attempts (client_ip, success) values (v_ip, false);
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PIN',
      'attempts_remaining', greatest(0, least(c_ip_max - v_ip_fails - 1, c_all_max - v_all_fails - 1))
    );
  end if;

  insert into public.admin_login_attempts (client_ip, success) values (v_ip, true);
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.admin_sessions (token_hash, pin_version, client_ip, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_cred.pin_version, v_ip, now() + c_absolute);

  return jsonb_build_object('ok', true, 'token', v_token, 'idle_timeout_minutes', v_timeout);
end $$;

-- Every admin function starts with this. Raises UNAUTHORIZED unless the token
-- belongs to a live session created under the current PIN.
create or replace function public.app_require_admin(p_token text)
returns uuid
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  v_id uuid;
  v_timeout integer := (public.app_settings()).admin_session_timeout_minutes;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    perform public.app_fail('UNAUTHORIZED', 'Your admin session has ended. Enter your PIN again.');
  end if;
  update public.admin_sessions s
     set last_seen_at = now()
   where s.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and s.expires_at > now()
     and s.last_seen_at > now() - make_interval(mins => v_timeout)
     and s.pin_version = (select pin_version from public.admin_credentials where id = true)
  returning s.id into v_id;
  if v_id is null then
    perform public.app_fail('UNAUTHORIZED', 'Your admin session has ended. Enter your PIN again.');
  end if;
  return v_id;
end $$;

create or replace function public.admin_session(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
begin
  perform public.app_require_admin(p_token);
  return jsonb_build_object('ok', true, 'idle_timeout_minutes', (public.app_settings()).admin_session_timeout_minutes);
end $$;

create or replace function public.admin_logout(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
begin
  delete from public.admin_sessions
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  return jsonb_build_object('ok', true);
end $$;

-- Re-authenticates with the current PIN, stores the new one, signs out every
-- other session and returns a fresh token for this one.
create or replace function public.admin_change_pin(p_token text, p_current_pin text, p_new_pin text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  v_cred public.admin_credentials;
  v_token text;
  v_ip text := left(public.app_client_ip(), 100);
begin
  perform public.app_require_admin(p_token);
  perform pg_advisory_xact_lock(hashtext('generator_admin_login'));
  select * into v_cred from public.admin_credentials where id = true for update;

  if p_current_pin is null or p_current_pin !~ '^[0-9]{4}$'
     or extensions.crypt(p_current_pin, v_cred.pin_hash) <> v_cred.pin_hash then
    insert into public.admin_login_attempts (client_ip, success) values (v_ip, false);
    return jsonb_build_object('ok', false, 'error', 'INVALID_PIN');
  end if;
  if p_new_pin is null or p_new_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'error', 'INVALID_FORMAT');
  end if;
  if p_new_pin = p_current_pin then
    return jsonb_build_object('ok', false, 'error', 'SAME_PIN');
  end if;
  if p_new_pin in ('0000', '1111', '1234', '4321', '2222', '9999', '1212', '0123') then
    return jsonb_build_object('ok', false, 'error', 'WEAK_PIN');
  end if;

  update public.admin_credentials
     set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 10)),
         pin_version = pin_version + 1,
         updated_at = now()
   where id = true;
  delete from public.admin_sessions;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.admin_sessions (token_hash, pin_version, client_ip, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_cred.pin_version + 1, v_ip, now() + interval '12 hours');
  return jsonb_build_object('ok', true, 'token', v_token);
end $$;

-- ===========================================================================
-- Admin: dashboard
-- ===========================================================================

-- p_revenue_basis: 'booked' counts confirmed + ongoing + completed bookings,
-- 'completed' counts completed bookings only. Cancelled bookings never count.
-- The period is by rental start date, in the business time zone, inclusive.
create or replace function public.admin_dashboard_stats(
  p_token text, p_from date, p_to date, p_revenue_basis text default 'booked'
) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  v_tz text := (public.app_settings()).time_zone;
  v_from timestamptz;
  v_to timestamptz;
  v_statuses public.booking_status[];
  v_today_start timestamptz := (date_trunc('day', now() at time zone v_tz)) at time zone v_tz;
  v_result jsonb;
begin
  perform public.app_require_admin(p_token);
  if p_from is null or p_to is null or p_to < p_from then
    perform public.app_fail('VALIDATION', 'Choose a valid report period.');
  end if;
  v_from := p_from::timestamp at time zone v_tz;
  v_to := (p_to + 1)::timestamp at time zone v_tz;
  v_statuses := case when p_revenue_basis = 'completed'
    then array['completed']::public.booking_status[]
    else array['confirmed', 'ongoing', 'completed']::public.booking_status[] end;

  select jsonb_build_object(
    'total_generators', (select count(*) from public.generators where not is_archived),
    'active_generators', (select count(*) from public.generators where not is_archived and is_active and not under_maintenance),
    'upcoming_bookings', (select count(*) from public.bookings where status = 'confirmed' and start_at > now()),
    'confirmed_bookings', (select count(*) from public.bookings where status = 'confirmed'),
    'ongoing_rentals', (select count(*) from public.bookings where status = 'ongoing'),
    'completed_bookings', (select count(*) from public.bookings where status = 'completed'),
    'cancelled_bookings', (select count(*) from public.bookings where status = 'cancelled'),
    'todays_bookings', (select count(*) from public.bookings
                        where status <> 'cancelled'
                          and start_at < v_today_start + interval '1 day' and end_at > v_today_start),
    'period', jsonb_build_object('from', p_from, 'to', p_to, 'revenue_basis',
                                 case when p_revenue_basis = 'completed' then 'completed' else 'booked' end),
    'period_bookings', count(b.id),
    'revenue', coalesce(sum(b.total_amount_at_booking), 0),
    'rental_hours', coalesce(sum(b.duration_hours), 0),
    'diesel_litres', coalesce(sum(b.estimated_diesel_litres), 0),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('date', d.day, 'revenue', d.revenue, 'bookings', d.n) order by d.day)
      from (
        select (b2.start_at at time zone v_tz)::date as day, sum(b2.total_amount_at_booking) as revenue, count(*) as n
        from public.bookings b2
        where b2.status = any(v_statuses) and b2.start_at >= v_from and b2.start_at < v_to
        group by 1
      ) d
    ), '[]'::jsonb),
    'by_generator', coalesce((
      select jsonb_agg(jsonb_build_object('capacity_kva', x.cap, 'revenue', x.revenue, 'bookings', x.n) order by x.cap)
      from (
        select b3.generator_capacity_at_booking as cap, sum(b3.total_amount_at_booking) as revenue, count(*) as n
        from public.bookings b3
        where b3.status = any(v_statuses) and b3.start_at >= v_from and b3.start_at < v_to
        group by 1
      ) x
    ), '[]'::jsonb)
  ) into v_result
  from public.bookings b
  where b.status = any(v_statuses) and b.start_at >= v_from and b.start_at < v_to;

  return v_result;
end $$;

-- ===========================================================================
-- Admin: generators
-- ===========================================================================

create or replace function public.admin_list_generators(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
begin
  perform public.app_require_admin(p_token);
  return coalesce((
    select jsonb_agg(public.app_generator_json(g) || jsonb_build_object(
      'is_archived', g.is_archived,
      'created_at', g.created_at,
      'updated_at', g.updated_at,
      'total_bookings', (select count(*) from public.bookings b where b.generator_id = g.id),
      'upcoming_bookings', (select count(*) from public.bookings b
                            where b.generator_id = g.id and b.status in ('confirmed', 'ongoing') and b.end_at > now())
    ) order by g.is_archived, g.sort_order, g.capacity_kva)
    from public.generators g
  ), '[]'::jsonb);
end $$;

-- Creates a generator when p_generator has no id, otherwise updates it.
-- Existing bookings keep their own price and diesel snapshot.
create or replace function public.admin_save_generator(p_token text, p_generator jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  v_id uuid;
  v_cap numeric;
  v_rate numeric;
  v_lph numeric;
  g public.generators;
begin
  perform public.app_require_admin(p_token);
  begin
    v_id := nullif(p_generator->>'id', '')::uuid;
    v_cap := (p_generator->>'capacity_kva')::numeric;
    v_rate := (p_generator->>'hourly_rental_rate')::numeric;
    v_lph := (p_generator->>'diesel_consumption_lph')::numeric;
  exception when others then
    perform public.app_fail('VALIDATION', 'Capacity, hourly rate and diesel consumption must be numbers.');
  end;
  if v_cap is null or v_cap <= 0 or v_cap > 5000 then
    perform public.app_fail('VALIDATION', 'Enter a capacity between 1 and 5000 kVA.');
  end if;
  if v_rate is null or v_rate < 0 or v_rate > 10000000 then
    perform public.app_fail('VALIDATION', 'Enter an hourly rate of zero or more.');
  end if;
  if v_lph is null or v_lph < 0 or v_lph > 1000 then
    perform public.app_fail('VALIDATION', 'Enter a diesel consumption of zero or more litres per hour.');
  end if;
  if (p_generator->>'image_url') is not null and (p_generator->>'image_url') <> ''
     and (p_generator->>'image_url') !~* '^https?://' then
    perform public.app_fail('VALIDATION', 'The image address must start with http:// or https://');
  end if;

  if v_id is null then
    insert into public.generators (name, capacity_kva, hourly_rental_rate, diesel_consumption_lph, image_url,
                                   description, is_active, under_maintenance, sort_order)
    values (
      public.app_clean_text(p_generator->>'name', 80), v_cap, round(v_rate, 2), round(v_lph, 2),
      public.app_clean_text(p_generator->>'image_url', 1000),
      public.app_clean_text(p_generator->>'description', 1000),
      coalesce((p_generator->>'is_active')::boolean, true),
      coalesce((p_generator->>'under_maintenance')::boolean, false),
      coalesce((p_generator->>'sort_order')::integer, (select coalesce(max(sort_order), 0) + 10 from public.generators))
    ) returning * into g;
  else
    update public.generators set
      name = public.app_clean_text(p_generator->>'name', 80),
      capacity_kva = v_cap,
      hourly_rental_rate = round(v_rate, 2),
      diesel_consumption_lph = round(v_lph, 2),
      image_url = public.app_clean_text(p_generator->>'image_url', 1000),
      description = public.app_clean_text(p_generator->>'description', 1000),
      is_active = coalesce((p_generator->>'is_active')::boolean, is_active),
      under_maintenance = coalesce((p_generator->>'under_maintenance')::boolean, under_maintenance),
      sort_order = coalesce((p_generator->>'sort_order')::integer, sort_order)
    where id = v_id and not is_archived
    returning * into g;
    if not found then
      perform public.app_fail('GENERATOR_NOT_FOUND', 'That generator no longer exists.');
    end if;
  end if;
  return public.app_generator_json(g);
end $$;

create or replace function public.admin_set_generator_active(p_token text, p_generator_id uuid, p_active boolean)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  g public.generators;
begin
  perform public.app_require_admin(p_token);
  update public.generators set is_active = p_active
   where id = p_generator_id and not is_archived returning * into g;
  if not found then
    perform public.app_fail('GENERATOR_NOT_FOUND', 'That generator no longer exists.');
  end if;
  return public.app_generator_json(g);
end $$;

-- Deletes a generator that was never booked; archives one with booking history
-- so receipts and reports keep working.
create or replace function public.admin_remove_generator(p_token text, p_generator_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
begin
  perform public.app_require_admin(p_token);
  if exists (select 1 from public.bookings where generator_id = p_generator_id
             and status in ('confirmed', 'ongoing') and end_at > now()) then
    perform public.app_fail('HAS_UPCOMING_BOOKINGS',
      'This generator has upcoming or ongoing bookings. Cancel or complete them first.');
  end if;
  if exists (select 1 from public.bookings where generator_id = p_generator_id) then
    update public.generators set is_archived = true, is_active = false where id = p_generator_id;
    return jsonb_build_object('action', 'archived');
  end if;
  delete from public.generators where id = p_generator_id;
  return jsonb_build_object('action', 'deleted');
end $$;

-- ===========================================================================
-- Admin: bookings and calendar
-- ===========================================================================

create or replace function public.app_admin_booking_row(b public.bookings, c public.customers)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', b.id,
    'booking_reference', b.booking_reference,
    'status', b.status,
    'start_at', b.start_at,
    'end_at', b.end_at,
    'created_at', b.created_at,
    'generator_id', b.generator_id,
    'generator_capacity', b.generator_capacity_at_booking,
    'customer_id', c.id,
    'customer_name', c.full_name,
    'customer_mobile', c.mobile_number,
    'rental_location', b.rental_location,
    'duration_hours', b.duration_hours,
    'total_amount', b.total_amount_at_booking,
    'estimated_diesel_litres', b.estimated_diesel_litres
  );
$$;

create or replace function public.admin_list_bookings(
  p_token text,
  p_search text default null,
  p_status text default null,
  p_generator_id uuid default null,
  p_date date default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  v_tz text := (public.app_settings()).time_zone;
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_digits text := nullif(regexp_replace(coalesce(p_search, ''), '\D', '', 'g'), '');
  v_kva numeric;
  v_day_start timestamptz := case when p_date is not null then p_date::timestamp at time zone v_tz end;
  v_total integer;
  v_rows jsonb;
begin
  perform public.app_require_admin(p_token);
  if v_q ~* '^\s*\d+(\.\d+)?\s*(kva)?\s*$' then
    v_kva := (regexp_replace(v_q, '[^0-9.]', '', 'g'))::numeric;
  end if;

  select coalesce(max(x.total), 0)::integer,
         coalesce(jsonb_agg(x.item order by x.start_at desc), '[]'::jsonb)
    into v_total, v_rows
  from (
    select public.app_admin_booking_row(b, c) as item, b.start_at, count(*) over () as total
    from public.bookings b
    join public.customers c on c.id = b.customer_id
    where (p_status is null or p_status = '' or b.status::text = p_status)
      and (p_generator_id is null or b.generator_id = p_generator_id)
      and (v_day_start is null or (b.start_at < v_day_start + interval '1 day' and b.end_at > v_day_start))
      and (
        v_q is null
        or b.booking_reference ilike '%' || v_q || '%'
        or c.full_name ilike '%' || v_q || '%'
        or (v_digits is not null and length(v_digits) >= 3 and c.mobile_number like '%' || right(v_digits, 10) || '%')
        or (v_kva is not null and b.generator_capacity_at_booking = v_kva)
        or b.status::text = lower(v_q)
      )
    order by b.start_at desc
    offset greatest(p_offset, 0)
    limit least(greatest(p_limit, 1), 200)
  ) x;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;

create or replace function public.admin_get_booking(p_token text, p_booking_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  v_receipt jsonb;
begin
  perform public.app_require_admin(p_token);
  v_receipt := public.app_receipt_json(p_booking_id);
  if v_receipt is null then
    perform public.app_fail('BOOKING_NOT_FOUND', 'That booking no longer exists.');
  end if;
  return v_receipt || jsonb_build_object(
    'id', p_booking_id,
    'generator_id', (select generator_id from public.bookings where id = p_booking_id),
    'customer_id', (select customer_id from public.bookings where id = p_booking_id),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('from_status', e.from_status, 'to_status', e.to_status,
                                          'note', e.note, 'created_at', e.created_at) order by e.created_at)
      from public.booking_events e where e.booking_id = p_booking_id
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.admin_update_booking_status(
  p_token text, p_booking_id uuid, p_status text, p_note text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  b public.bookings;
  g public.generators;
  v_old public.booking_status;
  v_new public.booking_status;
  v_allowed text[];
begin
  perform public.app_require_admin(p_token);
  begin
    v_new := p_status::public.booking_status;
  exception when others then
    perform public.app_fail('VALIDATION', 'Unknown booking status.');
  end;

  select * into b from public.bookings where id = p_booking_id;
  if not found then
    perform public.app_fail('BOOKING_NOT_FOUND', 'That booking no longer exists.');
  end if;
  -- lock the generator first (same order as create_booking), then the booking
  select * into g from public.generators where id = b.generator_id for update;
  select * into b from public.bookings where id = p_booking_id for update;

  v_old := b.status;
  v_allowed := case b.status
    when 'confirmed' then array['ongoing', 'completed', 'cancelled']
    when 'ongoing' then array['completed', 'cancelled']
    when 'cancelled' then array['confirmed']
    else array[]::text[] end;
  if not (v_new::text = any(v_allowed)) then
    perform public.app_fail('INVALID_TRANSITION',
      format('A %s booking cannot be changed to %s.', b.status, v_new));
  end if;

  if v_new = 'confirmed' then
    if b.end_at <= now() then
      perform public.app_fail('INVALID_TRANSITION', 'This booking''s rental period has already passed.');
    end if;
    if not g.is_active or g.is_archived then
      perform public.app_fail('GENERATOR_INACTIVE', 'Activate the generator before restoring this booking.');
    end if;
    if public.app_conflict_until(b.generator_id, b.start_at, b.end_at, b.id) is not null then
      perform public.app_fail('SLOT_TAKEN', 'Another booking now holds this generator for part of that period.');
    end if;
  end if;

  begin
    update public.bookings set status = v_new, status_changed_at = now()
     where id = b.id returning * into b;
  exception when exclusion_violation then
    perform public.app_fail('SLOT_TAKEN', 'Another booking now holds this generator for part of that period.');
  end;

  insert into public.booking_events (booking_id, from_status, to_status, note)
  values (b.id, v_old, v_new, public.app_clean_text(p_note, 500));

  return public.admin_get_booking(p_token, b.id);
end $$;

-- Moves a confirmed booking to a new period. Re-prices it with the hourly rate
-- and pricing rules saved on the booking, never with today's prices.
create or replace function public.admin_reschedule_booking(
  p_token text, p_booking_id uuid, p_start timestamptz, p_end timestamptz
) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  b public.bookings;
  v_start timestamptz := date_trunc('minute', p_start);
  v_end timestamptz := date_trunc('minute', p_end);
  v_quote jsonb;
begin
  perform public.app_require_admin(p_token);
  select * into b from public.bookings where id = p_booking_id;
  if not found then
    perform public.app_fail('BOOKING_NOT_FOUND', 'That booking no longer exists.');
  end if;
  perform 1 from public.generators where id = b.generator_id for update;
  select * into b from public.bookings where id = p_booking_id for update;

  if b.status <> 'confirmed' then
    perform public.app_fail('INVALID_TRANSITION', 'Only confirmed bookings can be rescheduled.');
  end if;
  if v_end is null or v_start is null or v_end <= v_start then
    perform public.app_fail('INVALID_PERIOD', 'The rental end must be later than the rental start.');
  end if;
  if public.app_conflict_until(b.generator_id, v_start, v_end, b.id) is not null then
    perform public.app_fail('SLOT_TAKEN', 'The generator is already booked for part of that period.');
  end if;

  v_quote := public.app_compute_quote(v_start, v_end, b.hourly_rate_at_booking,
                                      b.diesel_consumption_lph_at_booking, b.pricing_snapshot);
  begin
    update public.bookings set
      start_at = v_start,
      end_at = v_end,
      duration_seconds = (v_quote->>'duration_seconds')::integer,
      duration_hours = (v_quote->>'duration_hours')::numeric,
      billable_hours = (v_quote->>'billable_hours')::numeric,
      rental_charge_at_booking = (v_quote->>'rental_charge')::numeric,
      additional_charges_at_booking = (v_quote->>'additional_charges')::numeric,
      discount_at_booking = (v_quote->>'discount')::numeric,
      tax_at_booking = (v_quote->>'tax')::numeric,
      total_amount_at_booking = (v_quote->>'total_amount')::numeric,
      estimated_diesel_litres = (v_quote->>'estimated_diesel_litres')::numeric
    where id = b.id;
  exception when exclusion_violation then
    perform public.app_fail('SLOT_TAKEN', 'The generator is already booked for part of that period.');
  end;

  insert into public.booking_events (booking_id, from_status, to_status, note)
  values (b.id, b.status, b.status, 'Rescheduled');
  return public.admin_get_booking(p_token, b.id);
end $$;

create or replace function public.admin_calendar(
  p_token text, p_from timestamptz, p_to timestamptz, p_generator_id uuid default null
) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
begin
  perform public.app_require_admin(p_token);
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '62 days' then
    perform public.app_fail('VALIDATION', 'Choose a calendar range of up to 62 days.');
  end if;
  return coalesce((
    select jsonb_agg(public.app_admin_booking_row(b, c) order by b.start_at)
    from public.bookings b
    join public.customers c on c.id = b.customer_id
    where b.start_at < p_to and b.end_at > p_from
      and (p_generator_id is null or b.generator_id = p_generator_id)
  ), '[]'::jsonb);
end $$;

-- ===========================================================================
-- Admin: customers
-- ===========================================================================

create or replace function public.admin_list_customers(p_token text, p_search text default null, p_limit integer default 100)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_digits text := nullif(regexp_replace(coalesce(p_search, ''), '\D', '', 'g'), '');
begin
  perform public.app_require_admin(p_token);
  return coalesce((
    select jsonb_agg(x order by x->>'last_booking_at' desc nulls last)
    from (
      select jsonb_build_object(
        'id', c.id,
        'full_name', c.full_name,
        'mobile_number', c.mobile_number,
        'email', c.email,
        'created_at', c.created_at,
        'bookings', (select count(*) from public.bookings b where b.customer_id = c.id),
        'total_booked', (select coalesce(sum(total_amount_at_booking), 0) from public.bookings b
                         where b.customer_id = c.id and b.status <> 'cancelled'),
        'last_booking_at', (select max(start_at) from public.bookings b where b.customer_id = c.id)
      ) as x
      from public.customers c
      where v_q is null
         or c.full_name ilike '%' || v_q || '%'
         or (v_digits is not null and length(v_digits) >= 3 and c.mobile_number like '%' || right(v_digits, 10) || '%')
         or c.email ilike '%' || v_q || '%'
      limit least(greatest(p_limit, 1), 500)
    ) s
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_get_customer(p_token text, p_customer_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  c public.customers;
begin
  perform public.app_require_admin(p_token);
  select * into c from public.customers where id = p_customer_id;
  if not found then
    perform public.app_fail('CUSTOMER_NOT_FOUND', 'That customer no longer exists.');
  end if;
  return jsonb_build_object(
    'id', c.id, 'full_name', c.full_name, 'mobile_number', c.mobile_number, 'email', c.email,
    'created_at', c.created_at,
    'bookings', coalesce((
      select jsonb_agg(public.app_admin_booking_row(b, c) order by b.start_at desc)
      from public.bookings b where b.customer_id = c.id
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.admin_update_customer(p_token text, p_customer_id uuid, p_customer jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  v_name text := public.app_clean_text(p_customer->>'full_name', 100);
  v_mobile text := public.app_normalize_mobile(p_customer->>'mobile_number');
  v_email text := lower(public.app_clean_text(p_customer->>'email', 254));
begin
  perform public.app_require_admin(p_token);
  if v_name is null or char_length(v_name) < 2 then
    perform public.app_fail('VALIDATION', 'Enter the customer''s full name.');
  end if;
  if v_mobile is null then
    perform public.app_fail('VALIDATION', 'Enter a valid 10-digit Indian mobile number.');
  end if;
  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform public.app_fail('VALIDATION', 'Enter a valid email address or leave it empty.');
  end if;
  if exists (select 1 from public.customers where mobile_number = v_mobile and id <> p_customer_id) then
    perform public.app_fail('DUPLICATE_MOBILE', 'Another customer already uses this mobile number.');
  end if;
  update public.customers set full_name = v_name, mobile_number = v_mobile, email = v_email
   where id = p_customer_id;
  if not found then
    perform public.app_fail('CUSTOMER_NOT_FOUND', 'That customer no longer exists.');
  end if;
  return public.admin_get_customer(p_token, p_customer_id);
end $$;

-- ===========================================================================
-- Admin: settings
-- ===========================================================================

create or replace function public.admin_get_settings(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
begin
  perform public.app_require_admin(p_token);
  return (select to_jsonb(s) - 'id' from public.business_settings s where s.id = true);
end $$;

create or replace function public.admin_update_settings(p_token text, p_settings jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  v_tz text := coalesce(p_settings->>'time_zone', (public.app_settings()).time_zone);
begin
  perform public.app_require_admin(p_token);
  if not exists (select 1 from pg_timezone_names where name = v_tz) then
    perform public.app_fail('VALIDATION', 'Choose a valid time zone, for example Asia/Kolkata.');
  end if;
  begin
    update public.business_settings s set
      business_name = coalesce(public.app_clean_text(p_settings->>'business_name', 100), s.business_name),
      tagline = coalesce(public.app_clean_text(p_settings->>'tagline', 300), s.tagline),
      contact_phone = case when p_settings ? 'contact_phone' then public.app_clean_text(p_settings->>'contact_phone', 40) else s.contact_phone end,
      contact_whatsapp = case when p_settings ? 'contact_whatsapp' then public.app_clean_text(p_settings->>'contact_whatsapp', 40) else s.contact_whatsapp end,
      contact_email = case when p_settings ? 'contact_email' then public.app_clean_text(p_settings->>'contact_email', 254) else s.contact_email end,
      contact_address = case when p_settings ? 'contact_address' then public.app_clean_text(p_settings->>'contact_address', 500) else s.contact_address end,
      business_hours = case when p_settings ? 'business_hours' then public.app_clean_text(p_settings->>'business_hours', 200) else s.business_hours end,
      time_zone = v_tz,
      billing_mode = coalesce(p_settings->>'billing_mode', s.billing_mode),
      minimum_billable_hours = coalesce((p_settings->>'minimum_billable_hours')::numeric, s.minimum_billable_hours),
      delivery_charge_enabled = coalesce((p_settings->>'delivery_charge_enabled')::boolean, s.delivery_charge_enabled),
      delivery_charge = coalesce((p_settings->>'delivery_charge')::numeric, s.delivery_charge),
      delivery_charge_label = coalesce(public.app_clean_text(p_settings->>'delivery_charge_label', 60), s.delivery_charge_label),
      discount_enabled = coalesce((p_settings->>'discount_enabled')::boolean, s.discount_enabled),
      discount_percent = coalesce((p_settings->>'discount_percent')::numeric, s.discount_percent),
      discount_label = coalesce(public.app_clean_text(p_settings->>'discount_label', 60), s.discount_label),
      tax_enabled = coalesce((p_settings->>'tax_enabled')::boolean, s.tax_enabled),
      tax_percent = coalesce((p_settings->>'tax_percent')::numeric, s.tax_percent),
      tax_label = coalesce(public.app_clean_text(p_settings->>'tax_label', 60), s.tax_label),
      min_lead_minutes = coalesce((p_settings->>'min_lead_minutes')::integer, s.min_lead_minutes),
      max_booking_days = coalesce((p_settings->>'max_booking_days')::integer, s.max_booking_days),
      admin_session_timeout_minutes = coalesce((p_settings->>'admin_session_timeout_minutes')::integer, s.admin_session_timeout_minutes)
    where s.id = true;
  exception
    when check_violation then
      perform public.app_fail('VALIDATION', 'One of the values is out of range. Check percentages (0 to 100), session timeout (5 to 480 minutes) and booking length (1 to 366 days).');
    when invalid_text_representation or numeric_value_out_of_range then
      perform public.app_fail('VALIDATION', 'Numbers must be entered as plain numbers.');
  end;
  return public.admin_get_settings(p_token);
end $$;
