/**
 * Catálogo de zonas de envío para Pastelería El Ruiseñor.
 *
 * Tarifas calculadas como ida y vuelta desde Providencia (Bogota 2866a)
 * con CX-30 (~13 km/L) + tiempo del operador. Cuando se mude el local,
 * solo es necesario revisar este archivo.
 *
 * Para asignar una zona automáticamente al ingresar la colonia, se usa
 * un mapeo `coloniaSlug → zona`. Las colonias listadas son las más
 * comunes; si no se encuentra, se cae al municipio.
 */

const ZONAS = {
  Z1: { nombre: "Zona 1 — Centro/Providencia", costo:  80, tiempo: "30 min" },
  Z2: { nombre: "Zona 2 — Zapopan/GDL periférico", costo: 120, tiempo: "45 min" },
  Z3: { nombre: "Zona 3 — Tlaquepaque/Tonalá/Zapopan sur", costo: 170, tiempo: "1 h" },
  Z4: { nombre: "Zona 4 — Tlajomulco/El Salto/Juanacatlán", costo: 260, tiempo: "1.5 h" },
};

// Mapeo de municipio → zona por defecto si no hay match de colonia.
const MUNICIPIO_A_ZONA = {
  "Guadalajara":                   "Z2",
  "Zapopan":                       "Z2",
  "San Pedro Tlaquepaque":         "Z3",
  "Tlaquepaque":                   "Z3",
  "Tonalá":                        "Z3",
  "Tonala":                        "Z3",
  "Tlajomulco de Zúñiga":          "Z4",
  "Tlajomulco de Zuniga":          "Z4",
  "Tlajomulco":                    "Z4",
  "El Salto":                      "Z4",
  "Juanacatlán":                   "Z4",
  "Juanacatlan":                   "Z4",
  "Ixtlahuacán de los Membrillos": "Z4",
  "Ixtlahuacan de los Membrillos": "Z4",
  "Acatlán de Juárez":             "Z4",
  "Acatlan de Juarez":             "Z4",
};

// Mapeo colonia → zona. Las colonias se buscan por slug (normalizado).
// Z1 = más cercanas al origen (Providencia).
const COLONIA_A_ZONA = {
  // ── Z1: GDL central / Providencia y aledañas ──
  "providencia":         "Z1",
  "americana":           "Z1",
  "lafayette":           "Z1",
  "chapultepec":         "Z1",
  "moderna":             "Z1",
  "ladron-de-guevara":   "Z1",
  "del-valle":           "Z1",
  "arcos":               "Z1",
  "arcos-vallarta":      "Z1",
  "arcos-sur":           "Z1",
  "vallarta-sur":        "Z1",
  "vallarta-norte":      "Z1",
  "vallarta-poniente":   "Z1",
  "country-club":        "Z1",
  "jardines-del-bosque": "Z1",
  "monraz":              "Z1",
  "prados-providencia":  "Z1",
  "circunvalacion":      "Z1",
  "italia-providencia":  "Z1",
  "obrera":              "Z1",
  "centro":              "Z1",

  // ── Z2: Zapopan centro / Patria / Andares + GDL periférico ──
  "andares":             "Z2",
  "puerta-de-hierro":    "Z2",
  "real-de-acueducto":   "Z2",
  "valle-real":          "Z2",
  "santa-margarita":     "Z2",
  "ciudad-granja":       "Z2",
  "zapopan-centro":      "Z2",
  "tepeyac":             "Z2",
  "colomos":             "Z2",
  "colinas-de-san-javier": "Z2",
  "el-bajio":            "Z2",
  "las-fuentes":         "Z2",
  "la-calma":            "Z2",
  "ciudad-del-sol":      "Z2",
  "miravalle":           "Z2",
  "olimpica":            "Z2",
  "lomas-del-valle":     "Z2",
  "patria":              "Z2",
  "huentitan":           "Z2",
  "atemajac":            "Z2",
  "alcalde":             "Z2",
  "oblatos":             "Z2",
  "tetlan":              "Z2",
  "san-andres":          "Z2",
  "olimpica-zapopan":    "Z2",

  // ── Z3: Tlaquepaque, Tonalá, Zapopan sur ──
  "san-pedro-tlaquepaque": "Z3",
  "tlaquepaque-centro":  "Z3",
  "tlaquepaque":         "Z3",
  "tonala-centro":       "Z3",
  "tonala":              "Z3",
  "santa-anita":         "Z3",
  "mariano-otero":       "Z3",
  "alamo-industrial":    "Z3",
  "el-cerrito":          "Z3",
  "loma-bonita":         "Z3",
  "el-fortin":           "Z3",
  "lopez-cotilla":       "Z3",
};

/**
 * Normaliza un texto a "slug": minúsculas, sin acentos, espacios → guión.
 */
function slugify(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")    // remueve acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Resuelve la zona y costo de envío a partir de colonia y municipio.
 *
 * @param {object} input
 * @param {string} input.colonia
 * @param {string} input.municipio
 * @returns {{zona: string, costo: number, nombre: string, fuente: "colonia"|"municipio"|"default"}}
 */
function resolverZona({ colonia, municipio }) {
  const slug = slugify(colonia);

  if (slug && COLONIA_A_ZONA[slug]) {
    const zona = COLONIA_A_ZONA[slug];
    return { zona, ...ZONAS[zona], fuente: "colonia" };
  }

  const m = String(municipio || "").trim();
  if (m && MUNICIPIO_A_ZONA[m]) {
    const zona = MUNICIPIO_A_ZONA[m];
    return { zona, ...ZONAS[zona], fuente: "municipio" };
  }

  // Default conservador para entregas en municipios listados sin colonia conocida
  return { zona: "Z2", ...ZONAS.Z2, fuente: "default" };
}

module.exports = {
  ZONAS,
  MUNICIPIO_A_ZONA,
  COLONIA_A_ZONA,
  slugify,
  resolverZona,
};
