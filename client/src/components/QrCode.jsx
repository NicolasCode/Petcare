import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

// QR como imagen (data URL); se genera en el navegador, sin servicios externos
export default function QrCode({ value, size = 180, label }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#2b1462', light: '#ffffff' } })
      .then((url) => alive && setSrc(url))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [value, size]);
  return src ? <img className="qr" src={src} width={size} height={size} alt={label ?? `Código QR: ${value}`} /> : <span className="qr qr-loading" style={{ width: size, height: size }} />;
}
