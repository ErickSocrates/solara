'use client'

import { useEffect, useState } from 'react'
import { criarClienteBrowser } from '@/lib/supabase/browser'

type Aprovacao = {
  id: string
  area: string
  item_tipo: string
  item_id: string
  titulo: string
  proposta: unknown
  status: string
  decidido_por: string | null
  decidido_em: string | null
  observacao: string | null
}

type Acao = 'aprovar' | 'editar' | 'rejeitar'

type ItemContexto = { descricao_cliente?: string; existe?: boolean }

type PropostaComResposta = {
  resposta: string
  contexto?: { itens?: ItemContexto[] }
  [chave: string]: unknown
}

function ehPropostaComResposta(proposta: unknown): proposta is PropostaComResposta {
  return (
    !!proposta &&
    typeof proposta === 'object' &&
    typeof (proposta as Record<string, unknown>).resposta === 'string'
  )
}

export default function FilaAprovacao({ area }: { area: 'vendas' | 'financeiro' }) {
  const [itens, setItens] = useState<Aprovacao[]>([])
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const [propostaEditada, setPropostaEditada] = useState('')
  const [observacao, setObservacao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    const supabase = criarClienteBrowser()
    let cancelado = false

    supabase
      .from('aprovacoes')
      .select('*')
      .eq('area', area)
      .eq('status', 'pendente')
      .then(({ data }) => {
        if (!cancelado && data) setItens(data as Aprovacao[])
      })

    const canal = supabase
      .channel(`aprovacoes-${area}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'aprovacoes', filter: `area=eq.${area}` },
        (payload) => {
          setItens((atual) => {
            if (payload.eventType === 'DELETE') {
              return atual.filter((i) => i.id !== (payload.old as Aprovacao).id)
            }

            const linha = payload.new as Aprovacao
            if (linha.status !== 'pendente') {
              return atual.filter((i) => i.id !== linha.id)
            }

            const existe = atual.some((i) => i.id === linha.id)
            return existe ? atual.map((i) => (i.id === linha.id ? linha : i)) : [...atual, linha]
          })
        }
      )
      .subscribe()

    return () => {
      cancelado = true
      supabase.removeChannel(canal)
    }
  }, [area])

  const selecionado = itens.find((i) => i.id === selecionadoId) ?? null

  function selecionar(item: Aprovacao) {
    setSelecionadoId(item.id)
    setPropostaEditada(
      ehPropostaComResposta(item.proposta) ? item.proposta.resposta : JSON.stringify(item.proposta, null, 2)
    )
    setObservacao('')
    setErro('')
  }

  const comResposta = ehPropostaComResposta(selecionado?.proposta)
  const itensNaoVendidos = comResposta
    ? (selecionado!.proposta as PropostaComResposta).contexto?.itens?.filter((item) => item.existe === false) ?? []
    : []

  async function decidir(acao: Acao) {
    if (!selecionado) return

    if (acao === 'rejeitar' && !observacao.trim()) {
      setErro('Informe uma observacao para rejeitar.')
      return
    }

    let propostaParaEnviar: unknown
    if (acao === 'editar') {
      if (comResposta) {
        // So o texto da resposta e editavel na tela; o resto da proposta
        // (triagem, contexto, revisao) e mantido como veio dos agentes.
        propostaParaEnviar = { ...(selecionado.proposta as PropostaComResposta), resposta: propostaEditada }
      } else {
        try {
          propostaParaEnviar = JSON.parse(propostaEditada)
        } catch {
          setErro('A proposta editada nao e um JSON valido.')
          return
        }
      }
    }

    setEnviando(true)
    setErro('')

    const resposta = await fetch('/api/aprovacoes/decidir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: selecionado.id,
        acao,
        proposta: propostaParaEnviar,
        observacao: observacao.trim() || undefined,
      }),
    })

    const resultado = await resposta.json()
    setEnviando(false)

    if (!resposta.ok) {
      setErro(resultado.erro ?? 'Falha ao registrar decisao.')
      return
    }

    setItens((atual) => atual.filter((i) => i.id !== selecionado.id))
    setSelecionadoId(null)
  }

  return (
    <div className="fila-aprovacao">
      <div className="fila-aprovacao-lista">
        {itens.length === 0 && <p>Nenhuma aprovacao pendente.</p>}
        {itens.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`fila-aprovacao-item ${selecionadoId === item.id ? 'selecionado' : ''}`}
            onClick={() => selecionar(item)}
          >
            {item.titulo}
          </button>
        ))}
      </div>

      {selecionado && (
        <div className="fila-aprovacao-detalhe">
          <h3>{selecionado.titulo}</h3>
          {erro && <p className="erro">{erro}</p>}

          {comResposta && itensNaoVendidos.length > 0 && (
            <div className="aviso-itens-nao-vendidos">
              <strong>Atenção: itens que a Solara não vende</strong>
              <ul>
                {itensNaoVendidos.map((item, indice) => (
                  <li key={indice}>{item.descricao_cliente ?? 'item nao identificado'}</li>
                ))}
              </ul>
              <p>Confira se a resposta abaixo deixa isso claro pro cliente antes de aprovar.</p>
            </div>
          )}

          <label htmlFor="proposta">{comResposta ? 'Resposta ao cliente' : 'Proposta'}</label>
          <textarea
            id="proposta"
            className={comResposta ? 'textarea-resposta' : undefined}
            value={propostaEditada}
            onChange={(e) => setPropostaEditada(e.target.value)}
            rows={comResposta ? 16 : 12}
          />

          <label htmlFor="observacao">Observacao (obrigatoria para rejeitar)</label>
          <input
            id="observacao"
            type="text"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="botao" type="button" disabled={enviando} onClick={() => decidir('aprovar')}>
              Aprovar
            </button>
            <button className="botao" type="button" disabled={enviando} onClick={() => decidir('editar')}>
              Salvar edicao e aprovar
            </button>
            <button
              className="botao botao-perigo"
              type="button"
              disabled={enviando}
              onClick={() => decidir('rejeitar')}
            >
              Rejeitar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
