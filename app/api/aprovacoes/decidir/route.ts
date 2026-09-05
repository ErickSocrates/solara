import { NextResponse } from 'next/server'
import { criarClienteServidor } from '@/lib/supabase/servidor'
import { criarClienteAdmin } from '@/lib/supabase/admin'

type Acao = 'aprovar' | 'editar' | 'rejeitar'

export async function POST(request: Request) {
  const supabase = await criarClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ erro: 'Nao autorizado.' }, { status: 401 })
  }

  const corpo = await request.json()
  const { id, acao, proposta, observacao } = corpo as {
    id: string
    acao: Acao
    proposta?: unknown
    observacao?: string
  }

  if (!id || !acao) {
    return NextResponse.json({ erro: 'Informe id e acao.' }, { status: 400 })
  }

  if (acao === 'rejeitar' && !observacao) {
    return NextResponse.json({ erro: 'Rejeicao exige observacao.' }, { status: 400 })
  }

  const statusPorAcao: Record<Acao, string> = {
    aprovar: 'aprovada',
    editar: 'editada',
    rejeitar: 'rejeitada',
  }

  const atualizacao: Record<string, unknown> = {
    status: statusPorAcao[acao],
    decidido_por: user.id,
    decidido_em: new Date().toISOString(),
  }

  if (acao === 'editar' && proposta !== undefined) {
    atualizacao.proposta = proposta
  }

  if (observacao) {
    atualizacao.observacao = observacao
  }

  const supabaseAdmin = criarClienteAdmin()
  const { data, error } = await supabaseAdmin
    .from('aprovacoes')
    .update(atualizacao)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 400 })
  }

  if (data.item_tipo === 'pedido') {
    const statusPedido = acao === 'rejeitar' ? 'rejeitado' : 'respondido'
    await supabaseAdmin.from('pedidos_orcamento').update({ status: statusPedido }).eq('cod_pedido', data.item_id)
  }

  if (data.item_tipo === 'divergencia') {
    const proposta = data.proposta as {
      divergencia_id?: string
      hipotese?: string
      cod_titulos_envolvidos?: string[]
      valor_pendente?: number
    } | null

    const divergenciaId = proposta?.divergencia_id

    if (divergenciaId) {
      if (acao === 'rejeitar') {
        await supabaseAdmin.from('divergencias').update({ status: 'nova' }).eq('id', divergenciaId)
      } else {
        await supabaseAdmin.from('divergencias').update({ status: 'resolvida' }).eq('id', divergenciaId)

        const statusTitulo =
          proposta?.hipotese === 'vencido_sem_pagamento'
            ? 'vencido'
            : (proposta?.valor_pendente ?? 0) > 0
              ? 'pago_parcial'
              : 'pago'

        for (const codTitulo of proposta?.cod_titulos_envolvidos ?? []) {
          await supabaseAdmin.from('titulos_receber').update({ status: statusTitulo }).eq('cod_titulo', codTitulo)
        }
      }
    }
  }

  return NextResponse.json({ aprovacao: data })
}
