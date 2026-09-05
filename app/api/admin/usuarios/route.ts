import { NextResponse } from 'next/server'
import { criarClienteServidor } from '@/lib/supabase/servidor'
import { criarClienteAdmin } from '@/lib/supabase/admin'
import { buscarPerfil } from '@/lib/perfil'

async function exigirAdmin() {
  const supabase = await criarClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const perfil = await buscarPerfil(user.id)
  if (!perfil || perfil.papel !== 'admin') return null

  return perfil
}

export async function POST(request: Request) {
  const admin = await exigirAdmin()
  if (!admin) {
    return NextResponse.json({ erro: 'Nao autorizado.' }, { status: 403 })
  }

  const corpo = await request.json()
  const { email, senha, nome, papel, areas } = corpo

  if (!email || !senha || !nome || !papel) {
    return NextResponse.json({ erro: 'Preencha e-mail, senha, nome e papel.' }, { status: 400 })
  }

  const supabaseAdmin = criarClienteAdmin()

  const { data: usuarioCriado, error: erroAuth } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })

  if (erroAuth || !usuarioCriado.user) {
    return NextResponse.json({ erro: erroAuth?.message ?? 'Falha ao criar usuario.' }, { status: 400 })
  }

  const { data: perfilCriado, error: erroPerfil } = await supabaseAdmin
    .from('perfis')
    .insert({
      id: usuarioCriado.user.id,
      email,
      nome,
      papel,
      areas: Array.isArray(areas) ? areas : [],
    })
    .select()
    .single()

  if (erroPerfil) {
    return NextResponse.json({ erro: erroPerfil.message }, { status: 400 })
  }

  return NextResponse.json({ perfil: perfilCriado })
}
