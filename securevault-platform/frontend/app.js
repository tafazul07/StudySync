// ===== CONFIG =====
const API_BASE = '/api';

// ===== STATE =====
let currentVault = null;
let currentVaultPassword = null;
let selectedFile = null;

// ===== DOM ELEMENTS =====
const tabs = document.querySelectorAll('.nav-btn');
const tabContents = document.querySelectorAll('.tab-content');
const toastContainer = document.getElementById('toast-container');
const modalOverlay = document.getElementById('modal-overlay');

// ===== TAB NAVIGATION =====
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const target = tab.dataset.tab;

        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        tab.classList.add('active');
        document.getElementById(`${target}-tab`).classList.add('active');

        // Reset forms when switching
        if (target === 'share') resetUpload();
        if (target === 'vault') resetVaultForms();
        if (target === 'download') resetDownload();
    });
});

// ===== TOAST SYSTEM =====
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span>${type === 'success' ? '&#10003;' : type === 'error' ? '&#10007;' : '&#9432;'}</span>
        <span>${message}</span>
    `;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastSlide 0.4s ease reverse';
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

// ===== MODAL SYSTEM =====
let modalResolve = null;

function showModal(title, message) {
    return new Promise((resolve) => {
        modalResolve = resolve;
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-message').textContent = message;
        modalOverlay.classList.remove('hidden');
    });
}

document.getElementById('modal-cancel').addEventListener('click', () => {
    modalOverlay.classList.add('hidden');
    if (modalResolve) modalResolve(false);
});

document.getElementById('modal-confirm').addEventListener('click', () => {
    modalOverlay.classList.add('hidden');
    if (modalResolve) modalResolve(true);
});

// ===== FILE UPLOAD =====
const dropzone = document.getElementById('upload-dropzone');
const fileInput = document.getElementById('file-input');
const fileInfo = document.getElementById('file-info');
const uploadBtn = document.getElementById('upload-btn');
const shareResult = document.getElementById('share-result');

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(event => {
    dropzone.addEventListener(event, (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
});

['dragenter', 'dragover'].forEach(event => {
    dropzone.addEventListener(event, () => dropzone.classList.add('dragover'));
});

['dragleave', 'drop'].forEach(event => {
    dropzone.addEventListener(event, () => dropzone.classList.remove('dragover'));
});

dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length) handleFileSelect(files[0]);
});

dropzone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFileSelect(e.target.files[0]);
});

function handleFileSelect(file) {
    const MAX_SIZE = 100 * 1024 * 1024; // 100MB

    if (file.size > MAX_SIZE) {
        showToast('File too large. Max 100MB allowed.', 'error');
        return;
    }

    selectedFile = file;

    const sizeStr = file.size < 1024 * 1024 
        ? (file.size / 1024).toFixed(1) + ' KB'
        : (file.size / (1024 * 1024)).toFixed(1) + ' MB';

    fileInfo.innerHTML = `
        <span class="file-icon">&#128196;</span>
        <div class="file-meta">
            <div class="file-name">${escapeHtml(file.name)}</div>
            <div class="file-size">${sizeStr}</div>
        </div>
        <button class="remove-file" onclick="removeFile()">&times;</button>
    `;

    uploadBtn.disabled = false;
    showToast(`Selected: ${file.name}`, 'info');
}

function removeFile() {
    selectedFile = null;
    fileInfo.innerHTML = '';
    uploadBtn.disabled = true;
    fileInput.value = '';
}

window.removeFile = removeFile;

uploadBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    const btnText = uploadBtn.querySelector('.btn-text');
    const spinner = uploadBtn.querySelector('.spinner');

    btnText.classList.add('hidden');
    spinner.classList.remove('hidden');
    uploadBtn.disabled = true;

    const formData = new FormData();
    formData.append('file', selectedFile);

    const maxDownloads = document.getElementById('max-downloads').value;
    if (maxDownloads) formData.append('maxDownloads', maxDownloads);

    const expiresAt = document.getElementById('expires-at').value;
    if (expiresAt) formData.append('expiresAt', new Date(expiresAt).toISOString());

    try {
        const response = await fetch(`${API_BASE}/files/upload`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showToast('File uploaded successfully!', 'success');
            displayShareResult(data.file);
        } else {
            showToast(data.error || 'Upload failed', 'error');
        }
    } catch (err) {
        showToast('Network error. Please try again.', 'error');
        console.error(err);
    } finally {
        btnText.classList.remove('hidden');
        spinner.classList.add('hidden');
        uploadBtn.disabled = false;
    }
});

function displayShareResult(file) {
    shareResult.classList.remove('hidden');
    document.getElementById('share-link').value = file.shareUrl;

    const sizeStr = file.size < 1024 * 1024 
        ? (file.size / 1024).toFixed(1) + ' KB'
        : (file.size / (1024 * 1024)).toFixed(1) + ' MB';

    document.getElementById('upload-details').innerHTML = `
        <span>&#128196; ${escapeHtml(file.name)}</span>
        <span>&#128230; ${sizeStr}</span>
        <span>&#128273; ${file.shareToken.substring(0, 16)}...</span>
    `;

    // Scroll to result
    shareResult.scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('copy-link-btn').addEventListener('click', () => {
    const link = document.getElementById('share-link');
    link.select();
    navigator.clipboard.writeText(link.value).then(() => {
        showToast('Link copied to clipboard!', 'success');
    });
});

function resetUpload() {
    removeFile();
    shareResult.classList.add('hidden');
    document.getElementById('max-downloads').value = '';
    document.getElementById('expires-at').value = '';
}

// ===== VAULT SYSTEM =====
const createVaultBtn = document.getElementById('create-vault-btn');
const openVaultBtn = document.getElementById('open-vault-btn');
const createVaultForm = document.getElementById('create-vault-form');
const openVaultForm = document.getElementById('open-vault-form');
const vaultContent = document.getElementById('vault-content');

createVaultBtn.addEventListener('click', () => {
    createVaultForm.classList.remove('hidden');
    openVaultForm.classList.add('hidden');
    vaultContent.classList.add('hidden');
});

openVaultBtn.addEventListener('click', () => {
    openVaultForm.classList.remove('hidden');
    createVaultForm.classList.add('hidden');
    vaultContent.classList.add('hidden');
});

// Create vault
document.getElementById('create-vault-submit').addEventListener('click', async () => {
    const name = document.getElementById('vault-name').value.trim();
    const password = document.getElementById('vault-password').value;
    const desc = document.getElementById('vault-desc').value.trim();

    if (!name || !password) {
        showToast('Name and password are required', 'error');
        return;
    }

    if (password.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }

    const btn = document.getElementById('create-vault-submit');
    const btnText = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.spinner');

    btnText.classList.add('hidden');
    spinner.classList.remove('hidden');
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/vaults/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, password, description: desc })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showToast('Vault created successfully!', 'success');
            currentVault = data.vault;
            currentVaultPassword = password;
            showVaultContent(data.vault);
        } else {
            showToast(data.error || 'Failed to create vault', 'error');
        }
    } catch (err) {
        console.error('Vault create error:', err);
        showToast(err.message || 'Network error - check console', 'error');
    } finally {
        btnText.classList.remove('hidden');
        spinner.classList.add('hidden');
        btn.disabled = false;
    }
});

// Open vault
document.getElementById('open-vault-submit').addEventListener('click', async () => {
    let token = document.getElementById('vault-token-input').value.trim();
    const password = document.getElementById('vault-password-input').value;

    if (!token || !password) {
        showToast('Token and password are required', 'error');
        return;
    }

    // Extract token from URL if full link pasted
    if (token.includes('/vault/')) {
        token = token.split('/vault/').pop().split('?')[0];
    }

    const btn = document.getElementById('open-vault-submit');
    const btnText = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.spinner');

    btnText.classList.add('hidden');
    spinner.classList.remove('hidden');
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/vaults/verify/${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showToast('Vault unlocked!', 'success');
            currentVault = { ...data.vault, token };
            currentVaultPassword = password;
            showVaultContent(data.vault);
        } else {
            showToast(data.error || 'Invalid credentials', 'error');
        }
    } catch (err) {
        console.error('Vault open error:', err);
        showToast(err.message || 'Network error - check console', 'error');
    } finally {
        btnText.classList.remove('hidden');
        spinner.classList.add('hidden');
        btn.disabled = false;
    }
});

function showVaultContent(vault) {
    createVaultForm.classList.add('hidden');
    openVaultForm.classList.add('hidden');
    vaultContent.classList.remove('hidden');
    
    document.getElementById('vault-title').textContent = vault.name;
    document.getElementById('vault-desc-display').textContent = vault.description || 'No description';
    document.getElementById('vault-created').textContent = `Created: ${new Date(vault.createdAt).toLocaleDateString()}`;
    
    const files = vault.files || [];
    document.getElementById('vault-file-count').textContent = `${files.length} file${files.length !== 1 ? 's' : ''}`;
    
    const token = currentVault.token || vault.token;
    const shareUrl = `${window.location.origin}/vault/${token}`;
    document.getElementById('vault-share-link').value = shareUrl;
    document.getElementById('vault-raw-token').value = token;
    
    renderVaultFiles(files);
}

function renderVaultFiles(files) {
    const list = document.getElementById('vault-file-list');

    if (!files.length) {
        list.innerHTML = '<p class="empty-state">No files in this vault yet. Upload files above.</p>';
        return;
    }

    list.innerHTML = files.map(file => {
        const sizeStr = file.file_size < 1024 * 1024 
            ? (file.file_size / 1024).toFixed(1) + ' KB'
            : (file.file_size / (1024 * 1024)).toFixed(1) + ' MB';

        return `
            <div class="file-item">
                <span class="file-icon">${getFileIcon(file.mime_type)}</span>
                <div class="file-details-list">
                    <div class="file-name-list">${escapeHtml(file.original_name)}</div>
                    <div class="file-meta-list">${sizeStr} &bull; ${new Date(file.created_at).toLocaleDateString()}</div>
                </div>
                <div class="file-actions">
                    <button class="btn btn-secondary" onclick="downloadVaultFile('${file.file_token}', '${escapeHtml(file.original_name)}')">
                        Download
                    </button>
                    <button class="btn btn-danger" onclick="deleteVaultFile('${file.file_token}')">
                        Delete
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

