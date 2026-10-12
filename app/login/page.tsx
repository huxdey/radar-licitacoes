'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [pend, setPend] = useState(false);
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="mb-1">Radar de Licitações</h1>
      <p className="mb-6 text-sm text-black/60">Acesso restrito.</p>
      <form
        className="card space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setPend(true);
          setErro('');
          const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password: senha });
          setPend(false);
          if (error) return setErro('E-mail ou senha inválidos.');
          window.location.href = '/mfa';
        }}
      >
        <div>
          <label className="label">E-mail</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label">Senha</label>
          <input className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </div>
        {erro && <p className="text-sm text-alerta">{erro}</p>}
        <button className="btn-primario w-full" disabled={pend}>{pend ? 'Entrando...' : 'Entrar'}</button>
      </form>
    </div>
  );
}
