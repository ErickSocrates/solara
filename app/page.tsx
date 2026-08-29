import { redirect } from 'next/navigation'
import { criarClienteServidor } from '@/lib/supabase/servidor'
import { sair } from './sair/actions'

export default async function PaginaInicial() {
  const supabase = await criarClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div>
      <header className="cabecalho">
        <strong>Solara OS</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>{user.email}</span>
          <form action={sair}>
            <button className="botao" type="submit">
              Sair
            </button>
          </form>
        </div>
      </header>
    </div>
  )
}
