const PDFDocument = require('pdfkit');
const { formatCentsToEuros } = require('./calculator');

/**
 * Generate Devis PDF Stream
 */
function generateDevisPDF(devis, client, artisan, lines, res) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Devis_${devis.numero}_v${devis.version}.pdf"`);

  doc.pipe(res);

  // Colors
  const primaryColor = '#1e293b'; // Slate 800
  const secondaryColor = '#0284c7'; // Sky 600
  const lightBg = '#f8fafc';

  // Header - Artisan Info (Top Left)
  doc.fillColor(primaryColor).fontSize(20).font('Helvetica-Bold').text(artisan.nom_entreprise, 50, 45);
  doc.fontSize(10).font('Helvetica').fillColor('#64748b');
  doc.text(`Artisan : ${artisan.nom_artisan}`, 50, 70);
  if (artisan.siret) doc.text(`SIRET : ${artisan.siret}`, 50, 84);
  if (artisan.telephone) doc.text(`Tél : ${artisan.telephone}`, 50, 98);
  if (artisan.email) doc.text(`Email : ${artisan.email}`, 50, 112);
  if (artisan.adresse) doc.text(artisan.adresse, 50, 126, { width: 220 });

  // Header - Document Title (Top Right)
  doc.fillColor(secondaryColor).fontSize(22).font('Helvetica-Bold').text('DEVIS', 350, 45, { align: 'right' });
  doc.fontSize(10).font('Helvetica-Bold').fillColor(primaryColor);
  doc.text(`N° ${devis.numero}`, 350, 72, { align: 'right' });
  doc.font('Helvetica').fillColor('#64748b');
  doc.text(`Version : ${devis.version}`, 350, 86, { align: 'right' });
  doc.text(`Date : ${new Date(devis.created_at).toLocaleDateString('fr-FR')}`, 350, 100, { align: 'right' });
  
  let statusLabel = devis.statut.toUpperCase();
  if (devis.statut === 'envoye') statusLabel = 'ENVOYÉ';
  if (devis.statut === 'accepte') statusLabel = 'ACCEPTÉ';
  if (devis.statut === 'converti') statusLabel = 'CONVERTI EN FACTURE';
  if (devis.statut === 'remplace') statusLabel = 'REMPLACÉ';
  doc.text(`Statut : ${statusLabel}`, 350, 114, { align: 'right' });

  doc.moveDown(2);

  // Client Box
  const clientTop = 165;
  doc.rect(320, clientTop, 225, 80).fillAndStroke(lightBg, '#e2e8f0');
  doc.fillColor(primaryColor).fontSize(10).font('Helvetica-Bold').text('CLIENT', 335, clientTop + 10);
  doc.font('Helvetica').fontSize(10).text(client.nom, 335, clientTop + 25);
  if (client.adresse) doc.text(client.adresse, 335, clientTop + 40, { width: 200 });
  if (client.email) doc.text(`Email : ${client.email}`, 335, clientTop + 55, { width: 200 });

  // Table Header
  const tableTop = 270;
  doc.rect(50, tableTop, 495, 24).fill(secondaryColor);
  doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
  doc.text('Désignation', 60, tableTop + 7, { width: 220 });
  doc.text('Qté', 280, tableTop + 7, { width: 50, align: 'center' });
  doc.text('P.U. HT', 340, tableTop + 7, { width: 60, align: 'right' });
  doc.text('TVA', 410, tableTop + 7, { width: 40, align: 'right' });
  doc.text('Total HT', 460, tableTop + 7, { width: 75, align: 'right' });

  // Table Lines
  let y = tableTop + 30;
  doc.font('Helvetica').fontSize(9).fillColor(primaryColor);

  lines.forEach((line, index) => {
    if (y > 700) {
      doc.addPage();
      y = 50;
    }

    if (index % 2 === 1) {
      doc.rect(50, y - 4, 495, 20).fill('#f8fafc');
      doc.fillColor(primaryColor);
    }

    doc.text(line.designation, 60, y, { width: 215 });
    doc.text(line.quantite.toString(), 280, y, { width: 50, align: 'center' });
    doc.text(formatCentsToEuros(line.prix_unitaire_cents), 340, y, { width: 60, align: 'right' });
    doc.text(`${line.taux_tva}%`, 410, y, { width: 40, align: 'right' });
    doc.text(formatCentsToEuros(line.total_ht_cents), 460, y, { width: 75, align: 'right' });

    y += 22;
  });

  doc.rect(50, y, 495, 1).fill('#cbd5e1');
  y += 15;

  // Summary Box (Right Aligned)
  const summaryTop = y;
  doc.rect(340, summaryTop, 205, 75).fillAndStroke('#f1f5f9', '#e2e8f0');

  doc.fillColor(primaryColor).fontSize(10).font('Helvetica');
  doc.text('Total HT :', 355, summaryTop + 10);
  doc.text(formatCentsToEuros(devis.total_ht_cents), 440, summaryTop + 10, { align: 'right', width: 95 });

  doc.text('Total TVA :', 355, summaryTop + 28);
  doc.text(formatCentsToEuros(devis.total_tva_cents), 440, summaryTop + 28, { align: 'right', width: 95 });

  doc.font('Helvetica-Bold').fontSize(12).fillColor(secondaryColor);
  doc.text('Total TTC :', 355, summaryTop + 48);
  doc.text(formatCentsToEuros(devis.total_ttc_cents), 440, summaryTop + 48, { align: 'right', width: 95 });

  // Footer
  doc.fontSize(8).font('Helvetica').fillColor('#94a3b8').text(
    'Document généré par ArtisanPro - Application de gestion devis & factures pour artisans indépendants.',
    50,
    780,
    { align: 'center', width: 495 }
  );

  doc.end();
}

