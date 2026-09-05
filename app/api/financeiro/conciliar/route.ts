import { NextResponse } from 'next/server'
import { criarClienteServidor } from '@/lib/supabase/servidor'
import { buscarPerfil } from '@/lib/perfil'
import { conciliarExtrato } from '@/lib/orquestradores/financeiro'

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
  if (!perfil || !perfil.areas.includes('financeiro')) {
    return NextResponse.json({ erro: 'Sem acesso a area financeiro.' }, { status: 403 })
  }

  const corpo = await request.json()
  const { extrato_id } = corpo as { extrato_id?: string }

  if (!extrato_id) {
    return NextResponse.json({ erro: 'Informe extrato_id.' }, { status: 400 })
  }

  try {
    const resultado = await conciliarExtrato(extrato_id)
    return NextResponse.json({ ok: true, ...resultado })
  } catch (erro) {
    const mensagemErro = erro instanceof Error ? erro.message : String(erro)
    return NextResponse.json({ erro: mensagemErro }, { status: 500 })
  }
}
