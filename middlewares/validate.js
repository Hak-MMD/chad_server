const { body, validationResult } = require("express-validator");
const mongoose = require("mongoose");

// Runs after validation chains; returns 400 with field-level errors if any failed
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: "Validation failed",
      details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

const validateRegister = [
  body("email")
    .isEmail().withMessage("Valid email address required")
    .normalizeEmail(),
  body("password")
    .isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
  body("name")
    .trim()
    .notEmpty().withMessage("Name is required")
    .isLength({ max: 50 }).withMessage("Name must be 50 characters or fewer"),
  handleValidation,
];

const validateLogin = [
  body("email")
    .isEmail().withMessage("Valid email address required")
    .normalizeEmail(),
  body("password")
    .notEmpty().withMessage("Password is required"),
  handleValidation,
];

const validateVerifyEmail = [
  body("email")
    .isEmail().withMessage("Valid email address required")
    .normalizeEmail(),
  body("code")
    .matches(/^\d{6}$/).withMessage("Verification code must be exactly 6 digits"),
  handleValidation,
];

const validateMessage = [
  body("chatId")
    .notEmpty().withMessage("chatId is required")
    .custom((val) => mongoose.Types.ObjectId.isValid(val))
    .withMessage("chatId must be a valid ID"),
  body("text")
    .optional()
    .isString().withMessage("text must be a string")
    .isLength({ max: 20000 }).withMessage("Message text must be 20,000 characters or fewer"),
  body("idempotencyKey")
    .optional()
    .isString()
    .isLength({ max: 128 }).withMessage("idempotencyKey must be 128 characters or fewer"),
  handleValidation,
];

const validateCreateChat = [
  body("title")
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage("Title must be 100 characters or fewer"),
  body("source")
    .optional()
    .isIn(["extension", "website"]).withMessage("source must be 'extension' or 'website'"),
  handleValidation,
];

const validateUpdateChat = [
  body("title")
    .trim()
    .notEmpty().withMessage("Title is required")
    .isLength({ max: 100 }).withMessage("Title must be 100 characters or fewer"),
  handleValidation,
];

module.exports = {
  validateRegister,
  validateLogin,
  validateVerifyEmail,
  validateMessage,
  validateCreateChat,
  validateUpdateChat,
};
