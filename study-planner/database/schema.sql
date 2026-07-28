-- Create database manually: CREATE DATABASE study_planner;

CREATE TABLE IF NOT EXISTS study_plans (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    original_filename VARCHAR(500),
    file_path VARCHAR(500),
    extracted_text TEXT,
    plan_content JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deadlines (
    id SERIAL PRIMARY KEY,
    study_plan_id INTEGER REFERENCES study_plans(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date TIMESTAMP NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email_sent BOOLEAN DEFAULT FALSE,
    sms_sent BOOLEAN DEFAULT FALSE,
    completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_deadlines_due_date ON deadlines(due_date);
CREATE INDEX idx_deadlines_completed ON deadlines(completed);
