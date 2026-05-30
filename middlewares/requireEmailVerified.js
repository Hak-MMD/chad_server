const User = require("../models/User");

// Must run after the `protect` middleware (relies on req.user from JWT).
// Fast path uses the JWT payload; slow path (legacy tokens without the field) queries the DB.
const requireEmailVerified = async (req, res, next) => {
  if (req.user.emailVerified === true) return next();

  if (req.user.emailVerified === false) {
    return res.status(403).json({
      error: "Email not verified. Please check your inbox and verify your email.",
      code: "EMAIL_NOT_VERIFIED",
    });
  }

  // Token was issued before emailVerified was added to the payload — check DB
  try {
    const user = await User.findById(req.user.id, "emailVerified");
    if (user?.emailVerified) return next();

    return res.status(403).json({
      error: "Email not verified. Please check your inbox and verify your email.",
      code: "EMAIL_NOT_VERIFIED",
    });
  } catch {
    return res.status(500).json({ error: "Authorization check failed" });
  }
};

module.exports = requireEmailVerified;
