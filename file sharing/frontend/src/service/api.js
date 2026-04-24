import axios from 'axios';

const API_URL = 'http://localhost:3000';

// Upload file
export const uploadFile = async (data, onProgress) => {
    const response = await axios.post(`${API_URL}/upload`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress?.(percent);
        }
    });
    return response.data;
};

// Get all files
export const getAllFiles = async () => {
    const response = await axios.get(`${API_URL}/files`);
    return response.data;
};

// Download file (not used directly, we use <a> tag)
export const downloadFile = (fileId) => {
    return `${API_URL}/file/${fileId}`;
};

// Delete file
export const deleteFile = async (fileId) => {
  if (!fileId) throw new Error("File ID is required"); // Prevent requests to '.../undefined'
  return await axios.delete(`/api/files/${fileId}`);
};


// Delete all files
export const deleteAllFiles = async () => {
    const response = await axios.delete(`${API_URL}/files/all`);
    return response.data;
};

