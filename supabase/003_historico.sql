-- Histórico automático: antes de cada salvamento, guarda a versão anterior (mantém as 50 mais recentes)
create table if not exists public.dados_historico (
  id bigserial primary key,
  rev bigint not null,
  data jsonb not null,
  salvo_em timestamptz not null
);
alter table public.dados_historico enable row level security;
drop policy if exists "gestao le historico" on public.dados_historico;
create policy "gestao le historico" on public.dados_historico for select to authenticated using (true);

create or replace function public.guardar_historico() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.dados_historico (rev, data, salvo_em) values (old.rev, old.data, old.updated_at);
  delete from public.dados_historico where id not in (select id from public.dados_historico order by id desc limit 50);
  return new;
end $$;

drop trigger if exists dados_historico on public.dados;
create trigger dados_historico before update on public.dados for each row execute function public.guardar_historico();
