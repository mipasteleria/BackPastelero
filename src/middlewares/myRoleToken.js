const jwt = require("jsonwebtoken");

const checkRoleToken = (requiredRole) => (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  jwt.verify(token, process.env.JWT_SIGN, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Failed to authenticate token" });
    }
    const { role } = decoded;

    if (role !== requiredRole) {
      return res.status(403).json({ message: "User not authorized" });
    }

    next();
  });
};

module.exports = checkRoleToken;
