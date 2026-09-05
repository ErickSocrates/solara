import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { criarClienteServidor } from '@/lib/supabase/servidor'
import { buscarPerfil } from '@/lib/perfil'
import { limparExtrato, limparTitulos } from '@/lib/financeiro/limpar'
import { casarLancamentos, type LancamentoCasado } from '@/lib/financeiro/casar'
import {
  criarExtratoImportado,
  inserirLancamentos,
  inserirDivergencias,
  listarTitulosAbertos,
  listarClientesResumo,
} from '@/lib/financeiro/dados'

export async function POST(request: Request) {
  const supabase = await criarClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ erro: 'Nao autorizado.' }, { status: 401 })
  }

  const perfil = await buscarPerfil(user.id)
  if (!perfil || !perfil.areas.includes('financeiro')) {
    return NextResponse.json({ erro: 'Sem acesso a area financeiro.' }, { status: 403 })
  }

  const formData = await request.formData()
  const arquivoExtrato = formData.get('extrato')
  const arquivoTitulos = formData.get('titulos')

  if (!(arquivoExtrato instanceof File)) {
    return NextResponse.json({ erro: 'Envie o arquivo do extrato.' }, { status: 400 })
  }

  try {
    const { linhasAntes, lancamentos } = limparExtrato(await arquivoExtrato.arrayBuffer())

    // Um <input type="file"> opcional sem arquivo selecionado ainda chega
    // aqui como um File vazio (size 0), nao como null - por isso o size > 0.
    const titulosForamEnviados = arquivoTitulos instanceof File && arquivoTitulos.size > 0

    const [titulosAbertos, clientes] = await Promise.all([
      titulosForamEnviados
        ? limparTitulos(await (arquivoTitulos as File).arrayBuffer()).filter((t) => t.status === 'aberto')
        : listarTitulosAbertos(),
      listarClientesResumo(),
    ])

    const { lancamentos: lancamentosCasados, divergenciasLancamento, divergenciasVencidas } = casarLancamentos(
      lancamentos,
      titulosAbertos,
      clientes
    )

    const lancamentosComId = lancamentosCasados.map((l) => ({ ...l, id: randomUUID() }))
    const totalCreditos = lancamentosComId.filter((l) => l.tipo === 'credito').length

    const extratoId = await criarExtratoImportado({
      nome_arquivo: arquivoExtrato.name,
      importado_por: user.id,
      total_linhas: lancamentosComId.length,
      total_creditos: totalCreditos,
    })

    const lancamentosGravados = await inserirLancamentos(extratoId, lancamentosComId)

    const divergenciasParaGravar = [
      ...divergenciasLancamento.map((d) => ({
        extrato_id: extratoId,
        tipo_inicial: d.tipo_inicial as string,
        lancamento_id: lancamentosComId[d.lancamentoIndex].id,
        cod_titulo: d.cod_titulo,
        valor_lancamento: d.valor_lancamento,
        valor_titulo: d.valor_titulo,
        status: 'nova',
      })),
      ...divergenciasVencidas.map((d) => ({
        extrato_id: extratoId,
        tipo_inicial: d.tipo_inicial as string,
        lancamento_id: null,
        cod_titulo: d.cod_titulo,
        valor_lancamento: null,
        valor_titulo: d.valor_titulo,
        status: 'nova',
      })),
    ]

    const divergenciasGravadas = await inserirDivergencias(divergenciasParaGravar)

    return NextResponse.json({
      extrato_id: extratoId,
      antes: linhasAntes,
      depois: lancamentosCasados.slice(0, 6) as LancamentoCasado[],
      bateram: lancamentosGravados.filter((l) => l.situacao === 'casado'),
      ignorados: lancamentosGravados.filter((l) => l.situacao === 'ignorado'),
      divergencias: divergenciasGravadas,
    })
  } catch (erro) {
    const mensagemErro = erro instanceof Error ? erro.message : String(erro)
    return NextResponse.json({ erro: mensagemErro }, { status: 400 })
  }
}
