const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// GET /api/factures - List all invoices for artisan with payments overview
router.get('/', (req, res) => {
  try {
    const list = db.prepare(`
      SELECT f.*, c.nom as client_nom, c.email as client_email,
             d.numero as devis_numero,
             COALESCE(SUM(p.montant_cents), 0) as total_paye_cents,
             (f.total_ttc_cents - COALESCE(SUM(p.montant_cents), 0)) as solde_restant_cents
      FROM factures f
      JOIN clients c ON c.id = f.client_id
      LEFT JOIN devis d ON d.id = f.devis_id
      LEFT JOIN paiements p ON p.facture_id = f.id
      WHERE f.artisan_id = ?
      GROUP BY f.id
      ORDER BY f.created_at DESC
    `).all(req.artisan.id);

    res.json(list);
  } catch (err) {
    console.error('List factures error:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des factures.' });
  }
});

// GET /api/factures/:id - Get single invoice with lines and payments
router.get('/:id', (req, res) => {
  try {
    const facture = db.prepare(`
      SELECT f.*, c.nom as client_nom, c.email as client_email, c.telephone as client_telephone, c.adresse as client_adresse,
             d.numero as devis_numero
      FROM factures f
      JOIN clients c ON c.id = f.client_id
      LEFT JOIN devis d ON d.id = f.devis_id
      WHERE f.id = ? AND f.artisan_id = ?
    `).get(req.params.id, req.artisan.id);

    if (!facture) {
      return res.status(404).json({ error: 'Facture introuvable ou accès refusé.' });
    }

    const lignes = db.prepare('SELECT * FROM facture_lignes WHERE facture_id = ? ORDER BY id ASC').all(facture.id);
    const paiements = db.prepare('SELECT * FROM paiements WHERE facture_id = ? ORDER BY date_paiement ASC').all(facture.id);

    const totalPayeCents = paiements.reduce((sum, p) => sum + p.montant_cents, 0);
    const soldeRestantCents = Math.max(0, facture.total_ttc_cents - totalPayeCents);

    res.json({
      ...facture,
      lignes,
      paiements,
      total_paye_cents: totalPayeCents,
      solde_restant_cents: soldeRestantCents
    });
  } catch (err) {
    console.error('Get facture error:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération de la facture.' });
  }
});

// MANDATORY RULE: Invoices are READ-ONLY locked once generated. Modification attempt strictly rejected.
router.put('/:id', (req, res) => {
  res.status(400).json({
    error: 'Action rejetée : Une facture générée est verrouillée en lecture seule et ne peut pas être modifiée.'
  });
});

router.patch('/:id', (req, res) => {
  // Allow only status update to 'annulee' if requested, otherwise reject modifications
  const { statut } = req.body;
  if (statut === 'annulee') {
    return handleAnnulation(req, res);
  }
  res.status(400).json({
    error: 'Action rejetée : Le contenu d\'une facture est strictement verrouillé en lecture seule. Seul le passage au statut "annulée" est autorisé.'
  });
});

// MANDATORY RULE: Invoices can NEVER be deleted.
router.delete('/:id', (req, res) => {
  res.status(400).json({
    error: 'Action rejetée : Une facture ne peut pas être supprimée. Seul le passage au statut "annulée" est autorisé.'
  });
});

