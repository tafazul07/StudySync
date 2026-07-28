import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import fs from 'fs';

export async function extractText(filePath, mimetype) {
  const ext = filePath.split('.').pop().toLowerCase();

  if (ext === 'pdf') {
    const buffer = fs.readFileSync(filePath);
    const data = await pdf(buffer);
    return data.text;
  }

  if (ext === 'docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  if (ext === 'txt' || ext === 'md') {
    return fs.readFileSync(filePath, 'utf-8');
  }

  throw new Error('Unsupported file type');
}
