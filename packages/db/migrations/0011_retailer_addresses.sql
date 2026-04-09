create table if not exists retailer_addresses (
  id uuid primary key default gen_random_uuid() not null,
  retailer_id uuid not null references retailers(id) on delete cascade,
  label varchar(120) default 'principal' not null,
  address text not null,
  is_default boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create index if not exists retailer_addresses_retailer_idx on retailer_addresses (retailer_id);
create index if not exists retailer_addresses_retailer_default_idx on retailer_addresses (retailer_id, is_default);
