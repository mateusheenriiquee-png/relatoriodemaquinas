const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const {
  getSuportes,
  getSuporte,
  getCountsByStatus,
  createSuporte,
  importSuportes,
  updateSuporte,
  deleteSuporte,
  getReagendadosOverdue,
  updateReagendadoToAberto
} = require('../services/suportes-firestore');

const router = express.Router();

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const { status, tecnico, ac } = req.query;
    const suportes = await getSuportes({ status, tecnico, ac });
    res.json({ ok: true, data: suportes });
  } catch (error) {
    next(error);
  }
});

router.get('/stats', authenticateToken, async (_req, res, next) => {
  try {
    const data = await getCountsByStatus();
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/reagendados/overdue', authenticateToken, async (_req, res, next) => {
  try {
    const data = await getReagendadosOverdue();
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const suporte = await getSuporte(req.params.id);
    if (!suporte) {
      return res.status(404).json({ ok: false, error: 'Suporte não encontrado' });
    }
    res.json({ ok: true, data: suporte });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const data = await createSuporte(req.body || {});
    res.status(201).json({ ok: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/import', authenticateToken, async (req, res, next) => {
  try {
    const result = await importSuportes(req.body || []);
    res.status(201).json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticateToken, async (req, res, next) => {
  try {
    const data = await updateSuporte(req.params.id, req.body || {});
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    await deleteSuporte(req.params.id);
    res.json({ ok: true, deleted: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
