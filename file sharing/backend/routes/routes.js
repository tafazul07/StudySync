const express = require('express');
const { uploadImage, getImage, getAllFiles, deleteFile, deleteAllFiles } = require('../controller/image_controller');
const upload = require('../utils/upload');

const router = express.Router();

router.post('/upload',upload.array('files', 100), uploadImage);
router.get('/file/:fileId', getImage);
router.get('/files', getAllFiles);
router.delete('/file/:fileId', deleteFile);
router.delete('/files/all', deleteAllFiles); 

module.exports = router;