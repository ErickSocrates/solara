import { redirect } from 'next/navigation'
import Link from 'next/link'
import { criarClienteServidor } from '@/lib/supabase/servidor'
import { buscarPerfil } from '@/lib/perfil'
import { listarPedidos, listarClientes } from '@/lib/vendas/dados'
import PainelVendas from './PainelVendas'

export default async function PaginaVendas() {
  const supabase = await criarClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const perfil = await buscarPerfil(user.id)
  if (!perfil || !perfil.areas.includes('vendas')) redirect('/')

  const [pedidos, clientes] = await Promise.all([listarPedidos(), listarClientes()])

  return (
    <div>
      <header className="cabecalho">
        <strong>Solara OS · Vendas</strong>
        <Link href="/">Voltar</Link>
      </header>

      <PainelVendas pedidosIniciais={pedidos} clientes={clientes} />
    </div>
  )
}
