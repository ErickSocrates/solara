-- Secao Vendas: permite ao browser (chave anon) ler pedidos_orcamento em
-- tempo real para o kanban. Nao mexe em colunas nem em outras tabelas do ERP.
-- Cole no SQL Editor do Supabase e rode uma vez.

alter table public.pedidos_orcamento enable row level security;

create policy "usuarios autenticados podem ler pedidos_orcamento"
  on public.pedidos_orcamento for select
  to authenticated
  using (true);

-- habilita Realtime nesta tabela (equivalente a Database -> Replication no painel)
alter publication supabase_realtime add table public.pedidos_orcamento;

-- Escrita (criar pedido, mudar status) continua so pelo servidor com a
-- service role, que ignora RLS.
