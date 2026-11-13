// Reduce la foto en el navegador antes de subirla: la del celular pesa varios MB y solo necesitamos un avatar
export async function resizeImage(file, max = 640, quality = 0.85) {
  if (!file.type.startsWith('image/')) throw new Error('Elige un archivo de imagen');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('No pudimos leer esa imagen. Prueba con una foto JPG o PNG.');
  });
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No pudimos procesar la imagen'))), 'image/jpeg', quality),
  );
}
