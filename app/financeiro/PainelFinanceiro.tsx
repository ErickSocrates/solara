'use client'

import { useEffect, useState } from 'react'
import { criarClienteBrowser } from '@/lib/supabase/browser'
import Organograma from '@/components/Organograma'
import LinhaDoTempo from '@/components/LinhaDoTempo'
import FilaAprovacao from '@/components/FilaAprovacao'
import type { LancamentoRegistro, DivergenciaRegistro } from '@/lib/financeiro/dados'
import type { LancamentoCasado } from '@/lib/financeiro/casar'

const COLUNAS_DIVERGENCIA: { status: string; titulo: string }[] = [
  { status: 'nova', titulo: 'Nova' },
  { status: 'investigando', titulo: 'Investigando' },
  { status: 'aguardando_aprovacao', titulo: 'Aguardando aprovação' },
  { status: 'resolvida', titulo: 'Resolvida' },
]

type ResultadoImportacao = {
  extrato_id: string
  antes: string[]
  depois: LancamentoCasado[]
  bateram: LancamentoRegistro[]
  ignorados: LancamentoRegistro[]
  divergencias: DivergenciaRegistro[]
}

export default function PainelFinanceiro() {
  const [aba, setAba] = useState<'conciliacao' | 'relatorio' | 'aprovacoes'>('conciliacao')
  const [importando, setImportando] = useState(false)
  const [conciliando, setConciliando] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  const [divergencias, setDivergencias] = useState<DivergenciaRegistro[]>([])
  const [relatorio, setRelatorio] = useState<string | null>(null)
  const [mostrarLinhaDoTempo, setMostrarLinhaDoTempo] = useState(false)

  // Realtime: kanban de divergencias reflete nova -> investigando ->
  // aguardando_aprovacao enquanto o orquestrador roda.
  useEffect(() => {
    if (!resultado) return

    const supabase = criarClienteBrowser()
    const canal = supabase
      .channel(`divergencias-${resultado.extrato_id}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'divergencias', filter: `extrato_id=eq.${resultado.extrato_id}` },
        (payload) => {
          setDivergencias((atual) => {
            if (payload.eventType === 'DELETE') {
              return atual.filter((d) => d.id !== (payload.old as DivergenciaRegistro).id)
            }
            const nova = payload.new as DivergenciaRegistro
            const existe = atual.some((d) => d.id === nova.id)
            return existe ? atual.map((d) => (d.id === nova.id ? nova : d)) : [...atual, nova]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [resultado?.extrato_id])

  async function importar(dadosFormulario: FormData) {
    setErro('')
    setImportando(true)

    const resposta = await fetch('/api/financeiro/importar', { method: 'POST', body: dadosFormulario })
    const dados = await resposta.json()

    setImportando(false)

    if (!resposta.ok) {
      setErro(dados.erro ?? 'Falha ao importar extrato.')
      return
    }

    setResultado(dados)
    setDivergencias(dados.divergencias)
    setRelatorio(null)
    setMostrarLinhaDoTempo(false)
  }

  async function conciliar() {
    if (!resultado) return
    setErro('')
    setConciliando(true)

    const resposta = await fetch('/api/financeiro/conciliar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extrato_id: resultado.extrato_id }),
    })
    const dados = await resposta.json()

    setConciliando(false)

    if (!resposta.ok) {
      setErro(dados.erro ?? 'Falha ao conciliar.')
      return
    }

    setRelatorio(dados.relatorio?.relatorio_markdown ?? null)
  }

  const temDivergenciasNovas = divergencias.some((d) => d.status === 'nova')

  return (
    <div>
      <div className="abas">
        <button
          type="button"
          className={`aba ${aba === 'conciliacao' ? 'aba-ativa' : ''}`}
          onClick={() => setAba('conciliacao')}
        >
          Conciliação
        </button>
        <button
          type="button"
          className={`aba ${aba === 'relatorio' ? 'aba-ativa' : ''}`}
          onClick={() => setAba('relatorio')}
        >
          Relatório
        </button>
        <button
          type="button"
          className={`aba ${aba === 'aprovacoes' ? 'aba-ativa' : ''}`}
          onClick={() => setAba('aprovacoes')}
        >
          Aprovações
        </button>
      </div>

      {erro && (
        <p className="erro" style={{ padding: '0 24px' }}>
          {erro}
        </p>
      )}

      {aba === 'conciliacao' && (
        <div>
          {resultado ? (
            <>
              <Organograma area="financeiro" itemId={resultado.extrato_id} />
              <div style={{ padding: '0 24px' }}>
                <button className="botao" type="button" onClick={() => setMostrarLinhaDoTempo((atual) => !atual)}>
                  {mostrarLinhaDoTempo ? 'Fechar linha do tempo' : 'Ver linha do tempo'}
                </button>
              </div>
            </>
          ) : (
            <p style={{ padding: 24, color: '#999' }}>Importe um extrato para ver o organograma.</p>
          )}

          <div style={{ padding: 24 }}>
            <h2>Importar</h2>
            <form action={importar} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
              <div className="campo">
                <label htmlFor="extrato">Extrato (obrigatório)</label>
                <input id="extrato" name="extrato" type="file" accept=".csv" required />
              </div>
              <div className="campo">
                <label htmlFor="titulos">Títulos (opcional)</label>
                <input id="titulos" name="titulos" type="file" accept=".csv" />
              </div>
              <button className="botao" type="submit" disabled={importando}>
                {importando ? 'Importando...' : 'Importar'}
              </button>
            </form>
          </div>

          {resultado && (
            <>
              <div style={{ padding: '0 24px 24px' }}>
                <h3>Antes e depois (6 primeiras linhas)</h3>
                <div className="antes-depois-grade">
                  <div>
                    <strong>Como veio</strong>
                    <pre>{resultado.antes.join('\n')}</pre>
                  </div>
                  <div>
                    <strong>Normalizado</strong>
                    <table className="tabela">
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Descrição</th>
                          <th>Valor</th>
                          <th>Tipo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultado.depois.map((lancamento, indice) => (
                          <tr key={indice}>
                            <td>{lancamento.data}</td>
                            <td>{lancamento.descricao}</td>
                            <td>{lancamento.valor.toFixed(2)}</td>
                            <td>{lancamento.tipo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div style={{ padding: '0 24px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  className="botao"
                  type="button"
                  disabled={conciliando || !temDivergenciasNovas}
                  onClick={conciliar}
                >
                  {conciliando ? 'Conciliando...' : 'Conciliar'}
                </button>
                {!temDivergenciasNovas && divergencias.length > 0 && (
                  <span style={{ color: '#666' }}>Divergências já em conciliação ou resolvidas.</span>
                )}
              </div>

              <div className="financeiro-listas" style={{ padding: '0 24px 24px' }}>
                <div>
                  <h3>Bateram ({resultado.bateram.length})</h3>
                  {resultado.bateram.map((lancamento) => (
                    <div key={lancamento.id} className="cartao-lista cartao-lista-verde">
                      {lancamento.data} · {lancamento.descricao} · R$ {Number(lancamento.valor).toFixed(2)} →{' '}
                      {lancamento.cod_titulo_casado}
                    </div>
                  ))}
                </div>

                <div>
                  <h3>Ignorados ({resultado.ignorados.length})</h3>
                  {resultado.ignorados.map((lancamento) => (
                    <div key={lancamento.id} className="cartao-lista">
                      {lancamento.data} · {lancamento.descricao} · R$ {Number(lancamento.valor).toFixed(2)}
                    </div>
                  ))}
                </div>

                <div>
                  <h3>Divergências</h3>
                  <div className="kanban">
                    {COLUNAS_DIVERGENCIA.map((coluna) => (
                      <div className="kanban-coluna" key={coluna.status}>
                        <h3>{coluna.titulo}</h3>
                        {divergencias
                          .filter((d) => d.status === coluna.status)
                          .map((d) => (
                            <div key={d.id} className="kanban-cartao">
                              <strong>{d.tipo_inicial}</strong>
                              <span>R$ {Number(d.valor_lancamento ?? d.valor_titulo ?? 0).toFixed(2)}</span>
                            </div>
                          ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {aba === 'relatorio' && (
        <div style={{ padding: 24 }}>
          {relatorio ? (
            <pre className="relatorio-markdown">{relatorio}</pre>
          ) : (
            <p>Nenhum relatório ainda. Importe e concilie um extrato.</p>
          )}
        </div>
      )}

      {aba === 'aprovacoes' && <FilaAprovacao area="financeiro" />}

      {mostrarLinhaDoTempo && resultado && (
        <div className="painel-lateral">
          <div className="painel-lateral-cabecalho">
            <strong>Linha do tempo</strong>
            <button className="botao" type="button" onClick={() => setMostrarLinhaDoTempo(false)}>
              Fechar
            </button>
          </div>
          <LinhaDoTempo itemId={resultado.extrato_id} />
        </div>
      )}
    </div>
  )
}
