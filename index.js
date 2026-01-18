const express = require("express");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// SMS messages file path
const smsFilePath = path.join(__dirname, "messages.json");

app.post("/api/send-message", async (req, res) => {
  const { name, email, message } = req.body;

  console.log("Attempting to send message from:", email);
  console.log("Email User:", process.env.EMAIL_USER);

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    replyTo: email,
    subject: `New Message from ${name} - Ankit Transport`,
    html: `
      <h2>New Contact Form Submission</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Message:</strong></p>
      <p>${message.replace(/\n/g, "<br>")}</p>
    `,
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", result.messageId);
    
    // Also save as local SMS
    saveSMS(
      process.env.PHONE_NUMBER || "local",
      `Message from ${name} (${email}): ${message}`,
      name,
      email,
      "message"
    );
    
    res.status(200).json({ message: "Message sent successfully!" });
  } catch (error) {
    console.error("Error sending email:", error.message);
    res.status(500).json({ message: "Failed to send message.", error: error.message });
  }
});

app.post("/api/send-quotation", async (req, res) => {
  const {
    name,
    company,
    email,
    phone,
    originZip,
    destinationZip,
    product,
    truckType,
    message,
  } = req.body;

  console.log("Attempting to send quotation from:", email);

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    replyTo: email,
    subject: `Quotation Request from ${name} - Ankit Transport`,
    html: `
      <h2>New Quotation Request</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Company:</strong> ${company}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone}</p>
      <p><strong>Origin Zip Code:</strong> ${originZip}</p>
      <p><strong>Destination Zip Code:</strong> ${destinationZip}</p>
      <p><strong>Product:</strong> ${product}</p>
      <p><strong>Truck Type:</strong> ${truckType}</p>
      <p><strong>Message:</strong></p>
      <p>${message.replace(/\n/g, "<br>")}</p>
    `,
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log("Quotation email sent successfully:", result.messageId);
    res.status(200).json({ message: "Quotation request sent successfully!" });
  } catch (error) {
    console.error("Error sending quotation email:", error.message);
    res.status(500).json({ message: "Failed to send quotation request.", error: error.message });
  }
});

// Helper function to save SMS locally
function saveSMS(phoneNumber, message, senderName, senderEmail, messageType) {
  try {
    let messages = [];
    
    if (fs.existsSync(smsFilePath)) {
      const data = fs.readFileSync(smsFilePath, "utf8");
      messages = JSON.parse(data);
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
    
    console.log(`📱 SMS saved to local system for ${phoneNumber}`);
    return newMessage;
  } catch (error) {
    console.error("Error saving SMS:", error);
    return null;
  }
}

// Endpoint to send SMS locally
app.post("/api/send-sms", (req, res) => {
  const { phoneNumber, message, senderName, senderEmail, messageType } = req.body;
  
  if (!phoneNumber || !message) {
    return res.status(400).json({ message: "Phone number and message required" });
  }
  
  const sms = saveSMS(phoneNumber, message, senderName, senderEmail, messageType || "contact");
  
  if (sms) {
    res.status(200).json({ 
      message: "Message saved locally!", 
      sms 
    });
  } else {
    res.status(500).json({ message: "Failed to save message" });
  }
});

// Endpoint to get all received SMS
app.get("/api/messages", (req, res) => {
  try {
    if (!fs.existsSync(smsFilePath)) {
      return res.status(200).json([]);
    }
    
    const data = fs.readFileSync(smsFilePath, "utf8");
    const messages = JSON.parse(data);
    res.status(200).json(messages);
  } catch (error) {
    console.error("Error reading messages:", error);
    res.status(500).json({ message: "Error reading messages", error: error.message });
  }
});

// Endpoint to mark message as read
app.put("/api/messages/:id/read", (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    
    if (!fs.existsSync(smsFilePath)) {
      return res.status(404).json({ message: "No messages found" });
    }
    
    let messages = JSON.parse(fs.readFileSync(smsFilePath, "utf8"));
    const message = messages.find(m => m.id === messageId);
    
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }
    
    message.read = true;
    fs.writeFileSync(smsFilePath, JSON.stringify(messages, null, 2));
    
    res.status(200).json({ message: "Message marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Error updating message", error: error.message });
  }
});

// Endpoint to delete a message
app.delete("/api/messages/:id", (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    
    if (!fs.existsSync(smsFilePath)) {
      return res.status(404).json({ message: "No messages found" });
    }
    
    let messages = JSON.parse(fs.readFileSync(smsFilePath, "utf8"));
    messages = messages.filter(m => m.id !== messageId);
    
    fs.writeFileSync(smsFilePath, JSON.stringify(messages, null, 2));
    
    res.status(200).json({ message: "Message deleted" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting message", error: error.message });
  }
});
app.get("/api/test-email", async (req, res) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    await transporter.verify();
    res.status(200).json({ 
      message: "Email configuration is working!", 
      emailUser: process.env.EMAIL_USER 
    });
  } catch (error) {
    console.error("Email configuration error:", error.message);
    res.status(500).json({ 
      message: "Email configuration failed!", 
      error: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log("Email service configured with:", process.env.EMAIL_USER);
});
