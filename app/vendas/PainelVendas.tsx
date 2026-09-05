'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarClienteBrowser } from '@/lib/supabase/browser'
import Organograma from '@/components/Organograma'
import LinhaDoTempo from '@/components/LinhaDoTempo'
import FilaAprovacao from '@/components/FilaAprovacao'
import type { Cliente, PedidoOrcamento } from '@/lib/vendas/dados'

const COLUNAS: { status: string; titulo: string }[] = [
  { status: 'novo', titulo: 'Novo' },
  { status: 'processando', titulo: 'Processando' },
  { status: 'aguardando_aprovacao', titulo: 'Aguardando aprovacao' },
  { status: 'respondido', titulo: 'Respondido' },
  { status: 'rejeitado', titulo: 'Rejeitado' },
]

const CANAIS = ['e-mail', 'whatsapp', 'telefone']

export default function PainelVendas({
  pedidosIniciais,
  clientes,
}: {
  pedidosIniciais: PedidoOrcamento[]
  clientes: Cliente[]
}) {
  const router = useRouter()
  const [pedidos, setPedidos] = useState(pedidosIniciais)
  const [aba, setAba] = useState<'kanban' | 'aprovacoes'>('kanban')
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [emProcessamento, setEmProcessamento] = useState<Set<string>>(new Set())
  const [mostrarNovoPedido, setMostrarNovoPedido] = useState(false)
  const [erro, setErro] = useState('')

  const nomePorCliente = new Map(clientes.map((c) => [c.cod_cliente, c.nome]))

  useEffect(() => {
    const supabase = criarClienteBrowser()

    const canal = supabase
      .channel('pedidos-orcamento')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos_orcamento' },
        (payload) => {
          setPedidos((atual) => {
            if (payload.eventType === 'DELETE') {
              const antigo = payload.old as PedidoOrcamento
              return atual.filter((p) => p.cod_pedido !== antigo.cod_pedido)
            }

            const novo = payload.new as PedidoOrcamento
            const existe = atual.some((p) => p.cod_pedido === novo.cod_pedido)
            const atualizado = existe
              ? atual.map((p) => (p.cod_pedido === novo.cod_pedido ? novo : p))
              : [novo, ...atual]

            return atualizado
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [])

  async function processar(codPedido: string) {
    setEmProcessamento((atual) => new Set(atual).add(codPedido))
    setErro('')

    const resposta = await fetch('/api/vendas/processar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cod_pedido: codPedido }),
    })

    const resultado = await resposta.json()

    setEmProcessamento((atual) => {
      const novo = new Set(atual)
      novo.delete(codPedido)
      return novo
    })

    if (!resposta.ok) {
      setErro(`Falha ao processar ${codPedido}: ${resultado.erro}`)
    }

    // Nao depende so do Realtime: atualiza o card com o status final aqui
    // mesmo, caso o evento de Realtime atrase ou se perca.
    setPedidos((atual) =>
      atual.map((p) =>
        p.cod_pedido === codPedido
          ? { ...p, status: resposta.ok ? 'aguardando_aprovacao' : 'novo' }
          : p
      )
    )
  }

  async function criarNovoPedido(dadosFormulario: FormData) {
    setErro('')

    const resposta = await fetch('/api/vendas/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cod_cliente: dadosFormulario.get('cod_cliente'),
        canal: dadosFormulario.get('canal'),
        mensagem: dadosFormulario.get('mensagem'),
      }),
    })

    const resultado = await resposta.json()

    if (!resposta.ok) {
      setErro(resultado.erro ?? 'Falha ao criar pedido.')
      return
    }

    setPedidos((atual) => [resultado.pedido, ...atual])
    setMostrarNovoPedido(false)
    router.refresh()
  }

  return (
    <div>
      <div className="abas">
        <button
          type="button"
          className={`aba ${aba === 'kanban' ? 'aba-ativa' : ''}`}
          onClick={() => setAba('kanban')}
        >
          Pedidos
        </button>
        <button
          type="button"
          className={`aba ${aba === 'aprovacoes' ? 'aba-ativa' : ''}`}
          onClick={() => setAba('aprovacoes')}
        >
          Aprovacoes
        </button>
      </div>

      {erro && (
        <p className="erro" style={{ padding: '0 24px' }}>
          {erro}
        </p>
      )}

      {aba === 'kanban' ? (
        <div>
          {selecionado ? (
            <Organograma area="vendas" itemId={selecionado} />
          ) : (
            <p style={{ padding: 24, color: '#999' }}>Selecione um pedido para ver o organograma.</p>
          )}

          <div style={{ padding: '0 24px 24px' }}>
            <button className="botao" type="button" onClick={() => setMostrarNovoPedido(true)}>
              Novo pedido
            </button>
          </div>

          <div className="kanban">
            {COLUNAS.map((coluna) => (
              <div className="kanban-coluna" key={coluna.status}>
                <h3>{coluna.titulo}</h3>
                {pedidos
                  .filter((p) => p.status === coluna.status)
                  .map((pedido) => (
                    <div
                      key={pedido.cod_pedido}
                      className={`kanban-cartao ${selecionado === pedido.cod_pedido ? 'selecionado' : ''}`}
                      onClick={() => setSelecionado(pedido.cod_pedido)}
                    >
                      <strong>{pedido.cod_pedido}</strong>
                      <span>{pedido.cod_cliente ? nomePorCliente.get(pedido.cod_cliente) ?? pedido.cod_cliente : 'sem cliente'}</span>
                      <span className="kanban-cartao-meta">
                        {pedido.canal} · {pedido.data}
                      </span>
                      <p>{pedido.mensagem.slice(0, 80)}</p>

                      {coluna.status === 'novo' && (
                        <button
                          className="botao"
                          type="button"
                          disabled={emProcessamento.has(pedido.cod_pedido)}
                          onClick={(e) => {
                            e.stopPropagation()
                            processar(pedido.cod_pedido)
                          }}
                        >
                          {emProcessamento.has(pedido.cod_pedido) ? 'Processando...' : 'Processar'}
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <FilaAprovacao area="vendas" />
      )}

      {selecionado && aba === 'kanban' && (
        <div className="painel-lateral">
          <div className="painel-lateral-cabecalho">
            <strong>{selecionado}</strong>
            <button className="botao" type="button" onClick={() => setSelecionado(null)}>
              Fechar
            </button>
          </div>
          <LinhaDoTempo itemId={selecionado} />
        </div>
      )}

      {mostrarNovoPedido && (
        <div className="modal-fundo" onClick={() => setMostrarNovoPedido(false)}>
          <form
            className="cartao"
            onClick={(e) => e.stopPropagation()}
            action={criarNovoPedido}
          >
            <h2>Novo pedido</h2>

            <div className="campo">
              <label htmlFor="cod_cliente">Cliente</label>
              <select id="cod_cliente" name="cod_cliente" required defaultValue="">
                <option value="" disabled>
                  Selecione
                </option>
                {clientes.map((cliente) => (
                  <option key={cliente.cod_cliente} value={cliente.cod_cliente}>
                    {cliente.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="campo">
              <label htmlFor="canal">Canal</label>
              <select id="canal" name="canal" required defaultValue="e-mail">
                {CANAIS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="campo">
              <label htmlFor="mensagem">Mensagem</label>
              <textarea id="mensagem" name="mensagem" rows={5} required />
            </div>

            <button className="botao" type="submit">
              Salvar
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
