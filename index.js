require("dotenv").config();

const express = require("express");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const smsFilePath = path.join(__dirname, "messages.json");


// ===============================
// ✅ CREATE SINGLE SMTP TRANSPORT
// ===============================
const transporter = nodemailer.createTransport({
  host: process.env.BREVO_SMTP_HOST,
  port: Number(process.env.BREVO_SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
  connectionTimeout: 10000, // 10s
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

// Verify once on server start
transporter.verify((err) => {
  if (err) {
    console.error("❌ SMTP Verification Failed:", err.message);
  } else {
    console.log("✅ Brevo SMTP Ready");
  }
});


// ===============================
// CONTACT MESSAGE
// ===============================
app.post("/api/send-message", async (req, res) => {
  const { name, email, message } = req.body;

  try {
    await transporter.sendMail({
      from: `"Ankit Transport" <${process.env.BREVO_FROM_EMAIL}>`,
      to: process.env.BREVO_FROM_EMAIL,
      replyTo: email,
      subject: `New Message from ${name}`,
      html: `
        <h3>Contact Form Message</h3>
        <p><b>Name:</b> ${name}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Message:</b><br/>${message.replace(/\n/g, "<br>")}</p>
      `,
    });

    saveSMS("local", message, name, email, "contact");

    res.status(200).json({ message: "Message sent successfully!" });

  } catch (error) {
    console.error("❌ Email Error:", error);
    res.status(500).json({ message: "Email failed", error: error.message });
  }
});


// ===============================
// QUOTATION REQUEST
// ===============================
app.post("/api/send-quotation", async (req, res) => {
  const {
    name, company, email, phone,
    originZip, destinationZip,
    product, truckType, message
  } = req.body;

  try {
    await transporter.sendMail({
      from: `"Ankit Transport" <${process.env.BREVO_FROM_EMAIL}>`,
      to: process.env.BREVO_FROM_EMAIL,
      replyTo: email,
      subject: `Quotation Request - ${name}`,
      html: `
        <h3>Quotation Request</h3>
        <p><b>Name:</b> ${name}</p>
        <p><b>Company:</b> ${company}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Phone:</b> ${phone}</p>
        <p><b>From:</b> ${originZip}</p>
        <p><b>To:</b> ${destinationZip}</p>
        <p><b>Product:</b> ${product}</p>
        <p><b>Truck Type:</b> ${truckType}</p>
        <p><b>Message:</b><br/>${message.replace(/\n/g, "<br>")}</p>
      `,
    });

    res.status(200).json({ message: "Quotation sent successfully!" });

  } catch (error) {
    console.error("❌ Quotation Email Error:", error);
    res.status(500).json({ message: "Quotation failed", error: error.message });
  }
});


// ===============================
// SAVE SMS LOCALLY
// ===============================
function saveSMS(phoneNumber, message, senderName, senderEmail, messageType) {
  let messages = [];
  if (fs.existsSync(smsFilePath)) {
    messages = JSON.parse(fs.readFileSync(smsFilePath, "utf8"));
  }

  messages.push({
    id: Date.now(),
    timestamp: new Date().toISOString(),
    phoneNumber,
    message,
    senderName,
    senderEmail,
    messageType,
    read: false,
  });

  fs.writeFileSync(smsFilePath, JSON.stringify(messages, null, 2));
}


// ===============================
app.get("/", (req, res) => {
  res.send("Backend is live 🚀");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
