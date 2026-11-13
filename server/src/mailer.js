import { config } from './config.js';

// En pruebas los correos se guardan aquí en lugar de enviarse
export const testOutbox = [];

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Plantilla mínima con la identidad de Kaimi; `lines` son párrafos de texto plano
export function renderMail({ title, lines, action }) {
  const text = [title, '', ...lines, ...(action ? ['', `${action.label}: ${action.url}`] : [])].join('\n');
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f7f1e3;font-family:Arial,sans-serif;color:#23123c">
<div style="max-width:520px;margin:0 auto;padding:24px">
<p style="font-size:22px;font-weight:800;color:#371971;margin:0 0 16px">kaimi</p>
<div style="background:#fffdf9;border:1px solid #e9dfca;border-radius:16px;padding:24px">
<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>
${lines.map((l) => `<p style="margin:0 0 10px;line-height:1.5">${escapeHtml(l)}</p>`).join('')}
${action ? `<p style="margin:20px 0 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#371971;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px">${escapeHtml(action.label)}</a></p>` : ''}
</div>
<p style="font-size:12px;color:#6e6486;margin:16px 0 0">Recibes este correo porque tienes una cuenta en Kaimi.</p>
</div></body></html>`;
  return { text, html };
}

export async function sendMail({ to, subject, text, html }) {
  if (process.env.NODE_ENV === 'test') {
    testOutbox.push({ to, subject, text });
    return;
  }
  if (!config.resendApiKey) {
    console.log(`[correo sin enviar: falta RESEND_API_KEY] Para: ${to} · ${subject}\n${text}`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.mailFrom, to, subject, text, html }),
  });
  if (!res.ok) throw new Error(`No se pudo enviar el correo (${res.status}): ${await res.text()}`);
}

// Un correo que falla no debe tumbar la petición que lo originó
export function sendMailSafe(mail) {
  return sendMail(mail).catch((err) => console.error(err));
}
