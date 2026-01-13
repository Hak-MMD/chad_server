// middleware/requireAdmin.js

function admin(req, res, next) {
  try {
    // Auth middleware must run before this
    if (!req.user) {
      return res.status(401).json({
        errorMessage: "Unauthorized",
      });
    }

    // // Optional: block non-active users
    // if (req.user.status !== "active") {
    //   return res.status(403).json({
    //     errorMessage: "Account is not active",
    //   });
    // }

    const allowedRoles = ["admin", "dev"];

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        errorMessage: "Access denied. Admins only.",
      });
    }

    // All good
    next();
  } catch (err) {
    console.error("Admin middleware error:", err);
    return res.status(500).json({
      errorMessage: "Authorization failed",
    });
  }
}

module.exports = admin;
