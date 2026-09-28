-- Permite à gestão listar/apagar fotos do bucket (o remove do Storage precisa enxergar o arquivo)
drop policy if exists "gestao ve fotos" on storage.objects;
create policy "gestao ve fotos" on storage.objects for select to authenticated using (bucket_id = 'fotos');
