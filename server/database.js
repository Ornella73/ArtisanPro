const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = process.env.VERCEL 
  ? path.join('/tmp', 'data')
  : path.join(__dirname, '..', 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'artisanpro.db');
const db = new Database(dbPath);

// Enable WAL mode & foreign keys (fallback to DELETE journal mode if WAL fails on serverless filesystem)
try {
  db.pragma('journal_mode = WAL');
} catch (_) {
  db.pragma('journal_mode = DELETE');
}
db.pragma('foreign_keys = ON');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS artisans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nom_entreprise TEXT NOT NULL,
      nom_artisan TEXT NOT NULL,
      telephone TEXT,
      siret TEXT,
      adresse TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artisan_id INTEGER NOT NULL,
      nom TEXT NOT NULL,
      email TEXT,
      telephone TEXT,
      adresse TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (artisan_id) REFERENCES artisans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS devis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artisan_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      numero TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      parent_devis_id INTEGER,
      statut TEXT NOT NULL DEFAULT 'brouillon',
      total_ht_cents INTEGER NOT NULL DEFAULT 0,
      total_tva_cents INTEGER NOT NULL DEFAULT 0,
      total_ttc_cents INTEGER NOT NULL DEFAULT 0,
      public_token TEXT UNIQUE NOT NULL,
      facture_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (artisan_id) REFERENCES artisans(id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_devis_id) REFERENCES devis(id) ON DELETE SET NULL,
      FOREIGN KEY (facture_id) REFERENCES factures(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS devis_lignes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      devis_id INTEGER NOT NULL,
      designation TEXT NOT NULL,
      quantite REAL NOT NULL DEFAULT 1,
      prix_unitaire_cents INTEGER NOT NULL DEFAULT 0,
      taux_tva REAL NOT NULL DEFAULT 20.0,
      total_ht_cents INTEGER NOT NULL DEFAULT 0,
      total_tva_cents INTEGER NOT NULL DEFAULT 0,
      total_ttc_cents INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (devis_id) REFERENCES devis(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS factures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artisan_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      devis_id INTEGER,
      numero TEXT NOT NULL,
      statut TEXT NOT NULL DEFAULT 'emise',
      total_ht_cents INTEGER NOT NULL DEFAULT 0,
      total_tva_cents INTEGER NOT NULL DEFAULT 0,
      total_ttc_cents INTEGER NOT NULL DEFAULT 0,
      public_token TEXT UNIQUE NOT NULL,
      date_emission DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (artisan_id) REFERENCES artisans(id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (devis_id) REFERENCES devis(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS facture_lignes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      facture_id INTEGER NOT NULL,
      designation TEXT NOT NULL,
      quantite REAL NOT NULL DEFAULT 1,
      prix_unitaire_cents INTEGER NOT NULL DEFAULT 0,
      taux_tva REAL NOT NULL DEFAULT 20.0,
      total_ht_cents INTEGER NOT NULL DEFAULT 0,
      total_tva_cents INTEGER NOT NULL DEFAULT 0,
      total_ttc_cents INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (facture_id) REFERENCES factures(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS paiements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      facture_id INTEGER NOT NULL,
      artisan_id INTEGER NOT NULL,
      montant_cents INTEGER NOT NULL,
      date_paiement DATETIME DEFAULT CURRENT_TIMESTAMP,
      mode_paiement TEXT NOT NULL DEFAULT 'virement',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (facture_id) REFERENCES factures(id) ON DELETE CASCADE,
      FOREIGN KEY (artisan_id) REFERENCES artisans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS devis_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      devis_id INTEGER NOT NULL,
      auteur TEXT NOT NULL DEFAULT 'client',
      nom_expediteur TEXT,
      email TEXT,
      telephone TEXT,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (devis_id) REFERENCES devis(id) ON DELETE CASCADE
    );
  `);

  try {
    db.exec(`ALTER TABLE devis ADD COLUMN date_acceptation DATETIME`);
  } catch (_) {}
  try {
    db.exec(`ALTER TABLE devis ADD COLUMN signature_client TEXT`);
  } catch (_) {}

  // Optimization indexes for sub-millisecond lookups & fast joins
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_clients_artisan ON clients(artisan_id);
    CREATE INDEX IF NOT EXISTS idx_devis_artisan ON devis(artisan_id);
    CREATE INDEX IF NOT EXISTS idx_devis_token ON devis(public_token);
    CREATE INDEX IF NOT EXISTS idx_devis_lignes_devis ON devis_lignes(devis_id);
    CREATE INDEX IF NOT EXISTS idx_factures_artisan ON factures(artisan_id);
    CREATE INDEX IF NOT EXISTS idx_factures_token ON factures(public_token);
    CREATE INDEX IF NOT EXISTS idx_factures_devis ON factures(devis_id);
    CREATE INDEX IF NOT EXISTS idx_facture_lignes_facture ON facture_lignes(facture_id);
    CREATE INDEX IF NOT EXISTS idx_paiements_facture ON paiements(facture_id);
    CREATE INDEX IF NOT EXISTS idx_devis_messages_devis ON devis_messages(devis_id);
  `);
}

initSchema();

module.exports = db;

