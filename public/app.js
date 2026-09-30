/**
 * ArtiFlow / ArtisanPro Client Application Script
 */

function safeJSONParse(str) {
  try { return str ? JSON.parse(str) : null; } catch (_) { return null; }
}

let state = {
  token: localStorage.getItem('artiflow_token') || null,
  artisan: safeJSONParse(localStorage.getItem('artiflow_user')),
  currentView: 'dashboard',
  clients: [],
  devis: [],
  factures: [],
  theme: localStorage.getItem('artiflow_theme') || 'light'
};

// Set theme
document.documentElement.setAttribute('data-theme', state.theme);

window.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  if (path.startsWith('/public/devis/') || path.startsWith('/public/factures/')) {
    loadPublicView(path);
    return;
  }

  if (state.token && state.artisan) {
    showMainApp();
  } else {
    showAuthApp();
  }
});

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem('artiflow_theme', state.theme);
  const icon = document.getElementById('theme-icon');
  if (icon) icon.className = state.theme === 'dark' ? 'ri-sun-line' : 'ri-moon-line';
}

async function api(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  try {
    const res = await fetch(`/api${endpoint}`, { ...options, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Une erreur est survenue.');
    return data;
  } catch (err) {
    alert(err.message);
    throw err;
  }
}

// -----------------------------------------------------------------
// AUTH & ONBOARDING (Matches Maquette 1 & 2)
// -----------------------------------------------------------------
function showAuthApp() {
  document.getElementById('sidebar').style.display = 'none';
  document.getElementById('bottom-nav').style.display = 'none';
  document.getElementById('main-container').style.display = 'none';
  document.getElementById('public-container').style.display = 'none';
  document.getElementById('auth-container').style.display = 'flex';
}

function showLoginForm() {
  document.getElementById('login-form').style.display = 'block';
  document.getElementById('register-form').style.display = 'none';
}

function showRegisterForm() {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'block';
}

function showMainApp() {
  document.getElementById('auth-container').style.display = 'none';
  document.getElementById('public-container').style.display = 'none';
  
  if (window.innerWidth <= 768) {
    document.getElementById('bottom-nav').style.display = 'flex';
    document.getElementById('sidebar').style.display = 'none';
  } else {
    document.getElementById('sidebar').style.display = 'flex';
    document.getElementById('bottom-nav').style.display = 'none';
  }

  document.getElementById('main-container').style.display = 'block';

  document.getElementById('artisan-company').innerText = state.artisan.nom_entreprise || 'Électricité & Co';
  document.getElementById('artisan-name').innerText = state.artisan.nom_artisan || 'Amine Traoré';

  const initials = (state.artisan.nom_artisan || 'AT').split(' ').map(n => n[0]).join('').toUpperCase();
  document.getElementById('user-avatar').innerText = initials;

  switchView(state.currentView);
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    state.token = data.token;
    state.artisan = data.artisan;
    localStorage.setItem('artiflow_token', data.token);
    localStorage.setItem('artiflow_user', JSON.stringify(data.artisan));

    showMainApp();
  } catch (err) {}
}

async function handleRegister(e) {
  e.preventDefault();
  const nom_entreprise = document.getElementById('reg-company').value;
  const nom_artisan = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;

  try {
    const data = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ nom_entreprise, nom_artisan, email, password })
    });

    state.token = data.token;
    state.artisan = data.artisan;
    localStorage.setItem('artiflow_token', data.token);
    localStorage.setItem('artiflow_user', JSON.stringify(data.artisan));

    showMainApp();
  } catch (err) {}
}

async function quickDemoLogin() {
  const demoEmail = `artisan.demo.${Date.now()}@artiflow.fr`;
  const password = 'demoPassword123';

  try {
    const data = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        nom_entreprise: 'Électricité & Co',
        nom_artisan: 'Amine Traoré',
        email: demoEmail,
        password: password,
        telephone: '06 90 12 34 56',
        siret: '89123456700019'
      })
    });

    state.token = data.token;
    state.artisan = data.artisan;
    localStorage.setItem('artiflow_token', data.token);
    localStorage.setItem('artiflow_user', JSON.stringify(data.artisan));

    // Seed default client from Maquette 1 & 2
    await api('/clients', {
      method: 'POST',
      body: JSON.stringify({
        nom: 'SARL Bâtir Plus',
        email: 'contact@batirplus.fr',
        telephone: '06 91 23 45 67',
        adresse: '15 Boulevard Haussmann, 75009 Paris'
      })
    });

    await api('/clients', {
      method: 'POST',
      body: JSON.stringify({
        nom: 'Aminata Traoré',
        email: 'aminata@exemple.com',
        telephone: '06 90 12 34 56',
        adresse: '8 Rue des Fleurs, 69002 Lyon'
      })
    });

    showMainApp();
  } catch (err) {}
}

