const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// GET /api/dashboard/stats
router.get('/stats', (req, res) => {
  try {
    const { period = 'this_month', start_date, end_date } = req.query;
    const artisanId = req.artisan.id;

    let startDateISO = null;
    let endDateISO = null;

    const now = new Date();

    if (period === 'this_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      startDateISO = start.toISOString();
      endDateISO = end.toISOString();
    } else if (period === 'this_quarter') {
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), currentQuarter * 3, 1);
      const end = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0, 23, 59, 59);
      startDateISO = start.toISOString();
      endDateISO = end.toISOString();
    } else if (period === 'this_year') {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
      startDateISO = start.toISOString();
      endDateISO = end.toISOString();
    } else if (period === 'custom' && start_date && end_date) {
      const dStart = new Date(start_date);
      const dEnd = new Date(String(end_date).includes('T') ? end_date : end_date + 'T23:59:59');
      if (!isNaN(dStart.getTime()) && !isNaN(dEnd.getTime())) {
        startDateISO = dStart.toISOString();
        endDateISO = dEnd.toISOString();
      }
    }

    // 1. Montant total facturé (Factures émises, partiellement payées, ou payées, hors annulées)
    let facturedQuery = `
      SELECT COALESCE(SUM(total_ttc_cents), 0) as total_facture_cents, COUNT(id) as count_factures
      FROM factures
      WHERE artisan_id = ? AND statut IN ('emise', 'partiellement_payee', 'payee')
    `;
    const facturedParams = [artisanId];

    if (startDateISO && endDateISO) {
      facturedQuery += ` AND created_at >= ? AND created_at <= ?`;
      facturedParams.push(startDateISO, endDateISO);
    }

    const facturedRes = db.prepare(facturedQuery).get(...facturedParams);

    // 2. Montant réellement encaissé (Somme de tous les paiements enregistrés sur la période)
    let encaisseQuery = `
      SELECT COALESCE(SUM(montant_cents), 0) as total_encaisse_cents, COUNT(id) as count_paiements
      FROM paiements
      WHERE artisan_id = ?
    `;
    const encaisseParams = [artisanId];

    if (startDateISO && endDateISO) {
      encaisseQuery += ` AND date_paiement >= ? AND date_paiement <= ?`;
      encaisseParams.push(startDateISO, endDateISO);
    }

    const encaisseRes = db.prepare(encaisseQuery).get(...encaisseParams);

    // 3. Montant en attente (Soldes restants cumulés des factures non annulées)
    let pendingQuery = `
      SELECT 
        COALESCE(SUM(f.total_ttc_cents - COALESCE(p.total_p, 0)), 0) as total_attente_cents
      FROM factures f
      LEFT JOIN (
        SELECT facture_id, SUM(montant_cents) as total_p 
        FROM paiements 
        WHERE artisan_id = ?
        GROUP BY facture_id
      ) p ON p.facture_id = f.id
      WHERE f.artisan_id = ? AND f.statut IN ('emise', 'partiellement_payee')
    `;
    const pendingParams = [artisanId, artisanId];

    if (startDateISO && endDateISO) {
      pendingQuery += ` AND f.created_at >= ? AND f.created_at <= ?`;
      pendingParams.push(startDateISO, endDateISO);
    }

    const pendingRes = db.prepare(pendingQuery).get(...pendingParams);

    // Recent activity overview
    const recentDevis = db.prepare(`
      SELECT d.id, d.numero, d.statut, d.total_ttc_cents, d.created_at, c.nom as client_nom
      FROM devis d
      JOIN clients c ON c.id = d.client_id
      WHERE d.artisan_id = ?
      ORDER BY d.created_at DESC LIMIT 5
    `).all(artisanId);

    const recentFactures = db.prepare(`
      SELECT f.id, f.numero, f.statut, f.total_ttc_cents, f.created_at, c.nom as client_nom,
             COALESCE(SUM(p.montant_cents), 0) as total_paye_cents
      FROM factures f
      JOIN clients c ON c.id = f.client_id
      LEFT JOIN paiements p ON p.facture_id = f.id
      WHERE f.artisan_id = ?
      GROUP BY f.id
      ORDER BY f.created_at DESC LIMIT 5
    `).all(artisanId);

    res.json({
      period,
      start_date: startDateISO,
      end_date: endDateISO,
      kpis: {
        total_facture_cents: facturedRes.total_facture_cents,
        total_encaisse_cents: encaisseRes.total_encaisse_cents,
        total_attente_cents: pendingRes.total_attente_cents,
        count_factures: facturedRes.count_factures,
        count_paiements: encaisseRes.count_paiements
      },
      recent_devis: recentDevis,
      recent_factures: recentFactures
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Erreur lors du calcul du tableau de bord.' });
  }
});

module.exports = router;
