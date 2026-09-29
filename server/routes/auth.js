const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database');
const { generateToken, authenticateToken } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', (req, res) => {
  try {
    const { email, password, nom_entreprise, nom_artisan, telephone, siret, adresse } = req.body;

    if (!email || !password || !nom_entreprise || !nom_artisan) {
      return res.status(400).json({ error: 'Champs obligatoires manquants (email, password, nom_entreprise, nom_artisan).' });
    }

    // Check existing
    const existing = db.prepare('SELECT id FROM artisans WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) {
      return res.status(400).json({ error: 'Un compte existe déjà avec cette adresse email.' });
    }

    const password_hash = bcrypt.hashSync(password, 10);

    const stmt = db.prepare(`
      INSERT INTO artisans (email, password_hash, nom_entreprise, nom_artisan, telephone, siret, adresse)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      email.toLowerCase().trim(),
      password_hash,
      nom_entreprise.trim(),
      nom_artisan.trim(),
      telephone ? telephone.trim() : null,
      siret ? siret.trim() : null,
      adresse ? adresse.trim() : null
    );

    const artisan = db.prepare('SELECT id, email, nom_entreprise, nom_artisan, telephone, siret, adresse FROM artisans WHERE id = ?').get(result.lastInsertRowid);
    const token = generateToken(artisan);

    res.status(201).json({
      message: 'Inscription réussie',
      token,
      artisan
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'inscription.' });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Veuillez saisir votre email et votre mot de passe.' });
    }

    const artisan = db.prepare('SELECT * FROM artisans WHERE email = ?').get(email.toLowerCase().trim());
    if (!artisan || !bcrypt.compareSync(password, artisan.password_hash)) {
      return res.status(401).json({ error: 'Identifiants incorrects.' });
    }

    const { password_hash, ...artisanClean } = artisan;
    const token = generateToken(artisanClean);

    res.json({
      message: 'Connexion réussie',
      token,
      artisan: artisanClean
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erreur lors de la connexion.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  res.json({ artisan: req.artisan });
});

module.exports = router;
