import { criarClienteAdmin } from '@/lib/supabase/admin'

export type Cliente = {
  cod_cliente: string
  nome: string
  cidade: string
  segmento: string
  prazo_pagamento_dias: number
  desconto_maximo_pct: number
  cliente_desde: string
}

export type Produto = {
  cod_produto: string
  descricao: string
  categoria: string
  unidade: string
  preco_unitario: number
  preco_acima_100_un: number
  estoque: number
  prazo_reposicao_dias: number
}

export type PedidoOrcamento = {
  cod_pedido: string
  data: string
  cod_cliente: string | null
  canal: string
  mensagem: string
  status: string
}

const PALAVRAS_IGNORADAS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'com', 'para', 'pra', 'e', 'a', 'o', 'as', 'os',
  'um', 'uma', 'uns', 'umas', 'em', 'no', 'na', 'nos', 'nas', 'que', 'se', 'tem',
  'pol', 'mm', 'cm', 'kg', 'x',
])

function palavrasChave(descricao: string): string[] {
  return descricao
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((palavra) => palavra.length >= 3 && !PALAVRAS_IGNORADAS.has(palavra))
}

export async function listarClientes(): Promise<Cliente[]> {
  const supabase = criarClienteAdmin()
  const { data, error } = await supabase.from('clientes').select('*').order('nome')
  if (error) throw new Error(`Falha ao listar clientes: ${error.message}`)
  return data as Cliente[]
}

export async function buscarCliente(codCliente: string): Promise<Cliente | null> {
  const supabase = criarClienteAdmin()
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('cod_cliente', codCliente)
    .single()
  if (error) return null
  return data as Cliente
}

export async function listarPedidos(): Promise<PedidoOrcamento[]> {
  const supabase = criarClienteAdmin()
  const { data, error } = await supabase
    .from('pedidos_orcamento')
    .select('*')
    .order('data', { ascending: false })
  if (error) throw new Error(`Falha ao listar pedidos: ${error.message}`)
  return data as PedidoOrcamento[]
}

export async function buscarPedido(codPedido: string): Promise<PedidoOrcamento | null> {
  const supabase = criarClienteAdmin()
  const { data, error } = await supabase
    .from('pedidos_orcamento')
    .select('*')
    .eq('cod_pedido', codPedido)
    .single()
  if (error) return null
  return data as PedidoOrcamento
}

export async function proximoCodPedido(): Promise<string> {
  const supabase = criarClienteAdmin()
  const { data, error } = await supabase
    .from('pedidos_orcamento')
    .select('cod_pedido')
    .order('cod_pedido', { ascending: false })
    .limit(1)

  if (error) throw new Error(`Falha ao gerar cod_pedido: ${error.message}`)

  const ultimo = data?.[0]?.cod_pedido as string | undefined
  const ultimoNumero = ultimo ? parseInt(ultimo.replace('PED', ''), 10) : 0
  const proximoNumero = ultimoNumero + 1

  return `PED${String(proximoNumero).padStart(3, '0')}`
}

export async function criarPedido(dados: { cod_cliente: string; canal: string; mensagem: string }) {
  const supabase = criarClienteAdmin()
  const cod_pedido = await proximoCodPedido()

  const { data, error } = await supabase
    .from('pedidos_orcamento')
    .insert({
      cod_pedido,
      data: new Date().toISOString().slice(0, 10),
      cod_cliente: dados.cod_cliente,
      canal: dados.canal,
      mensagem: dados.mensagem,
      status: 'novo',
    })
    .select()
    .single()

  if (error) throw new Error(`Falha ao criar pedido: ${error.message}`)
  return data as PedidoOrcamento
}

export async function atualizarStatusPedido(codPedido: string, status: string) {
  const supabase = criarClienteAdmin()
  const { error } = await supabase
    .from('pedidos_orcamento')
    .update({ status })
    .eq('cod_pedido', codPedido)

  if (error) throw new Error(`Falha ao atualizar status do pedido: ${error.message}`)
}

export async function buscarCandidatosCatalogo(descricaoCliente: string): Promise<Produto[]> {
  const palavras = palavrasChave(descricaoCliente)
  if (palavras.length === 0) return []

  const supabase = criarClienteAdmin()
  const filtro = palavras.map((palavra) => `descricao.ilike.%${palavra}%`).join(',')

  const { data, error } = await supabase.from('produtos').select('*').or(filtro).limit(8)

  if (error) throw new Error(`Falha ao buscar candidatos do catalogo: ${error.message}`)
  return data as Produto[]
}

export async function pedidosAnteriores(
  codCliente: string,
  codPedidoAtual: string
): Promise<PedidoOrcamento[]> {
  const trintaDiasAtras = new Date()
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30)

  const supabase = criarClienteAdmin()
  const { data, error } = await supabase
    .from('pedidos_orcamento')
    .select('*')
    .eq('cod_cliente', codCliente)
    .neq('cod_pedido', codPedidoAtual)
    .gte('data', trintaDiasAtras.toISOString().slice(0, 10))
    .order('data', { ascending: false })

  if (error) throw new Error(`Falha ao buscar pedidos anteriores: ${error.message}`)
  return data as PedidoOrcamento[]
}
