import { redirect } from 'next/navigation'
import Link from 'next/link'
import { criarClienteServidor } from '@/lib/supabase/servidor'
import { buscarPerfil } from '@/lib/perfil'
import PainelFinanceiro from './PainelFinanceiro'

export default async function PaginaFinanceiro() {
  const supabase = await criarClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const perfil = await buscarPerfil(user.id)
  if (!perfil || !perfil.areas.includes('financeiro')) redirect('/')

  return (
    <div>
      <header className="cabecalho">
        <strong>Solara OS · Financeiro</strong>
        <Link href="/">Voltar</Link>
      </header>

      <PainelFinanceiro />
    </div>
  )
}
