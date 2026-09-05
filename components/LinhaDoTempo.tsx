'use client'

import { useState } from 'react'
import { useExecucoesAgentes, type ExecucaoAgente } from '@/lib/hooks/useExecucoesAgentes'

function tempoEmSegundos(execucao: ExecucaoAgente) {
  if (!execucao.inicio || !execucao.fim) return '—'
  const segundos = (new Date(execucao.fim).getTime() - new Date(execucao.inicio).getTime()) / 1000
  return `${segundos.toFixed(1)}s`
}

function totalTokens(execucao: ExecucaoAgente) {
  if (execucao.tokens_entrada == null && execucao.tokens_saida == null) return '—'
  return `${(execucao.tokens_entrada ?? 0) + (execucao.tokens_saida ?? 0)}`
}

export default function LinhaDoTempo({ itemId }: { itemId: string }) {
  const execucoes = useExecucoesAgentes(itemId)
  const [expandidoId, setExpandidoId] = useState<string | null>(null)

  return (
    <div className="linha-do-tempo">
      {execucoes.length === 0 && <p>Nenhuma execucao ainda.</p>}

      {execucoes.map((execucao) => {
        const expandido = expandidoId === execucao.id

        return (
          <div key={execucao.id} className="linha-do-tempo-item">
            <button
              type="button"
              className={`linha-do-tempo-cabecalho status-${execucao.status}`}
              onClick={() => setExpandidoId(expandido ? null : execucao.id)}
            >
              <strong>{execucao.agente}</strong>
              <span>{execucao.status}</span>
              <span>{tempoEmSegundos(execucao)}</span>
              <span>{totalTokens(execucao)} tokens</span>
            </button>

            {expandido && (
              <div className="linha-do-tempo-detalhe">
                <div>
                  <p>Entrada</p>
                  <pre>{JSON.stringify(execucao.entrada, null, 2)}</pre>
                </div>
                <div>
                  <p>Saida</p>
                  <pre>{JSON.stringify(execucao.saida ?? execucao.erro, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
