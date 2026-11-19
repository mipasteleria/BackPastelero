const PostreCotiza = require("../../models/cotizacionCatalogos/postre");
const Receta = require("../../models/recetas/recetas");
const checkRoleToken = require("../../middlewares/myRoleToken");
const express = require("express");
const crudFactory = require("./_crudFactory");
const Cost = require("../../models/costs");
const { costearPostreMesa } = require("../../utils/costeoPostreMesa");
const { calcularEmpaque } = require("../../utils/empaque");
const { getConfigPasarela } = require("../../utils/comisionPasarela");

/**
 * Postres (mesa de postres) — CRUD + recosteo desde receta.
 *
 * Mismo patrón que sabores: el admin vincula una Receta y recostea para
 * congelar `costoUnitarioSnapshot` (total_cost / portions). Si no hay
 * receta, `costoManual` (por porción) se usa como fallback.
 */
// OJO con el orden: el CRUD genérico define `GET /:id`, que capturaría
// `/costeo` tratándolo como un id. Por eso las rutas específicas se
// registran primero y el CRUD se monta al final.
const router = express.Router();

const crudRouter = crudFactory({
  Model: PostreCotiza,
  camposEditables: [
    "slug",
    "nombre",
    "descripcion",
    "emoji",
    "imagenUrl",
    "imagenFileName",
    "recetaId",
    "costoManual",
    "precioManual",
    "empaque",
    "activo",
    "orden",
  ],
  populate: ["recetaId"],
  recostearReceta: true,
});

/**
 * GET /cotizacion-catalogos/postres/costeo — admin.
 *
 * Devuelve cada postre del catálogo con su costo, margen y PRECIO por
 * porción, calculados con el mismo helper que usa el costeo real de la
 * cotización. Existe porque la pantalla de catálogo solo mostraba el
 * costo, y daba la impresión de que el margen no se estaba aplicando
 * cuando sí se aplicaba al cotizar.
 */
router.get("/costeo", checkRoleToken("admin"), async (req, res) => {
  try {
    const cfg = await Cost.findOne();
    const markup = cfg?.markupCotizacionesPct ?? cfg?.markupPostresPct ?? 60;

    // Comisión de pasarela, vista POR PIEZA. Solo se aplica la parte
    // porcentual: la cuota fija ($3 en Stripe) es por transacción, no por
    // unidad, así que repartirla entre piezas daría un número inventado.
    const pasarela = await getConfigPasarela();
    const pctConIva = pasarela.activa
      ? (pasarela.comisionPct / 100) * (1 + pasarela.ivaSobreComisionPct / 100)
      : 0;
    const postres = await PostreCotiza.find().populate("recetaId").sort({ orden: 1 });
    const data = [];
    for (const p of postres) {
      const { total: costoEmpaque, detalle: empaqueDetalle } = await calcularEmpaque(p.empaque);
      const costeo = costearPostreMesa(p, markup, costoEmpaque);

      // Con `incluirEnPrecio` la comisión se SUMA al precio: el cliente
      // paga más y la ganancia no se toca. Se reporta lo que acaba
      // pagando y lo que se lleva la pasarela, para que el dato esté a la
      // vista en vez de suponerlo.
      const precioConComision = pctConIva > 0 && pctConIva < 1
        ? Math.round((costeo.precioUnitario / (1 - pctConIva)) * 100) / 100
        : costeo.precioUnitario;

      data.push({
        _id: p._id,
        slug: p.slug,
        nombre: p.nombre,
        empaqueDetalle,
        ...costeo,
        comisionActiva: pasarela.activa,
        comisionProveedor: pasarela.proveedorNombre,
        comisionPctUnitaria: Math.round(pctConIva * 1000) / 10,
        precioConComision,
        comisionUnitaria: Math.round((precioConComision - costeo.precioUnitario) * 100) / 100,
      });
    }
    res.json({ markupGlobal: markup, data });
  } catch (e) {
    console.error("Error costeando catálogo de postres:", e);
    res.status(500).json({ message: e.message });
  }
});

router.post("/:id/recostear", checkRoleToken("admin"), async (req, res) => {
  try {
    const postre = await PostreCotiza.findById(req.params.id);
    if (!postre) return res.status(404).json({ message: "Postre no encontrado" });
    if (!postre.recetaId) {
      return res.status(400).json({ message: "Este postre no tiene receta vinculada" });
    }
    const receta = await Receta.findById(postre.recetaId);
    if (!receta) return res.status(404).json({ message: "Receta vinculada no existe" });
    if (!receta.portions || receta.portions <= 0) {
      return res.status(400).json({ message: "La receta no tiene `portions` válido" });
    }

    postre.costoUnitarioSnapshot = Math.round((receta.total_cost / receta.portions) * 100) / 100;
    postre.fechaCosteoSnapshot = new Date();
    await postre.save();

    res.json({ message: "Postre recosteado", data: postre });
  } catch (e) {
    console.error("Error recosteando postre:", e);
    res.status(400).json({ message: e.message });
  }
});

// El CRUD genérico va al final, ya con /costeo y /:id/recostear registrados.
router.use(crudRouter);

module.exports = router;
