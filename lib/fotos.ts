// Fotos da vitrine. O produto mostra a foto que o fornecedor enviou; sem ela, a foto da categoria,
// tirada do Wikimedia Commons (licenças livres, com crédito na página /creditos).

import type { Categoria } from './tipos';

export interface FotoLivre {
  /** Caminho do arquivo no Commons, como aparece na URL (já codificado). */
  arquivo: string;
  autor: string;
  licenca: 'CC0' | 'CC BY 4.0' | 'CC BY-SA 3.0' | 'CC BY-SA 4.0';
}

const COMMONS = 'https://upload.wikimedia.org/wikipedia/commons';

export const FOTOS_CATEGORIA: Partial<Record<Categoria, FotoLivre>> = {
  oleo_motor: { arquivo: '6/67/Olio_Motore.jpg', autor: 'Devid Bianchetti', licenca: 'CC BY-SA 4.0' },
  filtro_oleo: { arquivo: 'e/e1/Olejov%C3%BD_filtr_s_t%C4%9Bsn%C4%9Bn%C3%ADm.jpg', autor: 'Voton.cz autodíly', licenca: 'CC BY-SA 4.0' },
  filtro_ar: { arquivo: 'e/ea/Filtry_powietrza2.jpg', autor: 'Maly LOLek', licenca: 'CC BY-SA 3.0' },
  filtro_cabine: { arquivo: '8/89/Autobacs_Pro_Air_conditioner_filter_H-0001.jpg', autor: 'Qurren', licenca: 'CC BY-SA 3.0' },
  filtro_combustivel: { arquivo: '7/74/HTKC_filters_auto_uit_folder_gehaald.jpg', autor: 'Vanhoorensteven', licenca: 'CC0' },
  vela: { arquivo: 'b/ba/Buj%C3%ADa_Bosch_Yttrium_Super_Plus.JPG', autor: 'Schumi4ever', licenca: 'CC BY-SA 4.0' },
  correia_dentada: { arquivo: '6/64/2001_honda_accord_timing_belt-terabass.jpg', autor: 'Terabass', licenca: 'CC BY-SA 3.0' },
  pastilha_freio: { arquivo: '9/92/Brake_pad.jpg', autor: 'A7N8X', licenca: 'CC BY-SA 3.0' },
  disco_freio: { arquivo: 'c/c4/Ventilated_2-Piece_Floating_Disc_Curved_Drilled_%26_Slotted_Brake_Rotor.jpg', autor: 'Atharv Chandel', licenca: 'CC BY 4.0' },
  fluido_freio: { arquivo: 'a/a2/Castrol_brake_and_clutch_fluid.jpg', autor: 'LukaszKatlewa', licenca: 'CC BY-SA 3.0' },
  arrefecimento: {
    arquivo:
      'e/ed/%D0%9A%D1%80%D0%B0%D1%81%D0%BD%D1%8B%D0%B9_%D0%B0%D0%BD%D1%82%D0%B8%D1%84%D1%80%D0%B8%D0%B7._%D0%A4%D0%BE%D1%82%D0%BE_%D0%90._%D0%A9%D0%B5%D0%BA%D0%B8%D0%BD%D0%BE%D0%B2%D0%B0.jpg',
    autor: 'Schekinov Alexey Victorovich',
    licenca: 'CC BY-SA 4.0'
  },
  bateria: { arquivo: '5/55/BannerDB72FT.jpg', autor: 'AlexSor2010', licenca: 'CC BY-SA 4.0' },
  amortecedor: { arquivo: 'a/a5/Absorb_Shock.JPG', autor: 'Voipiador', licenca: 'CC BY-SA 3.0' },
  fluido_cambio: { arquivo: '0/01/ATF_Automatic_transmission_fluid_Dextron_III.JPG', autor: 'Andshel', licenca: 'CC BY-SA 3.0' }
};

const LICENCAS: Record<FotoLivre['licenca'], string> = {
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/deed.pt-br',
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/deed.pt-br',
  'CC BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/deed.pt-br',
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/deed.pt-br'
};

export function linkDaLicenca(f: FotoLivre): string {
  return LICENCAS[f.licenca];
}

/** A miniatura do Commons na largura pedida (o Commons só gera algumas larguras; 500 é uma delas). */
export function urlDaFoto(f: FotoLivre, largura = 500): string {
  const nome = f.arquivo.split('/').pop()!;
  return `${COMMONS}/thumb/${f.arquivo}/${largura}px-${nome}`;
}

/** A página do arquivo no Commons (autor, licença e o arquivo original). */
export function paginaDaFoto(f: FotoLivre): string {
  return `https://commons.wikimedia.org/wiki/File:${f.arquivo.split('/').pop()}`;
}

export interface FotoDoProduto {
  url: string;
  /** Crédito da foto livre; null quando a foto é do próprio fornecedor. */
  credito: FotoLivre | null;
}

/** A foto que a vitrine mostra para o produto, ou null (aí entra o ícone da categoria). */
export function fotoDoProduto(p: { imagemUrl?: string | null; categoria: Categoria }): FotoDoProduto | null {
  if (p.imagemUrl) return { url: p.imagemUrl, credito: null };
  const f = FOTOS_CATEGORIA[p.categoria];
  return f ? { url: urlDaFoto(f), credito: f } : null;
}
