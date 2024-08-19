const express = require('express');
const router = express.Router();

// Importar las rutas de recetas
const recetaRoutes = require('./recetas'); // Verifica si el archivo se llama realmente `receta.js`

// Usar las rutas importadas
router.use('/recetas', recetaRoutes);

module.exports = router;
