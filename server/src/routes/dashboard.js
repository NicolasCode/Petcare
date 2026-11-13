import { Router } from 'express';
import { z } from 'zod';
import { getReminders } from '../reminders.js';
import { bogotaTodayIso } from '../validation.js';

const router = Router();

router.get('/', async (req, res) => {
  // El cliente envía su fecha local para que "hoy" coincida con la zona horaria del usuario
  const today = z.iso.date().catch(bogotaTodayIso()).parse(req.query.today);
  res.json({ today, ...(await getReminders(req.userId, today)) });
});

export default router;
