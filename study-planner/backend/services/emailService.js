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
    from: `\"Study Planner\" <${process.env.SMTP_USER}>`,
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
    from: `\"Study Planner\" <${process.env.SMTP_USER}>`,
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
