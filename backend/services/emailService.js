import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: true
  }
});

export async function sendDeadlineReminder(to, deadline) {
  const mailOptions = {
    from: `"Study Planner" <${process.env.SMTP_USER}>`,
    to,
    subject: `Reminder: ${deadline.title} due soon!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #e74c3c;">Deadline Reminder</h2>
        <p><strong>${deadline.title}</strong> is due on <strong>${new Date(deadline.due_date).toLocaleString()}</strong></p>
        ${deadline.description ? `<p>${deadline.description}</p>` : ''}
        <p>Stay on track with your study plan!</p>
        <hr>
        <p style="color: #7f8c8d; font-size: 12px;">Sent by Study Planner App</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
  return true;
}

export async function sendStudyPlanEmail(to, plan) {
  const scheduleHtml = plan.dailySchedule.map(day => `
    <tr>
      <td style="border: 1px solid #ddd; padding: 8px;">Day ${day.day}</td>
      <td style="border: 1px solid #ddd; padding: 8px;">${day.date}</td>
      <td style="border: 1px solid #ddd; padding: 8px;">${day.topics.join(', ')}</td>
      <td style="border: 1px solid #ddd; padding: 8px;">${day.hours}h</td>
    </tr>
  `).join('');

  const mailOptions = {
    from: `"Study Planner" <${process.env.SMTP_USER}>`,
    to,
    subject: `Your Study Plan: ${plan.title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
        <h1 style="color: #2c3e50;">${plan.title}</h1>
        <p>${plan.summary}</p>
        <h3>Daily Schedule</h3>
        <table style="border-collapse: collapse; width: 100%;">
          <tr style="background: #3498db; color: white;">
            <th style="border: 1px solid #ddd; padding: 8px;">Day</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Date</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Topics</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Hours</th>
          </tr>
          ${scheduleHtml}
        </table>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
}

export async function sendPasswordResetEmail(to, resetLink, fullName) {
  const mailOptions = {
    from: `"StudySync" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Reset Your StudySync Password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0;">StudySync</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 0 0 8px 8px;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p style="color: #555;">Hi ${fullName || 'there'},</p>
          <p style="color: #555;">We received a request to reset your password. Click the button below to create a new password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="color: #555;">Or copy and paste this link into your browser:</p>
          <p style="color: #667eea; word-break: break-all; font-size: 14px;">${resetLink}</p>
          <p style="color: #999; font-size: 13px; margin-top: 20px;">This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">Sent by StudySync - Your Unified Learning Platform</p>
        </div>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
  return true;
}
