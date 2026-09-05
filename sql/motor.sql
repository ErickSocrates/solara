-- Motor do Solara OS: execucoes_agentes e aprovacoes
-- Cole no SQL Editor do Supabase e rode uma vez.

create table public.execucoes_agentes (
  id uuid primary key default gen_random_uuid(),
  area text not null check (area in ('vendas', 'financeiro')),
  item_tipo text not null check (item_tipo in ('pedido', 'divergencia')),
  item_id text not null,
  agente text not null check (
    agente in ('orquestrador', 'triador', 'pesquisador', 'redator', 'revisor', 'investigador', 'consolidador')
  ),
  chamado_por uuid references public.execucoes_agentes(id),
  status text not null default 'rodando' check (status in ('rodando', 'ok', 'erro')),
  entrada jsonb,
  saida jsonb,
  erro text,
  tokens_entrada int,
  tokens_saida int,
  inicio timestamptz,
  fim timestamptz
);

create index execucoes_agentes_item_id_idx on public.execucoes_agentes (item_id);
create index execucoes_agentes_chamado_por_idx on public.execucoes_agentes (chamado_por);

alter table public.execucoes_agentes enable row level security;

create policy "usuarios autenticados podem ler execucoes"
  on public.execucoes_agentes for select
  to authenticated
  using (true);

-- habilita Realtime nesta tabela (equivalente a Database -> Replication no painel)
alter publication supabase_realtime add table public.execucoes_agentes;


create table public.aprovacoes (
  id uuid primary key default gen_random_uuid(),
  area text not null check (area in ('vendas', 'financeiro')),
  item_tipo text not null check (item_tipo in ('pedido', 'divergencia')),
  item_id text not null,
  titulo text not null,
  proposta jsonb not null,
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'editada', 'rejeitada')),
  decidido_por uuid references public.perfis(id),
  decidido_em timestamptz,
  observacao text
);

create index aprovacoes_area_status_idx on public.aprovacoes (area, status);
create index aprovacoes_item_id_idx on public.aprovacoes (item_id);

alter table public.aprovacoes enable row level security;

create policy "usuarios autenticados podem ler aprovacoes"
  on public.aprovacoes for select
  to authenticated
  using (true);

-- Nenhuma policy de insert/update: essas tabelas so sao escritas pelo
-- servidor com a service role (lib/agente.ts e as rotas de API), que
-- ignora RLS. Leitura (inclusive Realtime) usa a chave anon do browser.
