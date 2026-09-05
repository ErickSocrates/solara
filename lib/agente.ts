import Anthropic from '@anthropic-ai/sdk'
import { readFile } from 'fs/promises'
import path from 'path'
import { criarClienteAdmin } from './supabase/admin'

export type Papel = 'triador' | 'pesquisador' | 'redator' | 'revisor' | 'investigador' | 'consolidador'

export type Contexto = {
  area: 'vendas' | 'financeiro'
  item_tipo: 'pedido' | 'divergencia'
  item_id: string
  chamado_por: string
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// O modelo por vezes devolve o JSON dentro de um bloco ```json ... ``` e/ou
// com texto antes ou depois, ou até markdown dentro das strings JSON.
// Estratégia: procura por { ou [, conta chaves/colchetes para encontrar o matching.
function extrairJson(texto: string): string {
  const semEspacos = texto.trim()
  const primeiroChar = semEspacos.search(/[{[]/)
  if (primeiroChar === -1) return semEspacos

  const abre = semEspacos[primeiroChar]
  const fecha = abre === '{' ? '}' : ']'
  let contador = 0
  let dentroString = false
  let escape = false

  for (let i = primeiroChar; i < semEspacos.length; i++) {
    const char = semEspacos[i]

    if (escape) {
      escape = false
      continue
    }

    if (char === '\\') {
      escape = true
      continue
    }

    if (char === '"' && !escape) {
      dentroString = !dentroString
      continue
    }

    if (dentroString) continue

    if (char === abre) contador++
    if (char === fecha) {
      contador--
      if (contador === 0) {
        return semEspacos.slice(primeiroChar, i + 1)
      }
    }
  }

  return semEspacos
}

export async function agente<T = unknown>(papel: Papel, entrada: unknown, contexto: Contexto) {
  const supabase = criarClienteAdmin()
  const inicio = new Date().toISOString()

  const { data: execucao, error: erroInsercao } = await supabase
    .from('execucoes_agentes')
    .insert({
      area: contexto.area,
      item_tipo: contexto.item_tipo,
      item_id: contexto.item_id,
      agente: papel,
      chamado_por: contexto.chamado_por,
      status: 'rodando',
      entrada,
      inicio,
    })
    .select('id')
    .single()

  if (erroInsercao || !execucao) {
    throw new Error(`Falha ao registrar execucao do agente ${papel}: ${erroInsercao?.message}`)
  }

  try {
    const systemPrompt = await readFile(
      path.join(process.cwd(), 'prompts', contexto.area, `${papel}.md`),
      'utf-8'
    )

    const resposta = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: JSON.stringify(entrada) }],
    })

    const textoResposta = resposta.content
      .filter((bloco): bloco is Anthropic.TextBlock => bloco.type === 'text')
      .map((bloco) => bloco.text)
      .join('')

    let saida: T
    try {
      saida = JSON.parse(extrairJson(textoResposta)) as T
    } catch {
      throw new Error(`Resposta do agente ${papel} nao e um JSON valido: ${textoResposta}`)
    }

    await supabase
      .from('execucoes_agentes')
      .update({
        status: 'ok',
        saida,
        tokens_entrada: resposta.usage.input_tokens,
        tokens_saida: resposta.usage.output_tokens,
        fim: new Date().toISOString(),
      })
      .eq('id', execucao.id)

    return { saida, execucao_id: execucao.id as string }
  } catch (erro) {
    const mensagemErro = erro instanceof Error ? erro.message : String(erro)

    await supabase
      .from('execucoes_agentes')
      .update({
        status: 'erro',
        erro: mensagemErro,
        fim: new Date().toISOString(),
      })
      .eq('id', execucao.id)

    throw erro
  }
}
