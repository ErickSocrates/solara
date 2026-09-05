import type { LancamentoLimpo } from './limpar'

export type Titulo = {
  cod_titulo: string
  cod_cliente: string | null
  nota_fiscal: string | null
  valor: number
  emissao: string | null
  vencimento: string
  status: string
}

export type ClienteResumo = { cod_cliente: string; nome: string }

export type TipoInicialDivergencia =
  | 'valor_diferente_mesma_nf'
  | 'sem_titulo_correspondente'
  | 'possivel_soma'
  | 'duplicado'
  | 'vencido_sem_pagamento'

export type LancamentoCasado = LancamentoLimpo & {
  cod_titulo_casado: string | null
  situacao: 'casado' | 'divergente' | 'ignorado'
}

export type DivergenciaLancamento = {
  lancamentoIndex: number
  tipo_inicial: Exclude<TipoInicialDivergencia, 'vencido_sem_pagamento'>
  cod_titulo: string | null
  valor_lancamento: number
  valor_titulo: number | null
}

export type DivergenciaVencida = {
  tipo_inicial: 'vencido_sem_pagamento'
  cod_titulo: string
  valor_titulo: number
}

export type ResultadoCasamento = {
  lancamentos: LancamentoCasado[]
  divergenciasLancamento: DivergenciaLancamento[]
  divergenciasVencidas: DivergenciaVencida[]
}

const TOLERANCIA_VALOR = 0.01
const JANELA_CASAMENTO_DIAS = 5

function valoresIguais(a: number, b: number, tolerancia = TOLERANCIA_VALOR): boolean {
  return Math.abs(a - b) < tolerancia
}

export function diferencaDias(dataIsoA: string, dataIsoB: string): number {
  return Math.abs((new Date(dataIsoA).getTime() - new Date(dataIsoB).getTime()) / 86_400_000)
}

function extrairNotaFiscal(descricao: string): string | null {
  const encontrado = descricao.match(/NF-?\s?(\d+)/i)
  return encontrado ? `NF-${encontrado[1]}` : null
}

export function identificarCliente(descricao: string, clientes: ClienteResumo[]): ClienteResumo | null {
  const descricaoMaiuscula = descricao.toUpperCase()
  return clientes.find((cliente) => descricaoMaiuscula.includes(cliente.nome.toUpperCase())) ?? null
}

function encontrarParSoma(
  titulosDoCliente: Titulo[],
  valorAlvo: number
): [Titulo, Titulo] | null {
  for (let i = 0; i < titulosDoCliente.length; i++) {
    for (let j = i + 1; j < titulosDoCliente.length; j++) {
      if (valoresIguais(titulosDoCliente[i].valor + titulosDoCliente[j].valor, valorAlvo)) {
        return [titulosDoCliente[i], titulosDoCliente[j]]
      }
    }
  }
  return null
}

export function casarLancamentos(
  lancamentosLimpos: LancamentoLimpo[],
  titulosAbertos: Titulo[],
  clientes: ClienteResumo[]
): ResultadoCasamento {
  const titulosUsados = new Set<string>()
  const lancamentos: LancamentoCasado[] = []
  const divergenciasLancamento: DivergenciaLancamento[] = []

  for (const lancamento of lancamentosLimpos) {
    if (lancamento.tipo === 'debito') {
      lancamentos.push({ ...lancamento, cod_titulo_casado: null, situacao: 'ignorado' })
      continue
    }

    const notaFiscal = extrairNotaFiscal(lancamento.descricao)

    // Regra 1: descricao traz a NF e existe titulo com essa nota e mesmo valor.
    const tituloMesmaNf = notaFiscal ? titulosAbertos.find((t) => t.nota_fiscal === notaFiscal) : undefined
    if (tituloMesmaNf && !titulosUsados.has(tituloMesmaNf.cod_titulo) && valoresIguais(tituloMesmaNf.valor, lancamento.valor)) {
      titulosUsados.add(tituloMesmaNf.cod_titulo)
      lancamentos.push({ ...lancamento, cod_titulo_casado: tituloMesmaNf.cod_titulo, situacao: 'casado' })
      continue
    }

    // Regra 2: exatamente um titulo aberto com mesmo valor e vencimento a ate 5 dias do lancamento.
    const candidatosPorValor = titulosAbertos.filter(
      (t) =>
        !titulosUsados.has(t.cod_titulo) &&
        valoresIguais(t.valor, lancamento.valor) &&
        diferencaDias(t.vencimento, lancamento.data) <= JANELA_CASAMENTO_DIAS
    )
    if (candidatosPorValor.length === 1) {
      titulosUsados.add(candidatosPorValor[0].cod_titulo)
      lancamentos.push({ ...lancamento, cod_titulo_casado: candidatosPorValor[0].cod_titulo, situacao: 'casado' })
      continue
    }

    // Divergente: classifica o tipo_inicial.
    if (tituloMesmaNf && titulosUsados.has(tituloMesmaNf.cod_titulo)) {
      divergenciasLancamento.push({
        lancamentoIndex: lancamentos.length,
        tipo_inicial: 'duplicado',
        cod_titulo: tituloMesmaNf.cod_titulo,
        valor_lancamento: lancamento.valor,
        valor_titulo: tituloMesmaNf.valor,
      })
    } else if (tituloMesmaNf) {
      divergenciasLancamento.push({
        lancamentoIndex: lancamentos.length,
        tipo_inicial: 'valor_diferente_mesma_nf',
        cod_titulo: tituloMesmaNf.cod_titulo,
        valor_lancamento: lancamento.valor,
        valor_titulo: tituloMesmaNf.valor,
      })
    } else {
      const cliente = identificarCliente(lancamento.descricao, clientes)
      const titulosDoCliente = cliente
        ? titulosAbertos.filter((t) => t.cod_cliente === cliente.cod_cliente && !titulosUsados.has(t.cod_titulo))
        : []
      const par = cliente ? encontrarParSoma(titulosDoCliente, lancamento.valor) : null

      if (par) {
        divergenciasLancamento.push({
          lancamentoIndex: lancamentos.length,
          tipo_inicial: 'possivel_soma',
          cod_titulo: `${par[0].cod_titulo} + ${par[1].cod_titulo}`,
          valor_lancamento: lancamento.valor,
          valor_titulo: par[0].valor + par[1].valor,
        })
      } else {
        divergenciasLancamento.push({
          lancamentoIndex: lancamentos.length,
          tipo_inicial: 'sem_titulo_correspondente',
          cod_titulo: null,
          valor_lancamento: lancamento.valor,
          valor_titulo: null,
        })
      }
    }

    lancamentos.push({ ...lancamento, cod_titulo_casado: null, situacao: 'divergente' })
  }

  const dataFinalExtrato = lancamentosLimpos.reduce(
    (maxData, l) => (l.data > maxData ? l.data : maxData),
    lancamentosLimpos[0]?.data ?? ''
  )

  const divergenciasVencidas: DivergenciaVencida[] = titulosAbertos
    .filter(
      (t) => !titulosUsados.has(t.cod_titulo) && t.status === 'aberto' && dataFinalExtrato && t.vencimento < dataFinalExtrato
    )
    .map((t) => ({ tipo_inicial: 'vencido_sem_pagamento', cod_titulo: t.cod_titulo, valor_titulo: t.valor }))

  return { lancamentos, divergenciasLancamento, divergenciasVencidas }
}
