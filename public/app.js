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

            <button class="btn btn-terracotta btn-sm" onclick="openEmailModal(${devis.id})" title="Envoyer directement par email au client">
              <i class="ri-mail-send-line"></i> Envoyer
            </button>

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

// Helper for inline client creation in modals
function toggleNewClientInline(prefix) {
  const box = document.getElementById(`${prefix}-new-client-box`);
  const select = document.getElementById(`${prefix}-client-id`);
  if (!box || !select) return;

  if (box.style.display === 'none' || !box.style.display) {
    box.style.display = 'block';
    select.value = 'new';
    const firstInput = document.getElementById(`${prefix}-new-client-nom`);
    if (firstInput) firstInput.focus();
  } else {
    box.style.display = 'none';
    if (select.value === 'new') select.value = select.options.length > 2 ? select.options[2].value : '';
  }
}

function handleClientDropdownChange(prefix) {
  const select = document.getElementById(`${prefix}-client-id`);
  const box = document.getElementById(`${prefix}-new-client-box`);
  if (!select || !box) return;

  if (select.value === 'new') {
    box.style.display = 'block';
    const firstInput = document.getElementById(`${prefix}-new-client-nom`);
    if (firstInput) firstInput.focus();
  } else {
    box.style.display = 'none';
  }
}

async function populateClientsDropdown(selectId = 'devis-client-id') {
  const clients = await api('/clients');
  const select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = '';

  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.innerText = '-- Choisir un client existant --';
  select.appendChild(defaultOpt);

  const newOpt = document.createElement('option');
  newOpt.value = 'new';
  newOpt.innerText = '➕ + Nouveau client (enregistrer automatiquement)';
  select.appendChild(newOpt);

  clients.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.innerText = c.nom + (c.email ? ` (${c.email})` : '');
    select.appendChild(opt);
  });
}

// -----------------------------------------------------------------
// DEVIS ACTIONS & RESPONSIVE LINE ITEMS
// -----------------------------------------------------------------
async function openNewDevisModal() {
  await populateClientsDropdown('devis-client-id');
  document.getElementById('devis-modal-title').innerText = 'Créer un devis';
  document.getElementById('devis-id').value = '';
  document.getElementById('devis-statut').value = 'brouillon';
  
  // Reset new client box
  const box = document.getElementById('devis-new-client-box');
  if (box) box.style.display = 'none';
  ['nom', 'email', 'tel', 'adresse'].forEach(field => {
    const el = document.getElementById(`devis-new-client-${field}`);
    if (el) el.value = '';
  });

  const linesContainer = document.getElementById('devis-lines-container');
  linesContainer.innerHTML = '';
  addDevisLine('Installation tableau électrique', 1, 150.00);
  addDevisLine('Disjoncteur 20A', 2, 35.00);
  recalculateModalTotals('devis');

  openModal('devis-modal');
}

async function editDevis(id) {
  await populateClientsDropdown('devis-client-id');
  try {
    const data = await api(`/devis/${id}`);
    
    document.getElementById('devis-modal-title').innerText = `Modifier Devis ${data.numero} (v${data.version})`;
    document.getElementById('devis-id').value = data.id;
    document.getElementById('devis-client-id').value = data.client_id;
    document.getElementById('devis-statut').value = data.statut === 'remplace' || data.statut === 'converti' ? 'brouillon' : data.statut;

    const box = document.getElementById('devis-new-client-box');
    if (box) box.style.display = 'none';

    const linesContainer = document.getElementById('devis-lines-container');
    linesContainer.innerHTML = '';

    data.lignes.forEach(line => {
      addDevisLine(line.designation, line.quantite, line.prix_unitaire_cents / 100);
    });

    recalculateModalTotals('devis');
    openModal('devis-modal');
  } catch (err) {}
}

function addDevisLine(designation = '', quantite = 1, prixUnitaireEuro = '') {
  const container = document.getElementById('devis-lines-container');
  const div = document.createElement('div');
  div.className = 'line-item-row';
  div.innerHTML = `
    <div class="line-item-desc">
      <input type="text" class="form-input line-desc" value="${escapeHtml(designation)}" placeholder="Désignation des travaux ou matériel" required oninput="recalculateModalTotals('devis')">
    </div>
    <div class="line-mobile-subrow">
      <div class="line-item-qty">
        <input type="number" step="0.1" class="form-input line-qty" value="${quantite}" min="0.1" placeholder="Qté" required oninput="recalculateModalTotals('devis')">
      </div>
      <div class="line-item-price">
        <input type="number" step="0.01" class="form-input line-price" value="${prixUnitaireEuro}" placeholder="P.U. HT (€)" required oninput="recalculateModalTotals('devis')">
      </div>
      <div class="line-del-btn">
        <button type="button" class="btn btn-danger btn-sm" onclick="removeDevisLine(this)" title="Supprimer cette ligne">
          <i class="ri-delete-bin-line"></i>
        </button>
      </div>
    </div>
  `;
  container.appendChild(div);
  recalculateModalTotals('devis');
}

