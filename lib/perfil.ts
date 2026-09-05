import { criarClienteAdmin } from './supabase/admin'

export type Perfil = {
  id: string
  email: string
  nome: string
  papel: 'admin' | 'operador'
  areas: string[]
  criado_em: string
}

export async function buscarPerfil(id: string): Promise<Perfil | null> {
  const supabase = criarClienteAdmin()
  const { data, error } = await supabase.from('perfis').select('*').eq('id', id).single()

  if (error) return null
  return data as Perfil
}

export async function listarPerfis(): Promise<Perfil[]> {
  const supabase = criarClienteAdmin()
  const { data, error } = await supabase.from('perfis').select('*').order('criado_em')

  if (error) throw new Error(`Falha ao listar perfis: ${error.message}`)
  return data as Perfil[]
}
