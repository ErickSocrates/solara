import { redirect } from 'next/navigation'
import Link from 'next/link'
import { criarClienteServidor } from '@/lib/supabase/servidor'
import { buscarPerfil, listarPerfis } from '@/lib/perfil'
import FormularioNovoUsuario from './FormularioNovoUsuario'

export default async function PaginaAdmin() {
  const supabase = await criarClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const perfil = await buscarPerfil(user.id)
  if (!perfil || perfil.papel !== 'admin') redirect('/')

  const perfis = await listarPerfis()

  return (
    <div>
      <header className="cabecalho">
        <strong>Solara OS · Admin</strong>
        <Link href="/">Voltar</Link>
      </header>

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <h2>Usuarios</h2>
          <table className="tabela">
            <thead>
              <tr>
                <th>E-mail</th>
                <th>Nome</th>
                <th>Papel</th>
                <th>Areas</th>
              </tr>
            </thead>
            <tbody>
              {perfis.map((p) => (
                <tr key={p.id}>
                  <td>{p.email}</td>
                  <td>{p.nome}</td>
                  <td>{p.papel}</td>
                  <td>{p.areas?.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <FormularioNovoUsuario />
      </div>
    </div>
  )
}
