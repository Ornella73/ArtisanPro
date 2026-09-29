const express = require('express');
const path = require('path');
const cors = require('cors');

const authRoutes = require('./server/routes/auth');
const clientRoutes = require('./server/routes/clients');
const devisRoutes = require('./server/routes/devis');
const factureRoutes = require('./server/routes/factures');
const dashboardRoutes = require('./server/routes/dashboard');
const publicRoutes = require('./server/routes/public');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/devis', devisRoutes);
app.use('/api/factures', factureRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/public', publicRoutes);

// Public viewing HTML fallback for client link routes (e.g. /public/devis/:token or /public/factures/:token)
app.get('/public/devis/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/public/factures/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Fallback for SPA routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.listen(PORT, () => {
  console.log(`🚀 Application ArtisanPro démarrée avec succès sur le port ${PORT}`);
  console.log(`👉 http://localhost:${PORT}`);
});

module.exports = app;
