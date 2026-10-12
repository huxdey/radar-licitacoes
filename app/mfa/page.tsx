'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

/** Segundo fator (app autenticador: Google Authenticator, Authy etc.). Obrigatório para entrar. */
export default function MFA() {
  const sb = supabaseBrowser();
  const [fase, setFase] = useState<'carregando' | 'cadastrar' | 'verificar'>('carregando');
  const [qr, setQr] = useState('');
  const [segredo, setSegredo] = useState('');
  const [factorId, setFactorId] = useState('');
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    (async () => {
      const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === 'aal2') return (window.location.href = '/');
      const { data } = await sb.auth.mfa.listFactors();
      const totp = data?.totp?.find((f) => f.status === 'verified');
      if (totp) {
        setFactorId(totp.id);
        setFase('verificar');
      } else {
        // limpa cadastros não concluídos e cria um novo
        for (const f of data?.all ?? []) if (f.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: f.id });
        const { data: en, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `radar-${Date.now()}` });
        if (error || !en) return setErro(error?.message ?? 'Falha ao iniciar MFA');
        setFactorId(en.id);
        setQr(en.totp.qr_code);
        setSegredo(en.totp.secret);
        setFase('cadastrar');
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    const { data: ch, error } = await sb.auth.mfa.challenge({ factorId });
    if (error || !ch) return setErro(error?.message ?? 'Erro');
    const { error: ev } = await sb.auth.mfa.verify({ factorId, challengeId: ch.id, code: codigo.trim() });
    if (ev) return setErro('Código inválido. Tente o próximo código do app.');
    window.location.href = '/';
  }

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="mb-4">Verificação em duas etapas</h1>
      <div className="card space-y-4">
        {fase === 'carregando' && <p className="text-sm">Carregando...</p>}
        {fase === 'cadastrar' && (
          <>
            <p className="text-sm">Escaneie o QR code no Google Authenticator (ou similar) e digite o código de 6 dígitos.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code do autenticador" className="mx-auto h-48 w-48" />
            <p className="break-all text-center text-xs text-black/50">Código manual: {segredo}</p>
          </>
        )}
        {fase === 'verificar' && <p className="text-sm">Digite o código do seu app autenticador.</p>}
        {fase !== 'carregando' && (
          <form onSubmit={confirmar} className="space-y-3">
            <input className="input text-center text-lg tracking-widest" inputMode="numeric" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value)} />
            <button className="btn-primario w-full">Confirmar</button>
          </form>
        )}
        {erro && <p className="text-sm text-alerta">{erro}</p>}
      </div>
    </div>
  );
}
