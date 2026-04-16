const jwt = require("jsonwebtoken");

// Verifica el JWT y, si se pasa un rol, exige que coincida.
// Si `requiredRole` es null/undefined solo valida la firma/vencimiento
// y deja `req.user` disponible para el siguiente handler.
const checkRoleToken = (requiredRole) => (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  jwt.verify(token, process.env.JWT_SIGN, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Failed to authenticate token" });
    }

    req.user = decoded;

    if (requiredRole && decoded.role !== requiredRole) {
      return res.status(403).json({ message: "User not authorized" });
    }

    next();
  });
};

// Azúcar: solo valida el token (cualquier rol autenticado).
const requireAuth = checkRoleToken(null);

module.exports = checkRoleToken;
module.exports.requireAuth = requireAuth;
