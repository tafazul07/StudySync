import { query } from '../config/db.js';

export async function createDeadline(req, res, next) {
  try {
    const { study_plan_id, title, description, due_date, email, phone } = req.body;

    const result = await query(
      `INSERT INTO deadlines (study_plan_id, title, description, due_date, email, phone)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [study_plan_id, title, description, due_date, email, phone || null]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
}

export async function getDeadlines(req, res, next) {
  try {
    const { status } = req.query;
    let sql = `
      SELECT d.*, sp.title as plan_title 
      FROM deadlines d
      LEFT JOIN study_plans sp ON d.study_plan_id = sp.id
    `;
    const params = [];

    if (status === 'upcoming') {
      sql += ` WHERE d.due_date > NOW() AND d.completed = false`;
    } else if (status === 'completed') {
      sql += ` WHERE d.completed = true`;
    }

    sql += ` ORDER BY d.due_date ASC`;

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
}

export async function updateDeadline(req, res, next) {
  try {
    const { id } = req.params;
    const { completed } = req.body;

    const result = await query(
      `UPDATE deadlines SET completed = $1 WHERE id = $2 RETURNING *`,
      [completed, id]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
}

export async function deleteDeadline(req, res, next) {
  try {
    const { id } = req.params;
    await query(`DELETE FROM deadlines WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Deleted' });
  } catch (error) {
    next(error);
  }
}
