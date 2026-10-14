// Reduz uma foto no próprio navegador antes de enviar: até `lado` pixels no lado maior,
// em WebP (ou JPEG, se o navegador não gerar WebP). Uma foto de celular de 4 MB vira uns 200 KB.

export async function reduzirFoto(arquivo: File, lado = 1200, qualidade = 0.82): Promise<File> {
  if (!arquivo.type.startsWith('image/')) throw new Error('Escolha uma imagem.');
  const bitmap = await createImageBitmap(arquivo).catch(() => null);
  if (!bitmap) throw new Error('Não deu para abrir esta foto. Tente outra.');
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  const largura = Math.max(1, Math.round(bitmap.width * escala));
  const altura = Math.max(1, Math.round(bitmap.height * escala));
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não deu para preparar a foto.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, largura, altura);
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();
  const gerar = (tipo: string) => new Promise<Blob | null>((ok) => canvas.toBlob(ok, tipo, qualidade));
  let blob = await gerar('image/webp');
  if (!blob || blob.type !== 'image/webp') blob = await gerar('image/jpeg');
  if (!blob) throw new Error('Não deu para preparar a foto.');
  const extensao = blob.type === 'image/webp' ? 'webp' : 'jpg';
  return new File([blob], `foto.${extensao}`, { type: blob.type });
}
