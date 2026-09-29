const jwt = require('jsonwebtoken');
const db = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'artisanpro_super_secret_jwt_key_2026';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  if (!token && req.query.auth_token) {
    token = req.query.auth_token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Accès non autorisé. Token manquant.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalide ou expiré.' });
    }

    // Verify artisan exists in DB
    const artisan = db.prepare('SELECT id, email, nom_entreprise, nom_artisan, telephone, siret, adresse FROM artisans WHERE id = ?').get(user.id);
    if (!artisan) {
      return res.status(401).json({ error: 'Compte artisan introuvable.' });
    }

    req.artisan = artisan;
    next();
  });
}

function generateToken(artisan) {
  return jwt.sign(
    { id: artisan.id, email: artisan.email, nom_entreprise: artisan.nom_entreprise },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

module.exports = {
  authenticateToken,
  generateToken,
  JWT_SECRET
};
