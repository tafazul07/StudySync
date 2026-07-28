import express from 'express';
import dbStore from '../services/dbStore.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Create a new WebRTC room
router.post('/rooms', authenticate, async (req, res, next) => {
  try {
    const { name } = req.body;
    const userId = req.user.id;

    const room = await dbStore.insert('webrtc_rooms', {
      name: name || 'Study Room',
      created_by: userId,
      active: true
    });

    res.json({
      success: true,
      room
    });
  } catch (error) {
    next(error);
  }
});

// Get all active rooms — A01: requires authentication
router.get('/rooms', authenticate, async (req, res, next) => {
  try {
    const rooms = await dbStore.select('webrtc_rooms', { active: true });
    res.json({ rooms });
  } catch (error) {
    next(error);
  }
});

// Get room by ID — A01: requires authentication
router.get('/rooms/:id', authenticate, async (req, res, next) => {
  try {
    const room = await dbStore.findById('webrtc_rooms', req.params.id);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    res.json({ room });
  } catch (error) {
    next(error);
  }
});

// Update room status
router.patch('/rooms/:id', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { active } = req.body;
    const room = await dbStore.findById('webrtc_rooms', req.params.id);
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Check if user owns this room
    if (room.created_by !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updated = await dbStore.updateOne('webrtc_rooms', { id: req.params.id }, { active });
    
    if (!updated) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const updatedRoom = await dbStore.findById('webrtc_rooms', req.params.id);
    res.json({ success: true, room: updatedRoom });
  } catch (error) {
    next(error);
  }
});

// Delete room
router.delete('/rooms/:id', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const room = await dbStore.findById('webrtc_rooms', req.params.id);
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Check if user owns this room
    if (room.created_by !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await dbStore.deleteOne('webrtc_rooms', { id: req.params.id });
    res.json({ success: true, message: 'Room deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
