import { agente } from '@/lib/agente'
import { criarExecucaoRaiz, fecharExecucaoRaiz } from '@/lib/execucaoRaiz'
import { criarClienteAdmin } from '@/lib/supabase/admin'
import {
  buscarCliente,
  buscarPedido,
  buscarCandidatosCatalogo,
  pedidosAnteriores,
  atualizarStatusPedido,
  type Cliente,
  type Produto,
} from '@/lib/vendas/dados'

type ItemTriagem = { descricao_cliente: string; quantidade: number | null; unidade: string }

type SaidaTriador = {
  tipo: string
  itens: ItemTriagem[]
  prazo_desejado: string | null
  pede_desconto: boolean
  desconto_pedido_pct: number | null
  urgencia: string
  observacoes: string
}

type ItemContexto = {
  descricao_cliente: string
  cod_produto: string | null
  descricao: string
  quantidade: number | null
  unidade: string
  existe: boolean
  preco_aplicado: number | null
  estoque: number | null
  atende_estoque: boolean | null
  prazo_reposicao_dias: number | null
}

type SaidaPesquisador = {
  itens: ItemContexto[]
  condicao_pagamento_dias: number
  desconto_maximo_pct: number
  observacoes: string
}

type SaidaRedator = { resposta: string; resumo: string }
type SaidaRevisor = { aprovado: boolean; motivos: string[] }

type ClienteResumo = { cod_cliente: string | null; nome: string; segmento: string | null }

type EntradaRedator = {
  triagem: SaidaTriador
  contexto: SaidaPesquisador
  cliente: ClienteResumo
  ajustes?: string[]
}

const MAX_VOLTAS_REVISOR = 2

export async function processarPedidoVendas(codPedido: string) {
  const pedido = await buscarPedido(codPedido)
  if (!pedido) throw new Error(`Pedido ${codPedido} nao encontrado.`)

  const cliente: Cliente | null = pedido.cod_cliente ? await buscarCliente(pedido.cod_cliente) : null

  await atualizarStatusPedido(codPedido, 'processando')
  const execucaoRaizId = await criarExecucaoRaiz({
    area: 'vendas',
    item_tipo: 'pedido',
    item_id: codPedido,
  })

  const contexto = {
    area: 'vendas' as const,
    item_tipo: 'pedido' as const,
    item_id: codPedido,
    chamado_por: execucaoRaizId,
  }

  try {
    const clienteResumo: ClienteResumo = cliente
      ? { cod_cliente: cliente.cod_cliente, nome: cliente.nome, segmento: cliente.segmento }
      : { cod_cliente: pedido.cod_cliente, nome: 'Cliente nao identificado', segmento: null }

    const { saida: triagem } = await agente<SaidaTriador>(
      'triador',
      { mensagem: pedido.mensagem, canal: pedido.canal, cliente: clienteResumo },
      contexto
    )

    if (triagem.tipo !== 'orcamento' && triagem.tipo !== 'complemento') {
      await criarAprovacao({
        area: 'vendas',
        item_tipo: 'pedido',
        item_id: codPedido,
        titulo: `Nao e orcamento: ${triagem.tipo}`,
        proposta: triagem,
      })
      await atualizarStatusPedido(codPedido, 'aguardando_aprovacao')
      await fecharExecucaoRaiz(execucaoRaizId, 'ok')
      return
    }

    if (!cliente) {
      throw new Error(`Cliente ${pedido.cod_cliente} nao encontrado para o pedido ${codPedido}.`)
    }

    // Pesquisador: catalogo (por item) e historico do cliente, em paralelo -
    // codigo deterministico, o modelo so casa os itens depois.
    const [candidatosCatalogo, historico] = await Promise.all([
      Promise.all(
        triagem.itens.map(async (item) => ({
          descricao_cliente: item.descricao_cliente,
          candidatos: (await buscarCandidatosCatalogo(item.descricao_cliente)) as Produto[],
        }))
      ),
      pedidosAnteriores(cliente.cod_cliente, codPedido),
    ])

    const { saida: pesquisa } = await agente<SaidaPesquisador>(
      'pesquisador',
      {
        itens_pedidos: triagem.itens,
        candidatos_catalogo: candidatosCatalogo,
        cliente,
        pedidos_anteriores: historico,
      },
      contexto
    )

    let entradaRedator: EntradaRedator = { triagem, contexto: pesquisa, cliente: clienteResumo }
    let { saida: redacao } = await agente<SaidaRedator>('redator', entradaRedator, contexto)
    let { saida: revisao } = await agente<SaidaRevisor>(
      'revisor',
      { resposta: redacao.resposta, contexto: pesquisa },
      contexto
    )

    let voltas = 0
    while (!revisao.aprovado && voltas < MAX_VOLTAS_REVISOR) {
      entradaRedator = { ...entradaRedator, ajustes: revisao.motivos }
      redacao = (await agente<SaidaRedator>('redator', entradaRedator, contexto)).saida
      revisao = (
        await agente<SaidaRevisor>('revisor', { resposta: redacao.resposta, contexto: pesquisa }, contexto)
      ).saida
      voltas += 1
    }

    // Se ainda assim reprovado apos as voltas, segue para a fila com os
    // motivos anexados na propria revisao - a decisao final e humana.
    await criarAprovacao({
      area: 'vendas',
      item_tipo: 'pedido',
      item_id: codPedido,
      titulo: `${cliente.nome} · ${redacao.resumo}`,
      proposta: { resposta: redacao.resposta, triagem, contexto: pesquisa, revisao },
    })

    await atualizarStatusPedido(codPedido, 'aguardando_aprovacao')
    await fecharExecucaoRaiz(execucaoRaizId, 'ok')
  } catch (erro) {
    const mensagemErro = erro instanceof Error ? erro.message : String(erro)
    await fecharExecucaoRaiz(execucaoRaizId, 'erro', mensagemErro)
    await atualizarStatusPedido(codPedido, 'novo')
    throw erro
  }
}

async function criarAprovacao(dados: {
  area: string
  item_tipo: string
  item_id: string
  titulo: string
  proposta: unknown
}) {
  const supabase = criarClienteAdmin()
  const { error } = await supabase.from('aprovacoes').insert({ ...dados, status: 'pendente' })
  if (error) throw new Error(`Falha ao criar aprovacao: ${error.message}`)
}
