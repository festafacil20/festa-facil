-- Notificações de novo pedido no celular (Web Push)
-- Aparelhos que ativaram as notificações (qualquer gestor logado pode ativar/desativar)
create table if not exists public.push_subs (
  endpoint text primary key,
  sub jsonb not null,
  aparelho text,
  criado_em timestamptz not null default now()
);
alter table public.push_subs enable row level security;
drop policy if exists "gestao gerencia avisos" on public.push_subs;
create policy "gestao gerencia avisos" on public.push_subs for all to authenticated using (true) with check (true);

-- A cada pedido novo, o banco chama a função notificar-pedido (que envia o push para os aparelhos)
create extension if not exists pg_net;
create or replace function public.avisar_novo_pedido() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://ntejkgnotonbkxjoddbb.supabase.co/functions/v1/notificar-pedido',
    body := jsonb_build_object('id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', 'sb_publishable_ijS4mkhw5phouvkRHrEWaQ_EZ954d38')
  );
  return new;
end $$;
drop trigger if exists pedidos_notificar on public.pedidos;
create trigger pedidos_notificar after insert on public.pedidos for each row execute function public.avisar_novo_pedido();