/**
 * Generate Facture PDF Stream
 */
function generateFacturePDF(facture, client, artisan, lines, paiements, res) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Facture_${facture.numero}.pdf"`);

  doc.pipe(res);

  // Colors
  const primaryColor = '#1e293b';
  const accentColor = '#059669'; // Emerald 600
  const lightBg = '#f8fafc';

  // Header - Artisan Info
  doc.fillColor(primaryColor).fontSize(20).font('Helvetica-Bold').text(artisan.nom_entreprise, 50, 45);
  doc.fontSize(10).font('Helvetica').fillColor('#64748b');
  doc.text(`Artisan : ${artisan.nom_artisan}`, 50, 70);
  if (artisan.siret) doc.text(`SIRET : ${artisan.siret}`, 50, 84);
  if (artisan.telephone) doc.text(`Tél : ${artisan.telephone}`, 50, 98);
  if (artisan.email) doc.text(`Email : ${artisan.email}`, 50, 112);
  if (artisan.adresse) doc.text(artisan.adresse, 50, 126, { width: 220 });

  // Header - Document Title
  doc.fillColor(accentColor).fontSize(22).font('Helvetica-Bold').text('FACTURE', 350, 45, { align: 'right' });
  doc.fontSize(10).font('Helvetica-Bold').fillColor(primaryColor);
  doc.text(`N° ${facture.numero}`, 350, 72, { align: 'right' });
  doc.font('Helvetica').fillColor('#64748b');
  doc.text(`Date d'émission : ${new Date(facture.date_emission).toLocaleDateString('fr-FR')}`, 350, 86, { align: 'right' });

  let statusLabel = 'ÉMISE';
  if (facture.statut === 'partiellement_payee') statusLabel = 'PARTIELLEMENT PAYÉE';
  if (facture.statut === 'payee') statusLabel = 'PAYÉE';
  if (facture.statut === 'annulee') statusLabel = 'ANNULÉE';
  doc.text(`Statut : ${statusLabel}`, 350, 100, { align: 'right' });

  doc.moveDown(2);

  // Client Box
  const clientTop = 165;
  doc.rect(320, clientTop, 225, 80).fillAndStroke(lightBg, '#e2e8f0');
  doc.fillColor(primaryColor).fontSize(10).font('Helvetica-Bold').text('CLIENT', 335, clientTop + 10);
  doc.font('Helvetica').fontSize(10).text(client.nom, 335, clientTop + 25);
  if (client.adresse) doc.text(client.adresse, 335, clientTop + 40, { width: 200 });
  if (client.email) doc.text(`Email : ${client.email}`, 335, clientTop + 55, { width: 200 });

  // Table Header
  const tableTop = 270;
  doc.rect(50, tableTop, 495, 24).fill(accentColor);
  doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
  doc.text('Désignation', 60, tableTop + 7, { width: 220 });
  doc.text('Qté', 280, tableTop + 7, { width: 50, align: 'center' });
  doc.text('P.U. HT', 340, tableTop + 7, { width: 60, align: 'right' });
  doc.text('TVA', 410, tableTop + 7, { width: 40, align: 'right' });
  doc.text('Total HT', 460, tableTop + 7, { width: 75, align: 'right' });

  // Table Lines
  let y = tableTop + 30;
  doc.font('Helvetica').fontSize(9).fillColor(primaryColor);

  lines.forEach((line, index) => {
    if (y > 650) {
      doc.addPage();
      y = 50;
    }

    if (index % 2 === 1) {
      doc.rect(50, y - 4, 495, 20).fill('#f8fafc');
      doc.fillColor(primaryColor);
    }

    doc.text(line.designation, 60, y, { width: 215 });
    doc.text(line.quantite.toString(), 280, y, { width: 50, align: 'center' });
    doc.text(formatCentsToEuros(line.prix_unitaire_cents), 340, y, { width: 60, align: 'right' });
    doc.text(`${line.taux_tva}%`, 410, y, { width: 40, align: 'right' });
    doc.text(formatCentsToEuros(line.total_ht_cents), 460, y, { width: 75, align: 'right' });

    y += 22;
  });

  doc.rect(50, y, 495, 1).fill('#cbd5e1');
  y += 15;

  // Payments & Summary
  const summaryTop = y;
  
  // Left: Payments history
  const totalPayeCents = paiements.reduce((sum, p) => sum + p.montant_cents, 0);
  const soldeRestantCents = Math.max(0, facture.total_ttc_cents - totalPayeCents);

  if (paiements.length > 0) {
    doc.fillColor(primaryColor).fontSize(10).font('Helvetica-Bold').text('Acomptes & Paiements reçus :', 50, summaryTop);
    let payY = summaryTop + 15;
    doc.font('Helvetica').fontSize(8);
    paiements.forEach((p) => {
      doc.text(`${new Date(p.date_paiement).toLocaleDateString('fr-FR')} (${p.mode_paiement.toUpperCase()}) : ${formatCentsToEuros(p.montant_cents)}`, 50, payY);
      payY += 14;
    });
  }

  // Right: Summary Box
  doc.rect(340, summaryTop, 205, 95).fillAndStroke('#f1f5f9', '#e2e8f0');

  doc.fillColor(primaryColor).fontSize(10).font('Helvetica');
  doc.text('Total HT :', 355, summaryTop + 10);
  doc.text(formatCentsToEuros(facture.total_ht_cents), 440, summaryTop + 10, { align: 'right', width: 95 });

  doc.text('Total TVA :', 355, summaryTop + 26);
  doc.text(formatCentsToEuros(facture.total_tva_cents), 440, summaryTop + 26, { align: 'right', width: 95 });

  doc.font('Helvetica-Bold').fontSize(11).fillColor(primaryColor);
  doc.text('Total TTC :', 355, summaryTop + 44);
  doc.text(formatCentsToEuros(facture.total_ttc_cents), 440, summaryTop + 44, { align: 'right', width: 95 });

  doc.font('Helvetica').fontSize(9).fillColor('#059669');
  doc.text('Déjà payé :', 355, summaryTop + 62);
  doc.text(formatCentsToEuros(totalPayeCents), 440, summaryTop + 62, { align: 'right', width: 95 });

  doc.font('Helvetica-Bold').fontSize(11).fillColor(soldeRestantCents === 0 ? '#059669' : '#dc2626');
  doc.text('Reste à payer :', 355, summaryTop + 78);
  doc.text(formatCentsToEuros(soldeRestantCents), 440, summaryTop + 78, { align: 'right', width: 95 });

  // Footer
  doc.fontSize(8).font('Helvetica').fillColor('#94a3b8').text(
    'Facture émise via ArtisanPro. Conformément aux règles, ce document est définitif et verrouillé en lecture seule.',
    50,
    780,
    { align: 'center', width: 495 }
  );

  doc.end();
}

module.exports = {
  generateDevisPDF,
  generateFacturePDF
};
