// utils/validatePassword.js
module.exports = function validatePassword(password) {
  const minLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  return minLength && hasUpper && hasNumber;
};
