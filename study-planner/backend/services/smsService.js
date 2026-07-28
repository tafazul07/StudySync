import twilio from 'twilio';

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

export async function sendSmsReminder(phone, deadline) {
  if (!phone) return false;

  const message = await client.messages.create({
    body: `Study Planner Reminder: \"${deadline.title}\" is due on ${new Date(deadline.due_date).toLocaleDateString()}. Don't forget!`,
    from: fromNumber,
    to: phone
  });

  return message.sid;
}
