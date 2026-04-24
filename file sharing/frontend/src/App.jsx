import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";
import { uploadFile, getAllFiles, deleteFile, deleteAllFiles } from "./service/api.js";
import {
  saveFileToIndexedDB,
  getAllFilesFromIndexedDB,
  deleteFileFromIndexedDB,
  getUnsyncedFiles,
  markFileAsSynced,
  getFileFromIndexedDB,
} from "./utils/indexedDB.js";

function App() {
  const [files, setFiles] = useState([]);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previews, setPreviews] = useState([]);
  const [progress, setProgress] = useState(0);
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("darkMode") === "true"
  );
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem("viewMode") || "upload"
  );
  const [allFiles, setAllFiles] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [uploadMode, setUploadMode] = useState(
    () => localStorage.getItem("uploadMode") || "files"
  );
  const [dragCounter, setDragCounter] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [storageInfo, setStorageInfo] = useState({ used: 0, total: 0 });
  const [uploadedFilesList, setUploadedFilesList] = useState([]);

  const fileInputRef = useRef();

  // ✅ FIX #3: fetchFiles defined FIRST so it can be used in useEffects and syncOfflineFiles below
  const fetchFiles = useCallback(async () => {
    try {
      const response = await getAllFiles();
      const serverFiles = (response.files || []).map((f) => ({
        ...f,
        offline: false,
        synced: true,
      }));

      const offlineFiles = await getAllFilesFromIndexedDB();
      const unsyncedOffline = offlineFiles
        .filter((f) => !f.synced)
        .map((f) => ({
          id: f.id,
          name: f.name,
          created_at: f.created_at,
          size: f.size,
          offline: true,
          synced: false,
        }));

      setAllFiles([...serverFiles, ...unsyncedOffline]);
    } catch (err) {
      console.error("fetchFiles error:", err);

      const offlineFiles = await getAllFilesFromIndexedDB();
      setAllFiles(
        offlineFiles.map((f) => ({
          id: f.id,
          name: f.name,
          created_at: f.created_at,
          size: f.size,
          offline: !f.synced,
          synced: f.synced,
        }))
      );
    }
  }, []); // ✅ FIX #4: getAllFiles and getAllFilesFromIndexedDB are module-level imports (stable refs), empty deps is correct here

  // ✅ FIX #2: syncOfflineFiles defined BEFORE the online/offline useEffect that calls it
  const syncOfflineFiles = useCallback(async () => {
    const unsynced = await getUnsyncedFiles();
    if (unsynced.length === 0) {
      setSyncStatus("synced");
      return;
    }
    setSyncStatus("syncing");
    for (const file of unsynced) {
      try {
        const formData = new FormData();
        const blob = new Blob([file.blob], { type: file.type });
        formData.append("files", blob, file.name);
        const response = await uploadFile(formData);
        if (response.files && response.files.length > 0) {
          await markFileAsSynced(file.id, response.files[0].id);
        }
      } catch (err) {
        console.error("Sync failed:", file.name, err);
      }
    }
    setSyncStatus("synced");
    fetchFiles();
  }, [fetchFiles]); // ✅ fetchFiles is a dependency since it's used inside

  // ✅ FIX #2: online/offline useEffect now comes AFTER syncOfflineFiles is defined
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSyncStatus("syncing");
      syncOfflineFiles();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus("idle");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncOfflineFiles]);

  // ✅ FIX #3: Service worker useEffect now comes AFTER fetchFiles is defined
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/service-worker.js")
        .then((registration) => {
          console.log("SW registered:", registration.scope);
          navigator.serviceWorker.addEventListener("message", (event) => {
            if (event.data.type === "upload-complete") fetchFiles();
          });
        })
        .catch((err) => console.log("SW registration failed:", err));
    }
  }, [fetchFiles]);

  useEffect(() => {
    const loadOfflineFiles = async () => {
      const offlineFiles = await getAllFilesFromIndexedDB();
      if (offlineFiles.length > 0) {
        setAllFiles(
          offlineFiles.map((f) => ({
            id: f.id,
            name: f.name,
            created_at: f.created_at,
            size: f.size,
            offline: !f.synced,
            synced: f.synced,
          }))
        );
      }
    };
    loadOfflineFiles();
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  useEffect(() => {
    localStorage.setItem("viewMode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem("uploadMode", uploadMode);
  }, [uploadMode]);

  useEffect(() => {
    localStorage.setItem("darkMode", darkMode);
  }, [darkMode]);

  useEffect(() => {
    const newPreviews = files.map((file) => {
      if (file.type.startsWith("image/")) return URL.createObjectURL(file);
      return null;
    });
    setPreviews(newPreviews);
    return () => {
      newPreviews.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [files]);

  useEffect(() => {
    const checkStorage = async () => {
      if ("storage" in navigator && "estimate" in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        setStorageInfo({
          used: (estimate.usage / 1024 / 1024).toFixed(2),
          total: (estimate.quota / 1024 / 1024).toFixed(2),
        });
      }
    };
    checkStorage();
  }, [allFiles]);

  const filteredFiles = allFiles.filter((file) =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleUpload = async () => {
    if (files.length === 0) {
      setError("Please select files to upload.");
      return;
    }
    setUploading(true);
    setError("");
    setResult("");
    setProgress(0);
    setUploadedFilesList([]);

    const uploadedFiles = [];
    for (const file of files) {
      try {
        const tempId =
          Date.now().toString() + Math.random().toString(36).substr(2, 9);
        const arrayBuffer = await file.arrayBuffer();
        const fileData = {
          id: tempId,
          name: file.name,
          blob: arrayBuffer,
          size: file.size,
          type: file.type,
          synced: false,
          created_at: new Date().toISOString(),
        };
        await saveFileToIndexedDB(fileData);

        if (isOnline) {
          const formData = new FormData();
          formData.append("files", file, file.name);
          const response = await uploadFile(formData, (percent) =>
            setProgress(percent)
          );
          if (response.files && response.files.length > 0) {
            const serverFile = response.files[0];
            await markFileAsSynced(tempId, serverFile.id);
            uploadedFiles.push({
              id: serverFile.id,
              name: file.name,
              downloadUrl: serverFile.downloadUrl,
              synced: true,
            });
          }
        } else {
          uploadedFiles.push({
            id: tempId,
            name: file.name,
            downloadUrl: null,
            synced: false,
          });
        }
      } catch (err) {
        console.error("Upload error:", err);
        setError(`Failed to upload ${file.name}`);
      }
    }

    setUploading(false);
    setProgress(0);
    if (uploadedFiles.length > 0) {
      setUploadedFilesList(uploadedFiles);
      setResult(uploadedFiles.every((f) => f.synced) ? "success" : "offline");
      setFiles([]);
      fetchFiles();
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onUploadClick = () => fileInputRef.current.click();

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length > 0) {
      setFiles(selectedFiles);
      setResult("");
      setError("");
      setUploadedFilesList([]);
    } else {
      setFiles([]);
      setResult("");
      setError("");
      setUploadedFilesList([]);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    setDragCounter(0);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      setFiles(droppedFiles);
      setResult("");
      setError("");
      setUploadedFilesList([]);
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    setDragCounter((prev) => prev + 1);
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0)
      setDragOver(true);
  };

  const handleDragOver = (e) => e.preventDefault();

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragCounter((prev) => {
      const newCounter = prev - 1;
      if (newCounter === 0) setDragOver(false);
      return newCounter;
    });
  };

  const handleUploadAreaKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onUploadClick();
    }
  };

  const toggleViewMode = () => {
    const newMode = viewMode === "upload" ? "browse" : "upload";
    setViewMode(newMode);
    if (newMode === "browse") fetchFiles();
  };

  const handleDeleteFile = async (fileId) => {
    if (window.confirm("Are you sure you want to delete this file?")) {
      try {
        if (isOnline) {
          try {
            await deleteFile(fileId);
          } catch (err) {
            console.log("Server delete failed:", err.message);
          }
        }
        await deleteFileFromIndexedDB(fileId);
        fetchFiles();
      } catch (error) {
        console.error("Delete error:", error);
        setError("Failed to delete file");
      }
    }
  };

  const handleDeleteAll = async () => {
    if (
      window.confirm(
        "⚠️ Are you sure you want to delete ALL files? This cannot be undone!"
      )
    ) {
      try {
        if (isOnline) {
          try {
            await deleteAllFiles();
          } catch (err) {
            console.log("Server clear failed:", err.message);
          }
        }

        const offlineFiles = await getAllFilesFromIndexedDB();
        for (const file of offlineFiles) {
          await deleteFileFromIndexedDB(file.id);
        }

        setAllFiles([]);
        setResult("");
        setError("");
        setUploadedFilesList([]); // ✅ FIX #8: clear stale download links
      } catch (error) {
        console.error("Clear all error:", error);
        setError(
          "Failed to clear files: " +
            (error.response?.data?.msg || error.message)
        );
      }
    }
  };

  const toggleDarkMode = () => setDarkMode(!darkMode);

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const renderFilePreview = () => {
    if (files.length === 0) return null;
    return (
      <div className="files-preview">
        {files.map((file, index) => (
          <div key={index} className="file-item">
            {previews[index] ? (
              <img
                src={previews[index]}
                alt={file.name}
                className="file-preview"
              />
            ) : (
              <div className="file-icon">📄</div>
            )}
            <p>{file.name}</p>
          </div>
        ))}
      </div>
    );
  };

  const downloadOfflineFile = async (fileId) => {
    const file = await getFileFromIndexedDB(fileId);
    if (file && file.blob) {
      const blob = new Blob([file.blob], { type: file.type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const renderDownloadLinks = () => {
    if (result !== "success" && result !== "offline") return null;
    const isOfflineResult = result === "offline";

    return (
      <div className="success">
        <p>
          {isOfflineResult
            ? "Files saved locally (will sync when online)"
            : "Upload successful! Share these links:"}
        </p>

        {/* ✅ FIX #7: Guard against null downloadUrl for offline files */}
        {uploadedFilesList.length === 1 ? (
          uploadedFilesList[0].downloadUrl ? (
            <>
              <div className="link-container">
                <input
                  type="text"
                  value={uploadedFilesList[0].downloadUrl}
                  readOnly
                  className="link-input"
                />
                <button
                  onClick={() => copyToClipboard(uploadedFilesList[0].downloadUrl)}
                  className="copy-btn"
                >
                  {copied ? "✅" : "📋"}
                </button>
              </div>
              <a
                href={uploadedFilesList[0].downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="download-link"
              >
                Open Download Link
              </a>
            </>
          ) : (
            <p>📴 File saved locally — download available in Browse view once synced.</p>
          )
        ) : (
          <>
            <p style={{ marginTop: "15px", marginBottom: "10px", fontWeight: "bold" }}>
              {uploadedFilesList.length} files uploaded:
            </p>
            {uploadedFilesList.map((file) => (
              <div key={file.id} className="link-container" style={{ marginBottom: "10px" }}>
                {/* ✅ FIX #7: Guard per-file null downloadUrl */}
                {file.downloadUrl ? (
                  <>
                    <input
                      type="text"
                      value={file.downloadUrl}
                      readOnly
                      className="link-input"
                      title={file.name}
                    />
                    <button
                      onClick={() => copyToClipboard(file.downloadUrl)}
                      className="copy-btn"
                    >
                      📋
                    </button>
                    <a
                      href={file.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="download-link"
                      style={{ marginLeft: "5px", padding: "10px 15px" }}
                    >
                      Open
                    </a>
                  </>
                ) : (
                  <span style={{ fontSize: "0.85rem", color: "#888" }}>
                    📴 {file.name} — saved locally
                  </span>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    );
  };

  return (
    <div className={`container ${darkMode ? "dark" : ""}`}>
      <div className="wrapper">
        <div className="status-bar">
          <span className={`online-status ${isOnline ? "online" : "offline"}`}>
            {isOnline ? "🟢 Online" : "🔴 Offline"}
          </span>
          {syncStatus === "syncing" && (
            <span className="sync-status">🔄 Syncing...</span>
          )}
          {syncStatus === "synced" && (
            <span className="sync-status">✅ Synced</span>
          )}
          <span className="storage-info">💾 {storageInfo.used} MB used</span>
        </div>

        <div className="header">
          <div className="header-title">
            <h1>📁 File Sharing App</h1>
            <p className="header-subtitle">
              Upload, browse, and share your files securely
            </p>
          </div>
          <div className="header-controls">
            {viewMode === "browse" && (
              <input
                type="text"
                placeholder="Search files..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            )}
            <div className="header-buttons">
              <button onClick={toggleViewMode} className="view-toggle">
                {viewMode === "upload" ? "📂 Browse Files" : "⬆️ Upload File"}
              </button>
              <button onClick={toggleDarkMode} className="dark-mode-toggle">
                {darkMode ? "☀️" : "🌙"}
              </button>
            </div>
          </div>
        </div>

        <div className="upload-options">
          <label>
            <input
              type="radio"
              name="uploadType"
              checked={uploadMode === "files"}
              onChange={() => setUploadMode("files")}
            />
            Upload Files
          </label>
          <label>
            <input
              type="radio"
              name="uploadType"
              checked={uploadMode === "folder"}
              onChange={() => setUploadMode("folder")}
            />
            Upload Folder
          </label>
        </div>

        {viewMode === "upload" ? (
          <>
            <div
              className={`upload-area ${dragOver ? "drag-over" : ""} ${
                uploading ? "uploading" : ""
              }`}
              onDrop={handleDrop}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={onUploadClick}
              role="button"
              tabIndex="0"
              onKeyDown={handleUploadAreaKeyDown}
            >
              {uploading ? (
                <div className="upload-progress">
                  <div className="spinner"></div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  <p>{progress}%</p>
                </div>
              ) : (
                <>
                  <div className="upload-icon">📁</div>
                  <p>
                    {uploadMode === "folder"
                      ? "Drag & drop a folder here or click to browse"
                      : "Drag & drop your files here or click to browse"}
                  </p>
                  {!isOnline && (
                    <p className="offline-hint">
                      💡 Files will be saved locally and synced when you're back online
                    </p>
                  )}
                </>
              )}
            </div>

            {uploadMode === "folder" ? (
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                webkitdirectory=""
                directory=""
                mozdirectory=""
                onChange={handleFileChange}
              />
            ) : (
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                multiple
                onChange={handleFileChange}
              />
            )}

            {files.length > 0 && !uploading && (
              <>
                <div className="file-info">
                  {renderFilePreview()}
                  <div>
                    <p>
                      <strong>{files.length} file(s) selected</strong>
                    </p>
                    <p>
                      {(
                        files.reduce((sum, f) => sum + f.size, 0) /
                        1024 /
                        1024
                      ).toFixed(2)}{" "}
                      MB total
                    </p>
                  </div>
                </div>
                <div className="upload-btn-container">
                  <button onClick={handleUpload} className="upload-btn">
                    {isOnline ? "Upload Selected Files" : "Save Files Locally"}
                  </button>
                </div>
              </>
            )}

            {error && <p className="error">{error}</p>}
            {renderDownloadLinks()}
          </>
        ) : (
          <div className="files-list">
            <div
              className="files-header"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              <h2 style={{ margin: 0 }}>Available Files</h2>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <button onClick={fetchFiles} className="refresh-btn">
                  🔄 Refresh
                </button>
                {allFiles.length > 0 && (
                  <button
                    onClick={handleDeleteAll}
                    style={{
                      background: "linear-gradient(45deg, #dc3545, #c0392b)",
                      color: "white",
                      border: "none",
                      padding: "8px 16px",
                      borderRadius: "20px",
                      cursor: "pointer",
                      fontSize: "0.9rem",
                      fontWeight: "600",
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    🗑️ Clear All ({allFiles.length})
                  </button>
                )}
              </div>
            </div>

            {filteredFiles.length === 0 ? (
              <p>
                {allFiles.length === 0
                  ? "No files uploaded yet."
                  : "No files match your search."}
              </p>
            ) : (
              <div className="files-grid">
                {filteredFiles.map((file) => {
                  // ✅ FIX #6: Use the dedicated offline flag instead of ID length heuristic
                  const isOffline = file.offline === true;

                  // ✅ FIX #5: Use env variable instead of hardcoded localhost
                  const downloadUrl = isOffline
                    ? null
                    : `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/file/${file.id}`;

                  return (
                    <div
                      key={file.id}
                      className={`file-card ${isOffline ? "offline" : ""}`}
                    >
                      <div className="file-icon-large">📄</div>
                      <div className="file-details">
                        <p className="file-name">{file.name}</p>
                        <p className="file-date">
                          {new Date(file.created_at).toLocaleDateString()}
                        </p>
                        {isOffline && (
                          <span className="offline-badge">📴 Offline</span>
                        )}
                      </div>
                      <div className="file-actions">
                        {isOffline ? (
                          <button
                            onClick={() => downloadOfflineFile(file.id)}
                            className="download-btn"
                          >
                            Download
                          </button>
                        ) : (
                          <a
                            href={downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="download-btn"
                          >
                            Download
                          </a>
                        )}
                        <button
                          onClick={() => handleDeleteFile(file.id)}
                          className="delete-btn"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;