window.downloadVaultFile = (token, filename) => {
    const url = `${API_BASE}/vaults/download/${token}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast('Download started', 'success');
};

window.deleteVaultFile = async (fileToken) => {
    const confirmed = await showModal('Delete File', 'Are you sure you want to delete this file? This cannot be undone.');
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_BASE}/vaults/file/${fileToken}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: currentVaultPassword })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showToast('File deleted', 'success');
            // Refresh vault
            document.getElementById('open-vault-submit').click();
        } else {
            showToast(data.error || 'Failed to delete', 'error');
        }
    } catch (err) {
        showToast('Network error', 'error');
    }
};

// Vault file upload
const vaultDropzone = document.getElementById('vault-dropzone');
const vaultFileInput = document.getElementById('vault-file-input');

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(event => {
    vaultDropzone.addEventListener(event, (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
});

['dragenter', 'dragover'].forEach(event => {
    vaultDropzone.addEventListener(event, () => vaultDropzone.classList.add('dragover'));
});

['dragleave', 'drop'].forEach(event => {
    vaultDropzone.addEventListener(event, () => vaultDropzone.classList.remove('dragover'));
});

vaultDropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length) uploadToVault(files[0]);
});

vaultDropzone.addEventListener('click', () => vaultFileInput.click());
vaultFileInput.addEventListener('change', (e) => {
    if (e.target.files.length) uploadToVault(e.target.files[0]);
});

async function uploadToVault(file) {
    if (!currentVault) {
        showToast('Please open a vault first', 'error');
        return;
    }

    const MAX_SIZE = 100 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        showToast('File too large. Max 100MB.', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('password', currentVaultPassword);

    showToast('Uploading to vault...', 'info');

    try {
        const response = await fetch(`${API_BASE}/vaults/${currentVault.token}/upload`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showToast('File uploaded to vault!', 'success');
            // Refresh vault view
            document.getElementById('open-vault-submit').click();
        } else {
            showToast(data.error || 'Upload failed', 'error');
        }
    } catch (err) {
        showToast('Network error', 'error');
    }

    vaultFileInput.value = '';
}

// Copy vault link
document.getElementById('copy-vault-link').addEventListener('click', () => {
    const link = document.getElementById('vault-share-link');
    link.select();
    navigator.clipboard.writeText(link.value).then(() => {
        showToast('Vault link copied!', 'success');
    });
});

document.getElementById('copy-vault-token').addEventListener('click', () => {
    const token = document.getElementById('vault-raw-token');
    token.select();
    navigator.clipboard.writeText(token.value).then(() => {
        showToast('Vault token copied!', 'success');
    });
});

// Delete vault
document.getElementById('delete-vault-btn').addEventListener('click', async () => {
    const confirmed = await showModal('Delete Vault', 'Are you sure? This will permanently delete the vault and ALL files inside. This cannot be undone.');
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_BASE}/vaults/${currentVault.token}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: currentVaultPassword })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showToast('Vault deleted permanently', 'success');
            resetVaultForms();
        } else {
            showToast(data.error || 'Failed to delete vault', 'error');
        }
    } catch (err) {
        showToast('Network error', 'error');
    }
});

function resetVaultForms() {
    createVaultForm.classList.add('hidden');
    openVaultForm.classList.add('hidden');
    vaultContent.classList.add('hidden');
    document.getElementById('vault-name').value = '';
    document.getElementById('vault-password').value = '';
    document.getElementById('vault-desc').value = '';
    document.getElementById('vault-token-input').value = '';
    document.getElementById('vault-password-input').value = '';
    currentVault = null;
    currentVaultPassword = null;
}

// ===== DOWNLOAD TAB =====
const checkFileBtn = document.getElementById('check-file-btn');
const downloadPreview = document.getElementById('download-preview');

checkFileBtn.addEventListener('click', async () => {
    let token = document.getElementById('download-token').value.trim();

    if (!token) {
        showToast('Please enter a share link or token', 'error');
        return;
    }

    // Extract token from URL
    if (token.includes('/download/')) {
        token = token.split('/download/').pop().split('?')[0];
    }

    const btnText = checkFileBtn.querySelector('.btn-text');
    const spinner = checkFileBtn.querySelector('.spinner');

    btnText.classList.add('hidden');
    spinner.classList.remove('hidden');
    checkFileBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/files/info/${token}`);
        const data = await response.json();

        if (response.ok) {
            showDownloadPreview(data, token);
        } else {
            showToast(data.error || 'File not found or expired', 'error');
            downloadPreview.classList.add('hidden');
        }
    } catch (err) {
        showToast('Network error', 'error');
    } finally {
        btnText.classList.remove('hidden');
        spinner.classList.add('hidden');
        checkFileBtn.disabled = false;
    }
});

