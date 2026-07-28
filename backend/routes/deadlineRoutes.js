import express from 'express';
import dbStore from '../services/dbStore.js';
import { authenticate } from '../middleware/auth.js';
import { sanitizeHtml } from '../middleware/security.js';

const router = express.Router();

// Create deadline
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { study_plan_id, title, description, due_date, email, phone, priority } = req.body;
    const userId = req.user.id;

    // A03: Sanitize inputs
    const safeTitle = title ? sanitizeHtml(title).slice(0, 200) : '';
    const safeDescription = description ? sanitizeHtml(description).slice(0, 1000) : '';
    const safeEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
    const safePhone = phone ? phone.replace(/[^0-9+\-() ]/g, '').slice(0, 20) : '';
    const safePriority = ['low', 'medium', 'high'].includes(priority) ? priority : 'medium';

    const deadline = await dbStore.insert('deadlines', {
      study_plan_id,
      title: safeTitle,
      description: safeDescription,
      due_date,
      priority: safePriority,
      status: 'pending',
      email: safeEmail,
      phone: safePhone,
      user_id: userId
    });

    res.status(201).json({ success: true, data: deadline });
  } catch (error) {
    next(error);
  }
});

// Get deadlines
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status } = req.query;
    const userId = req.user.id;
    let deadlines = await dbStore.select('deadlines', { user_id: userId });

    if (status === 'upcoming') {
      const now = new Date();
      deadlines = deadlines.filter(d => new Date(d.due_date) > now && d.status !== 'completed');
    } else if (status === 'completed') {
      deadlines = deadlines.filter(d => d.status === 'completed');
    }

    // Sort by due date
    deadlines.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

    res.json({ success: true, data: deadlines });
  } catch (error) {
    next(error);
  }
});

// Update deadline
router.patch('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { completed, status, priority } = req.body;

    const deadline = await dbStore.findById('deadlines', id);
    if (!deadline) {
      return res.status(404).json({ error: 'Deadline not found' });
    }

    // Check if user owns this deadline
    if (deadline.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updates = {};
    if (completed !== undefined) updates.status = completed ? 'completed' : 'pending';
    if (status) updates.status = status;
    if (priority) updates.priority = priority;

    const updated = await dbStore.updateOne('deadlines', { id }, updates);

    if (!updated) {
      return res.status(404).json({ error: 'Deadline not found' });
    }

    const updatedDeadline = await dbStore.findById('deadlines', id);
    res.json({ success: true, data: updatedDeadline });
  } catch (error) {
    next(error);
  }
});

// Delete deadline
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const deadline = await dbStore.findById('deadlines', id);

    if (!deadline) {
      return res.status(404).json({ error: 'Deadline not found' });
    }

    // Check if user owns this deadline
    if (deadline.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await dbStore.deleteOne('deadlines', { id });
    res.json({ success: true, message: 'Deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
