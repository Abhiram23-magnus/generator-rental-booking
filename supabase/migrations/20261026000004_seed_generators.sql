-- Initial generator fleet. Prices and diesel figures are editable from the admin dashboard.
insert into public.generators (name, capacity_kva, hourly_rental_rate, diesel_consumption_lph, description, sort_order)
select v.name, v.kva, v.rate, v.lph, v.description, v.sort_order
from (values
  ('25 kVA silent genset',  25,  2500,  2.5, 'Compact silent generator for small events, shops and home backup.', 10),
  ('30 kVA silent genset',  30,  3000,  3,   'Quiet power for functions, offices and small construction work.', 20),
  ('40 kVA silent genset',  40,  4000,  4,   'Steady supply for medium events, clinics and site offices.', 30),
  ('50 kVA silent genset',  50,  5000,  5,   'Popular choice for weddings, exhibitions and commercial backup.', 40),
  ('62 kVA silent genset',  62,  6000,  6,   'Handles larger halls, lighting rigs and multiple AC units.', 50),
  ('82 kVA silent genset',  82,  8000,  8,   'Heavy-duty power for construction sites and large venues.', 60),
  ('125 kVA silent genset', 125, 10000, 10,  'High-capacity power for industrial loads and big events.', 70)
) as v(name, kva, rate, lph, description, sort_order)
where not exists (select 1 from public.generators);