function showDownloadPreview(file, token) {
    downloadPreview.classList.remove('hidden');

    document.getElementById('preview-name').textContent = file.name;

    const sizeStr = file.size < 1024 * 1024 
        ? (file.size / 1024).toFixed(1) + ' KB'
        : (file.size / (1024 * 1024)).toFixed(1) + ' MB';

    let metaText = `${sizeStr}`;
    if (file.downloads !== undefined && file.maxDownloads) {
        metaText += ` &bull; Downloaded ${file.downloads}/${file.maxDownloads} times`;
    } else if (file.downloads !== undefined) {
        metaText += ` &bull; Downloaded ${file.downloads} times`;
    }
    if (file.expiresAt) {
        const expires = new Date(file.expiresAt);
        const now = new Date();
        if (expires > now) {
            metaText += ` &bull; Expires ${expires.toLocaleDateString()}`;
        }
    }

    document.getElementById('preview-size').textContent = sizeStr;
    document.getElementById('preview-meta').innerHTML = metaText;

    const downloadLink = document.getElementById('download-link');
    downloadLink.href = `${API_BASE}/files/download/${token}`;
    downloadLink.download = file.name;

    downloadPreview.scrollIntoView({ behavior: 'smooth' });
}

function resetDownload() {
    document.getElementById('download-token').value = '';
    downloadPreview.classList.add('hidden');
}

