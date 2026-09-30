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
 * Safely format a date for PDF output — prevents RangeError on invalid date values.
 */
function formatDate(dateVal) {
  if (!dateVal) return '-';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('fr-FR');
}

/**
 * Collect a PDFDocument into a Buffer, then send atomically.
 * Prevents ERR_HTTP_HEADERS_SENT by preventing doc listeners from flushing half-written PDF
 * if an error occurs during buildFn.
 */
function sendPDF(doc, filename, res, buildFn) {
  const chunks = [];
  let errorOccurred = false;

  doc.on('data', (chunk) => {
    if (!errorOccurred) {
      chunks.push(chunk);
    }
  });

  doc.on('end', () => {
    if (errorOccurred) return;
    try {
      const pdfBuffer = Buffer.concat(chunks);
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.end(pdfBuffer);
      }
    } catch (err) {
      console.error('PDF stream flush error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Erreur lors de la génération du PDF.', details: err.message });
      }
    }
  });

  doc.on('error', (err) => {
    console.error('PDFKit internal error:', err);
    errorOccurred = true;
    doc.removeAllListeners('data');
    doc.removeAllListeners('end');
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erreur lors de la génération du PDF.', details: err.message });
    }
  });

  try {
    buildFn(doc);
    doc.end();
  } catch (err) {
    console.error('PDF build error:', err);
    errorOccurred = true;
    doc.removeAllListeners('data');
    doc.removeAllListeners('end');
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erreur lors de la génération du PDF.', details: err.message });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DEVIS PDF
// ─────────────────────────────────────────────────────────────────────────────

function generateDevisPDF(rawDevis, rawClient, rawArtisan, rawLines, res) {
  const devis = rawDevis || {};
  const client = rawClient || {};
  const artisan = rawArtisan || {};
  const lines = Array.isArray(rawLines) ? rawLines : [];

  let doc;
  try {
    doc = new PDFDocument({ margin: 50, size: 'A4' });
  } catch (initErr) {
    console.error('[PDF] PDFDocument init failed:', initErr.stack || initErr.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erreur lors de la génération du PDF.', details: initErr.message });
    }
    return;
  }
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
    doc.text(`Version : ${safe(devis.version, '1')}`, 350, 86, { align: 'right' });
    doc.text(`Date : ${formatDate(devis.created_at)}`, 350, 100, { align: 'right' });

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
    doc.font('Helvetica').fontSize(10).text(safe(client.nom, 'Client'), 335, clientTop + 25);
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

    lines.forEach((line, index) => {
      if (!line) return;
      if (y > 700) { doc.addPage(); y = 50; }

      if (index % 2 === 1) {
        doc.rect(50, y - 4, 495, 20).fill('#f8fafc');
        doc.fillColor(primaryColor);
      }

      const qte = line.quantite != null ? String(line.quantite) : '1';
      const tva = line.taux_tva  != null ? `${line.taux_tva}%` : '0%';

      doc.text(safe(line.designation, 'Article'), 60,  y, { width: 215 });
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

function generateFacturePDF(rawFacture, rawClient, rawArtisan, rawLines, rawPaiements, res) {
  const facture = rawFacture || {};
  const client = rawClient || {};
  const artisan = rawArtisan || {};
  const lines = Array.isArray(rawLines) ? rawLines : [];
  const paiements = Array.isArray(rawPaiements) ? rawPaiements : [];

  let doc;
  try {
    doc = new PDFDocument({ margin: 50, size: 'A4' });
  } catch (initErr) {
    console.error('[PDF] PDFDocument init failed (facture):', initErr.stack || initErr.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erreur lors de la génération du PDF.', details: initErr.message });
    }
    return;
  }
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
    doc.text(`Date d'emission : ${formatDate(facture.date_emission)}`, 350, 86, { align: 'right' });

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
    doc.font('Helvetica').fontSize(10).text(safe(client.nom, 'Client'), 335, clientTop + 25);
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

    lines.forEach((line, index) => {
      if (!line) return;
      if (y > 650) { doc.addPage(); y = 50; }

      if (index % 2 === 1) {
        doc.rect(50, y - 4, 495, 20).fill('#f8fafc');
        doc.fillColor(primaryColor);
      }

      const qte = line.quantite != null ? String(line.quantite) : '1';
      const tva = line.taux_tva  != null ? `${line.taux_tva}%` : '0%';

      doc.text(safe(line.designation, 'Article'), 60,  y, { width: 215 });
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
    const totalPayeCents      = paiements.reduce((sum, p) => sum + ((p && p.montant_cents) || 0), 0);
    const soldeRestantCents   = Math.max(0, (facture.total_ttc_cents || 0) - totalPayeCents);

    if (paiements.length > 0) {
      doc.fillColor(primaryColor).fontSize(10).font('Helvetica-Bold')
         .text('Acomptes & Paiements recus :', 50, summaryTop);
      let payY = summaryTop + 15;
      doc.font('Helvetica').fontSize(8);
      paiements.forEach((p) => {
        if (!p) return;
        const dateP = formatDate(p.date_paiement);
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
