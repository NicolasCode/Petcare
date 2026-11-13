import { config } from './config.js';

// Recordatorios por WhatsApp Business (Cloud API de Meta) con una plantilla aprobada.
// Variables de la plantilla, en orden: nombre del dueño, mascota, cuidado, fecha y clínica
export const testWhatsApp = [];

export const whatsappEnabled = () => process.env.NODE_ENV === 'test' || Boolean(config.whatsapp.token && config.whatsapp.phoneId);

// Celular colombiano de 10 dígitos -> 57XXXXXXXXXX
export function normalizePhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

export async function sendWhatsAppReminder(phone, params) {
  const to = normalizePhone(phone);
  if (!to) throw new Error('El celular del dueño no es válido');
  if (process.env.NODE_ENV === 'test') {
    testWhatsApp.push({ to, params });
    return;
  }
  if (!whatsappEnabled()) throw new Error('WhatsApp no está configurado en este servidor');
  const res = await fetch(`https://graph.facebook.com/v21.0/${config.whatsapp.phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.whatsapp.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: config.whatsapp.template,
        language: { code: config.whatsapp.language },
        components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text).slice(0, 200) })) }],
      },
    }),
  });
  if (!res.ok) throw new Error(`WhatsApp respondió ${res.status}: ${await res.text()}`);
}

// Variables de la plantilla para un seguimiento de clínica (ver getClinicFollowUps)
export const whatsappParams = (f, place) => [
  f.owner_name.split(' ')[0],
  f.pet_name,
  f.name,
  new Date(`${f.next_due}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' }),
  place.name,
];
