'use client'

import { useActionState } from 'react'
import { entrar } from './actions'

export default function FormularioLogin() {
  const [estado, acaoFormulario, pendente] = useActionState(entrar, null)

  return (
    <form action={acaoFormulario}>
      {estado?.erro && <p className="erro">{estado.erro}</p>}
      <div className="campo">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="campo">
        <label htmlFor="senha">Senha</label>
        <input id="senha" name="senha" type="password" required autoComplete="current-password" />
      </div>
      <button className="botao" type="submit" disabled={pendente}>
        {pendente ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  )
}
