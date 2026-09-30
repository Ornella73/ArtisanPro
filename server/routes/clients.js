const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// GET /api/clients - List all clients for logged-in artisan
router.get('/', (req, res) => {
  try {
    const clients = db.prepare(`
      SELECT c.*, 
             COUNT(DISTINCT d.id) as count_devis, 
             COUNT(DISTINCT f.id) as count_factures
      FROM clients c
      LEFT JOIN devis d ON d.client_id = c.id AND d.artisan_id = c.artisan_id
      LEFT JOIN factures f ON f.client_id = c.id AND f.artisan_id = c.artisan_id
      WHERE c.artisan_id = ?
      GROUP BY c.id
      ORDER BY c.nom ASC
    `).all(req.artisan.id);

    res.json(clients);
  } catch (err) {
    console.error('List clients error:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des clients.' });
  }
});

// GET /api/clients/:id - Get single client details
router.get('/:id', (req, res) => {
  try {
    const client = db.prepare('SELECT * FROM clients WHERE id = ? AND artisan_id = ?').get(req.params.id, req.artisan.id);
    if (!client) {
      return res.status(404).json({ error: 'Client non trouvé ou accès refusé.' });
    }
    res.json(client);
  } catch (err) {
    console.error('Get client error:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération du client.' });
  }
});

// POST /api/clients - Create new client
router.post('/', (req, res) => {
  try {
    const { nom, email, telephone, adresse } = req.body;

    if (!nom || typeof nom !== 'string' || !nom.trim()) {
      return res.status(400).json({ error: 'Le nom du client est obligatoire.' });
    }

    const stmt = db.prepare(`
      INSERT INTO clients (artisan_id, nom, email, telephone, adresse)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      req.artisan.id,
      nom.trim(),
      typeof email === 'string' && email.trim() ? email.trim() : null,
      typeof telephone === 'string' && telephone.trim() ? telephone.trim() : null,
      typeof adresse === 'string' && adresse.trim() ? adresse.trim() : null
    );

    const newClient = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newClient);
  } catch (err) {
    console.error('Create client error:', err);
    res.status(500).json({ error: 'Erreur lors de la création du client.' });
  }
});

// PUT /api/clients/:id - Update client
router.put('/:id', (req, res) => {
  try {
    const { nom, email, telephone, adresse } = req.body;

    if (!nom || typeof nom !== 'string' || !nom.trim()) {
      return res.status(400).json({ error: 'Le nom du client est obligatoire.' });
    }

    const existing = db.prepare('SELECT id FROM clients WHERE id = ? AND artisan_id = ?').get(req.params.id, req.artisan.id);
    if (!existing) {
      return res.status(404).json({ error: 'Client non trouvé ou accès refusé.' });
    }

    db.prepare(`
      UPDATE clients 
      SET nom = ?, email = ?, telephone = ?, adresse = ?
      WHERE id = ? AND artisan_id = ?
    `).run(
      nom.trim(),
      typeof email === 'string' && email.trim() ? email.trim() : null,
      typeof telephone === 'string' && telephone.trim() ? telephone.trim() : null,
      typeof adresse === 'string' && adresse.trim() ? adresse.trim() : null,
      req.params.id,
      req.artisan.id
    );

    const updatedClient = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    res.json(updatedClient);
  } catch (err) {
    console.error('Update client error:', err);
    res.status(500).json({ error: 'Erreur lors de la modification du client.' });
  }
});

// DELETE /api/clients/:id - Delete client
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM clients WHERE id = ? AND artisan_id = ?').get(req.params.id, req.artisan.id);
    if (!existing) {
      return res.status(404).json({ error: 'Client non trouvé ou accès refusé.' });
    }

    db.prepare('DELETE FROM clients WHERE id = ? AND artisan_id = ?').run(req.params.id, req.artisan.id);
    res.json({ message: 'Client supprimé avec succès.' });
  } catch (err) {
    console.error('Delete client error:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression du client.' });
  }
});

module.exports = router;
