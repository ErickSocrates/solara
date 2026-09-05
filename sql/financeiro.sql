-- Financeiro: extratos_importados, lancamentos e divergencias.
-- Cole no SQL Editor do Supabase e rode uma vez.

create table public.extratos_importados (
  id uuid primary key default gen_random_uuid(),
  nome_arquivo text not null,
  importado_em timestamptz not null default now(),
  importado_por uuid references public.perfis(id),
  total_linhas int not null default 0,
  total_creditos int not null default 0
);

alter table public.extratos_importados enable row level security;

create policy "usuarios autenticados podem ler extratos_importados"
  on public.extratos_importados for select
  to authenticated
  using (true);


create table public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  extrato_id uuid not null references public.extratos_importados(id),
  data date not null,
  descricao text not null,
  valor numeric(12, 2) not null,
  tipo text not null check (tipo in ('credito', 'debito')),
  cod_titulo_casado text,
  situacao text not null default 'divergente' check (situacao in ('casado', 'divergente', 'ignorado'))
);

create index lancamentos_extrato_id_idx on public.lancamentos (extrato_id);

alter table public.lancamentos enable row level security;

create policy "usuarios autenticados podem ler lancamentos"
  on public.lancamentos for select
  to authenticated
  using (true);

-- habilita Realtime nesta tabela (equivalente a Database -> Replication no painel)
alter publication supabase_realtime add table public.lancamentos;


create table public.divergencias (
  id uuid primary key default gen_random_uuid(),
  extrato_id uuid not null references public.extratos_importados(id),
  tipo_inicial text not null check (
    tipo_inicial in (
      'valor_diferente_mesma_nf', 'sem_titulo_correspondente', 'possivel_soma',
      'duplicado', 'vencido_sem_pagamento'
    )
  ),
  lancamento_id uuid references public.lancamentos(id),
  cod_titulo text,
  valor_lancamento numeric(12, 2),
  valor_titulo numeric(12, 2),
  status text not null default 'nova' check (
    status in ('nova', 'investigando', 'aguardando_aprovacao', 'resolvida')
  ),
  hipotese jsonb
);

create index divergencias_extrato_id_idx on public.divergencias (extrato_id);
create index divergencias_status_idx on public.divergencias (status);

alter table public.divergencias enable row level security;

create policy "usuarios autenticados podem ler divergencias"
  on public.divergencias for select
  to authenticated
  using (true);

alter publication supabase_realtime add table public.divergencias;

-- Escrita (importar extrato, conciliar, decidir aprovacoes) continua so
-- pelo servidor com a service role, que ignora RLS.
