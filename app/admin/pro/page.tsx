import type { Metadata } from 'next';
import { AvisoErro } from '@/components/equipe/comum';
import { Moldura } from '@/components/equipe/Moldura';
import { portaoDaEquipe } from '@/components/equipe/Portao';
import { ProAdmin } from '@/components/equipe/ProAdmin';
import { buscarCadastros } from '@/lib/equipe';
import { diaEmBrasilia } from '@/lib/equipe-dados';
import { listarAssinaturas } from '@/lib/pro';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pro' };

export default async function PaginaPro() {
  const portao = await portaoDaEquipe('/admin/pro');
  if (portao) return portao;
  const [a, c] = await Promise.all([listarAssinaturas(), buscarCadastros()]);
  const comCodigo = new Set(a.dados.map((x) => x.oficina_nome.trim().toLowerCase()));
  const interessados = c.dados.filter(
    (x) => x.tipo === 'oficina' && (x.plano === 'plus' || x.plano === 'pro') && x.situacao !== 'arquivado' && !comCodigo.has((x.empresa || x.nome).trim().toLowerCase())
  );
  return (
    <Moldura aba="pro" titulo="Pro" descricao="Códigos do plano Pro das oficinas. Crie o código depois do pagamento e mande para a oficina digitar no app.">
      {a.erro ? <AvisoErro>{a.erro}</AvisoErro> : null}
      <ProAdmin assinaturas={a.dados} interessados={interessados} hoje={diaEmBrasilia(Date.now())} />
    </Moldura>
  );
}
