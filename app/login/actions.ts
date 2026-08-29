'use server'

import { redirect } from 'next/navigation'
import { criarClienteServidor } from '@/lib/supabase/servidor'

export async function entrar(_estadoAnterior: { erro: string } | null, dadosFormulario: FormData) {
  const email = dadosFormulario.get('email') as string
  const senha = dadosFormulario.get('senha') as string

  const supabase = await criarClienteServidor()
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha })

  if (error) {
    return { erro: 'E-mail ou senha invalidos.' }
  }

  redirect('/')
}
