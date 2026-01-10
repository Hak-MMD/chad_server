const jwt = require("jsonwebtoken");
require("dotenv").config();

const protect = (req, res, next) => {
  console.log("Auth middleware invoked");
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader || !authHeader?.startsWith("Bearer "))
    return res
      .status(401)
      .json({ message: "Unauthorized! Login or Register to be able access!" });

  const token = authHeader.split(" ")[1];
  console.log("Auth middleware invoked2");

  jwt.verify(token, process.env.ACCESS_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: "Invalid Token!" });
    req.user = decoded;
    next();
  });
  console.log("Auth middleware invoked3 ", req.user);
};

module.exports = protect;
