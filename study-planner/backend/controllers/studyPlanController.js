import { query } from '../config/db.js';
import { generateStudyPlan } from '../services/openrouterService.js';
import { extractText } from '../services/fileParserService.js';
import { sendStudyPlanEmail } from '../services/emailService.js';
import fs from 'fs';

export async function createStudyPlan(req, res, next) {
  try {
    const { title, preferences, userEmail } = req.body;
    let extractedText = '';

    if (req.file) {
      extractedText = await extractText(req.file.path, req.file.mimetype);
    } else if (req.body.content) {
      extractedText = req.body.content;
    } else {
      return res.status(400).json({ error: 'No file or content provided' });
    }

    const plan = await generateStudyPlan(extractedText, JSON.parse(preferences || '{}'));

    const result = await query(
      `INSERT INTO study_plans (title, original_filename, file_path, extracted_text, plan_content)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        plan.title || title,
        req.file?.originalname || null,
        req.file?.path || null,
        extractedText.substring(0, 5000),
        JSON.stringify(plan)
      ]
    );

    const savedPlan = result.rows[0];

    if (plan.milestones && Array.isArray(plan.milestones)) {
      for (const milestone of plan.milestones) {
        await query(
          `INSERT INTO deadlines (study_plan_id, title, description, due_date, email)
           VALUES ($1, $2, $3, $4, $5)`,
          [savedPlan.id, milestone.title, milestone.description, milestone.targetDate, userEmail || '']
        );
      }
    }

    if (userEmail) {
      try {
        await sendStudyPlanEmail(userEmail, plan);
      } catch (e) {
        console.error('Email send failed:', e.message);
      }
    }

    res.status(201).json({
      success: true,
      data: savedPlan
    });
  } catch (error) {
    next(error);
  }
}

export async function getStudyPlans(req, res, next) {
  try {
    const result = await query(
      `SELECT id, title, original_filename, plan_content, created_at 
       FROM study_plans ORDER BY created_at DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
}

export async function getStudyPlanById(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT * FROM study_plans WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Study plan not found' });
    }

    const deadlines = await query(
      `SELECT * FROM deadlines WHERE study_plan_id = $1 ORDER BY due_date`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...result.rows[0],
        deadlines: deadlines.rows
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteStudyPlan(req, res, next) {
  try {
    const { id } = req.params;
    const plan = await query(`SELECT file_path FROM study_plans WHERE id = $1`, [id]);

    if (plan.rows[0]?.file_path) {
      fs.unlinkSync(plan.rows[0].file_path);
    }

    await query(`DELETE FROM study_plans WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    next(error);
  }
}