// POST /api/factures/:id/annuler - Cancel an invoice
function handleAnnulation(req, res) {
  try {
    const facture = db.prepare('SELECT * FROM factures WHERE id = ? AND artisan_id = ?').get(req.params.id, req.artisan.id);
    if (!facture) {
      return res.status(404).json({ error: 'Facture introuvable ou accès refusé.' });
    }

    db.prepare(`UPDATE factures SET statut = 'annulee' WHERE id = ?`).run(facture.id);
    res.json({ message: 'Facture annulée avec succès.', statut: 'annulee' });
  } catch (err) {
    console.error('Annuler facture error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'annulation de la facture.' });
  }
}
router.post('/:id/annuler', handleAnnulation);

// POST /api/factures/:id/paiements - Add payment / acompte
router.post('/:id/paiements', (req, res) => {
  try {
    const factureId = req.params.id;
    const { montant_cents, mode_paiement = 'virement', date_paiement, notes } = req.body;

    const facture = db.prepare('SELECT * FROM factures WHERE id = ? AND artisan_id = ?').get(factureId, req.artisan.id);
    if (!facture) {
      return res.status(404).json({ error: 'Facture introuvable ou accès refusé.' });
    }

    if (facture.statut === 'annulee') {
      return res.status(400).json({ error: 'Impossible d\'enregistrer un paiement sur une facture annulée.' });
    }

    const amount = Math.round(Number(montant_cents));
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Le montant du paiement doit être un entier strictement positif (en centimes).' });
    }

    // Check total existing payments
    const existingPaiements = db.prepare('SELECT * FROM paiements WHERE facture_id = ?').all(factureId);
    const currentPaidTotal = existingPaiements.reduce((sum, p) => sum + p.montant_cents, 0);
    const newPaidTotal = currentPaidTotal + amount;

    if (newPaidTotal > facture.total_ttc_cents) {
      const maxAllowed = facture.total_ttc_cents - currentPaidTotal;
      return res.status(400).json({
        error: `Le montant dépasse le solde restant à payer (${(maxAllowed / 100).toFixed(2)} €).`
      });
    }

    const dateToUse = date_paiement ? new Date(date_paiement).toISOString() : new Date().toISOString();

    const newPaymentId = db.transaction(() => {
      // 1. Insert payment
      const pRes = db.prepare(`
        INSERT INTO paiements (facture_id, artisan_id, montant_cents, date_paiement, mode_paiement, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        factureId,
        req.artisan.id,
        amount,
        dateToUse,
        mode_paiement,
        notes ? notes.trim() : null
      );

      // 2. Automatically update invoice status
      let newStatut = 'emise';
      if (newPaidTotal >= facture.total_ttc_cents) {
        newStatut = 'payee';
      } else if (newPaidTotal > 0) {
        newStatut = 'partiellement_payee';
      }

      db.prepare('UPDATE factures SET statut = ? WHERE id = ?').run(newStatut, factureId);

      return pRes.lastInsertRowid;
    })();

    const updatedFacture = db.prepare('SELECT * FROM factures WHERE id = ?').get(factureId);
    const allPaiements = db.prepare('SELECT * FROM paiements WHERE facture_id = ? ORDER BY date_paiement ASC').all(factureId);

    const soldeRestantCents = Math.max(0, updatedFacture.total_ttc_cents - newPaidTotal);

    res.status(201).json({
      message: 'Paiement enregistré avec succès.',
      facture_statut: updatedFacture.statut,
      total_paye_cents: newPaidTotal,
      solde_restant_cents: soldeRestantCents,
      paiements: allPaiements
    });
  } catch (err) {
    console.error('Add payment error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'enregistrement du paiement.' });
  }
});

// GET /api/factures/:id/pdf - Internal PDF download for artisan
const { generateFacturePDF } = require('../services/pdf');
router.get('/:id/pdf', (req, res) => {
  try {
    const facture = db.prepare('SELECT * FROM factures WHERE id = ? AND artisan_id = ?').get(req.params.id, req.artisan.id);
    if (!facture) {
      return res.status(404).json({ error: 'Facture introuvable ou accès refusé.' });
    }

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(facture.client_id);
    const artisan = req.artisan;
    const lignes = db.prepare('SELECT * FROM facture_lignes WHERE facture_id = ? ORDER BY id ASC').all(facture.id);
    const paiements = db.prepare('SELECT * FROM paiements WHERE facture_id = ? ORDER BY date_paiement ASC').all(facture.id);

    generateFacturePDF(facture, client, artisan, lignes, paiements, res);
  } catch (err) {
    console.error('Private facture PDF error:', err);
    res.status(500).json({ error: 'Erreur lors de la génération du PDF.' });
  }
});

module.exports = router;

