// Planes para clínicas. Lo básico es gratis y el plan nunca compra posición en el directorio:
// el orden de "Cerca de mí" es solo por distancia (o por nombre) y no lee esta configuración
export const PLANS = {
  gratis: {
    label: 'Gratis',
    memberLimit: 5,
    reports: false,
    whatsapp: false,
    features: [
      'Perfil público con horarios, servicios, especialidades y equipos',
      'Aviso de "veterinario disponible ahora"',
      'Registro de pacientes con enlace o código QR',
      'Vacunas, controles y registros validados por la clínica',
      'Solicitudes de cita de los dueños',
      'Próximos seguimientos de los pacientes',
      'Reseñas verificadas y respuesta a reseñas',
      'Hasta 5 personas en el equipo',
    ],
  },
  pro: {
    label: 'Pro',
    memberLimit: 50,
    reports: true,
    whatsapp: true,
    features: [
      'Todo lo del plan Gratis',
      'Recordatorios automáticos por WhatsApp a los dueños que lo autoricen',
      'Reportes de vacunación, seguimiento y pacientes con exportación a CSV',
      'Equipos de hasta 50 personas',
    ],
  },
};

export const planOf = (place) => PLANS[place.plan] ?? PLANS.gratis;
