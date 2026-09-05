import { criarClienteAdmin } from '@/lib/supabase/admin'
import type { Titulo, ClienteResumo, LancamentoCasado } from './casar'

export type ExtratoImportado = {
  id: string
  nome_arquivo: string
  importado_em: string
  importado_por: string | null
  total_linhas: number
  total_creditos: number
}

export type LancamentoRegistro = {
  id: string
  extrato_id: string
  data: string
  descricao: string
  valor: number
  tipo: string
  cod_titulo_casado: string | null
  situacao: string
}

export type DivergenciaRegistro = {
  id: string
  extrato_id: string
  tipo_inicial: string
  lancamento_id: string | null
  cod_titulo: string | null
  valor_lancamento: number | null
  valor_titulo: number | null
  status: string
  hipotese: unknown
}

export async function listarTitulosAbertos(): Promise<Titulo[]> {
  const supabase = criarClienteAdmin()
  const { data, error } = await supabase.from('titulos_receber').select('*').eq('status', 'aberto')
  if (error) throw new Error(`Falha ao listar titulos abertos: ${error.message}`)
  return data as Titulo[]
}

export async function listarClientesResumo(): Promise<ClienteResumo[]> {
  const supabase = criarClienteAdmin()
  const { data, error } = await supabase.from('clientes').select('cod_cliente, nome')
  if (error) throw new Error(`Falha ao listar clientes: ${error.message}`)
  return data as ClienteResumo[]
}

export async function criarExtratoImportado(dados: {
  nome_arquivo: string
  importado_por: string
  total_linhas: number
  total_creditos: number
}): Promise<string> {
  const supabase = criarClienteAdmin()
  const { data, error } = await supabase.from('extratos_importados').insert(dados).select('id').single()
  if (error || !data) throw new Error(`Falha ao criar extrato importado: ${error?.message}`)
  return data.id as string
}

export async function inserirLancamentos(
  extratoId: string,
  lancamentos: (LancamentoCasado & { id: string })[]
): Promise<LancamentoRegistro[]> {
  const supabase = criarClienteAdmin()
  const linhas = lancamentos.map((l) => ({ ...l, extrato_id: extratoId }))
  const { data, error } = await supabase.from('lancamentos').insert(linhas).select()
  if (error) throw new Error(`Falha ao gravar lancamentos: ${error.message}`)
  return data as LancamentoRegistro[]
}

export async function inserirDivergencias(
  divergencias: {
    extrato_id: string
    tipo_inicial: string
    lancamento_id: string | null
    cod_titulo: string | null
    valor_lancamento: number | null
    valor_titulo: number | null
    status: string
  }[]
): Promise<DivergenciaRegistro[]> {
  if (divergencias.length === 0) return []
  const supabase = criarClienteAdmin()
  const { data, error } = await supabase.from('divergencias').insert(divergencias).select()
  if (error) throw new Error(`Falha ao gravar divergencias: ${error.message}`)
  return data as DivergenciaRegistro[]
}

export async function listarLancamentosDoExtrato(extratoId: string): Promise<LancamentoRegistro[]> {
  const supabase = criarClienteAdmin()
  const { data, error } = await supabase.from('lancamentos').select('*').eq('extrato_id', extratoId)
  if (error) throw new Error(`Falha ao listar lancamentos: ${error.message}`)
  return data as LancamentoRegistro[]
}

export async function listarDivergenciasDoExtrato(extratoId: string): Promise<DivergenciaRegistro[]> {
  const supabase = criarClienteAdmin()
  const { data, error } = await supabase.from('divergencias').select('*').eq('extrato_id', extratoId)
  if (error) throw new Error(`Falha ao listar divergencias: ${error.message}`)
  return data as DivergenciaRegistro[]
}

export async function listarExtratos(): Promise<ExtratoImportado[]> {
  const supabase = criarClienteAdmin()
  const { data, error } = await supabase.from('extratos_importados').select('*').order('importado_em', { ascending: false })
  if (error) throw new Error(`Falha ao listar extratos: ${error.message}`)
  return data as ExtratoImportado[]
}

export async function buscarRelatorioDoExtrato(extratoId: string): Promise<string | null> {
  const supabase = criarClienteAdmin()
  const { data } = await supabase
    .from('aprovacoes')
    .select('proposta')
    .eq('area', 'financeiro')
    .eq('item_id', extratoId)
    .limit(1)
    .maybeSingle()

  const proposta = data?.proposta as { relatorio?: { relatorio_markdown?: string } } | null
  return proposta?.relatorio?.relatorio_markdown ?? null
}
