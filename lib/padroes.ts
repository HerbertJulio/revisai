import type { Oficina, Preferencias } from './tipos';
import { MENSAGEM_PADRAO } from './whatsapp';

export const OFICINA_VAZIA: Oficina = { nome: '', whatsapp: '', cidade: '', uf: 'RJ', endereco: '', linkAvaliacao: '' };

export const PREFERENCIAS_PADRAO: Preferencias = {
  antecedenciaDias: 15,
  antecedenciaKm: 500,
  usoSeveroPadrao: false,
  kmMesPadrao: 1000,
  mensagem: MENSAGEM_PADRAO,
  intervalos: {},
  tema: 'auto',
  compartilharDemanda: false
};

export const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
