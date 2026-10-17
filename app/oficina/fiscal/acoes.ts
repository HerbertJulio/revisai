'use server';

// As notas fiscais da oficina pelo servidor (lib/fiscal/servidor confere o papel e o plano, fala
// com o emissor e grava com a chave do sistema). O certificado A1 e a senha passam direto para o
// emissor e não ficam guardados no Revisaí.

import {
  atualizarNotasProcessando,
  cancelarNotaFiscal,
  consultarNotaFiscal,
  emitirNotaDaOrdem,
  enviarCertificadoFiscal,
  estadoDoEmissor,
  salvarAjustesFiscais
} from '@/lib/fiscal/servidor';

export async function estadoFiscal() {
  return estadoDoEmissor();
}

export async function salvarFiscal(entrada: unknown) {
  return salvarAjustesFiscais(entrada);
}

export async function enviarCertificado(form: FormData) {
  return enviarCertificadoFiscal(form);
}

export async function emitirNota(entrada: unknown) {
  return emitirNotaDaOrdem(entrada);
}

export async function consultarNota(id: string) {
  return consultarNotaFiscal(String(id ?? ''));
}

export async function cancelarNota(id: string, justificativa: string) {
  return cancelarNotaFiscal(String(id ?? ''), String(justificativa ?? ''));
}

export async function atualizarNotas() {
  return atualizarNotasProcessando();
}
