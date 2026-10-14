'use client';

import Image from 'next/image';
import { useState } from 'react';
import { IconeServico } from '@/components/icones';
import { fotoDoProduto } from '@/lib/fotos';
import { servicosDaCategoria } from '@/lib/manutencao';
import type { Categoria } from '@/lib/tipos';

/**
 * A foto do produto na vitrine (a do fornecedor ou a da categoria). Sem foto, ou se ela não
 * carregar, entra o ícone da categoria no mesmo espaço, para a grade não pular.
 */
export function FotoProduto({
  produto,
  tamanhos,
  className = '',
  prioridade = false
}: {
  produto: { imagemUrl?: string | null; categoria: Categoria; nome: string };
  /** O atributo sizes da imagem (quanto da tela ela ocupa). */
  tamanhos: string;
  className?: string;
  prioridade?: boolean;
}) {
  const foto = fotoDoProduto(produto);
  const [falhou, setFalhou] = useState(false);
  return (
    <div className={`relative overflow-hidden bg-papel-2 ${className}`}>
      {foto && !falhou ? (
        <Image
          src={foto.url}
          alt={foto.credito ? `Foto ilustrativa de ${produto.nome.toLowerCase()}` : produto.nome}
          fill
          sizes={tamanhos}
          priority={prioridade}
          className="object-cover"
          onError={() => setFalhou(true)}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-tinta-3">
          <IconeServico servico={servicosDaCategoria(produto.categoria)[0] ?? 'revisao'} size={40} />
        </div>
      )}
    </div>
  );
}
