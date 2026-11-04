/**
 * Campo de email de cliente, con validación de formato.
 *
 * Por qué existe: estos campos aceptaban cualquier texto, y los pedidos y
 * cotizaciones los puede llenar un invitado sin cuenta. Ese texto termina
 * en `sendMail()`, y el parser de direcciones de nodemailer tuvo fallos de
 * backtracking cuadrático explotables justamente con direcciones
 * construidas a propósito. La versión de nodemailer ya está parcheada;
 * esto es la segunda línea: que la basura no entre siquiera a la base.
 *
 * El tope de longitud es deliberado — una dirección real no pasa de ~254
 * caracteres (RFC 5321), y las cadenas largas son la munición de ese tipo
 * de ataque.
 *
 * Vacío sigue siendo válido: el email es opcional en estos formularios,
 * hay clientes que solo dejan teléfono.
 */
const emailCliente = (extra = {}) => ({
  type: String,
  default: "",
  trim: true,
  lowercase: true,
  maxlength: [254, "El correo es demasiado largo"],
  validate: {
    validator: (v) => !v || /^[^\s@,;:<>()[\]\\"]+@[^\s@,;:<>()[\]\\"]+\.[A-Za-z]{2,}$/.test(v),
    message: "El correo no tiene un formato válido",
  },
  ...extra,
});

module.exports = { emailCliente };
