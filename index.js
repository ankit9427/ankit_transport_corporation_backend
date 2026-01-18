require("dotenv").config();

const express = require("express");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const smsFilePath = path.join(__dirname, "messages.json");

// ===============================
// Detect if running on Render
// ===============================
const isRender = !!process.env.RENDER; // Render sets this env automatically

// ===============================
// Nodemailer SMTP Transport (for local)
// ===============================
let smtpTransport = null;

if (!isRender) {
  smtpTransport = nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST,
    port: Number(process.env.BREVO_SMTP_PORT),
    secure: false,
    auth: {
      user: process.env.BREVO_SMTP_USER,
      pass: process.env.BREVO_SMTP_PASS,
    },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  smtpTransport.verify((err) => {
    if (err) console.error("❌ SMTP Verification Failed:", err.message);
    else console.log("✅ SMTP Ready (Local)");
  });
}

// ===============================
// HELPER: SAVE SMS LOCALLY
// ===============================
function saveSMS(phoneNumber, message, senderName, senderEmail, messageType) {
  let messages = [];
  if (fs.existsSync(smsFilePath)) {
    messages = JSON.parse(fs.readFileSync(smsFilePath, "utf8"));
  }

  const newMessage = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    phoneNumber,
    message,
    senderName,
    senderEmail,
    messageType,
    read: false,
  };

  messages.push(newMessage);
  fs.writeFileSync(smsFilePath, JSON.stringify(messages, null, 2));
  return newMessage;
}

// ===============================
// HELPER: SEND EMAIL
// ===============================
async function sendEmail({ toEmail, replyTo, subject, htmlContent }) {
  if (isRender) {
    // Use Brevo API on Render
    try {
      const response = await axios.post(
        "https://api.brevo.com/v3/smtp/email",
        {
          sender: { name: "Ankit Transport", email: process.env.BREVO_FROM_EMAIL },
          to: [{ email: toEmail, name: "Ankit Transport" }],
          replyTo: { email: replyTo, name: "Sender" },
          subject,
          htmlContent,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "api-key": process.env.BREVO_API_KEY, // Must be Brevo API Key
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("❌ Brevo API Error:", error.response?.data || error.message);
      throw error;
    }
  } else {
    // Use SMTP locally
    try {
      const info = await smtpTransport.sendMail({
        from: `"Ankit Transport" <${process.env.BREVO_FROM_EMAIL}>`,
        to: toEmail,
        replyTo,
        subject,
        html: htmlContent,
      });
      return info;
    } catch (error) {
      console.error("❌ SMTP Error:", error);
      throw error;
    }
  }
}

// ===============================
// CONTACT MESSAGE
// ===============================
app.post("/api/send-message", async (req, res) => {
  const { name, email, message } = req.body;

  const htmlContent = `
    <h3>Contact Form Message</h3>
    <p><b>Name:</b> ${name}</p>
    <p><b>Email:</b> ${email}</p>
    <p><b>Message:</b><br/>${message.replace(/\n/g, "<br>")}</p>
  `;

  try {
    await sendEmail({
      toEmail: process.env.BREVO_FROM_EMAIL,
      replyTo: email,
      subject: `New Message from ${name}`,
      htmlContent,
    });

    saveSMS("local", message, name, email, "contact");
    res.status(200).json({ message: "Message sent successfully!" });
  } catch (error) {
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

  const htmlContent = `
    <h3>Quotation Request</h3>
    <p><b>Name:</b> ${name}</p>
    <p><b>Company:</b> ${company}</p>
    <p><b>Email:</b> ${email}</p>
    <p><b>Phone:</b> ${phone}</p>
    <p><b>Origin Zip:</b> ${originZip}</p>
    <p><b>Destination Zip:</b> ${destinationZip}</p>
    <p><b>Product:</b> ${product}</p>
    <p><b>Truck Type:</b> ${truckType}</p>
    <p><b>Message:</b><br/>${message.replace(/\n/g, "<br>")}</p>
  `;

  try {
    await sendEmail({
      toEmail: process.env.BREVO_FROM_EMAIL,
      replyTo: email,
      subject: `Quotation Request - ${name}`,
      htmlContent,
    });
    res.status(200).json({ message: "Quotation sent successfully!" });
  } catch (error) {
    res.status(500).json({ message: "Quotation failed", error: error.message });
  }
});

// ===============================
// SAVE SMS LOCALLY
// ===============================
app.post("/api/send-sms", (req, res) => {
  const { phoneNumber, message, senderName, senderEmail, messageType } = req.body;

  if (!phoneNumber || !message) {
    return res.status(400).json({ message: "Phone number and message required" });
  }

  const sms = saveSMS(phoneNumber, message, senderName, senderEmail, messageType || "contact");
  res.status(200).json({ message: "Message saved locally!", sms });
});

// ===============================
// GET ALL MESSAGES
// ===============================
app.get("/api/messages", (req, res) => {
  try {
    if (!fs.existsSync(smsFilePath)) return res.status(200).json([]);
    const messages = JSON.parse(fs.readFileSync(smsFilePath, "utf8"));
    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ message: "Error reading messages", error: error.message });
  }
});

// ===============================
// MARK MESSAGE AS READ
// ===============================
app.put("/api/messages/:id/read", (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    if (!fs.existsSync(smsFilePath)) return res.status(404).json({ message: "No messages found" });

    let messages = JSON.parse(fs.readFileSync(smsFilePath, "utf8"));
    const message = messages.find(m => m.id === messageId);
    if (!message) return res.status(404).json({ message: "Message not found" });

    message.read = true;
    fs.writeFileSync(smsFilePath, JSON.stringify(messages, null, 2));
    res.status(200).json({ message: "Message marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Error updating message", error: error.message });
  }
});

// ===============================
// DELETE MESSAGE
// ===============================
app.delete("/api/messages/:id", (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    if (!fs.existsSync(smsFilePath)) return res.status(404).json({ message: "No messages found" });

    let messages = JSON.parse(fs.readFileSync(smsFilePath, "utf8"));
    messages = messages.filter(m => m.id !== messageId);
    fs.writeFileSync(smsFilePath, JSON.stringify(messages, null, 2));

    res.status(200).json({ message: "Message deleted" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting message", error: error.message });
  }
});

// ===============================
// TEST EMAIL CONFIG
// ===============================
app.get("/api/test-email", async (req, res) => {
  try {
    await sendEmail({
      toEmail: process.env.BREVO_FROM_EMAIL,
      replyTo: process.env.BREVO_FROM_EMAIL,
      subject: "Test Email from Ankit Transport",
      htmlContent: "<p>If you see this, email service is working!</p>",
    });
    res.status(200).json({ message: "Email service is working!" });
  } catch (error) {
    res.status(500).json({ message: "Email failed", error: error.message });
  }
});

// ===============================
app.get("/", (req, res) => {
  res.send("Backend is live 🚀");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