function removeDevisLine(btn) {
  const container = document.getElementById('devis-lines-container');
  if (container.children.length > 1) {
    btn.closest('.line-item-row').remove();
    recalculateModalTotals('devis');
  } else {
    alert('Le devis doit contenir au moins une ligne.');
  }
}

function recalculateModalTotals(prefix = 'devis') {
  const containerId = prefix === 'facture' ? 'facture-lines-container' : 'devis-lines-container';
  const rows = document.querySelectorAll(`#${containerId} .line-item-row`);
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

  const targetPrefix = prefix === 'facture' ? 'facture-modal-total' : 'modal-total';
  const elHT = document.getElementById(`${targetPrefix}-ht`);
  const elTVA = document.getElementById(`${targetPrefix}-tva`);
  const elTTC = document.getElementById(`${targetPrefix}-ttc`);

  if (elHT) elHT.innerText = formatCents(totalHTCents);
  if (elTVA) elTVA.innerText = formatCents(totalTVACents);
  if (elTTC) elTTC.innerText = formatCents(totalTTCCents);
}

async function saveDevis(e) {
  e.preventDefault();

  const id = document.getElementById('devis-id').value;
  const clientSelectValue = document.getElementById('devis-client-id').value;
  const statut = document.getElementById('devis-statut').value;

  let client_id = null;
  let new_client = null;

  if (clientSelectValue === 'new' || !clientSelectValue) {
    const nom = document.getElementById('devis-new-client-nom').value.trim();
    if (!nom) {
      alert('Veuillez renseigner le nom du nouveau client ou sélectionner un client existant.');
      document.getElementById('devis-new-client-nom').focus();
      return;
    }
    new_client = {
      nom,
      email: document.getElementById('devis-new-client-email').value.trim(),
      telephone: document.getElementById('devis-new-client-tel').value.trim(),
      adresse: document.getElementById('devis-new-client-adresse').value.trim()
    };
  } else {
    client_id = parseInt(clientSelectValue);
  }

  const rows = document.querySelectorAll('#devis-lines-container .line-item-row');
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
    const payload = { client_id, new_client, lignes, statut };

    if (id) {
      resData = await api(`/devis/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      if (resData.is_new_version) alert(resData.message);
    } else {
      resData = await api('/devis', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }

    closeModal('devis-modal');
    loadDevis();
    if (state.currentView === 'dashboard') loadDashboard();
  } catch (err) {}
}

// -----------------------------------------------------------------
// DIRECT FACTURES CREATION (with auto client registration)
// -----------------------------------------------------------------
async function openNewFactureModal() {
  await populateClientsDropdown('facture-client-id');
  const dateInput = document.getElementById('facture-date-emission');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

  const box = document.getElementById('facture-new-client-box');
  if (box) box.style.display = 'none';
  ['nom', 'email', 'tel', 'adresse'].forEach(field => {
    const el = document.getElementById(`facture-new-client-${field}`);
    if (el) el.value = '';
  });

  const linesContainer = document.getElementById('facture-lines-container');
  linesContainer.innerHTML = '';
  addFactureLine('Prestation de maintenance électrique', 1, 250.00);
  recalculateModalTotals('facture');

  openModal('facture-modal');
}

function addFactureLine(designation = '', quantite = 1, prixUnitaireEuro = '') {
  const container = document.getElementById('facture-lines-container');
  const div = document.createElement('div');
  div.className = 'line-item-row';
  div.innerHTML = `
    <div class="line-item-desc">
      <input type="text" class="form-input line-desc" value="${escapeHtml(designation)}" placeholder="Désignation des travaux ou fournitures" required oninput="recalculateModalTotals('facture')">
    </div>
    <div class="line-mobile-subrow">
      <div class="line-item-qty">
        <input type="number" step="0.1" class="form-input line-qty" value="${quantite}" min="0.1" placeholder="Qté" required oninput="recalculateModalTotals('facture')">
      </div>
      <div class="line-item-price">
        <input type="number" step="0.01" class="form-input line-price" value="${prixUnitaireEuro}" placeholder="P.U. HT (€)" required oninput="recalculateModalTotals('facture')">
      </div>
      <div class="line-del-btn">
        <button type="button" class="btn btn-danger btn-sm" onclick="removeFactureLine(this)" title="Supprimer">
          <i class="ri-delete-bin-line"></i>
        </button>
      </div>
    </div>
  `;
  container.appendChild(div);
  recalculateModalTotals('facture');
}

function removeFactureLine(btn) {
  const container = document.getElementById('facture-lines-container');
  if (container.children.length > 1) {
    btn.closest('.line-item-row').remove();
    recalculateModalTotals('facture');
  } else {
    alert('La facture doit contenir au moins une ligne.');
  }
}

async function saveDirectFacture(e) {
  e.preventDefault();

  const clientSelectValue = document.getElementById('facture-client-id').value;
  const date_emission = document.getElementById('facture-date-emission').value;

  let client_id = null;
  let new_client = null;

  if (clientSelectValue === 'new' || !clientSelectValue) {
    const nom = document.getElementById('facture-new-client-nom').value.trim();
    if (!nom) {
      alert('Veuillez renseigner le nom du nouveau client ou sélectionner un client existant.');
      document.getElementById('facture-new-client-nom').focus();
      return;
    }
    new_client = {
      nom,
      email: document.getElementById('facture-new-client-email').value.trim(),
      telephone: document.getElementById('facture-new-client-tel').value.trim(),
      adresse: document.getElementById('facture-new-client-adresse').value.trim()
    };
  } else {
    client_id = parseInt(clientSelectValue);
  }

  const rows = document.querySelectorAll('#facture-lines-container .line-item-row');
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
    alert('Veuillez renseigner les lignes de la facture.');
    return;
  }

  try {
    const res = await api('/factures', {
      method: 'POST',
      body: JSON.stringify({ client_id, new_client, lignes, date_emission })
    });

    closeModal('facture-modal');
    alert(`Facture ${res.numero} créée avec succès !`);
    loadFactures();
    if (state.currentView === 'dashboard') loadDashboard();
  } catch (err) {}
}

// -----------------------------------------------------------------
// EMAIL SENDING MODAL & ACTIONS
// -----------------------------------------------------------------
let currentEmailData = null;

async function openEmailModal(devisId) {
  try {
    const devis = await api(`/devis/${devisId}`);
    const publicUrl = `${window.location.origin}/public/devis/${devis.public_token}`;
    const artisanName = (state.artisan && state.artisan.nom_artisan) || 'Votre artisan';
    const company = (state.artisan && state.artisan.nom_entreprise) || 'ArtiFlow';

    currentEmailData = {
      id: devis.id,
      numero: devis.numero,
      client_nom: devis.client_nom,
      client_email: devis.client_email || '',
      total_ttc: formatCents(devis.total_ttc_cents),
      publicUrl,
      artisanName,
      company
    };

    document.getElementById('email-devis-id').value = devis.id;
    document.getElementById('email-public-link').value = publicUrl;
    document.getElementById('email-recipient').value = devis.client_email || '';
    document.getElementById('email-subject').value = `Devis ${devis.numero} - ${company}`;

    const defaultBody = `Bonjour ${devis.client_nom || ''},

Veuillez trouver ci-joint votre devis n° ${devis.numero} d'un montant de ${formatCents(devis.total_ttc_cents)} TTC.

Vous pouvez le consulter en ligne, télécharger le PDF ou le valider directement en un clic en suivant ce lien sécurisé :
${publicUrl}

N'hésitez pas à nous contacter ou à poser vos questions directement depuis la page du devis.

Cordialement,
${artisanName}
${company}
${(state.artisan && state.artisan.telephone) ? `Tél : ${state.artisan.telephone}` : ''}`;

    document.getElementById('email-body').value = defaultBody;
    openModal('email-modal');
  } catch (err) {}
}

async function sendDevisEmail(e) {
  e.preventDefault();
  const devisId = document.getElementById('email-devis-id').value;
  const email = document.getElementById('email-recipient').value.trim();
  const sujet = document.getElementById('email-subject').value.trim();
  const message = document.getElementById('email-body').value.trim();

  const btn = document.getElementById('btn-submit-email');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="ri-loader-4-line ri-spin"></i> Envoi...`;
  }

  try {
    const res = await api(`/devis/${devisId}/send-email`, {
      method: 'POST',
      body: JSON.stringify({ email, sujet, message })
    });

    closeModal('email-modal');
    alert(res.message || 'Devis envoyé par email au client !');
    loadDevis();
    if (state.currentView === 'dashboard') loadDashboard();
  } catch (err) {
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="ri-send-plane-fill"></i> Envoyer au client`;
    }
  }
}

function openMailtoClient() {
  const email = document.getElementById('email-recipient').value.trim();
  const subject = encodeURIComponent(document.getElementById('email-subject').value.trim());
  const body = encodeURIComponent(document.getElementById('email-body').value.trim());

  const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;
  window.open(mailtoUrl, '_blank');
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

        <div class="table-responsive">
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
        </div>

        <div class="totals-box">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>Total HT :</span><span>${formatCents(d.total_ht_cents)}</span></div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;"><span>TVA (20%) :</span><span>${formatCents(d.total_tva_cents)}</span></div>
          <div style="display: flex; justify-content: space-between; font-size: 18px; font-weight: 800; color: var(--text-total-ttc); border-top: 1px solid var(--border-color); padding-top: 8px;">
            <span>Total TTC :</span><span>${formatCents(d.total_ttc_cents)}</span>
          </div>
        </div>

        <!-- CLIENT INTERACTIVE ACTION BOX (Accept & Ask for Info) -->
        ${d.statut === 'accepte' ? `
          <div class="public-banner-accepted" style="margin-top: 32px;">
            <i class="ri-checkbox-circle-fill" style="font-size: 24px;"></i>
            <div>
              <strong>Devis accepté et validé !</strong><br>
              <span style="font-size: 13px; font-weight: normal;">
                Ce devis a été accepté le ${d.date_acceptation ? new Date(d.date_acceptation).toLocaleDateString('fr-FR') : 'récemment'}${d.signature_client ? ` par ${escapeHtml(d.signature_client)}` : ''}. L'artisan en a été notifié.
              </span>
            </div>
          </div>
        ` : (d.statut !== 'remplace' && d.statut !== 'converti') ? `
          <div class="public-actions-card" id="client-decision-card">
            <h4>Réponse au devis</h4>
            <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 8px;">
              Vous pouvez valider ce devis directement en ligne ou adresser une demande de renseignements à votre artisan.
            </p>

            <div class="public-actions-btn-row">
              <button class="btn btn-terracotta" onclick="showAcceptPrompt('${token}')">
                <i class="ri-check-double-line"></i> Accepter et signer le devis
              </button>
              <button class="btn btn-outline" onclick="showQuestionPrompt()">
                <i class="ri-question-answer-line"></i> Demander des informations supplémentaires
              </button>
              <a href="/api/public/devis/${token}/pdf" target="_blank" class="btn btn-outline">
                <i class="ri-file-pdf-line"></i> Télécharger en PDF
              </a>
            </div>

            <!-- Inline Accept Form -->
            <div id="client-accept-form-box" style="display: none; background: var(--bg-card); padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--artiflow-mint); margin-top: 14px;">
              <h5 style="font-size: 15px; font-weight: 800; margin-bottom: 8px; color: var(--badge-green-text);">Confirmation d'acceptation du devis</h5>
              <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">En confirmant, vous validez les prestations et les montants indiqués dans ce devis.</p>
              <div class="form-group">
                <label>Nom et prénom du signataire *</label>
                <input type="text" id="public-signer-name" class="form-input" value="${escapeHtml(c.nom)}" required>
              </div>
              <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('client-accept-form-box').style.display = 'none'">Annuler</button>
                <button type="button" class="btn btn-terracotta btn-sm" id="btn-confirm-accept" onclick="confirmAcceptPublicDevis('${token}')">
                  <i class="ri-check-line"></i> Confirmer la validation
                </button>
              </div>
            </div>

            <!-- Inline Question Form -->
            <div id="client-question-form-box" style="display: none; background: var(--bg-card); padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border-color); margin-top: 14px;">
              <h5 style="font-size: 15px; font-weight: 800; margin-bottom: 8px;">Demande d'informations à l'artisan</h5>
              <div class="form-group">
                <label>Votre question ou remarque *</label>
                <textarea id="public-question-text" class="form-input" rows="4" placeholder="Ex: Bonjour, quelles seraient les disponibilités pour démarrer le chantier ?"></textarea>
              </div>
              <div class="form-grid">
                <div class="form-group">
                  <label>Votre nom</label>
                  <input type="text" id="public-question-nom" class="form-input" value="${escapeHtml(c.nom)}">
                </div>
                <div class="form-group">
                  <label>Votre email ou téléphone</label>
                  <input type="text" id="public-question-contact" class="form-input" value="${escapeHtml(c.email || c.telephone || '')}">
                </div>
              </div>
              <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('client-question-form-box').style.display = 'none'">Annuler</button>
                <button type="button" class="btn btn-navy btn-sm" id="btn-send-question" onclick="submitPublicQuestion('${token}')">
                  <i class="ri-send-plane-fill"></i> Transmettre à l'artisan
                </button>
              </div>
            </div>

          </div>
        ` : `
          <div style="margin-top: 32px; text-align: center;">
            <a href="/api/public/devis/${token}/pdf" target="_blank" class="btn btn-terracotta">
              <i class="ri-file-pdf-line"></i> Télécharger en PDF
            </a>
          </div>
        `}

        <!-- Conversation / Messages Thread -->
        ${data.messages && data.messages.length > 0 ? `
          <div class="public-messages-list">
            <h5 style="font-size: 14px; font-weight: 800; color: var(--text-muted); margin-top: 16px;">Échanges récents :</h5>
            ${data.messages.map(m => `
              <div class="public-message-bubble">
                <div class="author">
                  ${m.auteur === 'client' ? '👤 ' + (escapeHtml(m.nom_expediteur) || 'Vous (Client)') : '👷 ' + (escapeHtml(m.nom_expediteur) || 'Artisan')} 
                  <span style="font-weight: normal; color: var(--text-muted); font-size: 11px;"> • ${new Date(m.created_at).toLocaleDateString('fr-FR')}</span>
                </div>
                <div>${escapeHtml(m.message)}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
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

// -----------------------------------------------------------------
// PUBLIC CLIENT ACTIONS (Accept & Ask Info)
// -----------------------------------------------------------------
function showAcceptPrompt(token) {
  const box = document.getElementById('client-accept-form-box');
  const qBox = document.getElementById('client-question-form-box');
  if (qBox) qBox.style.display = 'none';
  if (box) {
    box.style.display = 'block';
    const input = document.getElementById('public-signer-name');
    if (input) input.focus();
  }
}

function showQuestionPrompt() {
  const box = document.getElementById('client-question-form-box');
  const aBox = document.getElementById('client-accept-form-box');
  if (aBox) aBox.style.display = 'none';
  if (box) {
    box.style.display = 'block';
    const input = document.getElementById('public-question-text');
    if (input) input.focus();
  }
}

async function confirmAcceptPublicDevis(token) {
  const signerInput = document.getElementById('public-signer-name');
  const nom_signataire = signerInput ? signerInput.value.trim() : '';

  if (!nom_signataire) {
    alert('Veuillez renseigner votre nom pour confirmer la validation.');
    if (signerInput) signerInput.focus();
    return;
  }

  const btn = document.getElementById('btn-confirm-accept');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="ri-loader-4-line ri-spin"></i> Validation en cours...`;
  }

  try {
    const res = await fetch(`/api/public/devis/${token}/accepter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom_signataire })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur lors de la validation.');

    alert(data.message || 'Devis accepté avec succès !');
    loadPublicView(window.location.pathname);
  } catch (err) {
    alert(err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="ri-check-line"></i> Confirmer la validation`;
    }
  }
}

async function submitPublicQuestion(token) {
  const qInput = document.getElementById('public-question-text');
  const message = qInput ? qInput.value.trim() : '';

  if (!message) {
    alert('Veuillez formuler votre question ou demande.');
    if (qInput) qInput.focus();
    return;
  }

  const nomInput = document.getElementById('public-question-nom');
  const contactInput = document.getElementById('public-question-contact');
  const nom = nomInput ? nomInput.value.trim() : '';
  const contact = contactInput ? contactInput.value.trim() : '';

  const btn = document.getElementById('btn-send-question');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="ri-loader-4-line ri-spin"></i> Envoi en cours...`;
  }

  try {
    const res = await fetch(`/api/public/devis/${token}/demande-info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        nom,
        email: contact.includes('@') ? contact : null,
        telephone: !contact.includes('@') ? contact : null
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur lors de l\'envoi.');

    alert(data.message || 'Votre message a bien été transmis à l\'artisan !');
    loadPublicView(window.location.pathname);
  } catch (err) {
    alert(err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="ri-send-plane-fill"></i> Transmettre à l'artisan`;
    }
  }
}

