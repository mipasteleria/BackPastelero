const checkRole = (req, res, next) => {
  const { role } = req.headers;

  if (role !== "admin") {
    res.status(401).json({ message: "User not authorized" });
  } else {
    next();
  }
};

module.exports = checkRole;
