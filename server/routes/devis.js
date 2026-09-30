const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { calculateDocumentTotals } = require('../services/calculator');

router.use(authenticateToken);

// Helper to generate next Devis Number (e.g. DEV-2026-0001)
function generateDevisNumero(artisanId) {
  const year = new Date().getFullYear();
  const countRow = db.prepare(`
    SELECT COUNT(*) as count FROM devis 
    WHERE artisan_id = ? AND numero LIKE ?
  `).get(artisanId, `DEV-${year}-%`);

  const nextNum = (countRow.count + 1).toString().padStart(4, '0');
  return `DEV-${year}-${nextNum}`;
}

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

// GET /api/devis - List all devis for artisan
router.get('/', (req, res) => {
  try {
    const list = db.prepare(`
      SELECT d.*, c.nom as client_nom, c.email as client_email,
             f.numero as facture_numero
      FROM devis d
      JOIN clients c ON c.id = d.client_id
      LEFT JOIN factures f ON f.id = d.facture_id
      WHERE d.artisan_id = ?
      ORDER BY d.created_at DESC
    `).all(req.artisan.id);

    res.json(list);
  } catch (err) {
    console.error('List devis error:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des devis.' });
  }
});

// GET /api/devis/:id - Get single devis with lines and history
router.get('/:id', (req, res) => {
  try {
    const devis = db.prepare(`
      SELECT d.*, c.nom as client_nom, c.email as client_email, c.telephone as client_telephone, c.adresse as client_adresse,
             f.numero as facture_numero, f.statut as facture_statut
      FROM devis d
      JOIN clients c ON c.id = d.client_id
      LEFT JOIN factures f ON f.id = d.facture_id
      WHERE d.id = ? AND d.artisan_id = ?
    `).get(req.params.id, req.artisan.id);

    if (!devis) {
      return res.status(404).json({ error: 'Devis introuvable ou accès refusé.' });
    }

    const lignes = db.prepare('SELECT * FROM devis_lignes WHERE devis_id = ? ORDER BY id ASC').all(devis.id);

    // Fetch version history if available
    let versions = [];
    if (devis.parent_devis_id || devis.statut === 'remplace') {
      const rootId = devis.parent_devis_id || devis.id;
      versions = db.prepare(`
        SELECT id, numero, version, statut, total_ttc_cents, created_at, public_token
        FROM devis 
        WHERE (id = ? OR parent_devis_id = ?) AND artisan_id = ?
        ORDER BY version ASC
      `).all(rootId, rootId, req.artisan.id);
    }

    res.json({
      ...devis,
      lignes,
      versions
    });
  } catch (err) {
    console.error('Get devis error:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération du devis.' });
  }
});

