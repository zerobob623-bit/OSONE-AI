import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { db, doc, getDoc, serverTimestamp, setDoc } from '../firebase';
import type { User } from '../types';

export const LEGAL_VERSION = '2026-08-08-v2';

const valor = (nome: string): string => String(import.meta.env[nome] ?? '').trim();

const fornecedor = {
  nome: valor('VITE_OSONE_LEGAL_PROVIDER_NAME'),
  documento: valor('VITE_OSONE_LEGAL_PROVIDER_REGISTRATION'),
  endereco: valor('VITE_OSONE_LEGAL_PROVIDER_ADDRESS'),
  contato: valor('VITE_OSONE_LEGAL_CONTACT'),
};

type Estado = 'verificando' | 'pendente' | 'aceito' | 'erro';

export function LegalConsentGate({
  user,
  onSair,
  children,
}: {
  user: User;
  onSair: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [estado, setEstado] = useState<Estado>('verificando');
  const [erro, setErro] = useState('');
  const [termosAceitos, setTermosAceitos] = useState(false);
  const [privacidadeAceita, setPrivacidadeAceita] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const faltando = useMemo(
    () => Object.entries(fornecedor).filter(([, conteudo]) => !conteudo).map(([campo]) => campo),
    [],
  );

  const referencia = useMemo(
    () => doc(db, 'legalAcceptances', user.uid, 'versions', LEGAL_VERSION),
    [user.uid],
  );

  useEffect(() => {
    let ativo = true;
    setEstado('verificando');
    setErro('');

    if (faltando.length > 0) {
      setErro(`Configuração legal incompleta: ${faltando.join(', ')}.`);
      setEstado('erro');
      return () => { ativo = false; };
    }

    getDoc(referencia)
      .then(snapshot => {
        if (!ativo) return;
        setEstado(snapshot.exists() ? 'aceito' : 'pendente');
      })
      .catch(() => {
        if (!ativo) return;
        setErro('Não foi possível conferir o aceite com segurança. Verifique sua conexão e tente novamente.');
        setEstado('erro');
      });

    return () => { ativo = false; };
  }, [faltando, referencia]);

  const aceitar = async () => {
    if (!termosAceitos || !privacidadeAceita || salvando) return;
    setSalvando(true);
    setErro('');
    try {
      await setDoc(referencia, {
        version: LEGAL_VERSION,
        termsVersion: LEGAL_VERSION,
        privacyVersion: LEGAL_VERSION,
        acceptedAt: serverTimestamp(),
      });
      setEstado('aceito');
    } catch {
      setErro('O aceite não foi registrado no Firebase. Nada foi presumido: tente novamente com internet ativa.');
    } finally {
      setSalvando(false);
    }
  };

  if (estado === 'aceito') return <>{children}</>;

  if (estado === 'verificando') {
    return (
      <div className="w-full h-[100dvh] flex flex-col items-center justify-center gap-3 bg-[#0d0c0b]">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
        <span className="text-[10px] tracking-[0.35em] uppercase text-neutral-500">Conferindo termos</span>
      </div>
    );
  }

  if (estado === 'erro') {
    return (
      <div className="w-full h-[100dvh] flex items-center justify-center bg-[#0d0c0b] px-5">
        <div className="w-full max-w-lg rounded-2xl border border-red-500/25 bg-red-500/[0.04] p-6 text-center">
          <AlertTriangle className="mx-auto text-red-400" size={24} />
          <h1 className="mt-3 text-lg text-neutral-100">Não foi possível validar os Termos</h1>
          <p className="mt-2 text-sm leading-relaxed text-neutral-400">{erro}</p>
          <div className="mt-5 flex gap-3">
            <button onClick={() => window.location.reload()} className="flex-1 rounded-xl bg-emerald-500/15 px-4 py-3 text-sm text-emerald-300">Tentar novamente</button>
            <button onClick={onSair} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-neutral-400"><LogOut size={14} /> Sair</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#090a0c] p-3 sm:p-6">
      <div className="flex h-full max-h-[900px] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-cyan-400/20 bg-[#101218] shadow-2xl">
        <header className="border-b border-white/10 px-5 py-4 sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-[9px] uppercase tracking-[0.4em] text-cyan-400">OSONE · primeiro acesso</span>
              <h1 className="mt-1 text-xl font-semibold text-white">Termos de Uso e Aviso de Privacidade</h1>
              <p className="mt-1 text-xs text-neutral-500">Versão {LEGAL_VERSION}. Leia antes de continuar.</p>
            </div>
            <ShieldCheck className="shrink-0 text-cyan-400" size={26} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 py-5 text-[13px] leading-6 text-neutral-300 sm:px-8">
          <LegalText />
        </main>

        <footer className="border-t border-white/10 bg-black/20 px-5 py-4 sm:px-8">
          {erro && <p className="mb-3 text-xs text-red-300">{erro}</p>}
          <label className="flex cursor-pointer items-start gap-3 text-xs text-neutral-300">
            <input type="checkbox" checked={termosAceitos} onChange={e => setTermosAceitos(e.target.checked)} className="mt-1" />
            Li e aceito os Termos de Uso, inclusive as limitações das APIs de terceiros e das automações.
          </label>
          <label className="mt-2 flex cursor-pointer items-start gap-3 text-xs text-neutral-300">
            <input type="checkbox" checked={privacidadeAceita} onChange={e => setPrivacidadeAceita(e.target.checked)} className="mt-1" />
            Li o Aviso de Privacidade e estou ciente do tratamento de dados descrito nele.
          </label>
          <div className="mt-4 flex gap-3">
            <button onClick={onSair} disabled={salvando} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-neutral-400"><LogOut size={14} /> Sair</button>
            <button
              onClick={aceitar}
              disabled={!termosAceitos || !privacidadeAceita || salvando}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-35"
            >
              {salvando ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              {salvando ? 'Registrando aceite...' : 'Aceitar e entrar no OSONE'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function LegalText() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-base font-semibold text-white">1. Identificação do fornecedor</h2>
        <p className="mt-2"><strong>OSONE</strong> é fornecido por <strong>{fornecedor.nome}</strong>, pessoa física inscrita no CPF sob nº <strong>{fornecedor.documento}</strong>, com endereço em {fornecedor.endereco}. Contato de suporte, privacidade e exercício de direitos: <a className="text-cyan-300 underline" href={`mailto:${fornecedor.contato}`}>{fornecedor.contato}</a>.</p>
      </section>
      <section>
        <h2 className="text-base font-semibold text-white">2. O que é o OSONE</h2>
        <p className="mt-2">O OSONE é um software que reúne interface, automações próprias e integrações com serviços e APIs de terceiros. O OSONE não é o proprietário nem o operador das APIs externas integradas e não vende cotas, créditos ou capacidade dessas APIs. Os planos pagos remuneram o acesso às ferramentas próprias indicadas na tela de planos, à integração e à manutenção do software.</p>
      </section>
      <section>
        <h2 className="text-base font-semibold text-white">3. Recursos gratuitos, cotas e terceiros</h2>
        <p className="mt-2">Chat, voz, Hands-Free, a aba de Escrita — inclusive para escrever código — e o controle local do PC permanecem disponíveis no plano gratuito conforme a descrição vigente. O ambiente OSONE CODE, com Enxame, Hunter, execução, GitHub e ferramentas avançadas de desenvolvimento, integra o plano Pro. Alguns recursos dependem de internet, aparelho compatível, permissões do sistema e serviços como Google/Firebase/Gemini, ElevenLabs, Stripe, Vercel, WhatsApp e outros escolhidos pelo usuário.</p>
        <p className="mt-2">APIs externas podem impor cotas gratuitas, preços, bloqueios regionais, indisponibilidade ou mudanças sem controle do OSONE. O fim de uma cota externa não significa que o usuário foi induzido a contratar um plano OSONE e não cria garantia de uso ilimitado. Quando o recurso aceitar chave própria, o consumo e a relação com o provedor da chave são responsabilidade do usuário.</p>
      </section>
      <section>
        <h2 className="text-base font-semibold text-white">4. Planos e cobrança</h2>
        <p className="mt-2">Os recursos, valores, periodicidade e condições aparecem antes da contratação. O pagamento é processado pela Stripe; o OSONE não recebe os dados completos do cartão. No cartão, a assinatura se renova pelo período escolhido até ser cancelada e pode ser administrada pelo Portal do Cliente. No PIX, o pagamento é único e libera apenas o período mensal ou anual escolhido; não há renovação automática e, ao vencer, o usuário precisa fazer um novo PIX. O cancelamento do cartão impede renovações futuras e mantém o acesso até o fim do período já pago, salvo hipótese legal diferente.</p>
        <p className="mt-2">Direitos obrigatórios do consumidor, inclusive arrependimento quando aplicável, não são excluídos por estes Termos. Pedidos devem ser enviados ao contato oficial, com os dados necessários para localizar a compra.</p>
      </section>
      <section>
        <h2 className="text-base font-semibold text-white">5. IA e automações</h2>
        <p className="mt-2">Respostas de IA podem conter erros e devem ser conferidas antes de decisões importantes. O usuário é responsável pelas instruções, arquivos, contas e ambientes que disponibilizar. Automações podem clicar, escrever e controlar recursos autorizados; ações sensíveis mantêm confirmações e travas próprias. O OSONE não conclui pagamentos, PIX, transferências, compras ou outras movimentações financeiras pelo agente.</p>
        <p className="mt-2">É proibido usar o serviço para fraude, invasão, violação de direitos, envio abusivo, coleta ilícita de dados, desinformação deliberada ou atividade contrária à lei ou aos termos dos provedores integrados.</p>
      </section>
      <section>
        <h2 className="text-base font-semibold text-white">6. Disponibilidade e responsabilidade</h2>
        <p className="mt-2">O fornecedor buscará manter as ferramentas próprias disponíveis e corrigir defeitos, mas não garante operação ininterrupta de internet, sistema operacional, hardware ou serviços externos. Nada nestes Termos exclui responsabilidade que não possa ser afastada pela legislação brasileira. O usuário deve manter cópias de segurança e revisar resultados antes de executar ações irreversíveis.</p>
      </section>
      <section>
        <h2 className="text-base font-semibold text-white">7. Privacidade e dados tratados</h2>
        <p className="mt-2">Para autenticar, sincronizar, prestar suporte, proteger o serviço e administrar assinaturas, podem ser tratados nome, e-mail, foto, identificador Firebase, preferências, histórico e memórias que o usuário decidir sincronizar, plano, estado da assinatura, registros técnicos e comunicações de suporte. Dados mantidos somente no dispositivo permanecem locais até que o usuário use uma função que os envie a um provedor externo.</p>
        <p className="mt-2">Conforme o recurso escolhido, dados necessários podem ser enviados a operadores como Google/Firebase/Gemini, Stripe, Vercel, ElevenLabs e serviços expressamente conectados pelo usuário. Cada terceiro também aplica seus próprios termos e políticas. Pode ocorrer tratamento internacional quando a infraestrutura do operador estiver fora do Brasil.</p>
      </section>
      <section>
        <h2 className="text-base font-semibold text-white">8. Finalidades, retenção e direitos</h2>
        <p className="mt-2">O tratamento serve para executar o contrato, autenticar a conta, sincronizar recursos solicitados, prevenir abuso, atender obrigações legais e exercer direitos. Os dados são conservados enquanto necessários à conta, ao serviço, à segurança, à cobrança e aos prazos legais; depois são eliminados ou anonimizados quando aplicável.</p>
        <p className="mt-2">O titular pode solicitar confirmação, acesso, correção, informação sobre compartilhamento, portabilidade quando regulamentada, oposição, revogação de consentimento e eliminação quando cabível. A exclusão de dados indispensáveis pode impedir a continuidade do serviço. Solicitações: <a className="text-cyan-300 underline" href={`mailto:${fornecedor.contato}`}>{fornecedor.contato}</a>.</p>
      </section>
      <section>
        <h2 className="text-base font-semibold text-white">9. Alterações e legislação</h2>
        <p className="mt-2">Mudanças materiais gerarão uma nova versão e novo pedido de aceite. Aplicam-se as leis brasileiras, preservado o foro legalmente assegurado ao consumidor. Este documento entra em vigor na data da versão indicada no topo.</p>
      </section>
    </div>
  );
}
