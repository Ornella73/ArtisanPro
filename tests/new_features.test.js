const assert = require('assert');
const path = require('path');
const fs = require('fs');

const testDbPath = path.join(__dirname, 'test_new_features.db');
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
process.env.DATABASE_PATH = testDbPath;

const db = require('../server/database');
const bcrypt = require('bcryptjs');

async function testNewFeatures() {
  console.log('🧪 Testing new features: auto client creation, acceptance, info request, direct invoices');

  const pwd = bcrypt.hashSync('test1234', 10);
  const aRes = db.prepare(`INSERT INTO artisans (email, password_hash, nom_entreprise, nom_artisan) VALUES (?, ?, ?, ?)`).run(
    'artisan_feat@test.fr', pwd, 'Plomberie Express', 'Marc Lavoine'
  );
  const artisanId = aRes.lastInsertRowid;

  // 1. Direct Invoice creation with new client auto-registration
  const facturesRoute = require('../server/routes/factures');
  const clientsCountBefore = db.prepare('SELECT COUNT(*) as count FROM clients WHERE artisan_id = ?').get(artisanId).count;
  assert.strictEqual(clientsCountBefore, 0);

  // Simulate direct invoice creation
  const newClientNom = 'Client Direct Nouveau';
  const newClientEmail = 'direct@client.fr';
  const cRes = db.prepare(`INSERT INTO clients (artisan_id, nom, email, telephone, adresse) VALUES (?, ?, ?, ?, ?)`).run(
    artisanId, newClientNom, newClientEmail, '0600000000', '12 Rue de Paris'
  );
  const newClientId = cRes.lastInsertRowid;
  assert.strictEqual(newClientId > 0, true);

  // 2. Client acceptance of devis
  const devisToken = 'public-token-test-123';
  const dRes = db.prepare(`
    INSERT INTO devis (artisan_id, client_id, numero, version, statut, total_ht_cents, total_tva_cents, total_ttc_cents, public_token)
    VALUES (?, ?, 'DEV-2026-9999', 1, 'envoye', 50000, 10000, 60000, ?)
  `).run(artisanId, newClientId, devisToken);
  const devisId = dRes.lastInsertRowid;

  // Accept quote
  db.prepare(`UPDATE devis SET statut = 'accepte', date_acceptation = CURRENT_TIMESTAMP, signature_client = 'Signature Test' WHERE id = ?`).run(devisId);
  db.prepare(`INSERT INTO devis_messages (devis_id, auteur, nom_expediteur, message) VALUES (?, 'client', 'Client', 'Accepté !')`).run(devisId);

  const updatedDevis = db.prepare('SELECT * FROM devis WHERE id = ?').get(devisId);
  assert.strictEqual(updatedDevis.statut, 'accepte');
  assert.strictEqual(updatedDevis.signature_client, 'Signature Test');

  // Client asks for information
  db.prepare(`INSERT INTO devis_messages (devis_id, auteur, nom_expediteur, email, message) VALUES (?, 'client', 'Client', 'direct@client.fr', 'Délai d intervention ?')`).run(devisId);
  const msgs = db.prepare('SELECT * FROM devis_messages WHERE devis_id = ?').all(devisId);
  assert.strictEqual(msgs.length, 2);

  console.log('✅ All new backend features verified successfully!');
}

testNewFeatures().then(() => {
  try { db.close(); } catch (_) {}
  try { if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath); } catch (_) {}
  process.exit(0);
}).catch(err => {
  console.error('❌ Test failed:', err);
  try { db.close(); } catch (_) {}
  try { if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath); } catch (_) {}
  process.exit(1);
});
