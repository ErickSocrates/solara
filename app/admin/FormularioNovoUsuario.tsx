'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const AREAS_DISPONIVEIS = ['vendas', 'financeiro']

export default function FormularioNovoUsuario() {
  const router = useRouter()
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [areasSelecionadas, setAreasSelecionadas] = useState<string[]>([])

  function alternarArea(area: string) {
    setAreasSelecionadas((atual) =>
      atual.includes(area) ? atual.filter((a) => a !== area) : [...atual, area]
    )
  }

  async function enviar(dadosFormulario: FormData) {
    setEnviando(true)
    setErro('')

    const resposta = await fetch('/api/admin/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: dadosFormulario.get('email'),
        senha: dadosFormulario.get('senha'),
        nome: dadosFormulario.get('nome'),
        papel: dadosFormulario.get('papel'),
        areas: areasSelecionadas,
      }),
    })

    const resultado = await resposta.json()
    setEnviando(false)

    if (!resposta.ok) {
      setErro(resultado.erro ?? 'Falha ao criar usuario.')
      return
    }

    setAreasSelecionadas([])
    router.refresh()
  }

  return (
    <form action={enviar} className="cartao">
      <h2>Novo usuario</h2>
      {erro && <p className="erro">{erro}</p>}

      <div className="campo">
        <label htmlFor="nome">Nome</label>
        <input id="nome" name="nome" type="text" required />
      </div>

      <div className="campo">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" required />
      </div>

      <div className="campo">
        <label htmlFor="senha">Senha inicial</label>
        <input id="senha" name="senha" type="password" required minLength={6} />
      </div>

      <div className="campo">
        <label htmlFor="papel">Papel</label>
        <select id="papel" name="papel" required defaultValue="operador">
          <option value="operador">Operador</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <div className="campo">
        <label>Areas</label>
        <div style={{ display: 'flex', gap: 16 }}>
          {AREAS_DISPONIVEIS.map((area) => (
            <label key={area} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="checkbox"
                checked={areasSelecionadas.includes(area)}
                onChange={() => alternarArea(area)}
              />
              {area}
            </label>
          ))}
        </div>
      </div>

      <button className="botao" type="submit" disabled={enviando}>
        {enviando ? 'Criando...' : 'Criar usuario'}
      </button>
    </form>
  )
}
