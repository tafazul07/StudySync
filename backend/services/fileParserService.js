import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import fs from 'fs/promises';

/**
 * Extract text from a file based on its extension.
 * Supports PDF, DOCX, TXT, and MD files.
 * @param {string} filePath - Absolute path to the uploaded file
 * @param {string} mimetype - MIME type of the file (for validation)
 * @returns {Promise<string>} Extracted text content
 * @throws {Error} With a user-friendly message describing the failure
 */
export async function extractText(filePath, mimetype) {
  const ext = filePath.split('.').pop().toLowerCase();

  try {
    if (ext === 'pdf') {
      return await extractFromPdf(filePath);
    }

    if (ext === 'docx') {
      return await extractFromDocx(filePath);
    }

    if (ext === 'txt' || ext === 'md') {
      const text = await fs.readFile(filePath, 'utf-8');
      if (!text || text.trim().length === 0) {
        throw new Error('The text file appears to be empty.');
      }
      return text;
    }

    throw new Error(
      `Unsupported file type ".${ext}". Supported formats: PDF, DOCX, TXT, MD.`
    );
  } catch (error) {
    // Re-throw if it's already a user-friendly error from above
    if (error.message.includes('Unsupported file type') ||
        error.message.includes('appears to be empty') ||
        error.message.includes('scanned') ||
        error.message.includes('Could not extract') ||
        error.message.includes('password')) {
      throw error;
    }
    // Wrap unexpected errors with context
    console.error(`Text extraction failed for ${filePath}:`, error.message);
    throw new Error(
      `Failed to extract text from the file: ${error.message}. Please try a different file or paste the content directly.`
    );
  }
}

/**
 * Extract text from a PDF file using pdf-parse.
 * Detects scanned/image-only PDFs that have no text layer.
 */
async function extractFromPdf(filePath) {
  const buffer = await fs.readFile(filePath);

  let data;
  try {
    data = await pdfParse(buffer);
  } catch (err) {
    if (err.message?.includes('Password')) {
      throw new Error(
        'This PDF is password-protected. Please remove the password and try again.'
      );
    }
    throw new Error(
      `Failed to parse the PDF file: ${err.message}. The file may be corrupted.`
    );
  }

  const text = (data.text || '').trim();

  if (text.length === 0) {
    throw new Error(
      'No text could be extracted from this PDF. It appears to be a scanned/image-based document. ' +
      'Please use a text-based PDF, or paste the content directly into the text field.'
    );
  }

  if (text.length < 10) {
    throw new Error(
      'Very little text was found in this PDF. It may be image-based or corrupted. ' +
      'Please try a different file or paste the content directly.'
    );
  }

  return text;
}

/**
 * Extract text from a DOCX file using mammoth.
 */
async function extractFromDocx(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  const text = (result.value || '').trim();

  if (text.length === 0) {
    throw new Error(
      'No text could be extracted from this DOCX file. The document may be empty or contain only images.'
    );
  }

  return text;
}
