import cron from 'node-cron';
import { query } from '../config/db.js';
import { sendDeadlineReminder } from '../services/emailService.js';
import { sendSmsReminder } from '../services/smsService.js';

export function startReminderJob() {
  cron.schedule('*/15 * * * *', async () => {
    console.log('Running reminder check...', new Date().toISOString());

    try {
      const result = await query(
        `SELECT * FROM deadlines 
         WHERE due_date BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
         AND completed = false
         AND (email_sent = false OR sms_sent = false)`
      );

      for (const deadline of result.rows) {
        if (!deadline.email_sent) {
          try {
            await sendDeadlineReminder(deadline.email, deadline);
            await query(`UPDATE deadlines SET email_sent = true WHERE id = $1`, [deadline.id]);
            console.log(`Email sent for deadline ${deadline.id}`);
          } catch (e) {
            console.error(`Email failed for ${deadline.id}:`, e.message);
          }
        }

        if (!deadline.sms_sent && deadline.phone) {
          try {
            await sendSmsReminder(deadline.phone, deadline);
            await query(`UPDATE deadlines SET sms_sent = true WHERE id = $1`, [deadline.id]);
            console.log(`SMS sent for deadline ${deadline.id}`);
          } catch (e) {
            console.error(`SMS failed for ${deadline.id}:`, e.message);
          }
        }
      }
    } catch (error) {
      console.error('Reminder job error:', error);
    }
  });

  console.log('Reminder cron job started');
}
