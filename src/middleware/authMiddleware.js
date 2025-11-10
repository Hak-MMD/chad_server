const jwt = require("jsonwebtoken");
require("dotenv").config();

const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader || !authHeader?.startsWith("Bearer "))
    return res
      .status(401)
      .json({ message: "Unauthorized! Login or Register to be able access!" });

  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: "Invalid Token!" });
    const user = {
      userId: decoded.userId,
      email: decoded.email,
    };
    req.user = user;
    next();
  });
};

module.exports = verifyJWT;
