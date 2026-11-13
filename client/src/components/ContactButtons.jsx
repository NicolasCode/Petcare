import { directionsLink, telLink, waLink } from '../lib/contact.js';
import Icon from './Icon.jsx';

// Llamar, WhatsApp y "Cómo llegar" para una clínica; message prellena el WhatsApp
export default function ContactButtons({ phone, whatsapp, lat, lng, message, size = 'sm' }) {
  const cls = `btn btn-secondary btn-${size}`;
  if (!phone && !whatsapp && lat == null) return null;
  return (
    <div className="place-actions">
      {phone && (
        <a className={cls} href={telLink(phone)}>
          <Icon name="phone" size={16} /> Llamar
        </a>
      )}
      {whatsapp && (
        <a className={cls} href={waLink(whatsapp, message)} target="_blank" rel="noreferrer">
          <Icon name="message" size={16} /> WhatsApp
        </a>
      )}
      {lat != null && lng != null && (
        <a className={cls} href={directionsLink(lat, lng)} target="_blank" rel="noreferrer">
          <Icon name="map" size={16} /> Cómo llegar
        </a>
      )}
    </div>
  );
}
