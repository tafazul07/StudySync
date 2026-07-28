import express from 'express';
import { createStudyPlan, getStudyPlans, getStudyPlanById, deleteStudyPlan } from '../controllers/studyPlanController.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

router.post('/', upload.single('file'), createStudyPlan);
router.get('/', getStudyPlans);
router.get('/:id', getStudyPlanById);
router.delete('/:id', deleteStudyPlan);

export default router;