// ===== UTILITY FUNCTIONS =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getFileIcon(mimeType) {
    if (!mimeType) return '&#128196;';
    if (mimeType.startsWith('image/')) return '&#127912;';
    if (mimeType.startsWith('video/')) return '&#127909;';
    if (mimeType.startsWith('audio/')) return '&#127926;';
    if (mimeType.includes('pdf')) return '&#128209;';
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z')) return '&#128230;';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '&#128202;';
    if (mimeType.includes('word') || mimeType.includes('document')) return '&#128221;';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '&#127919;';
    if (mimeType.startsWith('text/')) return '&#128196;';
    return '&#128196;';
}

// ===== HANDLE DIRECT LINKS =====
function handleDirectLinks() {
    const path = window.location.pathname;

    if (path.startsWith('/download/')) {
        const token = path.split('/download/')[1];
        document.getElementById('download-token').value = token;
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        document.querySelector('[data-tab="download"]').classList.add('active');
        document.getElementById('download-tab').classList.add('active');
        checkFileBtn.click();
    }

    if (path.startsWith('/vault/')) {
        const token = path.split('/vault/')[1];
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        document.querySelector('[data-tab="vault"]').classList.add('active');
        document.getElementById('vault-tab').classList.add('active');

        createVaultForm.classList.add('hidden');
        openVaultForm.classList.remove('hidden');
        document.getElementById('vault-token-input').value = token;
    }
}

// Run on load
handleDirectLinks();

console.log('SecureVault loaded. API base:', API_BASE);
