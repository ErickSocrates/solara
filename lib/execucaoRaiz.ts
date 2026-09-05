import { criarClienteAdmin } from './supabase/admin'

export type ContextoRaiz = {
  area: 'vendas' | 'financeiro'
  item_tipo: 'pedido' | 'divergencia'
  item_id: string
}

export async function criarExecucaoRaiz(contexto: ContextoRaiz): Promise<string> {
  const supabase = criarClienteAdmin()

  const { data, error } = await supabase
    .from('execucoes_agentes')
    .insert({
      area: contexto.area,
      item_tipo: contexto.item_tipo,
      item_id: contexto.item_id,
      agente: 'orquestrador',
      chamado_por: null,
      status: 'rodando',
      entrada: { item_id: contexto.item_id },
      inicio: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Falha ao criar execucao raiz: ${error?.message}`)
  }

  return data.id as string
}

export async function fecharExecucaoRaiz(id: string, status: 'ok' | 'erro', erro?: string) {
  const supabase = criarClienteAdmin()

  await supabase
    .from('execucoes_agentes')
    .update({ status, erro: erro ?? null, fim: new Date().toISOString() })
    .eq('id', id)
}