// POST /api/devis - Create new devis
router.post('/', (req, res) => {
  try {
    const { client_id, lignes, statut = 'brouillon' } = req.body;

    if (!client_id) {
      return res.status(400).json({ error: 'Le client est obligatoire.' });
    }

    // Verify client belongs to artisan
    const client = db.prepare('SELECT id FROM clients WHERE id = ? AND artisan_id = ?').get(client_id, req.artisan.id);
    if (!client) {
      return res.status(404).json({ error: 'Client non trouvé ou accès refusé.' });
    }

    if (!Array.isArray(lignes) || lignes.length === 0) {
      return res.status(400).json({ error: 'Le devis doit contenir au moins une ligne.' });
    }

    // Single source of truth calculation
    const computed = calculateDocumentTotals(lignes);

    const numero = generateDevisNumero(req.artisan.id);
    const publicToken = crypto.randomUUID();

    const insertStmt = db.prepare(`
      INSERT INTO devis (
        artisan_id, client_id, numero, version, parent_devis_id, statut,
        total_ht_cents, total_tva_cents, total_ttc_cents, public_token
      )
      VALUES (?, ?, ?, 1, NULL, ?, ?, ?, ?, ?)
    `);

    const insertResult = db.transaction(() => {
      const resDevis = insertStmt.run(
        req.artisan.id,
        client_id,
        numero,
        statut,
        computed.total_ht_cents,
        computed.total_tva_cents,
        computed.total_ttc_cents,
        publicToken
      );

      const devisId = resDevis.lastInsertRowid;

      const lineStmt = db.prepare(`
        INSERT INTO devis_lignes (
          devis_id, designation, quantite, prix_unitaire_cents, taux_tva,
          total_ht_cents, total_tva_cents, total_ttc_cents
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const line of computed.lignes) {
        lineStmt.run(
          devisId,
          line.designation,
          line.quantite,
          line.prix_unitaire_cents,
          line.taux_tva,
          line.total_ht_cents,
          line.total_tva_cents,
          line.total_ttc_cents
        );
      }

      return devisId;
    })();

    const createdDevis = db.prepare('SELECT * FROM devis WHERE id = ?').get(insertResult);
    const createdLignes = db.prepare('SELECT * FROM devis_lignes WHERE devis_id = ?').all(insertResult);

    res.status(201).json({
      ...createdDevis,
      lignes: createdLignes
    });
  } catch (err) {
    console.error('Create devis error:', err);
    res.status(500).json({ error: 'Erreur lors de la création du devis.' });
  }
});

// PUT /api/devis/:id - Update devis (Handles Versioning if already sent/viewed)
router.put('/:id', (req, res) => {
  try {
    const devisId = req.params.id;
    const { client_id, lignes, statut } = req.body;

    const existingDevis = db.prepare('SELECT * FROM devis WHERE id = ? AND artisan_id = ?').get(devisId, req.artisan.id);
    if (!existingDevis) {
      return res.status(404).json({ error: 'Devis introuvable ou accès refusé.' });
    }

    if (existingDevis.statut === 'converti') {
      return res.status(400).json({ error: 'Un devis converti en facture ne peut plus être modifié.' });
    }

    if (!Array.isArray(lignes) || lignes.length === 0) {
      return res.status(400).json({ error: 'Le devis doit contenir au moins une ligne.' });
    }

    const clientIdToUse = client_id || existingDevis.client_id;
    const client = db.prepare('SELECT id FROM clients WHERE id = ? AND artisan_id = ?').get(clientIdToUse, req.artisan.id);
    if (!client) {
      return res.status(404).json({ error: 'Client non trouvé.' });
    }

    // Single source of truth calculation
    const computed = calculateDocumentTotals(lignes);

    // Check if devis has been sent/accepted (public link active) -> Create NEW VERSION
    if (existingDevis.statut === 'envoye' || existingDevis.statut === 'accepte') {
      const newVersionNum = existingDevis.version + 1;
      const newPublicToken = crypto.randomUUID();
      const parentId = existingDevis.parent_devis_id || existingDevis.id;

      const newDevisId = db.transaction(() => {
        // 1. Mark existing devis as 'remplace'
        db.prepare(`UPDATE devis SET statut = 'remplace', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(existingDevis.id);

        // 2. Create new version
        const newDevisRes = db.prepare(`
          INSERT INTO devis (
            artisan_id, client_id, numero, version, parent_devis_id, statut,
            total_ht_cents, total_tva_cents, total_ttc_cents, public_token
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          req.artisan.id,
          clientIdToUse,
          existingDevis.numero, // Keep same base document number
          newVersionNum,
          parentId,
          statut || 'envoye',
          computed.total_ht_cents,
          computed.total_tva_cents,
          computed.total_ttc_cents,
          newPublicToken
        );

        const newId = newDevisRes.lastInsertRowid;

        // 3. Insert new lines
        const lineStmt = db.prepare(`
          INSERT INTO devis_lignes (
            devis_id, designation, quantite, prix_unitaire_cents, taux_tva,
            total_ht_cents, total_tva_cents, total_ttc_cents
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const line of computed.lignes) {
          lineStmt.run(
            newId,
            line.designation,
            line.quantite,
            line.prix_unitaire_cents,
            line.taux_tva,
            line.total_ht_cents,
            line.total_tva_cents,
            line.total_ttc_cents
          );
        }

        return newId;
      })();

      const versionedDevis = db.prepare('SELECT * FROM devis WHERE id = ?').get(newDevisId);
      const versionedLignes = db.prepare('SELECT * FROM devis_lignes WHERE devis_id = ?').all(newDevisId);

      return res.json({
        message: `Nouvelle version (v${versionedDevis.version}) créée car l'ancien devis avait déjà été envoyé.`,
        is_new_version: true,
        previous_devis_id: existingDevis.id,
        ...versionedDevis,
        lignes: versionedLignes
      });
    }

    // Otherwise, devis is in 'brouillon' status: edit in place!
    db.transaction(() => {
      db.prepare(`
        UPDATE devis 
        SET client_id = ?, statut = ?, total_ht_cents = ?, total_tva_cents = ?, total_ttc_cents = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND artisan_id = ?
      `).run(
        clientIdToUse,
        statut || existingDevis.statut,
        computed.total_ht_cents,
        computed.total_tva_cents,
        computed.total_ttc_cents,
        devisId,
        req.artisan.id
      );

      // Replace lines
      db.prepare('DELETE FROM devis_lignes WHERE devis_id = ?').run(devisId);

      const lineStmt = db.prepare(`
        INSERT INTO devis_lignes (
          devis_id, designation, quantite, prix_unitaire_cents, taux_tva,
          total_ht_cents, total_tva_cents, total_ttc_cents
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const line of computed.lignes) {
        lineStmt.run(
          devisId,
          line.designation,
          line.quantite,
          line.prix_unitaire_cents,
          line.taux_tva,
          line.total_ht_cents,
          line.total_tva_cents,
          line.total_ttc_cents
        );
      }
    })();

    const updatedDevis = db.prepare('SELECT * FROM devis WHERE id = ?').get(devisId);
    const updatedLignes = db.prepare('SELECT * FROM devis_lignes WHERE devis_id = ?').all(devisId);

    res.json({
      message: 'Devis mis à jour.',
      is_new_version: false,
      ...updatedDevis,
      lignes: updatedLignes
    });
  } catch (err) {
    console.error('Update devis error:', err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du devis.' });
  }
});

// PATCH /api/devis/:id/statut - Change devis status (brouillon, envoye, accepte)
router.patch('/:id/statut', (req, res) => {
  try {
    const { statut } = req.body;
    const allowed = ['brouillon', 'envoye', 'accepte'];

    if (!allowed.includes(statut)) {
      return res.status(400).json({ error: 'Statut invalide.' });
    }

    const devis = db.prepare('SELECT * FROM devis WHERE id = ? AND artisan_id = ?').get(req.params.id, req.artisan.id);
    if (!devis) {
      return res.status(404).json({ error: 'Devis introuvable ou accès refusé.' });
    }

    if (devis.statut === 'converti') {
      return res.status(400).json({ error: 'Ce devis est déjà converti en facture.' });
    }

    if (devis.statut === 'remplace') {
      return res.status(400).json({ error: 'Ce devis a été remplacé par une version plus récente.' });
    }

    db.prepare('UPDATE devis SET statut = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(statut, devis.id);
    res.json({ message: 'Statut mis à jour.', statut });
  } catch (err) {
    console.error('Change devis status error:', err);
    res.status(500).json({ error: 'Erreur lors du changement de statut.' });
  }
});

// POST /api/devis/:id/share - Trigger status to 'envoye' as soon as link is shared
router.post('/:id/share', (req, res) => {
  try {
    const devis = db.prepare('SELECT * FROM devis WHERE id = ? AND artisan_id = ?').get(req.params.id, req.artisan.id);
    if (!devis) {
      return res.status(404).json({ error: 'Devis introuvable ou accès refusé.' });
    }

    if (devis.statut === 'brouillon') {
      db.prepare(`UPDATE devis SET statut = 'envoye', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(devis.id);
      return res.json({ message: 'Lien partagé, statut passé à envoyé.', statut: 'envoye' });
    }

    res.json({ message: 'Lien partagé.', statut: devis.statut });
  } catch (err) {
    console.error('Share devis error:', err);
    res.status(500).json({ error: 'Erreur lors du partage.' });
  }
});


// POST /api/devis/:id/convert - Convert accepted devis into invoice
router.post('/:id/convert', (req, res) => {
  try {
    const devisId = req.params.id;

    const devis = db.prepare('SELECT * FROM devis WHERE id = ? AND artisan_id = ?').get(devisId, req.artisan.id);
    if (!devis) {
      return res.status(404).json({ error: 'Devis introuvable ou accès refusé.' });
    }

    // STRICT CHECK 1: Must be in 'accepte' status
    if (devis.statut !== 'accepte') {
      return res.status(400).json({ error: 'Seul un devis au statut "accepté" peut être converti en facture.' });
    }

    // STRICT CHECK 2: Cannot convert twice
    if (devis.statut === 'converti' || devis.facture_id) {
      return res.status(400).json({ error: 'Ce devis a déjà été converti en facture. Conversion en double interdite.' });
    }

    const devisLignes = db.prepare('SELECT * FROM devis_lignes WHERE devis_id = ?').all(devis.id);
    if (devisLignes.length === 0) {
      return res.status(400).json({ error: 'Le devis ne contient aucune ligne à convertir.' });
    }

    const factureNumero = generateFactureNumero(req.artisan.id);
    const publicToken = crypto.randomUUID();

    const factureId = db.transaction(() => {
      // 1. Create Facture copying lines and totals permanently from Devis
      const insertFactureRes = db.prepare(`
        INSERT INTO factures (
          artisan_id, client_id, devis_id, numero, statut,
          total_ht_cents, total_tva_cents, total_ttc_cents, public_token
        )
        VALUES (?, ?, ?, ?, 'emise', ?, ?, ?, ?)
      `).run(
        req.artisan.id,
        devis.client_id,
        devis.id,
        factureNumero,
        devis.total_ht_cents,
        devis.total_tva_cents,
        devis.total_ttc_cents,
        publicToken
      );

      const fId = insertFactureRes.lastInsertRowid;

      // 2. Copy devis_lignes to facture_lignes permanently
      const lineStmt = db.prepare(`
        INSERT INTO facture_lignes (
          facture_id, designation, quantite, prix_unitaire_cents, taux_tva,
          total_ht_cents, total_tva_cents, total_ttc_cents
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const line of devisLignes) {
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

      // 3. Mark devis as 'converti' and link to facture_id
      db.prepare(`
        UPDATE devis 
        SET statut = 'converti', facture_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(fId, devis.id);

      return fId;
    })();

    const createdFacture = db.prepare('SELECT * FROM factures WHERE id = ?').get(factureId);
    const createdLignes = db.prepare('SELECT * FROM facture_lignes WHERE facture_id = ?').all(factureId);

    res.status(201).json({
      message: 'Devis converti en facture avec succès.',
      facture: {
        ...createdFacture,
        lignes: createdLignes
      }
    });
  } catch (err) {
    console.error('Convert devis error:', err);
    res.status(500).json({ error: 'Erreur lors de la conversion du devis en facture.' });
  }
});

// DELETE /api/devis/:id - Delete devis (drafts only)
router.delete('/:id', (req, res) => {
  try {
    const devis = db.prepare('SELECT * FROM devis WHERE id = ? AND artisan_id = ?').get(req.params.id, req.artisan.id);
    if (!devis) {
      return res.status(404).json({ error: 'Devis introuvable ou accès refusé.' });
    }

    if (devis.statut === 'converti') {
      return res.status(400).json({ error: 'Un devis converti en facture ne peut pas être supprimé.' });
    }

    db.prepare('DELETE FROM devis WHERE id = ? AND artisan_id = ?').run(devis.id, req.artisan.id);
    res.json({ message: 'Devis supprimé.' });
  } catch (err) {
    console.error('Delete devis error:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression du devis.' });
  }
});

// GET /api/devis/:id/pdf - Internal PDF download for artisan
const { generateDevisPDF } = require('../services/pdf');
router.get('/:id/pdf', (req, res) => {
  try {
    const devis = db.prepare('SELECT * FROM devis WHERE id = ? AND artisan_id = ?').get(req.params.id, req.artisan.id);
    if (!devis) {
      return res.status(404).json({ error: 'Devis introuvable ou accès refusé.' });
    }

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(devis.client_id);
    const artisan = req.artisan;
    const lignes = db.prepare('SELECT * FROM devis_lignes WHERE devis_id = ? ORDER BY id ASC').all(devis.id);

    generateDevisPDF(devis, client, artisan, lignes, res);
  } catch (err) {
    console.error('Private devis PDF error:', err);
    res.status(500).json({ error: 'Erreur lors de la génération du PDF.' });
  }
});

module.exports = router;

