alter table public.customers
drop constraint if exists customers_sumber_lead_check;

alter table public.customers
add constraint customers_sumber_lead_check check (
  sumber_lead in (
    'TikTok', 'Reels', 'Instagram', 'Facebook Marketplace', 'WA', 'Referral', 'Lainnya'
  )
);
