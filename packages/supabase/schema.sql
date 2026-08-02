-- Polycast Supabase schema
--
-- IMPORTANT: these tables are a READ CACHE of on-chain state, kept in sync
-- by apps/api's indexer (Session 4). They are never the source of truth for
-- balances or resolution outcomes — the chain is. Row Level Security is
-- configured so the public anon key (used by apps/web) can only SELECT;
-- all writes go through apps/api using the service role key.

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- markets: mirrors each on-chain PolycastMarket instance
-- ---------------------------------------------------------------------------
create table if not exists markets (
  id uuid primary key default uuid_generate_v4(),
  chain_market_address text not null unique,       -- on-chain contract address for this market
  question text not null,
  collateral_token_address text not null,
  collateral_symbol text not null,                 -- e.g. "USDT0", "FXRP"
  resolver_type text not null check (resolver_type in ('ftso', 'web2json', 'manual')),
  resolver_source text,                             -- FTSO feed id, or API endpoint identifier
  status text not null default 'open' check (status in ('open', 'resolving', 'resolved', 'disputed')),
  resolved_outcome smallint,                        -- null until resolved; 0 = NO, 1 = YES
  yes_price_cached numeric(5, 4),                   -- last known YES price, 0-1, for fast list rendering
  volume_cached numeric(20, 6) default 0,
  chains_settling smallint default 1,               -- how many chains' collateral/assets this market accepts
  created_at timestamptz not null default now(),
  resolves_at timestamptz,
  resolved_at timestamptz
);

create index if not exists idx_markets_status on markets(status);
create index if not exists idx_markets_created_at on markets(created_at desc);

-- ---------------------------------------------------------------------------
-- trades: mirrors on-chain mint/split/merge/redeem + matched trade events
-- ---------------------------------------------------------------------------
create table if not exists trades (
  id uuid primary key default uuid_generate_v4(),
  market_id uuid not null references markets(id) on delete cascade,
  wallet_address text not null,
  side smallint not null check (side in (0, 1)),    -- 0 = NO, 1 = YES
  amount numeric(20, 6) not null,
  price numeric(5, 4) not null,
  tx_hash text not null unique,
  block_number bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_trades_market_id on trades(market_id);
create index if not exists idx_trades_wallet on trades(wallet_address);

-- ---------------------------------------------------------------------------
-- resolutions: audit trail of how/when each market resolved
-- ---------------------------------------------------------------------------
create table if not exists resolutions (
  id uuid primary key default uuid_generate_v4(),
  market_id uuid not null references markets(id) on delete cascade,
  resolver_type text not null,
  raw_value text,                                    -- raw attested/fetched value that drove the outcome
  resolved_outcome smallint not null check (resolved_outcome in (0, 1)),
  tx_hash text not null unique,
  resolved_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- wallets: lightweight profile info, keyed by address, no auth of its own
-- (wallet signature IS the auth — Supabase auth is not used for this)
-- ---------------------------------------------------------------------------
create table if not exists wallets (
  address text primary key,
  display_name text,
  first_seen_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table markets enable row level security;
alter table trades enable row level security;
alter table resolutions enable row level security;
alter table wallets enable row level security;

-- Public read access (anon key) — no write access for anyone but service role
create policy "Public read markets" on markets for select using (true);
create policy "Public read trades" on trades for select using (true);
create policy "Public read resolutions" on resolutions for select using (true);
create policy "Public read wallets" on wallets for select using (true);

-- No insert/update/delete policies are defined for the anon/authenticated
-- roles, which means only the service_role key (used exclusively by
-- apps/api) can write to these tables.
