import express from 'express';
import { createDeadline, getDeadlines, updateDeadline, deleteDeadline } from '../controllers/deadlineController.js';

const router = express.Router();

router.post('/', createDeadline);
router.get('/', getDeadlines);
router.patch('/:id', updateDeadline);
router.delete('/:id', deleteDeadline);

export default router;
