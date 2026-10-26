-- Generator Rental Services: access control
--
-- Public roles get no direct table access. Row Level Security is enabled on
-- every table with no policies, so even an accidental grant exposes nothing.
-- The website reaches data only through the functions granted below; admin
-- functions check the admin session token themselves.

alter table public.generators           enable row level security;
alter table public.customers            enable row level security;
alter table public.bookings             enable row level security;
alter table public.booking_events       enable row level security;
alter table public.business_settings    enable row level security;
alter table public.admin_credentials    enable row level security;
alter table public.admin_sessions       enable row level security;
alter table public.admin_login_attempts enable row level security;


revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

alter default privileges for role postgres in schema public revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- Customer-facing API
grant execute on function public.get_public_settings() to anon, authenticated;
grant execute on function public.list_generators(timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.get_booking_quote(uuid, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.create_booking(jsonb) to anon, authenticated;
grant execute on function public.get_booking_receipt(text, text) to anon, authenticated;
grant execute on function public.find_booking(text, text) to anon, authenticated;

-- Admin API: callable by anyone, authorised inside by the session token
grant execute on function public.admin_login(text) to anon, authenticated;
grant execute on function public.admin_session(text) to anon, authenticated;
grant execute on function public.admin_logout(text) to anon, authenticated;
grant execute on function public.admin_change_pin(text, text, text) to anon, authenticated;
grant execute on function public.admin_dashboard_stats(text, date, date, text) to anon, authenticated;
grant execute on function public.admin_list_generators(text) to anon, authenticated;
grant execute on function public.admin_save_generator(text, jsonb) to anon, authenticated;
grant execute on function public.admin_set_generator_active(text, uuid, boolean) to anon, authenticated;
grant execute on function public.admin_remove_generator(text, uuid) to anon, authenticated;
grant execute on function public.admin_list_bookings(text, text, text, uuid, date, integer, integer) to anon, authenticated;
grant execute on function public.admin_get_booking(text, uuid) to anon, authenticated;
grant execute on function public.admin_update_booking_status(text, uuid, text, text) to anon, authenticated;
grant execute on function public.admin_reschedule_booking(text, uuid, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.admin_calendar(text, timestamptz, timestamptz, uuid) to anon, authenticated;
grant execute on function public.admin_list_customers(text, text, integer) to anon, authenticated;
grant execute on function public.admin_get_customer(text, uuid) to anon, authenticated;
grant execute on function public.admin_update_customer(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.admin_get_settings(text) to anon, authenticated;
grant execute on function public.admin_update_settings(text, jsonb) to anon, authenticated;

-- The image upload Edge Function validates tokens with the service role.
grant execute on function public.admin_session(text) to service_role;

-- admin_setup_pin and every app_* helper stay owner-only.
