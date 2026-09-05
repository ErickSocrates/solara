'use client'

import { useEffect, useRef, useState } from 'react'
import { useExecucoesAgentes, type ExecucaoAgente } from '@/lib/hooks/useExecucoesAgentes'

const AGENTES_POR_AREA: Record<string, string[]> = {
  vendas: ['triador', 'pesquisador', 'redator', 'revisor'],
  financeiro: ['investigador', 'consolidador', 'revisor'],
}

const ALVO_RETRABALHO: Record<string, string> = {
  vendas: 'redator',
  financeiro: 'consolidador',
}

function tempoEmSegundos(execucao: ExecucaoAgente) {
  if (!execucao.inicio || !execucao.fim) return null
  const segundos = (new Date(execucao.fim).getTime() - new Date(execucao.inicio).getTime()) / 1000
  return segundos.toFixed(1)
}

function totalTokens(execucao: ExecucaoAgente) {
  if (execucao.tokens_entrada == null && execucao.tokens_saida == null) return null
  return (execucao.tokens_entrada ?? 0) + (execucao.tokens_saida ?? 0)
}

function CartaoAgente({ nome, execucoes }: { nome: string; execucoes: ExecucaoAgente[] }) {
  if (execucoes.length === 0) {
    return (
      <div className="cartao-agente cartao-agente-vazio">
        <strong>{nome}</strong>
      </div>
    )
  }

  const rodando = execucoes.filter((e) => e.status === 'rodando')
  const concluidos = execucoes.filter((e) => e.status === 'ok')
  const comErro = execucoes.some((e) => e.status === 'erro')

  if (nome === 'investigador' && execucoes.length > 1) {
    return (
      <div
        className={`cartao-agente ${
          comErro ? 'cartao-agente-erro' : rodando.length > 0 ? 'cartao-agente-rodando' : 'cartao-agente-ok'
        }`}
      >
        <strong>{nome}</strong>
        <span>
          {rodando.length} rodando / {concluidos.length} concluidos
        </span>
      </div>
    )
  }

  const ultima = execucoes[execucoes.length - 1]

  if (ultima.status === 'rodando') {
    return (
      <div className="cartao-agente cartao-agente-rodando">
        <strong>{nome}</strong>
        <span>rodando...</span>
      </div>
    )
  }

  if (ultima.status === 'erro') {
    return (
      <div className="cartao-agente cartao-agente-erro">
        <strong>{nome}</strong>
        <span>erro</span>
      </div>
    )
  }

  return (
    <div className="cartao-agente cartao-agente-ok">
      <strong>{nome}</strong>
      <span>
        {tempoEmSegundos(ultima)}s · {totalTokens(ultima) ?? 0} tokens
      </span>
    </div>
  )
}

export default function Organograma({ area, itemId }: { area: 'vendas' | 'financeiro'; itemId: string }) {
  const execucoes = useExecucoesAgentes(itemId)
  const agentesDaArea = AGENTES_POR_AREA[area]
  const alvoRetrabalho = ALVO_RETRABALHO[area]

  const [setaVermelha, setSetaVermelha] = useState(false)
  const ultimaReprovacaoTratada = useRef<string | null>(null)

  useEffect(() => {
    const revisoes = execucoes
      .filter((e) => e.agente === 'revisor' && e.status === 'ok')
      .sort((a, b) => new Date(a.fim ?? 0).getTime() - new Date(b.fim ?? 0).getTime())

    const ultimaRevisao = revisoes[revisoes.length - 1]
    if (!ultimaRevisao) return

    const saida = ultimaRevisao.saida as { aprovado?: boolean } | null
    if (
      saida?.aprovado === false &&
      ultimaReprovacaoTratada.current !== ultimaRevisao.id
    ) {
      ultimaReprovacaoTratada.current = ultimaRevisao.id
      setSetaVermelha(true)
      const temporizador = setTimeout(() => setSetaVermelha(false), 3000)
      return () => clearTimeout(temporizador)
    }
  }, [execucoes])

  const execucaoOrquestrador = execucoes.find((e) => e.agente === 'orquestrador')

  return (
    <div className="organograma">
      <div
        className={`cartao-agente cartao-orquestrador ${
          execucaoOrquestrador?.status === 'rodando'
            ? 'cartao-agente-rodando'
            : execucaoOrquestrador?.status === 'erro'
              ? 'cartao-agente-erro'
              : execucaoOrquestrador?.status === 'ok'
                ? 'cartao-agente-ok'
                : 'cartao-agente-vazio'
        }`}
      >
        <strong>orquestrador</strong>
      </div>

      <div className="organograma-linha-agentes">
        {agentesDaArea.map((nome) => (
          <div className="organograma-coluna" key={nome}>
            <div
              className={`organograma-conector ${
                nome === alvoRetrabalho && setaVermelha ? 'organograma-conector-vermelho' : ''
              }`}
            />
            <CartaoAgente nome={nome} execucoes={execucoes.filter((e) => e.agente === nome)} />
          </div>
        ))}
      </div>
    </div>
  )
}
