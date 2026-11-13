// Planes para clínicas. Lo básico es gratis y el plan nunca compra posición en el directorio:
// el orden de "Cerca de mí" es solo por distancia (o por nombre) y no lee esta configuración
export const PLANS = {
  gratis: {
    label: 'Gratis',
    memberLimit: 5,
    features: [
      'Perfil público con horarios, servicios, especialidades y equipos',
      'Registro de pacientes con enlace o código QR',
      'Vacunas, controles y registros validados por la clínica',
      'Próximos seguimientos de los pacientes',
      'Reseñas verificadas y respuesta a reseñas',
      'Hasta 5 personas en el equipo',
    ],
  },
  pro: {
    label: 'Pro',
    memberLimit: 50,
    soon: true,
    features: [
      'Recordatorios automáticos a los dueños por WhatsApp',
      'Agenda de citas en línea',
      'Reportes de vacunación y seguimiento',
      'Equipos de hasta 50 personas y varias sedes',
    ],
  },
};

export const planOf = (place) => PLANS[place.plan] ?? PLANS.gratis;
