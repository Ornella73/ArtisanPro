const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { calculateDocumentTotals } = require('../services/calculator');

router.use(authenticateToken);

// Helper to generate next Facture Number (e.g. FACT-2026-0001)
function generateFactureNumero(artisanId) {
  const year = new Date().getFullYear();
  const countRow = db.prepare(`
    SELECT COUNT(*) as count FROM factures 
    WHERE artisan_id = ? AND numero LIKE ?
  `).get(artisanId, `FACT-${year}-%`);

  const nextNum = (countRow.count + 1).toString().padStart(4, '0');
  return `FACT-${year}-${nextNum}`;
}

// Helper to resolve or auto-create client in database
function resolveClientId(artisanId, body) {
  const { client_id, new_client } = body;
  if (new_client && (new_client.nom || '').trim()) {
    const nom = new_client.nom.trim();
    const email = (new_client.email || '').trim() || null;
    const telephone = (new_client.telephone || '').trim() || null;
    const adresse = (new_client.adresse || '').trim() || null;

    const res = db.prepare(`
      INSERT INTO clients (artisan_id, nom, email, telephone, adresse)
      VALUES (?, ?, ?, ?, ?)
    `).run(artisanId, nom, email, telephone, adresse);
    return res.lastInsertRowid;
  }

  if (!client_id || client_id === 'new') {
    throw new Error('Le client est obligatoire. Sélectionnez un client ou renseignez le nouveau client.');
  }

  const client = db.prepare('SELECT id FROM clients WHERE id = ? AND artisan_id = ?').get(client_id, artisanId);
  if (!client) {
    throw new Error('Client non trouvé ou accès refusé.');
  }
  return client.id;
}

// POST /api/factures - Create direct invoice with automatic client registration
router.post('/', (req, res) => {
  try {
    const { client_id, new_client, lignes } = req.body;

    let targetClientId;
    try {
      targetClientId = resolveClientId(req.artisan.id, req.body);
    } catch (clientErr) {
      return res.status(400).json({ error: clientErr.message });
    }

    if (!Array.isArray(lignes) || lignes.length === 0) {
      return res.status(400).json({ error: 'La facture doit contenir au moins une ligne.' });
    }

    const computed = calculateDocumentTotals(lignes);
    const numero = generateFactureNumero(req.artisan.id);
    const publicToken = crypto.randomUUID();

    const factureId = db.transaction(() => {
      const insertRes = db.prepare(`
        INSERT INTO factures (
          artisan_id, client_id, devis_id, numero, statut,
          total_ht_cents, total_tva_cents, total_ttc_cents, public_token
        )
        VALUES (?, ?, NULL, ?, 'emise', ?, ?, ?, ?)
      `).run(
        req.artisan.id,
        targetClientId,
        numero,
        computed.total_ht_cents,
        computed.total_tva_cents,
        computed.total_ttc_cents,
        publicToken
      );

      const fId = insertRes.lastInsertRowid;

      const lineStmt = db.prepare(`
        INSERT INTO facture_lignes (
          facture_id, designation, quantite, prix_unitaire_cents, taux_tva,
          total_ht_cents, total_tva_cents, total_ttc_cents
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const line of computed.lignes) {
        lineStmt.run(
          fId,
          line.designation,
          line.quantite,
          line.prix_unitaire_cents,
          line.taux_tva,
          line.total_ht_cents,
          line.total_tva_cents,
          line.total_ttc_cents
        );
      }

      return fId;
    })();

    const createdFacture = db.prepare('SELECT * FROM factures WHERE id = ?').get(factureId);
    const createdLignes = db.prepare('SELECT * FROM facture_lignes WHERE facture_id = ?').all(factureId);

    res.status(201).json({
      message: 'Facture créée avec succès.',
      ...createdFacture,
      lignes: createdLignes
    });
  } catch (err) {
    console.error('Create facture error:', err);
    res.status(500).json({ error: 'Erreur lors de la création de la facture.' });
  }
});

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

    let dateToUse = new Date().toISOString();
    if (date_paiement) {
      const parsedDate = new Date(date_paiement);
      if (!isNaN(parsedDate.getTime())) {
        dateToUse = parsedDate.toISOString();
      }
    }

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

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(facture.client_id) || {};
    const artisan = req.artisan || {};
    const lignes = db.prepare('SELECT * FROM facture_lignes WHERE facture_id = ? ORDER BY id ASC').all(facture.id) || [];
    const paiements = db.prepare('SELECT * FROM paiements WHERE facture_id = ? ORDER BY date_paiement ASC').all(facture.id) || [];

    generateFacturePDF(facture, client, artisan, lignes, paiements, res);
  } catch (err) {
    console.error('Private facture PDF error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erreur lors de la génération du PDF.' });
    }
  }
});

module.exports = router;

