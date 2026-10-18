import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { AvisoErro } from '@/components/equipe/comum';
import { EquipeAdmin } from '@/components/equipe/EquipeAdmin';
import { Moldura } from '@/components/equipe/Moldura';
import { listarEquipe } from '@/lib/equipe/dados';
import { PODE } from '@/lib/equipe/papeis';
import { exigirEquipe } from '@/lib/equipe/sessao';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Equipe' };

/** O endereço da entrada da equipe neste servidor (o painel pode ter endereço próprio). */
async function enderecoDaEntrada(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'revisai.howlks.com';
  const protocolo = h.get('x-forwarded-proto') ?? (/^(localhost|127\.)/.test(host) ? 'http' : 'https');
  return `${protocolo}://${host}/admin/entrar`;
}

export default async function PaginaEquipe() {
  const acesso = await exigirEquipe(PODE.equipe);
  const [{ dados, erro }, entrada] = await Promise.all([listarEquipe(acesso.sb), enderecoDaEntrada()]);
  return (
    <Moldura
      acesso={acesso}
      aba="equipe"
      titulo="Equipe"
      descricao="Quem entra no painel e com qual papel. Toda pessoa entra com o próprio e-mail e o app autenticador; não existe senha da equipe."
    >
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <EquipeAdmin membros={dados.membros} convites={dados.convites} eu={acesso.userId} entrada={entrada} agora={Date.now()} />
    </Moldura>
  );
}
