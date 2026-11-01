-- TwidyPOS Stage 2: relational foundations for retail operations.
-- Additive only: existing pos_workspaces JSON data is preserved.
create extension if not exists pgcrypto;

create table if not exists public.pos_branches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  code text not null, name text not null, phone text not null default '',
  address text not null default '', is_default boolean not null default false,
  active boolean not null default true, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(owner_id, code), unique(owner_id, name)
);
create unique index if not exists pos_branches_one_default_per_owner on public.pos_branches(owner_id) where is_default;

create table if not exists public.pos_suppliers (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null, contact_name text not null default '', phone text not null default '',
  email text not null default '', address text not null default '', notes text not null default '',
  active boolean not null default true, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(owner_id, name)
);
create table if not exists public.pos_product_variants (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null, branch_id uuid references public.pos_branches(id) on delete set null,
  sku text not null, barcode text, name text not null, attributes jsonb not null default '{}'::jsonb,
  cost_price numeric(14,2) not null default 0 check(cost_price >= 0),
  selling_price numeric(14,2) not null default 0 check(selling_price >= 0),
  stock integer not null default 0 check(stock >= 0), min_stock integer not null default 0 check(min_stock >= 0),
  active boolean not null default true, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(owner_id, sku), check(jsonb_typeof(attributes) = 'object')
);
create unique index if not exists pos_product_variants_barcode_unique on public.pos_product_variants(owner_id, barcode) where barcode is not null and barcode <> '';
create index if not exists pos_product_variants_product_idx on public.pos_product_variants(owner_id, product_id);

create table if not exists public.pos_purchase_orders (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  branch_id uuid references public.pos_branches(id) on delete set null,
  supplier_id uuid references public.pos_suppliers(id) on delete set null,
  purchase_number text not null, status text not null default 'draft' check(status in ('draft','received','cancelled')),
  purchase_date date not null default current_date, subtotal numeric(14,2) not null default 0 check(subtotal >= 0),
  discount numeric(14,2) not null default 0 check(discount >= 0), total numeric(14,2) not null default 0 check(total >= 0),
  payment_status text not null default 'unpaid' check(payment_status in ('unpaid','partial','paid')),
  notes text not null default '', received_at timestamptz, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(owner_id, purchase_number)
);
create table if not exists public.pos_purchase_items (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  purchase_id uuid not null references public.pos_purchase_orders(id) on delete cascade,
  product_id text not null, variant_id uuid references public.pos_product_variants(id) on delete set null,
  product_name text not null, sku text not null default '', quantity integer not null check(quantity > 0),
  received_quantity integer not null default 0 check(received_quantity >= 0),
  unit_cost numeric(14,2) not null check(unit_cost >= 0), line_total numeric(14,2) not null check(line_total >= 0),
  created_at timestamptz not null default now()
);
create index if not exists pos_purchase_items_purchase_idx on public.pos_purchase_items(owner_id,purchase_id);

create table if not exists public.pos_payables (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  branch_id uuid references public.pos_branches(id) on delete set null,
  supplier_id uuid references public.pos_suppliers(id) on delete set null,
  purchase_id uuid references public.pos_purchase_orders(id) on delete set null,
  description text not null, reference_number text not null default '',
  original_amount numeric(14,2) not null check(original_amount > 0),
  paid_amount numeric(14,2) not null default 0 check(paid_amount >= 0 and paid_amount <= original_amount),
  due_date date, status text not null default 'unpaid' check(status in ('unpaid','partial','paid','void')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.pos_receivables (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  branch_id uuid references public.pos_branches(id) on delete set null, customer_id text, transaction_id text,
  customer_name text not null, description text not null default '',
  original_amount numeric(14,2) not null check(original_amount > 0),
  paid_amount numeric(14,2) not null default 0 check(paid_amount >= 0 and paid_amount <= original_amount),
  due_date date, status text not null default 'unpaid' check(status in ('unpaid','partial','paid','void')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.pos_account_payments (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  payable_id uuid references public.pos_payables(id) on delete cascade,
  receivable_id uuid references public.pos_receivables(id) on delete cascade,
  amount numeric(14,2) not null check(amount > 0), payment_method text not null default 'Tunai',
  note text not null default '', paid_at timestamptz not null default now(),
  check ((payable_id is not null)::integer + (receivable_id is not null)::integer = 1)
);
create table if not exists public.pos_offline_sync (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  branch_id uuid references public.pos_branches(id) on delete set null, client_mutation_id text not null,
  mutation_type text not null, payload_hash text not null, result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), unique(owner_id, client_mutation_id)
);
create index if not exists pos_offline_sync_created_idx on public.pos_offline_sync(owner_id,created_at desc);

do $$
declare t text;
begin
  foreach t in array array['pos_branches','pos_suppliers','pos_product_variants','pos_purchase_orders','pos_purchase_items','pos_payables','pos_receivables','pos_account_payments','pos_offline_sync'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists %I on public.%I',t||'_owner_all',t);
    execute format('create policy %I on public.%I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))',t||'_owner_all',t);
  end loop;
end $$;
grant select, insert, update, delete on public.pos_branches, public.pos_suppliers, public.pos_product_variants, public.pos_purchase_orders, public.pos_purchase_items, public.pos_payables, public.pos_receivables, public.pos_account_payments, public.pos_offline_sync to authenticated;
