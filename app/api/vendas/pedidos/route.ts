import { NextResponse } from 'next/server'
import { criarClienteServidor } from '@/lib/supabase/servidor'
import { buscarPerfil } from '@/lib/perfil'
import { criarPedido } from '@/lib/vendas/dados'

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
  const { cod_cliente, canal, mensagem } = corpo as {
    cod_cliente?: string
    canal?: string
    mensagem?: string
  }

  if (!cod_cliente || !canal || !mensagem) {
    return NextResponse.json({ erro: 'Preencha cliente, canal e mensagem.' }, { status: 400 })
  }

  try {
    const pedido = await criarPedido({ cod_cliente, canal, mensagem })
    return NextResponse.json({ pedido })
  } catch (erro) {
    const mensagemErro = erro instanceof Error ? erro.message : String(erro)
    return NextResponse.json({ erro: mensagemErro }, { status: 400 })
  }
}
