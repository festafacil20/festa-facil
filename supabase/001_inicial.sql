-- Festa Fácil: estrutura inicial no Supabase
-- Rodar uma vez no SQL Editor do projeto.
-- Regra: qualquer usuário logado é gestor. Por isso o cadastro público deve ficar DESLIGADO
-- (Authentication > Sign In / Providers > "Allow new users to sign up" desmarcado).

-- 1) Dados da gestão (um único documento com tudo que hoje fica no aparelho)
create table if not exists public.dados (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  rev bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.dados enable row level security;
drop policy if exists "gestao le dados" on public.dados;
drop policy if exists "gestao cria dados" on public.dados;
drop policy if exists "gestao altera dados" on public.dados;
create policy "gestao le dados" on public.dados for select to authenticated using (true);
create policy "gestao cria dados" on public.dados for insert to authenticated with check (true);
create policy "gestao altera dados" on public.dados for update to authenticated using (true) with check (true);

-- Salva só se ninguém salvou antes a partir de outro aparelho (rev igual). Retorna a nova rev, ou null se houve conflito.
create or replace function public.salvar_dados(p_data jsonb, p_rev bigint)
returns bigint language plpgsql security invoker set search_path = public as $$
declare novo bigint;
begin
  insert into public.dados (id, data, rev) values (1, p_data, 1)
  on conflict (id) do update set data = excluded.data, rev = dados.rev + 1, updated_at = now()
    where dados.rev = p_rev
  returning rev into novo;
  return novo;
end $$;
revoke execute on function public.salvar_dados(jsonb, bigint) from public, anon;
grant execute on function public.salvar_dados(jsonb, bigint) to authenticated;

-- 2) Vitrine: cópia pública só do catálogo (nomes, descrições, preços, fotos) para a página de pedidos
create table if not exists public.vitrine (
  id int primary key default 1 check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.vitrine enable row level security;
drop policy if exists "todos leem vitrine" on public.vitrine;
drop policy if exists "gestao cria vitrine" on public.vitrine;
drop policy if exists "gestao altera vitrine" on public.vitrine;
create policy "todos leem vitrine" on public.vitrine for select to anon, authenticated using (true);
create policy "gestao cria vitrine" on public.vitrine for insert to authenticated with check (true);
create policy "gestao altera vitrine" on public.vitrine for update to authenticated using (true) with check (true);

-- 3) Pedidos feitos pelos clientes (qualquer um cria; só a gestão vê)
create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  status text not null default 'novo' check (status in ('novo', 'visto', 'convertido', 'arquivado')),
  nome text not null check (char_length(nome) between 1 and 120),
  tel text not null check (char_length(tel) between 8 and 30),
  dados jsonb not null check (pg_column_size(dados) < 20000)
);
create index if not exists pedidos_criado_em on public.pedidos (criado_em desc);
alter table public.pedidos enable row level security;
drop policy if exists "cliente envia pedido" on public.pedidos;
drop policy if exists "gestao le pedidos" on public.pedidos;
drop policy if exists "gestao altera pedidos" on public.pedidos;
drop policy if exists "gestao apaga pedidos" on public.pedidos;
create policy "cliente envia pedido" on public.pedidos for insert to anon, authenticated with check (status = 'novo');
create policy "gestao le pedidos" on public.pedidos for select to authenticated using (true);
create policy "gestao altera pedidos" on public.pedidos for update to authenticated using (true) with check (true);
create policy "gestao apaga pedidos" on public.pedidos for delete to authenticated using (true);

-- 4) Fotos do catálogo e das artes (leitura pública, envio só pela gestão)
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true)
on conflict (id) do update set public = true;
drop policy if exists "gestao ve fotos" on storage.objects;
drop policy if exists "gestao envia fotos" on storage.objects;
drop policy if exists "gestao altera fotos" on storage.objects;
drop policy if exists "gestao apaga fotos" on storage.objects;
create policy "gestao ve fotos" on storage.objects for select to authenticated using (bucket_id = 'fotos');
create policy "gestao envia fotos" on storage.objects for insert to authenticated with check (bucket_id = 'fotos');
create policy "gestao altera fotos" on storage.objects for update to authenticated using (bucket_id = 'fotos');
create policy "gestao apaga fotos" on storage.objects for delete to authenticated using (bucket_id = 'fotos');
