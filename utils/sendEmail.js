const nodemailer = require("nodemailer");
const path = require("path");
// SMTP configuration improve in the future
// const transporter = nodemailer.createTransport({
//   host: process.env.SMTP_HOST,
//   port: process.env.SMTP_PORT,
//   secure: false, // upgrade later with TLS
//   auth: {
//     user: process.env.SMTP_USER,
//     pass: process.env.SMTP_PASS,
//   },
// });

//gmail shortcut to test quickly
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendEmail(to, subject, html) {
  try {
    const info = await transporter.sendMail({
      from: `"ChadAI" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      //   attachments: [
      //     {
      //       filename: "icon.png",
      //       path: path.join(__dirname, "..", "emails", "images", "icon.png"),
      //       cid: "chadailogo",
      //     },
      //   ],
    });

    console.log("Email sent:", info.messageId);
  } catch (err) {
    console.error("Email error:", err);
  }
}

module.exports = sendEmail;
