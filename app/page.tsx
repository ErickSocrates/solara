import { redirect } from 'next/navigation'
import Link from 'next/link'
import { criarClienteServidor } from '@/lib/supabase/servidor'
import { buscarPerfil } from '@/lib/perfil'
import { sair } from './sair/actions'

const AREAS_EM_BREVE = ['RH', 'Juridico', 'Operacoes']

export default async function PaginaInicial() {
  const supabase = await criarClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const perfil = await buscarPerfil(user.id)
  const areas = perfil?.areas ?? []

  return (
    <div>
      <header className="cabecalho">
        <strong>Solara OS</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>{user.email}</span>
          {perfil?.papel === 'admin' && <Link href="/admin">Admin</Link>}
          <form action={sair}>
            <button className="botao" type="submit">
              Sair
            </button>
          </form>
        </div>
      </header>

      <div className="grade-cartoes">
        {areas.includes('vendas') && (
          <Link href="/vendas" className="cartao-area">
            Vendas
          </Link>
        )}
        {areas.includes('financeiro') && (
          <Link href="/financeiro" className="cartao-area">
            Financeiro
          </Link>
        )}
        {AREAS_EM_BREVE.map((area) => (
          <div key={area} className="cartao-area cartao-area-desativado">
            {area}
            <span className="etiqueta-em-breve">em breve</span>
          </div>
        ))}
      </div>
    </div>
  )
}