function logout() {
  state.token = null;
  state.artisan = null;
  localStorage.removeItem('artiflow_token');
  localStorage.removeItem('artiflow_user');
  showAuthApp();
}

// -----------------------------------------------------------------
// NAVIGATION
// -----------------------------------------------------------------
function switchView(viewName) {
  state.currentView = viewName;

  document.querySelectorAll('.nav-link, .bottom-nav-btn').forEach(btn => {
    if (btn.dataset.view === viewName) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  document.querySelectorAll('.view-section').forEach(s => s.style.display = 'none');
  document.getElementById(`view-${viewName}`).style.display = 'block';

  const name = (state.artisan && state.artisan.nom_artisan) ? state.artisan.nom_artisan.split(' ')[0] : 'Artisan';
  const headings = {
    dashboard: { title: `Bonjour, ${name} 👋`, sub: 'Voici un aperçu de votre activité.' },
    devis: { title: 'Vos Devis', sub: 'Gestion, envoi et suivi de vos devis' },
    factures: { title: 'Vos Factures', sub: 'Consultation des factures et suivi des encaissements' },
    clients: { title: 'Vos Clients', sub: 'Répertoire de vos fiches clients' }
  };

  document.getElementById('view-greeting').innerText = headings[viewName].title;
  document.getElementById('view-subtext').innerText = headings[viewName].sub;

  if (viewName === 'dashboard') loadDashboard();
  if (viewName === 'devis') loadDevis();
  if (viewName === 'factures') loadFactures();
  if (viewName === 'clients') loadClients();
}

// -----------------------------------------------------------------
// DASHBOARD
// -----------------------------------------------------------------
async function loadDashboard() {
  const period = document.getElementById('dashboard-period').value;
  try {
    const data = await api(`/dashboard/stats?period=${period}`);

    document.getElementById('kpi-facture').innerText = formatCents(data.kpis.total_facture_cents);
    document.getElementById('kpi-encaisse').innerText = formatCents(data.kpis.total_encaisse_cents);
    document.getElementById('kpi-attente').innerText = formatCents(data.kpis.total_attente_cents);

    const tbody = document.getElementById('dashboard-recent-table');
    tbody.innerHTML = '';

    const items = [
      ...data.recent_devis.map(d => ({ ...d, type: 'DEVIS' })),
      ...data.recent_factures.map(f => ({ ...f, type: 'FACTURE' }))
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Aucun document créé pour l'instant.</td></tr>`;
      return;
    }

    items.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${item.numero}</strong> <span class="status-badge ${item.type === 'DEVIS' ? 'envoye' : 'converti'}">${item.type}</span></td>
        <td>${escapeHtml(item.client_nom)}</td>
        <td><strong>${formatCents(item.total_ttc_cents)}</strong></td>
        <td>${renderBadge(item.statut)}</td>
        <td>${new Date(item.created_at).toLocaleDateString('fr-FR')}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {}
}

// -----------------------------------------------------------------
// DEVIS
// -----------------------------------------------------------------
async function loadDevis() {
  try {
    const devisList = await api('/devis');
    state.devis = devisList;

    const tbody = document.getElementById('devis-table-body');
    tbody.innerHTML = '';

    if (devisList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Aucun devis créé. Cliquez sur "Créer un devis".</td></tr>`;
      return;
    }

    devisList.forEach(devis => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${devis.numero}</strong></td>
        <td><span class="status-badge brouillon">v${devis.version}</span></td>
        <td>${escapeHtml(devis.client_nom)}</td>
        <td>${formatCents(devis.total_ht_cents)}</td>
        <td><strong>${formatCents(devis.total_ttc_cents)}</strong></td>
        <td>${renderBadge(devis.statut)}</td>
        <td>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            ${devis.statut !== 'converti' && devis.statut !== 'remplace' ? `
              <button class="btn btn-outline btn-sm" onclick="editDevis(${devis.id})" title="Modifier">
                <i class="ri-edit-line"></i>
              </button>
            ` : ''}

            ${devis.statut === 'accepte' ? `
              <button class="btn btn-terracotta btn-sm" onclick="convertDevisToFacture(${devis.id})" title="Convertir en facture">
                <i class="ri-article-line"></i> Convertir
              </button>
            ` : ''}

            <button class="btn btn-outline btn-sm" onclick="openShareModal('devis', '${devis.public_token}', ${devis.id})" title="Lien public">
              <i class="ri-share-line"></i>
            </button>

            <a href="/api/devis/${devis.id}/pdf?auth_token=${state.token}" target="_blank" class="btn btn-outline btn-sm" title="Télécharger PDF">
              <i class="ri-file-pdf-line"></i>
            </a>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {}
}

async function openNewDevisModal() {
  await populateClientsDropdown();
  document.getElementById('devis-modal-title').innerText = 'Créer un devis';
  document.getElementById('devis-id').value = '';
  document.getElementById('devis-statut').value = 'brouillon';
  
  const linesBody = document.getElementById('devis-lines-body');
  linesBody.innerHTML = '';
  addDevisLine('Installation tableau électrique', 1, 150.00);
  addDevisLine('Disjoncteur 20A', 2, 35.00);
  recalculateModalTotals();

  openModal('devis-modal');
}

async function editDevis(id) {
  await populateClientsDropdown();
  try {
    const data = await api(`/devis/${id}`);
    
    document.getElementById('devis-modal-title').innerText = `Modifier Devis ${data.numero} (v${data.version})`;
    document.getElementById('devis-id').value = data.id;
    document.getElementById('devis-client-id').value = data.client_id;
    document.getElementById('devis-statut').value = data.statut === 'remplace' || data.statut === 'converti' ? 'brouillon' : data.statut;

    const linesBody = document.getElementById('devis-lines-body');
    linesBody.innerHTML = '';

    data.lignes.forEach(line => {
      addDevisLine(line.designation, line.quantite, line.prix_unitaire_cents / 100);
    });

    recalculateModalTotals();
    openModal('devis-modal');
  } catch (err) {}
}

function addDevisLine(designation = '', quantite = 1, prixUnitaireEuro = '') {
  const tbody = document.getElementById('devis-lines-body');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td style="padding: 6px;">
      <input type="text" class="form-input line-desc" value="${escapeHtml(designation)}" placeholder="Ex. Câblage (30m)" required oninput="recalculateModalTotals()">
    </td>
    <td style="padding: 6px;">
      <input type="number" step="0.1" class="form-input line-qty" value="${quantite}" min="0.1" required oninput="recalculateModalTotals()">
    </td>
    <td style="padding: 6px;">
      <input type="number" step="0.01" class="form-input line-price" value="${prixUnitaireEuro}" placeholder="100.00" required oninput="recalculateModalTotals()">
    </td>
    <td style="padding: 6px; text-align: center;">
      <button type="button" class="btn btn-danger btn-sm" onclick="removeDevisLine(this)">
        <i class="ri-delete-bin-line"></i>
      </button>
    </td>
  `;
  tbody.appendChild(tr);
}

function removeDevisLine(btn) {
  const tbody = document.getElementById('devis-lines-body');
  if (tbody.children.length > 1) {
    btn.closest('tr').remove();
    recalculateModalTotals();
  } else {
    alert('Le devis doit contenir au moins une ligne.');
  }
}

function recalculateModalTotals() {
  const rows = document.querySelectorAll('#devis-lines-body tr');
  let totalHTCents = 0;
  let totalTVACents = 0;

  rows.forEach(row => {
    const qty = parseFloat(row.querySelector('.line-qty').value) || 0;
    const priceEuro = parseFloat(row.querySelector('.line-price').value) || 0;
    const puCents = Math.round(priceEuro * 100);

    const lineHT = Math.round(qty * puCents);
    const lineTVA = Math.round(lineHT * 0.20);

    totalHTCents += lineHT;
    totalTVACents += lineTVA;
  });

  const totalTTCCents = totalHTCents + totalTVACents;

  document.getElementById('modal-total-ht').innerText = formatCents(totalHTCents);
  document.getElementById('modal-total-tva').innerText = formatCents(totalTVACents);
  document.getElementById('modal-total-ttc').innerText = formatCents(totalTTCCents);
}

async function saveDevis(e) {
  e.preventDefault();

  const id = document.getElementById('devis-id').value;
  const client_id = parseInt(document.getElementById('devis-client-id').value);
  const statut = document.getElementById('devis-statut').value;

  const rows = document.querySelectorAll('#devis-lines-body tr');
  const lignes = [];

  rows.forEach(row => {
    const designation = row.querySelector('.line-desc').value.trim();
    const quantite = parseFloat(row.querySelector('.line-qty').value);
    const priceEuro = parseFloat(row.querySelector('.line-price').value);
    const prix_unitaire_cents = Math.round(priceEuro * 100);

    if (designation && quantite > 0 && prix_unitaire_cents >= 0) {
      lignes.push({ designation, quantite, prix_unitaire_cents, taux_tva: 20 });
    }
  });

  if (lignes.length === 0) {
    alert('Veuillez renseigner les lignes du devis.');
    return;
  }

  try {
    let resData;
    if (id) {
      resData = await api(`/devis/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ client_id, lignes, statut })
      });
      if (resData.is_new_version) alert(resData.message);
    } else {
      resData = await api('/devis', {
        method: 'POST',
        body: JSON.stringify({ client_id, lignes, statut })
      });
    }

    closeModal('devis-modal');
    loadDevis();
    if (state.currentView === 'dashboard') loadDashboard();
  } catch (err) {}
}

async function convertDevisToFacture(devisId) {
  if (!confirm('Voulez-vous transformer ce devis en facture définitive ? Les montants seront figés.')) return;

  try {
    const res = await api(`/devis/${devisId}/convert`, { method: 'POST' });
    alert(res.message);
    switchView('factures');
  } catch (err) {}
}

// -----------------------------------------------------------------
// FACTURES
// -----------------------------------------------------------------
async function loadFactures() {
  try {
    const facturesList = await api('/factures');
    state.factures = facturesList;

    const tbody = document.getElementById('factures-table-body');
    tbody.innerHTML = '';

    if (facturesList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">Aucune facture générée. Convertissez un devis accepté.</td></tr>`;
      return;
    }

    facturesList.forEach(facture => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${facture.numero}</strong></td>
        <td>${facture.devis_numero ? `<span class="status-badge envoye">${facture.devis_numero}</span>` : '-'}</td>
        <td>${escapeHtml(facture.client_nom)}</td>
        <td><strong>${formatCents(facture.total_ttc_cents)}</strong></td>
        <td><span style="color: var(--artiflow-mint); font-weight: 700;">${formatCents(facture.total_paye_cents)}</span></td>
        <td><span style="color: ${facture.solde_restant_cents > 0 ? 'var(--artiflow-terracotta)' : 'var(--text-muted)'}; font-weight: 700;">${formatCents(facture.solde_restant_cents)}</span></td>
        <td>${renderBadge(facture.statut)}</td>
        <td>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            ${facture.statut !== 'payee' && facture.statut !== 'annulee' ? `
              <button class="btn btn-navy btn-sm" onclick="openPaymentModal(${facture.id}, '${facture.numero}', ${facture.solde_restant_cents})" title="Ajouter un paiement">
                <i class="ri-bank-card-line"></i> Encaisser
              </button>
            ` : ''}

            <button class="btn btn-outline btn-sm" onclick="openShareModal('factures', '${facture.public_token}')" title="Lien public">
              <i class="ri-share-line"></i>
            </button>

            <a href="/api/factures/${facture.id}/pdf?auth_token=${state.token}" target="_blank" class="btn btn-outline btn-sm" title="Télécharger PDF">
              <i class="ri-file-pdf-line"></i>
            </a>

            ${facture.statut !== 'annulee' ? `
              <button class="btn btn-danger btn-sm" onclick="annulerFacture(${facture.id})" title="Annuler la facture">
                <i class="ri-close-circle-line"></i>
              </button>
            ` : ''}
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {}
}

function openPaymentModal(factureId, number, soldeCents) {
  document.getElementById('payment-facture-id').value = factureId;
  document.getElementById('payment-facture-num').innerText = number;
  document.getElementById('payment-facture-solde').innerText = formatCents(soldeCents);
  document.getElementById('payment-amount').value = (soldeCents / 100).toFixed(2);
  openModal('payment-modal');
}

async function savePayment(e) {
  e.preventDefault();
  const factureId = document.getElementById('payment-facture-id').value;
  const amountEuro = parseFloat(document.getElementById('payment-amount').value);
  const mode_paiement = document.getElementById('payment-mode').value;
  const notes = document.getElementById('payment-notes').value;

  const montant_cents = Math.round(amountEuro * 100);

  try {
    const res = await api(`/factures/${factureId}/paiements`, {
      method: 'POST',
      body: JSON.stringify({ montant_cents, mode_paiement, notes })
    });

    alert(res.message);
    closeModal('payment-modal');
    loadFactures();
    if (state.currentView === 'dashboard') loadDashboard();
  } catch (err) {}
}

async function annulerFacture(factureId) {
  if (!confirm('Attention : Une facture ne peut jamais être supprimée. Confirmez-vous le passage au statut ANNULÉE ?')) return;

  try {
    const res = await api(`/factures/${factureId}/annuler`, { method: 'POST' });
    alert(res.message);
    loadFactures();
  } catch (err) {}
}

// -----------------------------------------------------------------
// CLIENTS
// -----------------------------------------------------------------
async function loadClients() {
  try {
    const clients = await api('/clients');
    state.clients = clients;
    renderClientsTable(clients);
  } catch (err) {}
}

function renderClientsTable(clients) {
  const tbody = document.getElementById('clients-table-body');
  tbody.innerHTML = '';

  if (clients.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Aucun client trouvé.</td></tr>`;
    return;
  }

  clients.forEach(client => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(client.nom)}</strong></td>
      <td>${client.email ? escapeHtml(client.email) : '-'}</td>
      <td>${client.telephone ? escapeHtml(client.telephone) : '-'}</td>
      <td>${client.adresse ? escapeHtml(client.adresse) : '-'}</td>
      <td><span class="status-badge envoye">${client.count_devis} devis</span></td>
      <td><span class="status-badge converti">${client.count_factures} factures</span></td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="editClient(${client.id})">
          <i class="ri-edit-line"></i> Modifier
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterClientsList() {
  const query = document.getElementById('client-search-input').value.toLowerCase().trim();
  const filtered = state.clients.filter(c => c.nom.toLowerCase().includes(query) || (c.email && c.email.toLowerCase().includes(query)));
  renderClientsTable(filtered);
}

async function populateClientsDropdown() {
  const clients = await api('/clients');
  const select = document.getElementById('devis-client-id');
  select.innerHTML = '';

  clients.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.innerText = c.nom;
    select.appendChild(opt);
  });
}

function openClientModal() {
  document.getElementById('client-modal-title').innerText = 'Nouveau client';
  document.getElementById('client-id').value = '';
  document.getElementById('client-nom').value = '';
  document.getElementById('client-email').value = '';
  document.getElementById('client-phone').value = '';
  document.getElementById('client-adresse').value = '';
  openModal('client-modal');
}

async function editClient(id) {
  try {
    const client = await api(`/clients/${id}`);
    document.getElementById('client-modal-title').innerText = 'Modifier le client';
    document.getElementById('client-id').value = client.id;
    document.getElementById('client-nom').value = client.nom;
    document.getElementById('client-email').value = client.email || '';
    document.getElementById('client-phone').value = client.telephone || '';
    document.getElementById('client-adresse').value = client.adresse || '';
    openModal('client-modal');
  } catch (err) {}
}

async function saveClient(e) {
  e.preventDefault();
  const id = document.getElementById('client-id').value;
  const nom = document.getElementById('client-nom').value;
  const email = document.getElementById('client-email').value;
  const telephone = document.getElementById('client-phone').value;
  const adresse = document.getElementById('client-adresse').value;

  try {
    if (id) {
      await api(`/clients/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ nom, email, telephone, adresse })
      });
    } else {
      await api('/clients', {
        method: 'POST',
        body: JSON.stringify({ nom, email, telephone, adresse })
      });
    }

    closeModal('client-modal');
    loadClients();
  } catch (err) {}
}

// -----------------------------------------------------------------
// PUBLIC CLIENT VIEWING (UNAUTHENTICATED)
// -----------------------------------------------------------------
async function loadPublicView(path) {
  document.getElementById('sidebar').style.display = 'none';
  document.getElementById('bottom-nav').style.display = 'none';
  document.getElementById('main-container').style.display = 'none';
  document.getElementById('auth-container').style.display = 'none';
  
  const pubContainer = document.getElementById('public-container');
  pubContainer.style.display = 'block';

  const isDevis = path.startsWith('/public/devis/');
  const token = path.split('/').pop();

  try {
    const res = await fetch(`/api/public/${isDevis ? 'devis' : 'factures'}/${token}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const target = document.getElementById('public-content');
    
    if (isDevis) {
      const d = data.devis;
      const a = data.artisan;
      const c = data.client;

      target.innerHTML = `
        ${data.replacement_notice ? `
          <div style="background: var(--badge-orange-bg); border: 1px solid var(--artiflow-terracotta); padding: 14px; border-radius: var(--radius-md); margin-bottom: 24px;">
            <strong>Notice :</strong> ${data.replacement_notice.message}
            ${data.replacement_notice.newest_version ? `<br><a href="/public/devis/${data.replacement_notice.newest_version.public_token}" style="color: var(--artiflow-navy); font-weight: 700; text-decoration: underline;">Consulter la dernière version (${data.replacement_notice.newest_version.numero} v${data.replacement_notice.newest_version.version})</a>` : ''}
          </div>
        ` : ''}

        <div style="display: flex; justify-content: space-between; margin-bottom: 24px;">
          <div>
            <h2 style="font-size: 22px; font-weight: 800; color: var(--artiflow-navy);">${escapeHtml(a.nom_entreprise)}</h2>
            <p style="color: var(--text-muted); font-size: 13px;">Artisan: ${escapeHtml(a.nom_artisan)} | Tél: ${escapeHtml(a.telephone || '')}</p>
          </div>
          <div style="text-align: right;">
            <h2 style="font-size: 24px; color: var(--artiflow-navy); font-weight: 800;">DEVIS N° ${d.numero}</h2>
            <p style="color: var(--text-muted);">Version v${d.version}</p>
            <div style="margin-top: 6px;">${renderBadge(d.statut)}</div>
          </div>
        </div>

        <div style="background: var(--bg-input); padding: 16px; border-radius: var(--radius-md); margin-bottom: 24px;">
          <strong>Client :</strong> ${escapeHtml(c.nom)} <br>
          <span style="color: var(--text-muted);">${escapeHtml(c.adresse || '')}</span>
        </div>

        <table class="custom-table" style="margin-bottom: 24px;">
          <thead>
            <tr>
              <th>Désignation</th>
              <th style="text-align: center;">Qté</th>
              <th style="text-align: right;">P.U. HT</th>
              <th style="text-align: right;">Total HT</th>
            </tr>
          </thead>
          <tbody>
            ${data.lignes.map(l => `
              <tr>
                <td>${escapeHtml(l.designation)}</td>
                <td style="text-align: center;">${l.quantite}</td>
                <td style="text-align: right;">${formatCents(l.prix_unitaire_cents)}</td>
                <td style="text-align: right;">${formatCents(l.total_ht_cents)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="background: var(--bg-input); padding: 16px; border-radius: var(--radius-md); margin-left: auto; width: 280px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>Total HT :</span><span>${formatCents(d.total_ht_cents)}</span></div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>TVA (20%) :</span><span>${formatCents(d.total_tva_cents)}</span></div>
          <div style="display: flex; justify-content: space-between; font-size: 18px; font-weight: 800; color: var(--artiflow-navy); border-top: 1px solid var(--border-color); padding-top: 8px;">
            <span>Total TTC :</span><span>${formatCents(d.total_ttc_cents)}</span>
          </div>
        </div>

        <div style="margin-top: 32px; text-align: center;">
          <a href="/api/public/devis/${token}/pdf" target="_blank" class="btn btn-terracotta">
            <i class="ri-file-pdf-line"></i> Télécharger en PDF
          </a>
        </div>
      `;
    } else {
      const f = data.facture;
      const a = data.artisan;
      const c = data.client;

      target.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 24px;">
          <div>
            <h2 style="font-size: 22px; font-weight: 800; color: var(--artiflow-navy);">${escapeHtml(a.nom_entreprise)}</h2>
            <p style="color: var(--text-muted); font-size: 13px;">Artisan: ${escapeHtml(a.nom_artisan)} | Tél: ${escapeHtml(a.telephone || '')}</p>
          </div>
          <div style="text-align: right;">
            <h2 style="font-size: 24px; color: var(--artiflow-mint); font-weight: 800;">FACTURE N° ${f.numero}</h2>
            <p style="color: var(--text-muted);">Émise le ${new Date(f.date_emission).toLocaleDateString('fr-FR')}</p>
            <div style="margin-top: 6px;">${renderBadge(f.statut)}</div>
          </div>
        </div>

        <table class="custom-table" style="margin-bottom: 24px;">
          <thead>
            <tr>
              <th>Désignation</th>
              <th style="text-align: center;">Qté</th>
              <th style="text-align: right;">P.U. HT</th>
              <th style="text-align: right;">Total HT</th>
            </tr>
          </thead>
          <tbody>
            ${data.lignes.map(l => `
              <tr>
                <td>${escapeHtml(l.designation)}</td>
                <td style="text-align: center;">${l.quantite}</td>
                <td style="text-align: right;">${formatCents(l.prix_unitaire_cents)}</td>
                <td style="text-align: right;">${formatCents(l.total_ht_cents)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="background: var(--bg-input); padding: 16px; border-radius: var(--radius-md); margin-left: auto; width: 280px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>Total HT :</span><span>${formatCents(f.total_ht_cents)}</span></div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>TVA (20%) :</span><span>${formatCents(f.total_tva_cents)}</span></div>
          <div style="display: flex; justify-content: space-between; font-size: 18px; font-weight: 800; color: var(--artiflow-navy); border-top: 1px solid var(--border-color); padding-top: 8px;">
            <span>Total TTC :</span><span>${formatCents(f.total_ttc_cents)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 8px; color: var(--artiflow-mint); font-weight: 700;">
            <span>Déjà Payé :</span><span>${formatCents(f.total_paye_cents)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 4px; font-weight: 800; color: ${f.solde_restant_cents > 0 ? 'var(--artiflow-terracotta)' : 'var(--artiflow-mint)'};">
            <span>Reste à Payer :</span><span>${formatCents(f.solde_restant_cents)}</span>
          </div>
        </div>

        <div style="margin-top: 32px; text-align: center;">
          <a href="/api/public/factures/${token}/pdf" target="_blank" class="btn btn-navy">
            <i class="ri-file-pdf-line"></i> Télécharger la facture PDF
          </a>
        </div>
      `;
    }
  } catch (err) {
    pubContainer.innerHTML = `<h3 style="color: var(--artiflow-terracotta); text-align: center;">Document introuvable.</h3>`;
  }
}

async function openShareModal(type, token, devisId = null) {
  const url = `${window.location.origin}/public/${type}/${token}`;
  document.getElementById('share-link-input').value = url;

  if (type === 'devis' && devisId) {
    try {
      await api(`/devis/${devisId}/share`, { method: 'POST' });
      loadDevis();
      if (state.currentView === 'dashboard') loadDashboard();
    } catch (err) {}
  }

  openModal('share-modal');
}

function copyShareLink() {
  const input = document.getElementById('share-link-input');
  input.select();
  navigator.clipboard.writeText(input.value);
  alert('Lien public copié !');
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function formatCents(cents) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format((cents || 0) / 100);
}

function renderBadge(statut) {
  const badges = {
    brouillon: '<span class="status-badge brouillon">Brouillon</span>',
    envoye: '<span class="status-badge envoye">Envoyé</span>',
    accepte: '<span class="status-badge accepte">Accepté</span>',
    converti: '<span class="status-badge converti">Converti</span>',
    remplace: '<span class="status-badge remplace">Remplacé</span>',
    emise: '<span class="status-badge emise">Émise</span>',
    partiellement_payee: '<span class="status-badge partiellement_payee">Partiellement Payée</span>',
    payee: '<span class="status-badge payee">Payée</span>',
    annulee: '<span class="status-badge annulee">Annulée</span>'
  };
  return badges[statut] || `<span class="status-badge">${statut}</span>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
