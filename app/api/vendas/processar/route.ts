import { NextResponse } from 'next/server'
import { criarClienteServidor } from '@/lib/supabase/servidor'
import { buscarPerfil } from '@/lib/perfil'
import { processarPedidoVendas } from '@/lib/orquestradores/vendas'

export const maxDuration = 60

export async function POST(request: Request) {
  const supabase = await criarClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ erro: 'Nao autorizado.' }, { status: 401 })
  }

  const perfil = await buscarPerfil(user.id)
  if (!perfil || !perfil.areas.includes('vendas')) {
    return NextResponse.json({ erro: 'Sem acesso a area de vendas.' }, { status: 403 })
  }

  const corpo = await request.json()
  const { cod_pedido } = corpo as { cod_pedido?: string }

  if (!cod_pedido) {
    return NextResponse.json({ erro: 'Informe cod_pedido.' }, { status: 400 })
  }

  try {
    await processarPedidoVendas(cod_pedido)
    return NextResponse.json({ ok: true })
  } catch (erro) {
    const mensagemErro = erro instanceof Error ? erro.message : String(erro)
    return NextResponse.json({ erro: mensagemErro }, { status: 500 })
  }
}
