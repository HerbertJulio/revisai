import type { Metadata } from 'next';
import { AvisoErro, Quadro } from '@/components/fornecedor/comum';
import { ErroDoPainel, MolduraFornecedor, SemLoja } from '@/components/fornecedor/Moldura';
import { CartaoReputacao } from '@/components/fornecedor/Reputacao';
import { CadastroDaLoja, CashbackDaLoja, ChavePixDaLoja, EquipeDaLoja } from '@/components/fornecedor/SuaLoja';
import { cashbackDado, cashbackDaLoja } from '@/lib/loja/cashback';
import { diaEmBrasilia, inicioDoMes } from '@/lib/loja/comum';
import { equipeDaLoja } from '@/lib/loja/equipe';
import { painelOuEntrada } from '@/lib/loja/painel';
import { pixDaLoja } from '@/lib/loja/pix';
import { reputacaoDaLoja } from '@/lib/loja/reputacao';
import { configSupabase } from '@/lib/supabase-servidor';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sua loja' };

export default async function PaginaSuaLoja() {
  const r = await painelOuEntrada('/fornecedor/conta');
  if (r.estado === 'sem-loja') return <SemLoja />;
  if (r.estado === 'erro') return <ErroDoPainel erro={r.erro} />;
  const { painel, sb } = r;
  const { loja } = painel;
  const dono = painel.papel === 'dono';
  const [pix, equipe, reputacao, cashback] = await Promise.all([
    dono ? pixDaLoja(sb, loja.id) : Promise.resolve(null),
    equipeDaLoja(sb, loja.id, dono),
    reputacaoDaLoja(sb, loja.id),
    cashbackDaLoja(sb, loja.id)
  ]);
  // o primeiro instante do mês em Brasília (UTC-3, sem horário de verão)
  const comecoDoMes = `${inicioDoMes(diaEmBrasilia(Date.now()))}T03:00:00.000Z`;
  const config = configSupabase();

  return (
    <MolduraFornecedor
      aba="conta"
      painel={painel}
      titulo="Sua loja"
      descricao={dono ? 'O cadastro, a chave Pix e quem trabalha na loja.' : 'O cadastro da loja e quem trabalha nela. Você entra como vendedor.'}
    >
      <Quadro id="cadastro" titulo="Dados da loja" descricao="O que as oficinas e a equipe do Revisaí veem da loja.">
        <CadastroDaLoja loja={loja} dono={dono} />
      </Quadro>

      <Quadro
        id="pix"
        titulo="Chave Pix"
        descricao="A oficina paga cada pedido pelo app, com o QR Code do valor certo, direto na conta da loja. O Revisaí não passa no meio do dinheiro."
      >
        {!dono ? (
          <p className="text-[14.5px] text-tinta-2">A chave Pix fica com o dono da loja. Se a oficina avisar que pagou, confira com ele antes de confirmar o pagamento no pedido.</p>
        ) : pix?.dono ? (
          <ChavePixDaLoja pix={pix} config={config} email={painel.email} cidadeDaLoja={loja.cidade} />
        ) : (
          <AvisoErro>Não deu para carregar a chave Pix agora. Atualize a página em instantes.</AvisoErro>
        )}
      </Quadro>

      <Quadro
        id="equipe"
        titulo="Equipe"
        descricao={dono ? 'Quem acessa o painel da loja. Cada pessoa entra com o próprio e-mail.' : 'Quem acessa o painel da loja.'}
      >
        {equipe ? (
          <EquipeDaLoja membros={equipe.membros} convites={equipe.convites} dono={dono} euId={painel.usuarioId} loja={loja.nome} config={config} email={painel.email} />
        ) : (
          <AvisoErro>Não deu para carregar a equipe agora. Atualize a página em instantes.</AvisoErro>
        )}
      </Quadro>

      <Quadro
        id="cashback"
        titulo="Cashback para as oficinas"
        descricao="A loja devolve uma parte do valor como crédito para a oficina usar em compras na própria loja. Entra quando o pedido é entregue e o pagamento confirmado; quem paga é a loja."
      >
        {cashback ? (
          <CashbackDaLoja percentual={loja.cashback_percentual} dono={dono} movimentos={cashback} doMes={cashbackDado(cashback, comecoDoMes)} total={cashbackDado(cashback)} />
        ) : (
          <AvisoErro>Não deu para carregar o cashback agora. Atualize a página em instantes.</AvisoErro>
        )}
      </Quadro>

      <Quadro id="reputacao" titulo="Reputação" descricao="Calculada nos últimos 90 dias, do mesmo jeito para todas as lojas.">
        <CartaoReputacao reputacao={reputacao} />
      </Quadro>
    </MolduraFornecedor>
  );
}
