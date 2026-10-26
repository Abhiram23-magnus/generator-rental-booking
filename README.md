# Generator Rental Services

A booking website for a generator rental business. Customers pick a generator and a rental period, see the price and diesel estimate, and confirm a booking. The owner manages bookings, generators, prices and settings from a PIN-protected admin area.

- **Frontend:** React, TypeScript, Vite, Tailwind CSS v4, React Router, React Hook Form with Zod, Framer Motion, Lucide icons, jsPDF for receipts.
- **Backend:** Supabase Postgres. Every read and write goes through Postgres functions (RPCs). One Supabase Edge Function handles generator photo uploads, which are stored in Supabase Storage.
- **Hosting:** Vercel for the website, Supabase for the database, functions and storage.

## Contents

1. [What the site does](#what-the-site-does)
2. [How it works](#how-it-works)
3. [Local development](#local-development)
4. [Deploying to Supabase and Vercel](#deploying-to-supabase-and-vercel)
5. [Setting and changing the admin PIN](#setting-and-changing-the-admin-pin)
6. [Running the tests](#running-the-tests)
7. [Security notes](#security-notes)
8. [Backups](#backups)
9. [Troubleshooting](#troubleshooting)

## What the site does

### Customers

| Page | Path | What happens |
| --- | --- | --- |
| Home | `/` | Namaste greeting, the business tagline, the generator range and a Start Booking button. |
| Choose a generator | `/generators` | Pick a rental period. Each generator shows Available, Booked for Selected Period, Unavailable or Inactive for that period. |
| Booking details | `/book` | Rental schedule, customer details and delivery address. Calculate Estimate shows the price breakdown and diesel estimate. Confirm Booking rechecks availability on the server and saves the booking. |
| Confirmation | `/booking/:reference?t=…` | "Your generator booking has been confirmed successfully!", the receipt, Download PDF, Print and Back to Home. |
| Find my booking | `/my-booking` | Look up a receipt with the booking reference and the mobile number used to book. |

The choice of generator and period moves between pages in session storage, so database ids never appear in the address bar. Receipt links use the booking reference plus a random 36-character token, never the internal booking id.

### Owner (admin area at `/admin`)

- **Overview:** bookings today, upcoming and ongoing, generator status, and revenue for a chosen period with a chart and a table view.
- **Bookings:** search by reference, name, mobile, capacity, status or date. Open a booking to see its history, change its status, reschedule it, or copy customer details.
- **Calendar:** day, week and month views per generator.
- **Generators:** add, edit, upload a photo, deactivate, mark under maintenance, and remove. A generator with booking history is archived instead of deleted, and one with upcoming bookings cannot be removed until those are moved or cancelled.
- **Customers:** list, search, view booking history and correct details.
- **Settings:** business details and contacts, billing rules, optional charges, booking rules, the inactivity timeout, and Change PIN.

### Prices and diesel

The seven starting generators come from `supabase/migrations/20261026000004_seed_generators.sql`. The owner can change every value from the admin area.

| Capacity | Hourly rate | Diesel |
| --- | --- | --- |
| 25 kVA | ₹2,500 | 2.5 litres/hour |
| 30 kVA | ₹3,000 | 3 litres/hour |
| 40 kVA | ₹4,000 | 4 litres/hour |
| 50 kVA | ₹5,000 | 5 litres/hour |
| 62 kVA | ₹6,000 | 6 litres/hour |
| 82 kVA | ₹8,000 | 8 litres/hour |
| 125 kVA | ₹10,000 | 10 litres/hour |

How the total is calculated:

1. **Duration** is the time from start to end, counted in whole seconds. Billable hours depend on the billing mode in Settings:
   - exact time, charged per minute (the default)
   - rounded up to the next half hour
   - rounded up to the next hour

   A minimum number of billable hours can also be set. The default is 0.
2. **Rental charge** is the billable hours multiplied by the hourly rate.
3. **Optional charges** are a delivery charge, a percentage discount and a percentage tax. They are all switched off by default, and the site never adds a fee or tax the owner has not switched on. When they are on, the order is: rental charge, then delivery, then the discount on that subtotal, then tax on the discounted amount.
4. **Diesel** is the scheduled duration multiplied by litres per hour. It assumes the generator runs continuously for the whole period and is shown as an estimate only.

Example: a 25 kVA generator for 8 hours costs 8 × ₹2,500 = ₹20,000 and needs about 8 × 2.5 = 20 litres of diesel.

Every booking stores the hourly rate, charges, total, diesel rate, diesel estimate and generator capacity at the moment it was made. Later price changes never alter an existing booking, receipt or report.

### Booking rules

- **Times:** all times are entered and shown in the business time zone, Asia/Kolkata by default.
- **Overlaps:** a period is the interval from start up to, but not including, the end. Two bookings overlap when `existing.start < new.end AND existing.end > new.start`, so a booking may start exactly when another ends.
- **Which bookings hold a slot:** Confirmed and Ongoing bookings hold their slot. Cancelled and Completed bookings do not.
- **Allowed status changes:**
  - Confirmed can become Ongoing, Completed or Cancelled.
  - Ongoing can become Completed or Cancelled.
  - Cancelled can become Confirmed again, but only if the period has not ended, the generator is active and the slot is still free.
  - Completed is final.
- **Revenue:** cancelled bookings are never counted, and the period is chosen by rental start date. The Overview has two bases:
  - **Booked** counts Confirmed, Ongoing and Completed bookings.
  - **Completed** counts only Completed bookings.

## How it works

```
Browser (React on Vercel)
   │  anon key only
   ▼
Supabase PostgREST ──► public.* SECURITY DEFINER functions ──► tables (RLS on, no direct access)
   │
   └─► Edge Function admin-upload-image ──► checks admin session ──► Storage bucket generator-images
```

- **No direct table access.** The `anon` and `authenticated` roles have no grants on any table, and RLS is on with no policies. The browser can only call the functions listed in `supabase/migrations/20261026000003_security.sql`.
- **Double bookings are impossible at the database level.** `bookings_no_overlap` is a Postgres exclusion constraint on `(generator_id, tstzrange(start_at, end_at, '[)'))` for Confirmed and Ongoing bookings. Even a direct insert that skips the booking function is rejected. `create_booking` also locks the generator row, rechecks availability and recomputes the price on the server. The browser's estimate is only for display.
- **Admin sessions:**
  - The PIN is stored only as a bcrypt hash. `admin_login` compares it on the server and returns a random 256-bit session token. Only the SHA-256 of that token is stored.
  - The browser keeps the token in session storage and sends it with each admin call. Every admin function checks it on the server.
  - A session ends after the inactivity timeout (30 minutes by default), after 12 hours in any case, on logout, or when the PIN changes.
  - There is no `isAdmin` flag anywhere in the browser.
- **Login rate limits:**
  - 5 wrong PINs from one IP address within 15 minutes locks that address for 15 minutes.
  - 10 wrong PINs from anywhere within an hour locks all logins for 15 minutes.
  - Attempts are serialised with an advisory lock, so parallel guesses cannot slip past the limit.

### Repository layout

```
src/
  pages/             customer pages
  pages/admin/       admin pages
  admin/             admin session context, shared admin UI, booking drawer
  components/        shared UI: generator art, price breakdown, receipt, period picker
  lib/               pricing, validation, time zone, formatting, API client, PDF receipt
supabase/
  migrations/        schema, functions, security grants, seed generators, storage bucket
  functions/admin-upload-image/   Edge Function for photo uploads
scripts/
  db-reset.sh        creates a local database with Supabase-like roles and applies migrations
  local-api.ts       tiny local stand-in for PostgREST RPC + the upload function
tests/
  db/                database tests (booking rules, pricing, security)
  e2e/               Playwright tests of the real site
```

## Local development

You need Node.js 20 or newer and PostgreSQL 15 or newer, with `psql` on your PATH.

```bash
npm install

# 1. Create a local database and apply all migrations
DATABASE_URL=postgres://postgres@localhost:5432/postgres npm run db:reset -- generator_dev

# 2. Choose a local admin PIN (4 digits; common ones such as 1234 or 0000 are refused)
psql postgres://postgres@localhost:5432/generator_dev -c "select public.admin_setup_pin('4826')"

# 3. Start the local API that stands in for Supabase (port 54321)
LOCAL_DATABASE_URL=postgres://postgres@localhost:5432/generator_dev npm run api

# 4. In another terminal, point the site at it and start Vite
printf 'VITE_SUPABASE_URL=http://localhost:54321\nVITE_SUPABASE_ANON_KEY=local-dev\n' > .env.local
npm run dev
```

Open http://localhost:5173. The admin area is at http://localhost:5173/admin.

`scripts/local-api.ts` exists only for development and tests. It runs each function call as the `anon` role, as Supabase does, and saves uploaded photos to `.local-uploads/`. You can also use the Supabase CLI (`supabase start`) instead. The migrations work unchanged there.

## Deploying to Supabase and Vercel

### 1. Create the Supabase project

1. Create a project at https://supabase.com/dashboard and note the **Project URL** and the **anon / publishable key** (Project Settings → API).
2. Apply the migrations, either with the CLI:

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

   or by pasting each file in `supabase/migrations/` into the SQL Editor, in filename order.

   The last migration creates the public `generator-images` storage bucket (5 MB limit, JPEG, PNG and WebP).

3. Set the admin PIN in the SQL Editor (see [Setting and changing the admin PIN](#setting-and-changing-the-admin-pin)).

4. Add the business phone, WhatsApp, email and address from **Admin → Settings** after the site is live.

### 2. Deploy the photo upload function

```bash
npx supabase functions deploy admin-upload-image --no-verify-jwt
# Optional: only allow uploads from your site
npx supabase secrets set ALLOWED_ORIGIN=https://your-site.vercel.app
```

- **Service role key:** Supabase gives the function `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` automatically. The service role key stays on Supabase's servers and must never be put in the website's environment variables.
- **Why JWT checks are off:** `--no-verify-jwt` is needed because the owner signs in with the PIN, not a Supabase user account. The function instead checks the admin session token itself before accepting a file. It also checks the file type and the 5 MB size limit.

### 3. Deploy the website on Vercel

1. Import the GitHub repository in Vercel. It detects Vite. `vercel.json` sets the build, the single-page-app rewrite and some security headers.
2. Add two environment variables for Production and Preview:

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | your Project URL, for example `https://abcd1234.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | the anon / publishable key |

3. Deploy. Visit `/admin` and sign in with the PIN you set.

The anon key is meant to be public. It can only call the functions this project grants, and every admin function checks the session token on the server. `.env.example` lists the variables. Real `.env` files are ignored by git.

## Setting and changing the admin PIN

The project does not ship any PIN. Until one is set, `/admin` says that no PIN has been set up.

**First time:** in the Supabase SQL Editor, which runs as the database owner, run:

```sql
select public.admin_setup_pin('NNNN');   -- replace NNNN with your own 4 digits
```

- **Weak PINs are refused:** common choices such as 0000, 1111, 2222, 9999, 1234, 4321, 1212 and 0123. Pick something less guessable than a birth year too.
- **Owner only:** `admin_setup_pin` cannot be called from the website.
- **Resetting a forgotten PIN:** run the same statement again. It replaces the PIN and signs out every session.
- **Don't save the statement:** do not keep it in a saved SQL snippet, a migration or any committed file.

**Changing it later:** go to **Admin → Settings → Change PIN**. You must enter the current PIN again. Changing it signs out every other session.

## Running the tests

There are three layers of tests.

```bash
# Unit and component tests (pricing, validation, receipt and PDF)
npm test

# Database tests: booking rules, pricing on the server, concurrency, security
DATABASE_URL=postgres://postgres@localhost:5432/postgres npm run db:reset -- generator_test
TEST_DATABASE_URL=postgres://postgres@localhost:5432/generator_test npm run test:db

# End-to-end tests in a real browser
DATABASE_URL=postgres://postgres@localhost:5432/postgres npm run db:reset -- generator_dev
psql postgres://postgres@localhost:5432/generator_dev -c "select public.admin_setup_pin('4826')"
LOCAL_DATABASE_URL=postgres://postgres@localhost:5432/generator_dev npm run test:e2e
```

The end-to-end tests start the local API and Vite themselves. They expect a freshly reset `generator_dev` with the PIN 4826, or set `E2E_PIN` to the PIN you used. Reset the database before each run, because the tests create bookings and change a price. Install a browser once with `npx playwright install chromium` if you don't have one.

### What the tests cover

| Scenario | Where |
| --- | --- |
| 25 kVA for 8 hours costs ₹20,000 with 20 litres of diesel | `tests/db/booking.test.ts`, e2e |
| Partial hours, rentals across midnight and over several days | `tests/db/booking.test.ts`, `src/lib/pricing.test.ts` |
| Rounding, minimum hours, delivery, discount and tax only when switched on | `tests/db/booking.test.ts`, `src/lib/pricing.test.ts` |
| Browser estimate matches the server for random periods and rules | `tests/db/booking.test.ts` |
| Overlapping booking on the same generator is rejected | `tests/db/booking.test.ts`, e2e |
| Back-to-back bookings are allowed | `tests/db/booking.test.ts` |
| Different generators can be booked for the same period | `tests/db/booking.test.ts` |
| Simultaneous requests for one slot: exactly one succeeds | `tests/db/booking.test.ts` |
| Direct insert bypassing the function is still blocked | `tests/db/booking.test.ts` |
| Cancelled bookings free the slot; completed ones don't block | `tests/db/booking.test.ts` |
| Inactive or under-maintenance generators can't be booked | `tests/db/booking.test.ts` |
| Price edits don't change existing bookings | `tests/db/booking.test.ts`, `src/components/Receipt.test.tsx` |
| Invalid mobile numbers, emails, reversed or past periods are rejected | `tests/db/booking.test.ts`, `src/lib/validation.test.ts`, e2e |
| Unique booking references and private receipt links | `tests/db/booking.test.ts` |
| Admin PIN: correct, wrong, lockout, parallel guessing, hash only | `tests/db/security.test.ts`, e2e |
| Admin functions refuse without a valid session; timeout, logout, PIN change | `tests/db/security.test.ts`, e2e |
| Public roles can't read or write any table | `tests/db/security.test.ts` |
| Status changes, rescheduling, revenue without cancelled bookings | `tests/db/security.test.ts`, e2e |
| Receipt shows the saved figures and the PDF contains them | `src/components/Receipt.test.tsx`, e2e |

## Security notes

- **A four-digit PIN is weak.** It has only 10,000 combinations, so the server-side lockouts are what protect it. Use an unusual PIN and change it if anyone may have seen it.
- **Lockouts can be triggered on purpose.** Someone could enter wrong PINs to lock the owner out for 15 minutes at a time. That is the trade-off for making guessing impractical. If it happens, wait 15 minutes, or clear the attempts in the SQL Editor:

  ```sql
  delete from public.admin_login_attempts;
  ```
- **Spoofed addresses only get past the per-address limit.** The per-address limit uses the `x-forwarded-for` header that Supabase passes along, which a determined attacker can vary. The global limit of 10 failures per hour still applies across all addresses.
- **Receipts are protected by a token.** A receipt link contains a random token. Looking a booking up without that link also requires the mobile number used to book it.
- **The upload function can be limited to your site.** Set `ALLOWED_ORIGIN` on the Edge Function to your site's address so browsers on other sites cannot call it.

## Backups

- Supabase takes daily backups on paid plans (Database → Backups).
- On any plan you can take your own copy:

  ```bash
  pg_dump "postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres" \
    --schema=public --format=custom --file=generator-rental-$(date +%F).dump
  ```

  The connection string is under Project Settings → Database. Keep dumps somewhere private, because they contain customer names, phone numbers and addresses.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| The site says it is not connected to its database yet | `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing in Vercel. Add them and redeploy. |
| Refreshing a page such as `/generators` gives a 404 | The SPA rewrite is missing. Make sure `vercel.json` is deployed. |
| `/admin` says no PIN is set up | Run `select public.admin_setup_pin('NNNN')` in the SQL Editor. |
| "Too many incorrect attempts" on the admin login | The lockout is active. Wait 15 minutes or clear `admin_login_attempts` as shown above. |
| Photo upload fails with "unauthorized" | The admin session expired. Sign in again. If it persists, check the function is deployed with `--no-verify-jwt`. |
| Photo upload fails with a CORS error | `ALLOWED_ORIGIN` doesn't match the site's address exactly (scheme and host, no trailing slash). |
| "This generator is already booked for part of that period" | Another booking holds an overlapping period. Pick another time or generator. |
| Function errors after editing SQL by hand | Reapply the migrations in order. Every file can be run again safely. |
