const fs = require("fs");
const path = require("path");

function loadTemplate(templateName) {
  const filePath = path.join(
    __dirname,
    "..",
    "emails",
    "templates",
    templateName
  );
  return fs.readFileSync(filePath, "utf8");
}

module.exports = loadTemplate;
