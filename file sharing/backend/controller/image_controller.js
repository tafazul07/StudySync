const File = require('../model/file');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const uploadImage = async (request, response) => {
    console.log('=== UPLOAD START ===');
    
    try {
        const files = request.files;
        console.log('Files received:', files?.length || 0);
        
        if (!files || files.length === 0) {
            return response.status(400).json({ error: 'No files uploaded' });
        }

        const uploadedFiles = [];
        const PORT = process.env.PORT || 3000;
        const baseUrl = `http://localhost:${PORT}`;

        for (const file of files) {
            console.log('Processing file:', file.originalname, 'at:', file.path);
            
            // Generate ID
            const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
            console.log('Generated ID:', id);
            
            // Save to database
            let savedFile;
            try {
                savedFile = await File.create({
                    id: id,
                    path: file.path,
                    name: file.originalname
                });
            } catch (dbError) {
                console.error('Database save failed:', dbError);
                return response.status(500).json({ 
                    error: 'Database save failed: ' + dbError.message 
                });
            }
            
            uploadedFiles.push({
                id: savedFile.id,
                name: savedFile.name,
                downloadUrl: `${baseUrl}/file/${savedFile.id}`
            });
        }

        console.log('=== UPLOAD SUCCESS ===');
        console.log('Files saved:', uploadedFiles.length);

        response.status(200).json({ 
            message: `${uploadedFiles.length} files uploaded`,
            files: uploadedFiles,
            path: uploadedFiles[0]?.downloadUrl
        });
        
    } catch (error) {
        console.error('❌ UPLOAD ERROR:', error);
        response.status(500).json({ error: error.message });
    }
};

const getImage = async (request, response) => {
    try {
        console.log('Download ID:', request.params.fileId);
        
        const file = await File.findById(request.params.fileId);
        console.log('Found in DB:', file);
        
        if (!file) {
            return response.status(404).json({ msg: 'File not found' });
        }

        // Handle path - check both relative and absolute
        let filePath = file.path;
        if (!path.isAbsolute(filePath)) {
            filePath = path.join(__dirname, '..', filePath);
        }
        
        console.log('Looking for file at:', filePath);
        console.log('File exists:', fs.existsSync(filePath));
        
        if (!fs.existsSync(filePath)) {
            return response.status(404).json({ msg: 'File not found on disk' });
        }

        await File.incrementDownloads(request.params.fileId);
        response.download(filePath, file.name);
        
    } catch (error) {
        console.error('Download error:', error);
        response.status(500).json({ msg: error.message });
    }
};

const getAllFiles = async (request, response) => {
    try {
        const files = await File.findAll();
        const PORT = process.env.PORT || 3000;
        
        const filesWithUrls = files.map(f => ({
            ...f,
            downloadUrl: `http://localhost:${PORT}/file/${f.id}`
        }));
        
        response.status(200).json({ files: filesWithUrls });
    } catch (error) {
        response.status(500).json({ msg: error.message });
    }
};

const deleteFile = async (request, response) => {
    try {
        console.log('Delete requested for ID:', request.params.fileId);
        
        const file = await File.findById(request.params.fileId);
        if (!file) {
            console.log('File not found for delete');
            return response.status(404).json({ msg: 'File not found' });
        }

        // Delete from disk
        const fs = require('fs');
        const path = require('path');
        
        let filePath = file.path;
        if (!fs.existsSync(filePath)) {
            filePath = path.join(__dirname, '..', file.path);
        }
        
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log('Deleted from disk:', filePath);
        }

        // Delete from database
        await File.delete(request.params.fileId);
        console.log('Deleted from DB:', request.params.fileId);

        response.status(200).json({ msg: 'File deleted successfully' });
    } catch (error) {
        console.error('Delete error:', error);
        response.status(500).json({ msg: error.message });
    }
};

const deleteAllFiles = async (request, response) => {
    try {
        const fs = require('fs');
        const path = require('path');
        
        // Get all files from database
        const files = await File.findAll();
        
        // Delete each file from disk
        for (const file of files) {
            let filePath = file.path;
            if (!fs.existsSync(filePath)) {
                filePath = path.join(__dirname, '..', file.path);
            }
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        
        // Delete all from database
        await pool.query('DELETE FROM files');
        
        response.status(200).json({ 
            msg: `Deleted ${files.length} files successfully` 
        });
    } catch (error) {
        console.error('Delete all error:', error);
        response.status(500).json({ msg: error.message });
    }
};

module.exports = { uploadImage, getImage, getAllFiles, deleteFile, deleteAllFiles };