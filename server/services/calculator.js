/**
 * Single Source of Truth Calculation Function for Devis and Factures.
 * 
 * Rules:
 * 1. All amounts stored and computed in integer CENTS (centimes).
 * 2. Line total HT = Math.round(quantite * prix_unitaire_cents)
 * 3. Line TVA = Math.round(line_ht * (taux_tva / 100))
 * 4. Line TTC = line_ht + line_tva
 * 5. Document Total HT = sum of line_ht
 * 6. Document Total TVA = sum of line_tva
 * 7. Document Total TTC = Total HT + Total TVA
 */
function calculateDocumentTotals(lignes = []) {
  let totalHTCents = 0;
  let totalTVACents = 0;

  const processedLignes = lignes.map((ligne) => {
    const designation = (ligne.designation || '').trim();
    const quantite = parseFloat(ligne.quantite) > 0 ? parseFloat(ligne.quantite) : 1;
    // Unit price in integer centimes
    const prixUnitaireCents = Math.round(Number(ligne.prix_unitaire_cents) || 0);
    const tauxTva = Number(ligne.taux_tva) !== undefined && !isNaN(Number(ligne.taux_tva))
      ? Number(ligne.taux_tva)
      : 20.0;

    // Line total calculations with rounding to integer centimes
    const totalLineHT = Math.round(quantite * prixUnitaireCents);
    const totalLineTVA = Math.round(totalLineHT * (tauxTva / 100));
    const totalLineTTC = totalLineHT + totalLineTVA;

    totalHTCents += totalLineHT;
    totalTVACents += totalLineTVA;

    return {
      id: ligne.id || null,
      designation,
      quantite,
      prix_unitaire_cents: prixUnitaireCents,
      taux_tva: tauxTva,
      total_ht_cents: totalLineHT,
      total_tva_cents: totalLineTVA,
      total_ttc_cents: totalLineTTC
    };
  });

  const totalTTCCents = totalHTCents + totalTVACents;

  return {
    lignes: processedLignes,
    total_ht_cents: totalHTCents,
    total_tva_cents: totalTVACents,
    total_ttc_cents: totalTTCCents
  };
}

/**
 * Format centimes to French Euros string (e.g. 1050 -> "10,50 €")
 */
function formatCentsToEuros(cents) {
  const amount = (Number(cents) || 0) / 100;
  const formatted = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  }).format(amount);
  return formatted.replace(/[\u202f\u00a0]/g, ' ');
}

module.exports = {
  calculateDocumentTotals,
  formatCentsToEuros
};
