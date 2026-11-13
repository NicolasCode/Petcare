import { api } from './api.js';

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyToBytes(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

// Estado actual de las notificaciones push en este dispositivo
export async function pushState() {
  if (!supported()) return { available: false, reason: 'Este navegador no permite notificaciones. En iPhone, instala Kaimi en la pantalla de inicio.' };
  const config = await api.get('/notifications/config');
  if (!config.push_enabled) return { available: false, reason: 'Las notificaciones push aún no están activas en el servidor.' };
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return { available: true, enabled: Boolean(sub) && Notification.permission === 'granted', denied: Notification.permission === 'denied', config };
}

export async function enablePush(publicKey) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Debes permitir las notificaciones en el navegador');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }));
  await api.post('/notifications/subscribe', sub.toJSON());
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await api.post('/notifications/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}
