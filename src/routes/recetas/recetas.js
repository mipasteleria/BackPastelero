const express = require("express");
const router = express.Router();
const Receta = require("../../models/recetas/recetas");
const checkRoleToken = require("../../middlewares/myRoleToken");

/**
 * Detecta si agregar `subRecetas` a la receta con id `recetaIdActual`
 * crearía un ciclo. Recorre el grafo de dependencias con BFS — si la
 * receta actual aparece como descendiente de alguna de sus sub-recetas,
 * hay ciclo.
 *
 * Caso especial: si `recetaIdActual` es null (POST → creando), no hay
 * forma de generar ciclo desde una receta nueva (no existe todavía).
 *
 * @param {string|null} recetaIdActual  ID de la receta que se está editando
 * @param {Array} subRecetas             [{ recetaId, cantidad }, ...]
 * @returns {Promise<{ok: true} | {ok: false, error: string}>}
 */
async function validarSinCiclos(recetaIdActual, subRecetas) {
  if (!Array.isArray(subRecetas) || subRecetas.length === 0) return { ok: true };
  if (!recetaIdActual) return { ok: true }; // creando, no hay ciclo posible

  const idActualStr = String(recetaIdActual);

  // Validación directa: ninguna sub-receta puede ser la propia receta.
  for (const sub of subRecetas) {
    if (String(sub.recetaId) === idActualStr) {
      return { ok: false, error: "Una receta no puede usarse a sí misma como sub-receta" };
    }
  }

  // BFS: arrancar con las sub-recetas directas; en cada nivel cargar sus
  // sub-recetas; si alguna coincide con `idActualStr` → ciclo.
  const visitados = new Set();
  let cola = subRecetas.map((s) => String(s.recetaId));

  while (cola.length > 0) {
    const lote = cola.filter((id) => !visitados.has(id));
    lote.forEach((id) => visitados.add(id));
    if (lote.length === 0) break;

    const hijas = await Receta.find({ _id: { $in: lote } }).select("subRecetas");
    const siguienteNivel = [];
    for (const r of hijas) {
      for (const s of (r.subRecetas || [])) {
        const idHija = String(s.recetaId);
        if (idHija === idActualStr) {
          return {
            ok: false,
            error: "Se detectó un ciclo: alguna de las sub-recetas seleccionadas depende de esta receta",
          };
        }
        siguienteNivel.push(idHija);
      }
    }
    cola = siguienteNivel;
  }
  return { ok: true };
}

// Crear una nueva receta (POST) — solo admin
router.post("/", checkRoleToken("admin"), async (req, res) => {
  try {
    const receta = req.body;

    if (
      !receta.nombre_receta ||
      !receta.descripcion ||
      !Array.isArray(receta.ingredientes) ||
      receta.ingredientes.length === 0
    ) {
      return res.status(400).send({ message: "Datos incompletos o inválidos" });
    }

    // Validación de ciclos en sub-recetas. Al crear (id=null), solo se
    // valida que ninguna sub-receta dependa de OTRA que cree el ciclo.
    // En la práctica como la receta nueva todavía no existe, BFS no
    // encuentra el id actual; pero validamos las sub-recetas referenciadas
    // existan.
    if (Array.isArray(receta.subRecetas) && receta.subRecetas.length > 0) {
      const ids = receta.subRecetas.map((s) => s.recetaId).filter(Boolean);
      const encontradas = await Receta.find({ _id: { $in: ids } }).select("_id");
      if (encontradas.length !== ids.length) {
        return res.status(400).send({ message: "Alguna sub-receta no existe" });
      }
    }

    const newReceta = await Receta.create(receta);
    res.status(201).send({ message: "Receta creada", data: newReceta });
  } catch (error) {
    console.error("Error al guardar la receta:", error);
    res.status(400).send({ message: error.message });
  }
});

/**
 * GET /recetas/recetas/costo-unitario/:id — devuelve el costo unitario
 * (`total_cost / portions`) + nombre + unidadRendimiento de una receta.
 *
 * El front lo consume al agregar una sub-receta para mostrar el costo
 * proporcional en tiempo real y guardar el snapshot.
 */
router.get("/costo-unitario/:id", async (req, res) => {
  try {
    const r = await Receta.findById(req.params.id).select("nombre_receta portions total_cost unidadRendimiento");
    if (!r) return res.status(404).send({ message: "Receta no encontrada" });
    const portions = Number(r.portions) || 0;
    const totalCost = Number(r.total_cost) || 0;
    const costoUnitario = portions > 0 ? Math.round((totalCost / portions) * 100) / 100 : 0;
    res.json({
      data: {
        _id: r._id,
        nombre_receta: r.nombre_receta,
        portions: r.portions,
        total_cost: r.total_cost,
        unidadRendimiento: r.unidadRendimiento || "porcion",
        costoUnitario,
      },
    });
  } catch (e) {
    res.status(400).send({ message: e.message });
  }
});

// Obtener todas las recetas (GET)
router.get("/", async (req, res) => {
  try {
    const recetas = await Receta.find();
    res.status(200).send({ data: recetas });
  } catch (error) {
    console.error("Error al obtener las recetas:", error);
    res.status(400).send({ message: error.message });
  }
});

// Obtener una receta por ID (GET)
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const receta = await Receta.findById(id);
    if (!receta) {
      return res.status(404).send({ message: "Receta no encontrada" });
    }
    res.status(200).send({ data: receta });
  } catch (error) {
    console.error("Error al obtener la receta:", error);
    res.status(400).send({ message: error.message });
  }
});

// Actualizar una receta por ID (PUT) — solo admin
router.put("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const receta = req.body;

    // Validar ciclos antes de aplicar la edición.
    if (Array.isArray(receta.subRecetas) && receta.subRecetas.length > 0) {
      const check = await validarSinCiclos(id, receta.subRecetas);
      if (!check.ok) {
        return res.status(400).send({ message: check.error });
      }
    }

    const updatedReceta = await Receta.findByIdAndUpdate(id, receta, {
      new: true,
    });
    if (!updatedReceta) {
      return res.status(404).send({ message: "Receta no encontrada" });
    }
    res.status(200).send({ message: "Receta actualizada", data: updatedReceta });
  } catch (error) {
    console.error("Error al actualizar la receta:", error);
    res.status(400).send({ message: error.message });
  }
});

// Eliminar una receta por ID (DELETE) — solo admin
router.delete("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const deletedReceta = await Receta.findByIdAndDelete(id);
    if (!deletedReceta) {
      return res.status(404).send({ message: "Receta no encontrada" });
    }
    res.status(200).send({ message: "Receta eliminada", data: deletedReceta });
  } catch (error) {
    console.error("Error al eliminar la receta:", error);
    res.status(400).send({ message: error.message });
  }
});

module.exports = router;
