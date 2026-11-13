// Enlaces para contactar a una clínica desde cualquier pantalla
export const digits = (s) => (s || '').replace(/\D/g, '');
// Números colombianos de 10 dígitos sin indicativo: se antepone el 57
export const waLink = (n, text) => `https://wa.me/${digits(n).length === 10 ? `57${digits(n)}` : digits(n)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
export const telLink = (n) => `tel:${digits(n)}`;
export const directionsLink = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
