const express = require('express');
const router = express.Router();
const db = require('../database');
const { generateDevisPDF, generateFacturePDF } = require('../services/pdf');

// STRICT SECURITY RULE: Block ALL write operations on public routes
router.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    return res.status(405).json({
      error: 'Accès refusé : Les liens publics sont strictement réservés à la lecture seule. Aucune action d\'écriture n\'est autorisée.'
    });
  }
  next();
});

// GET /api/public/devis/:token - Public read-only quote details
router.get('/devis/:token', (req, res) => {
  try {
    const devis = db.prepare(`
      SELECT d.*, 
             c.nom as client_nom, c.email as client_email, c.telephone as client_telephone, c.adresse as client_adresse,
             a.nom_entreprise, a.nom_artisan, a.telephone as artisan_telephone, a.email as artisan_email, a.siret as artisan_siret, a.adresse as artisan_adresse,
             f.numero as facture_numero, f.public_token as facture_public_token, f.statut as facture_statut
      FROM devis d
      JOIN clients c ON c.id = d.client_id
      JOIN artisans a ON a.id = d.artisan_id
      LEFT JOIN factures f ON f.id = d.facture_id
      WHERE d.public_token = ?
    `).get(req.params.token);

    if (!devis) {
      return res.status(404).json({ error: 'Devis introuvable ou lien public expiré.' });
    }

    // Automatically transition draft devis to 'envoye' once public link is accessed
    if (devis.statut === 'brouillon') {
      db.prepare(`UPDATE devis SET statut = 'envoye', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(devis.id);
      devis.statut = 'envoye';
    }

    const lignes = db.prepare('SELECT * FROM devis_lignes WHERE devis_id = ? ORDER BY id ASC').all(devis.id);

    // If this devis was replaced by a newer version, find the latest version info
    let newestVersion = null;
    if (devis.statut === 'remplace') {
      const rootId = devis.parent_devis_id || devis.id;
      newestVersion = db.prepare(`
        SELECT id, numero, version, statut, public_token, created_at
        FROM devis
        WHERE (id = ? OR parent_devis_id = ?) AND statut != 'remplace'
        ORDER BY version DESC LIMIT 1
      `).get(rootId, rootId);
    }

    res.json({
      is_public: true,
      devis: {
        id: devis.id,
        numero: devis.numero,
        version: devis.version,
        statut: devis.statut,
        total_ht_cents: devis.total_ht_cents,
        total_tva_cents: devis.total_tva_cents,
        total_ttc_cents: devis.total_ttc_cents,
        created_at: devis.created_at,
        facture_numero: devis.facture_numero,
        facture_public_token: devis.facture_public_token,
        facture_statut: devis.facture_statut
      },
      client: {
        nom: devis.client_nom,
        email: devis.client_email,
        telephone: devis.client_telephone,
        adresse: devis.client_adresse
      },
      artisan: {
        nom_entreprise: devis.nom_entreprise,
        nom_artisan: devis.nom_artisan,
        telephone: devis.artisan_telephone,
        email: devis.artisan_email,
        siret: devis.artisan_siret,
        adresse: devis.artisan_adresse
      },
      lignes,
      replacement_notice: devis.statut === 'remplace' ? {
        message: 'Ce devis a été remplacé par une version plus récente émise par l\'artisan.',
        newest_version: newestVersion
      } : null
    });
  } catch (err) {
    console.error('Public devis error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement du devis public.' });
  }
});

// GET /api/public/devis/:token/pdf - Public PDF download for quote
router.get('/devis/:token/pdf', (req, res) => {
  try {
    const devis = db.prepare('SELECT * FROM devis WHERE public_token = ?').get(req.params.token);
    if (!devis) {
      return res.status(404).json({ error: 'Devis introuvable.' });
    }

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(devis.client_id);
    const artisanRaw = db.prepare('SELECT id, email, nom_entreprise, nom_artisan, telephone, siret, adresse FROM artisans WHERE id = ?').get(devis.artisan_id);
    const lignes = db.prepare('SELECT * FROM devis_lignes WHERE devis_id = ? ORDER BY id ASC').all(devis.id);

    if (!client || !artisanRaw) {
      return res.status(404).json({ error: 'Données du devis incomplètes.' });
    }

    // Sanitize — ensure no null crashes in PDFKit
    const artisan = {
      nom_entreprise: artisanRaw.nom_entreprise || 'Artisan',
      nom_artisan: artisanRaw.nom_artisan || '',
      email: artisanRaw.email || '',
      telephone: artisanRaw.telephone || '',
      siret: artisanRaw.siret || '',
      adresse: artisanRaw.adresse || ''
    };
    const safeClient = {
      nom: client.nom || '',
      email: client.email || '',
      telephone: client.telephone || '',
      adresse: client.adresse || ''
    };

    generateDevisPDF(devis, safeClient, artisan, lignes, res);
  } catch (err) {
    console.error('Public devis PDF error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erreur lors de la génération du PDF.' });
    }
  }
});

// GET /api/public/factures/:token - Public read-only invoice details
router.get('/factures/:token', (req, res) => {
  try {
    const facture = db.prepare(`
      SELECT f.*, 
             c.nom as client_nom, c.email as client_email, c.telephone as client_telephone, c.adresse as client_adresse,
             a.nom_entreprise, a.nom_artisan, a.telephone as artisan_telephone, a.email as artisan_email, a.siret as artisan_siret, a.adresse as artisan_adresse,
             d.numero as devis_numero
      FROM factures f
      JOIN clients c ON c.id = f.client_id
      JOIN artisans a ON a.id = f.artisan_id
      LEFT JOIN devis d ON d.id = f.devis_id
      WHERE f.public_token = ?
    `).get(req.params.token);

    if (!facture) {
      return res.status(404).json({ error: 'Facture introuvable ou lien public expiré.' });
    }

    const lignes = db.prepare('SELECT * FROM facture_lignes WHERE facture_id = ? ORDER BY id ASC').all(facture.id);
    const paiements = db.prepare('SELECT montant_cents, date_paiement, mode_paiement FROM paiements WHERE facture_id = ? ORDER BY date_paiement ASC').all(facture.id);

    const totalPayeCents = paiements.reduce((sum, p) => sum + p.montant_cents, 0);
    const soldeRestantCents = Math.max(0, facture.total_ttc_cents - totalPayeCents);

    res.json({
      is_public: true,
      facture: {
        id: facture.id,
        numero: facture.numero,
        devis_numero: facture.devis_numero,
        statut: facture.statut,
        total_ht_cents: facture.total_ht_cents,
        total_tva_cents: facture.total_tva_cents,
        total_ttc_cents: facture.total_ttc_cents,
        date_emission: facture.date_emission,
        total_paye_cents: totalPayeCents,
        solde_restant_cents: soldeRestantCents
      },
      client: {
        nom: facture.client_nom,
        email: facture.client_email,
        telephone: facture.client_telephone,
        adresse: facture.client_adresse
      },
      artisan: {
        nom_entreprise: facture.nom_entreprise,
        nom_artisan: facture.nom_artisan,
        telephone: facture.artisan_telephone,
        email: facture.artisan_email,
        siret: facture.artisan_siret,
        adresse: facture.artisan_adresse
      },
      lignes,
      paiements
    });
  } catch (err) {
    console.error('Public facture error:', err);
    res.status(500).json({ error: 'Erreur lors du chargement de la facture publique.' });
  }
});

// GET /api/public/factures/:token/pdf - Public PDF download for invoice
router.get('/factures/:token/pdf', (req, res) => {
  try {
    const facture = db.prepare('SELECT * FROM factures WHERE public_token = ?').get(req.params.token);
    if (!facture) {
      return res.status(404).json({ error: 'Facture introuvable.' });
    }

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(facture.client_id);
    const artisanRaw = db.prepare('SELECT id, email, nom_entreprise, nom_artisan, telephone, siret, adresse FROM artisans WHERE id = ?').get(facture.artisan_id);
    const lignes = db.prepare('SELECT * FROM facture_lignes WHERE facture_id = ? ORDER BY id ASC').all(facture.id);
    const paiements = db.prepare('SELECT * FROM paiements WHERE facture_id = ? ORDER BY date_paiement ASC').all(facture.id);

    if (!client || !artisanRaw) {
      return res.status(404).json({ error: 'Données de la facture incomplètes.' });
    }

    // Sanitize — ensure no null crashes in PDFKit
    const artisan = {
      nom_entreprise: artisanRaw.nom_entreprise || 'Artisan',
      nom_artisan: artisanRaw.nom_artisan || '',
      email: artisanRaw.email || '',
      telephone: artisanRaw.telephone || '',
      siret: artisanRaw.siret || '',
      adresse: artisanRaw.adresse || ''
    };
    const safeClient = {
      nom: client.nom || '',
      email: client.email || '',
      telephone: client.telephone || '',
      adresse: client.adresse || ''
    };

    generateFacturePDF(facture, safeClient, artisan, lignes, paiements, res);
  } catch (err) {
    console.error('Public facture PDF error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erreur lors de la génération du PDF.' });
    }
  }
});

module.exports = router;
