import { agente } from '@/lib/agente'
import { criarExecucaoRaiz, fecharExecucaoRaiz } from '@/lib/execucaoRaiz'
import { criarClienteAdmin } from '@/lib/supabase/admin'
import { diferencaDias, identificarCliente, type Titulo } from '@/lib/financeiro/casar'
import {
  listarTitulosAbertos,
  listarClientesResumo,
  listarLancamentosDoExtrato,
  listarDivergenciasDoExtrato,
  type DivergenciaRegistro,
  type LancamentoRegistro,
} from '@/lib/financeiro/dados'

type SaidaInvestigador = {
  hipotese: string
  explicacao: string
  confianca: number
  acao_sugerida: string
  cod_titulos_envolvidos: string[]
  valor_a_baixar: number
  valor_pendente: number
}

type HipoteseComOrigem = SaidaInvestigador & { divergencia_id: string }

type SaidaConsolidador = { relatorio_markdown: string; acoes: string[] }
type SaidaRevisor = { aprovado: boolean; motivos: string[] }

const MAX_VOLTAS_CONSOLIDADOR = 1
const RAIO_VALOR_PCT = 0.1
const JANELA_CANDIDATOS_DIAS = 30
const LIMITE_INVESTIGADORES_PARALELOS = 3

async function mapComLimite<T, R>(itens: T[], limite: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const resultados: R[] = new Array(itens.length)
  let proximo = 0

  async function worker() {
    while (proximo < itens.length) {
      const indice = proximo++
      resultados[indice] = await fn(itens[indice])
    }
  }

  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, worker))
  return resultados
}

export async function conciliarExtrato(extratoId: string) {
  const supabase = criarClienteAdmin()

  const divergenciasNovas = (await listarDivergenciasDoExtrato(extratoId)).filter((d) => d.status === 'nova')
  if (divergenciasNovas.length === 0) {
    throw new Error('Nao ha divergencias novas para conciliar neste extrato.')
  }

  const execucaoRaizId = await criarExecucaoRaiz({
    area: 'financeiro',
    item_tipo: 'divergencia',
    item_id: extratoId,
  })

  const contexto = {
    area: 'financeiro' as const,
    item_tipo: 'divergencia' as const,
    item_id: extratoId,
    chamado_por: execucaoRaizId,
  }

  try {
    await supabase
      .from('divergencias')
      .update({ status: 'investigando' })
      .in('id', divergenciasNovas.map((d) => d.id))

    const [titulosAbertos, clientes, lancamentosDoExtrato] = await Promise.all([
      listarTitulosAbertos(),
      listarClientesResumo(),
      listarLancamentosDoExtrato(extratoId),
    ])

    const lancamentosPorId = new Map(lancamentosDoExtrato.map((l) => [l.id, l]))

    // Investigador: um por divergencia, em paralelo - mas com um teto de
    // requisicoes simultaneas para nao estourar o limite de concorrencia da
    // API da Anthropic quando o extrato tem muitas divergencias.
    const hipoteses: HipoteseComOrigem[] = await mapComLimite(
      divergenciasNovas,
      LIMITE_INVESTIGADORES_PARALELOS,
      async (divergencia) => {
        const lancamento = divergencia.lancamento_id ? lancamentosPorId.get(divergencia.lancamento_id) ?? null : null
        const titulosCandidatos = candidatosParaDivergencia(divergencia, lancamento, titulosAbertos, clientes)

        const { saida } = await agente<SaidaInvestigador>(
          'investigador',
          {
            divergencia: {
              tipo_inicial: divergencia.tipo_inicial,
              valor_lancamento: divergencia.valor_lancamento,
              valor_titulo: divergencia.valor_titulo,
            },
            lancamento: lancamento
              ? { data: lancamento.data, descricao: lancamento.descricao, valor: lancamento.valor }
              : null,
            titulos_candidatos: titulosCandidatos,
          },
          contexto
        )

        return { divergencia_id: divergencia.id, ...saida }
      }
    )

    const resumoCasamento = calcularResumoCasamento(lancamentosDoExtrato)
    const hipotesesParaAgente = hipoteses.map(({ divergencia_id, ...resto }) => resto)

    let { saida: consolidado } = await agente<SaidaConsolidador>(
      'consolidador',
      { resumo_casamento: resumoCasamento, hipoteses: hipotesesParaAgente },
      contexto
    )

    let { saida: revisao } = await agente<SaidaRevisor>(
      'revisor',
      { hipoteses: hipotesesParaAgente, titulos_abertos: titulosAbertos, relatorio: consolidado },
      contexto
    )

    let voltas = 0
    while (!revisao.aprovado && voltas < MAX_VOLTAS_CONSOLIDADOR) {
      consolidado = (
        await agente<SaidaConsolidador>(
          'consolidador',
          { resumo_casamento: resumoCasamento, hipoteses: hipotesesParaAgente, ajustes: revisao.motivos },
          contexto
        )
      ).saida
      revisao = (
        await agente<SaidaRevisor>(
          'revisor',
          { hipoteses: hipotesesParaAgente, titulos_abertos: titulosAbertos, relatorio: consolidado },
          contexto
        )
      ).saida
      voltas += 1
    }

    // Cada hipotese vira um item em aprovacoes; a divergencia correspondente
    // vai para aguardando_aprovacao com a hipotese anexada.
    for (const hipotese of hipoteses) {
      const divergencia = divergenciasNovas.find((d) => d.id === hipotese.divergencia_id)!
      const lancamento = divergencia.lancamento_id ? lancamentosPorId.get(divergencia.lancamento_id) ?? null : null
      const identificador = lancamento?.descricao ?? `Título ${divergencia.cod_titulo}`

      await supabase
        .from('divergencias')
        .update({ status: 'aguardando_aprovacao', hipotese: hipotese })
        .eq('id', divergencia.id)

      await criarAprovacao({
        area: 'financeiro',
        item_tipo: 'divergencia',
        item_id: extratoId,
        titulo: `${hipotese.hipotese} · ${identificador} · R$ ${hipotese.valor_a_baixar.toFixed(2)}`,
        proposta: { ...hipotese, relatorio: consolidado, revisao },
      })
    }

    await fecharExecucaoRaiz(execucaoRaizId, 'ok')
    return { relatorio: consolidado, hipoteses }
  } catch (erro) {
    const mensagemErro = erro instanceof Error ? erro.message : String(erro)
    await fecharExecucaoRaiz(execucaoRaizId, 'erro', mensagemErro)
    // Sem isso as divergencias ficam presas em "investigando" para sempre:
    // nao aparecem mais como "nova" (botao Conciliar fica desabilitado) nem
    // chegam a "aguardando_aprovacao". Volta pra "nova" so as que ainda
    // estao "investigando" - as que ja avancaram para aguardando_aprovacao
    // antes do erro (com aprovacao ja criada) ficam como estao.
    await supabase
      .from('divergencias')
      .update({ status: 'nova' })
      .in('id', divergenciasNovas.map((d) => d.id))
      .eq('status', 'investigando')
    throw erro
  }
}

