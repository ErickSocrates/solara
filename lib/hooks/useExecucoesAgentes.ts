'use client'

import { useEffect, useState } from 'react'
import { criarClienteBrowser } from '@/lib/supabase/browser'

export type ExecucaoAgente = {
  id: string
  area: string
  item_tipo: string
  item_id: string
  agente: string
  chamado_por: string | null
  status: 'rodando' | 'ok' | 'erro'
  entrada: unknown
  saida: unknown
  erro: string | null
  tokens_entrada: number | null
  tokens_saida: number | null
  inicio: string | null
  fim: string | null
}

export function useExecucoesAgentes(itemId: string) {
  const [execucoes, setExecucoes] = useState<ExecucaoAgente[]>([])

  useEffect(() => {
    if (!itemId) return

    const supabase = criarClienteBrowser()
    let cancelado = false

    supabase
      .from('execucoes_agentes')
      .select('*')
      .eq('item_id', itemId)
      .order('inicio', { ascending: true })
      .then(({ data }) => {
        if (!cancelado && data) setExecucoes(data as ExecucaoAgente[])
      })

    // Nome unico por instancia: Organograma e LinhaDoTempo usam este hook ao
    // mesmo tempo para o mesmo itemId, e o Supabase reaproveita o canal
    // quando o nome do topico e identico - o segundo .on() depois do
    // primeiro subscribe() falha em runtime.
    const canal = supabase
      .channel(`execucoes-agentes-${itemId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'execucoes_agentes', filter: `item_id=eq.${itemId}` },
        (payload) => {
          setExecucoes((atual) => {
            if (payload.eventType === 'DELETE') {
              return atual.filter((e) => e.id !== (payload.old as ExecucaoAgente).id)
            }

            const nova = payload.new as ExecucaoAgente
            const existe = atual.some((e) => e.id === nova.id)
            return existe ? atual.map((e) => (e.id === nova.id ? nova : e)) : [...atual, nova]
          })
        }
      )
      .subscribe()

    return () => {
      cancelado = true
      supabase.removeChannel(canal)
    }
  }, [itemId])

  return execucoes
}
