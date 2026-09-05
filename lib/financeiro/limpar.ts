export type LancamentoLimpo = {
  data: string
  descricao: string
  valor: number
  tipo: 'credito' | 'debito'
}

export type TituloLimpo = {
  cod_titulo: string
  cod_cliente: string | null
  nota_fiscal: string | null
  valor: number
  emissao: string | null
  vencimento: string
  status: string
}

export type ResultadoLimpezaExtrato = {
  linhasAntes: string[]
  lancamentos: LancamentoLimpo[]
}

const REGEX_DATA_BR = /^\d{2}\/\d{2}\/\d{4}$/

function decodificar(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

function detectarSeparador(linha: string): string {
  const pontoEVirgula = (linha.match(/;/g) ?? []).length
  const virgula = (linha.match(/,/g) ?? []).length
  return pontoEVirgula >= virgula ? ';' : ','
}

function dataBrParaIso(dataBr: string): string {
  const [dia, mes, ano] = dataBr.trim().split('/')
  return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`
}

function valorBrParaNumero(valorTexto: string): number {
  return parseFloat(valorTexto.trim().replace(/\./g, '').replace(',', '.'))
}

export function limparExtrato(buffer: ArrayBuffer): ResultadoLimpezaExtrato {
  const texto = decodificar(buffer)
  const todasLinhas = texto.split(/\r?\n/)
  const linhasAntes = todasLinhas.slice(0, 6)
  const linhasNaoVazias = todasLinhas.filter((linha) => linha.trim().length > 0)

  const primeiraLinha = linhasNaoVazias[0] ?? ''

  // Arquivo ja limpo: cabecalho cod_lancamento,data,descricao,valor,tipo
  if (primeiraLinha.toLowerCase().startsWith('cod_lancamento')) {
    const separador = detectarSeparador(primeiraLinha)
    const lancamentos = linhasNaoVazias.slice(1).map((linha) => {
      const colunas = linha.split(separador)
      return {
        data: (colunas[1] ?? '').trim(),
        descricao: (colunas[2] ?? '').trim(),
        valor: parseFloat((colunas[3] ?? '').trim()),
        tipo: (colunas[4] ?? '').trim() as 'credito' | 'debito',
      }
    })
    return { linhasAntes, lancamentos }
  }

  // Extrato bruto: pula o cabecalho do banco ate achar a linha "Data;..."
  const indiceCabecalho = linhasNaoVazias.findIndex((linha) => linha.trim().toLowerCase().startsWith('data'))
  if (indiceCabecalho === -1) {
    throw new Error('Nao encontrei a linha de cabecalho ("Data...") no extrato.')
  }

  const separador = detectarSeparador(linhasNaoVazias[indiceCabecalho])
  const lancamentos: LancamentoLimpo[] = []

  for (const linha of linhasNaoVazias.slice(indiceCabecalho + 1)) {
    const colunas = linha.split(separador)
    const dataTexto = (colunas[0] ?? '').trim()
    const descricao = (colunas[1] ?? '').trim()
    const valorTexto = (colunas[2] ?? '').trim()

    if (!REGEX_DATA_BR.test(dataTexto)) continue // rodape do banco, sem data valida
    if (descricao.toUpperCase().includes('SALDO')) continue
    if (!valorTexto) continue

    const valor = valorBrParaNumero(valorTexto)
    lancamentos.push({
      data: dataBrParaIso(dataTexto),
      descricao,
      valor,
      tipo: valor < 0 ? 'debito' : 'credito',
    })
  }

  return { linhasAntes, lancamentos }
}

export function limparTitulos(buffer: ArrayBuffer): TituloLimpo[] {
  const texto = decodificar(buffer)
  const linhasNaoVazias = texto.split(/\r?\n/).filter((linha) => linha.trim().length > 0)
  if (linhasNaoVazias.length === 0) return []

  const separador = detectarSeparador(linhasNaoVazias[0])

  return linhasNaoVazias.slice(1).map((linha) => {
    const [cod_titulo, cod_cliente, nota_fiscal, valor, emissao, vencimento, status] = linha
      .split(separador)
      .map((valor) => valor.trim())

    return {
      cod_titulo,
      cod_cliente: cod_cliente || null,
      nota_fiscal: nota_fiscal || null,
      valor: parseFloat(valor),
      emissao: emissao || null,
      vencimento,
      status,
    }
  })
}