function candidatosParaDivergencia(
  divergencia: DivergenciaRegistro,
  lancamento: LancamentoRegistro | null,
  titulosAbertos: Titulo[],
  clientes: { cod_cliente: string; nome: string }[]
): Titulo[] {
  if (divergencia.tipo_inicial === 'vencido_sem_pagamento') {
    return titulosAbertos.filter((t) => t.cod_titulo === divergencia.cod_titulo)
  }

  const descricao = lancamento?.descricao ?? ''
  const dataReferencia = lancamento?.data ?? new Date().toISOString().slice(0, 10)
  const cliente = identificarCliente(descricao, clientes)
  const valorAlvo = divergencia.valor_lancamento ?? 0

  return titulosAbertos.filter((titulo) => {
    if (diferencaDias(titulo.vencimento, dataReferencia) > JANELA_CANDIDATOS_DIAS) return false
    if (cliente) return titulo.cod_cliente === cliente.cod_cliente
    return Math.abs(titulo.valor - valorAlvo) <= valorAlvo * RAIO_VALOR_PCT
  })
}

function calcularResumoCasamento(lancamentos: LancamentoRegistro[]) {
  const casados = lancamentos.filter((l) => l.situacao === 'casado')
  const divergentes = lancamentos.filter((l) => l.situacao === 'divergente')
  const datas = lancamentos.map((l) => l.data).sort()

  return {
    qtd_casados: casados.length,
    valor_casado: casados.reduce((soma, l) => soma + Number(l.valor), 0),
    qtd_divergencias: divergentes.length,
    valor_divergente: divergentes.reduce((soma, l) => soma + Number(l.valor), 0),
    periodo: datas.length ? `${datas[0]} a ${datas[datas.length - 1]}` : '',
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
