const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

class EmailService {
  async sendEmail(options) {
    const mailOptions = {
      from: process.env.MAIL_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log('Email sent:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending email:', error);
      return { success: false, error: error.message };
    }
  }

  async sendWelcomeEmail(user) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #00d4ff;">Welcome to DevDock!</h2>
        <p>Hello ${user.name},</p>
        <p>Welcome to DevDock - your repository collaboration workspace powered by AI.</p>
        
        <div style="background: #f4f4f4; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Getting Started</h3>
          <ul>
            <li>Connect your GitHub repositories</li>
            <li>Manage public and private repositories</li>
            <li>Collaborate with write/read permissions</li>
            <li>Use commit history and rollback safely</li>
          </ul>
        </div>

        <p>Get started by logging into your dashboard.</p>
        
        <a href="${process.env.FRONTEND_URL}" 
           style="display: inline-block; background: #00d4ff; color: #0a0c0f; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 10px;">
          Go to Dashboard
        </a>
      </div>
    `;

    return await this.sendEmail({
      to: user.email,
      subject: 'Welcome to DevDock!',
      html
    });
  }
}

module.exports = new EmailService();
