const PDFDocument = require('pdfkit');
const { formatCentsToEuros } = require('./calculator');

/**
 * Safely stringify a value for PDF text — prevents null/undefined crashes.
 */
function safe(val, fallback = '') {
  if (val === null || val === undefined) return fallback;
  return String(val);
}

/**
 * Collect a PDFDocument into a Buffer, then send atomically.
 * This prevents ERR_HTTP_HEADERS_SENT: headers are only set AFTER
 * the full PDF is successfully generated in memory.
 */
function sendPDF(doc, filename, res, buildFn) {
  const chunks = [];

  doc.on('data', (chunk) => chunks.push(chunk));

  doc.on('end', () => {
    try {
      const pdfBuffer = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.end(pdfBuffer);
    } catch (err) {
      console.error('PDF send error:', err);
    }
  });

  doc.on('error', (err) => {
    console.error('PDFKit internal error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erreur interne lors de la génération du PDF.' });
    }
  });

  try {
    buildFn(doc);
    doc.end();
  } catch (err) {
    console.error('PDF build error:', err);
    // end the doc to flush & avoid hanging response
    try { doc.end(); } catch (_) {}
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Erreur lors de la génération du PDF : ' + err.message
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DEVIS PDF
// ─────────────────────────────────────────────────────────────────────────────

function generateDevisPDF(devis, client, artisan, lines, res) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const filename = `Devis_${safe(devis.numero, 'DEV')}_v${safe(devis.version, '1')}.pdf`;

  sendPDF(doc, filename, res, (doc) => {
    const primaryColor   = '#1e293b';
    const secondaryColor = '#0284c7';
    const lightBg        = '#f8fafc';

    // ── Artisan block (top left) ──────────────────────────────────────────
    doc.fillColor(primaryColor).fontSize(20).font('Helvetica-Bold')
       .text(safe(artisan.nom_entreprise, 'Artisan'), 50, 45);
    doc.fontSize(10).font('Helvetica').fillColor('#64748b');
    doc.text(`Artisan : ${safe(artisan.nom_artisan)}`, 50, 70);
    if (artisan.siret)     doc.text(`SIRET : ${safe(artisan.siret)}`, 50, 84);
    if (artisan.telephone) doc.text(`Tél : ${safe(artisan.telephone)}`, 50, 98);
    if (artisan.email)     doc.text(`Email : ${safe(artisan.email)}`, 50, 112);
    if (artisan.adresse)   doc.text(safe(artisan.adresse), 50, 126, { width: 220 });

    // ── Document title (top right) ────────────────────────────────────────
    doc.fillColor(secondaryColor).fontSize(22).font('Helvetica-Bold')
       .text('DEVIS', 350, 45, { align: 'right' });
    doc.fontSize(10).font('Helvetica-Bold').fillColor(primaryColor);
    doc.text(`N° ${safe(devis.numero)}`, 350, 72, { align: 'right' });
    doc.font('Helvetica').fillColor('#64748b');
    doc.text(`Version : ${safe(devis.version)}`, 350, 86, { align: 'right' });

    const dateStr = devis.created_at
      ? new Date(devis.created_at).toLocaleDateString('fr-FR')
      : '-';
    doc.text(`Date : ${dateStr}`, 350, 100, { align: 'right' });

    const statut = safe(devis.statut, 'brouillon');
    let statusLabel = statut.toUpperCase();
    if (statut === 'envoye')   statusLabel = 'ENVOYE';
    if (statut === 'accepte')  statusLabel = 'ACCEPTE';
    if (statut === 'converti') statusLabel = 'CONVERTI EN FACTURE';
    if (statut === 'remplace') statusLabel = 'REMPLACE';
    doc.text(`Statut : ${statusLabel}`, 350, 114, { align: 'right' });

    doc.moveDown(2);

    // ── Client box ────────────────────────────────────────────────────────
    const clientTop = 165;
    doc.rect(320, clientTop, 225, 80).fillAndStroke(lightBg, '#e2e8f0');
    doc.fillColor(primaryColor).fontSize(10).font('Helvetica-Bold')
       .text('CLIENT', 335, clientTop + 10);
    doc.font('Helvetica').fontSize(10).text(safe(client.nom), 335, clientTop + 25);
    if (client.adresse) doc.text(safe(client.adresse), 335, clientTop + 40, { width: 200 });
    if (client.email)   doc.text(`Email : ${safe(client.email)}`, 335, clientTop + 55, { width: 200 });

    // ── Table header ──────────────────────────────────────────────────────
    const tableTop = 270;
    doc.rect(50, tableTop, 495, 24).fill(secondaryColor);
    doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
    doc.text('Designation',  60,  tableTop + 7, { width: 220 });
    doc.text('Qte',         280,  tableTop + 7, { width: 50,  align: 'center' });
    doc.text('P.U. HT',     340,  tableTop + 7, { width: 60,  align: 'right'  });
    doc.text('TVA',         410,  tableTop + 7, { width: 40,  align: 'right'  });
    doc.text('Total HT',    460,  tableTop + 7, { width: 75,  align: 'right'  });

    // ── Table rows ────────────────────────────────────────────────────────
    let y = tableTop + 30;
    doc.font('Helvetica').fontSize(9).fillColor(primaryColor);

    (lines || []).forEach((line, index) => {
      if (y > 700) { doc.addPage(); y = 50; }

      if (index % 2 === 1) {
        doc.rect(50, y - 4, 495, 20).fill('#f8fafc');
        doc.fillColor(primaryColor);
      }

      const qte = line.quantite != null ? String(line.quantite) : '1';
      const tva = line.taux_tva  != null ? `${line.taux_tva}%` : '0%';

      doc.text(safe(line.designation), 60,  y, { width: 215 });
      doc.text(qte,                    280, y, { width: 50,  align: 'center' });
      doc.text(formatCentsToEuros(line.prix_unitaire_cents || 0), 340, y, { width: 60, align: 'right' });
      doc.text(tva,                    410, y, { width: 40,  align: 'right'  });
      doc.text(formatCentsToEuros(line.total_ht_cents || 0),      460, y, { width: 75, align: 'right' });

      y += 22;
    });

    doc.rect(50, y, 495, 1).fill('#cbd5e1');
    y += 15;

    // ── Summary box ───────────────────────────────────────────────────────
    const summaryTop = y;
    doc.rect(340, summaryTop, 205, 75).fillAndStroke('#f1f5f9', '#e2e8f0');

    doc.fillColor(primaryColor).fontSize(10).font('Helvetica');
    doc.text('Total HT :',  355, summaryTop + 10);
    doc.text(formatCentsToEuros(devis.total_ht_cents  || 0), 440, summaryTop + 10, { align: 'right', width: 95 });

    doc.text('Total TVA :', 355, summaryTop + 28);
    doc.text(formatCentsToEuros(devis.total_tva_cents || 0), 440, summaryTop + 28, { align: 'right', width: 95 });

    doc.font('Helvetica-Bold').fontSize(12).fillColor(secondaryColor);
    doc.text('Total TTC :', 355, summaryTop + 48);
    doc.text(formatCentsToEuros(devis.total_ttc_cents || 0), 440, summaryTop + 48, { align: 'right', width: 95 });

    // ── Footer ────────────────────────────────────────────────────────────
    doc.fontSize(8).font('Helvetica').fillColor('#94a3b8').text(
      'Document genere par ArtisanPro - Application de gestion devis & factures pour artisans independants.',
      50, 780, { align: 'center', width: 495 }
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// FACTURE PDF
// ─────────────────────────────────────────────────────────────────────────────

function generateFacturePDF(facture, client, artisan, lines, paiements, res) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const filename = `Facture_${safe(facture.numero, 'FAC')}.pdf`;

  sendPDF(doc, filename, res, (doc) => {
    const primaryColor = '#1e293b';
    const accentColor  = '#059669';
    const lightBg      = '#f8fafc';

    // ── Artisan block ─────────────────────────────────────────────────────
    doc.fillColor(primaryColor).fontSize(20).font('Helvetica-Bold')
       .text(safe(artisan.nom_entreprise, 'Artisan'), 50, 45);
    doc.fontSize(10).font('Helvetica').fillColor('#64748b');
    doc.text(`Artisan : ${safe(artisan.nom_artisan)}`, 50, 70);
    if (artisan.siret)     doc.text(`SIRET : ${safe(artisan.siret)}`, 50, 84);
    if (artisan.telephone) doc.text(`Tel : ${safe(artisan.telephone)}`, 50, 98);
    if (artisan.email)     doc.text(`Email : ${safe(artisan.email)}`, 50, 112);
    if (artisan.adresse)   doc.text(safe(artisan.adresse), 50, 126, { width: 220 });

    // ── Document title ────────────────────────────────────────────────────
    doc.fillColor(accentColor).fontSize(22).font('Helvetica-Bold')
       .text('FACTURE', 350, 45, { align: 'right' });
    doc.fontSize(10).font('Helvetica-Bold').fillColor(primaryColor);
    doc.text(`N° ${safe(facture.numero)}`, 350, 72, { align: 'right' });
    doc.font('Helvetica').fillColor('#64748b');

    const emissionStr = facture.date_emission
      ? new Date(facture.date_emission).toLocaleDateString('fr-FR')
      : '-';
    doc.text(`Date d'emission : ${emissionStr}`, 350, 86, { align: 'right' });

    const fStatut = safe(facture.statut, 'emise');
    let statusLabel = 'EMISE';
    if (fStatut === 'partiellement_payee') statusLabel = 'PARTIELLEMENT PAYEE';
    if (fStatut === 'payee')   statusLabel = 'PAYEE';
    if (fStatut === 'annulee') statusLabel = 'ANNULEE';
    doc.text(`Statut : ${statusLabel}`, 350, 100, { align: 'right' });

    doc.moveDown(2);

    // ── Client box ────────────────────────────────────────────────────────
    const clientTop = 165;
    doc.rect(320, clientTop, 225, 80).fillAndStroke(lightBg, '#e2e8f0');
    doc.fillColor(primaryColor).fontSize(10).font('Helvetica-Bold')
       .text('CLIENT', 335, clientTop + 10);
    doc.font('Helvetica').fontSize(10).text(safe(client.nom), 335, clientTop + 25);
    if (client.adresse) doc.text(safe(client.adresse), 335, clientTop + 40, { width: 200 });
    if (client.email)   doc.text(`Email : ${safe(client.email)}`, 335, clientTop + 55, { width: 200 });

    // ── Table header ──────────────────────────────────────────────────────
    const tableTop = 270;
    doc.rect(50, tableTop, 495, 24).fill(accentColor);
    doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
    doc.text('Designation',  60,  tableTop + 7, { width: 220 });
    doc.text('Qte',         280,  tableTop + 7, { width: 50,  align: 'center' });
    doc.text('P.U. HT',     340,  tableTop + 7, { width: 60,  align: 'right'  });
    doc.text('TVA',         410,  tableTop + 7, { width: 40,  align: 'right'  });
    doc.text('Total HT',    460,  tableTop + 7, { width: 75,  align: 'right'  });

    // ── Table rows ────────────────────────────────────────────────────────
    let y = tableTop + 30;
    doc.font('Helvetica').fontSize(9).fillColor(primaryColor);

    (lines || []).forEach((line, index) => {
      if (y > 650) { doc.addPage(); y = 50; }

      if (index % 2 === 1) {
        doc.rect(50, y - 4, 495, 20).fill('#f8fafc');
        doc.fillColor(primaryColor);
      }

      const qte = line.quantite != null ? String(line.quantite) : '1';
      const tva = line.taux_tva  != null ? `${line.taux_tva}%` : '0%';

      doc.text(safe(line.designation), 60,  y, { width: 215 });
      doc.text(qte,                    280, y, { width: 50,  align: 'center' });
      doc.text(formatCentsToEuros(line.prix_unitaire_cents || 0), 340, y, { width: 60, align: 'right' });
      doc.text(tva,                    410, y, { width: 40,  align: 'right'  });
      doc.text(formatCentsToEuros(line.total_ht_cents || 0),      460, y, { width: 75, align: 'right' });

      y += 22;
    });

    doc.rect(50, y, 495, 1).fill('#cbd5e1');
    y += 15;

    // ── Payments + Summary ────────────────────────────────────────────────
    const summaryTop = y;
    const safePaiements = paiements || [];
    const totalPayeCents      = safePaiements.reduce((sum, p) => sum + (p.montant_cents || 0), 0);
    const soldeRestantCents   = Math.max(0, (facture.total_ttc_cents || 0) - totalPayeCents);

    if (safePaiements.length > 0) {
      doc.fillColor(primaryColor).fontSize(10).font('Helvetica-Bold')
         .text('Acomptes & Paiements recus :', 50, summaryTop);
      let payY = summaryTop + 15;
      doc.font('Helvetica').fontSize(8);
      safePaiements.forEach((p) => {
        const dateP = p.date_paiement ? new Date(p.date_paiement).toLocaleDateString('fr-FR') : '-';
        const mode  = p.mode_paiement ? safe(p.mode_paiement).toUpperCase() : 'VIREMENT';
        doc.text(
          `${dateP} (${mode}) : ${formatCentsToEuros(p.montant_cents || 0)}`,
          50, payY
        );
        payY += 14;
      });
    }

    // Summary box
    doc.rect(340, summaryTop, 205, 95).fillAndStroke('#f1f5f9', '#e2e8f0');

    doc.fillColor(primaryColor).fontSize(10).font('Helvetica');
    doc.text('Total HT :',  355, summaryTop + 10);
    doc.text(formatCentsToEuros(facture.total_ht_cents  || 0), 440, summaryTop + 10, { align: 'right', width: 95 });

    doc.text('Total TVA :', 355, summaryTop + 26);
    doc.text(formatCentsToEuros(facture.total_tva_cents || 0), 440, summaryTop + 26, { align: 'right', width: 95 });

    doc.font('Helvetica-Bold').fontSize(11).fillColor(primaryColor);
    doc.text('Total TTC :', 355, summaryTop + 44);
    doc.text(formatCentsToEuros(facture.total_ttc_cents || 0), 440, summaryTop + 44, { align: 'right', width: 95 });

    doc.font('Helvetica').fontSize(9).fillColor('#059669');
    doc.text('Deja paye :', 355, summaryTop + 62);
    doc.text(formatCentsToEuros(totalPayeCents), 440, summaryTop + 62, { align: 'right', width: 95 });

    doc.font('Helvetica-Bold').fontSize(11).fillColor(soldeRestantCents === 0 ? '#059669' : '#dc2626');
    doc.text('Reste a payer :', 355, summaryTop + 78);
    doc.text(formatCentsToEuros(soldeRestantCents), 440, summaryTop + 78, { align: 'right', width: 95 });

    // ── Footer ────────────────────────────────────────────────────────────
    doc.fontSize(8).font('Helvetica').fillColor('#94a3b8').text(
      'Facture emise via ArtisanPro. Ce document est definitif et verrouille en lecture seule.',
      50, 780, { align: 'center', width: 495 }
    );
  });
}

module.exports = { generateDevisPDF, generateFacturePDF };
