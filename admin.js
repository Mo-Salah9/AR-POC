// AETHERIS ADMIN COORDINATOR - Admin Page Logic
document.addEventListener("DOMContentLoaded", () => {
    // -------------------------------------------------------------
    // DOM Elements
    // -------------------------------------------------------------
    const btnSaveDb = document.getElementById("btn-save-db");
    const btnResetDb = document.getElementById("btn-reset-db");
    const btnSaveJson = document.getElementById("btn-save-json");
    const btnValidateJson = document.getElementById("btn-validate-json");
    
    const formAddText = document.getElementById("form-add-text");
    const formAddQr = document.getElementById("form-add-qr");
    const formAddImage = document.getElementById("form-add-image");
    
    const tableTextBody = document.getElementById("table-text-body");
    const tableImageBody = document.getElementById("table-image-body");
    const tableQrBody = document.getElementById("table-qr-body");
    
    const jsonEditor = document.getElementById("json-editor");
    const logStatus = document.getElementById("admin-log-status");
    const adminDbStatus = document.getElementById("admin-db-status");

    // -------------------------------------------------------------
    // Default Configuration Profile
    // -------------------------------------------------------------
    const defaultConfig = {
        textTriggers: [
            { id: "txt_1", keyword: "cube", matchType: "contains", action: "model", param: "cube" },
            { id: "txt_2", keyword: "torus", matchType: "contains", action: "model", param: "torus" },
            { id: "txt_3", keyword: "core", matchType: "contains", action: "model", param: "core" },
            { id: "txt_4", keyword: "google", matchType: "contains", action: "link", param: "https://www.google.com" }
        ],
        qrTriggers: [
            { id: "qr_1", pattern: "cube", action: "model", param: "cube" },
            { id: "qr_2", pattern: "torus", action: "model", param: "torus" },
            { id: "qr_3", pattern: "core", action: "model", param: "core" },
            { id: "qr_4", pattern: "http", action: "link", param: "auto" }
        ],
        imageTargets: [
            { id: "core", name: "Geometric Core", action: "model", param: "core", deletable: false },
            { id: "cyber", name: "Cyber Matrix", action: "model", param: "cube", deletable: false },
            { id: "shield", name: "OpenCV Shield", action: "model", param: "torus", deletable: false }
        ]
    };

    // Current working config clone
    let currentConfig = {};

    // -------------------------------------------------------------
    // Initializer
    // -------------------------------------------------------------
    function init() {
        loadConfig();
        bindEvents();
        setupTabs();
        updateTables();
    }

    // Load from localStorage or set defaults
    function loadConfig() {
        const stored = localStorage.getItem("aetheris_config");
        if (stored) {
            try {
                currentConfig = JSON.parse(stored);
                setLogStatus("Configuration successfully loaded from LocalStorage.", "success");
            } catch (err) {
                setLogStatus("Error parsing localStorage config. Loading defaults.", "error");
                currentConfig = JSON.parse(JSON.stringify(defaultConfig));
                saveConfig(true); // rewrite broken storage
            }
        } else {
            currentConfig = JSON.parse(JSON.stringify(defaultConfig));
            saveConfig(true);
            setLogStatus("No active configuration found. Loaded system defaults.", "system");
        }
        
        // Sync raw JSON editor text box
        updateJsonEditor();
    }

    // Save configurations back to local storage
    function saveConfig(silent = false) {
        try {
            localStorage.setItem("aetheris_config", JSON.stringify(currentConfig));
            if (!silent) {
                setLogStatus("Configuration saved! Real-time sync complete.", "success");
                flashSaveStatus();
            }
        } catch (err) {
            setLogStatus("Failed to save to LocalStorage: " + err.message, "error");
            alert("LocalStorage is full or disabled. Custom image data URL templates might be too large.");
        }
    }

    function setLogStatus(msg, type = "system") {
        logStatus.textContent = msg;
        logStatus.className = ""; // clear
        
        if (type === "success") logStatus.style.color = "var(--success)";
        else if (type === "error") logStatus.style.color = "var(--error)";
        else if (type === "warning") logStatus.style.color = "var(--warning)";
        else logStatus.style.color = "var(--text-secondary)";
    }

    function flashSaveStatus() {
        adminDbStatus.textContent = "DB STATUS: SAVED & SYNCED";
        adminDbStatus.style.color = "var(--success)";
        setTimeout(() => {
            adminDbStatus.textContent = "DB Status: Config Sync Active";
            adminDbStatus.style.color = ""; // restore default
        }, 2000);
    }

    // -------------------------------------------------------------
    // Tab Controller
    // -------------------------------------------------------------
    function setupTabs() {
        document.querySelectorAll(".tab-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const tabId = btn.getAttribute("data-tab");
                
                // Toggle tab button active state
                document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                
                // Toggle tab content visibility
                document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
                document.getElementById(tabId).classList.add("active");
            });
        });
    }

    // -------------------------------------------------------------
    // Tables Rendering
    // -------------------------------------------------------------
    function updateTables() {
        renderTextTable();
        renderImageTable();
        renderQrTable();
    }

    function renderTextTable() {
        tableTextBody.innerHTML = "";
        
        if (currentConfig.textTriggers.length === 0) {
            tableTextBody.innerHTML = `<tr><td colspan="5" class="empty-row" style="text-align:center; color:var(--text-muted); font-style:italic; padding:15px;">No text triggers configured.</td></tr>`;
            return;
        }

        currentConfig.textTriggers.forEach(t => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="font-weight:700; color:var(--neon-cyan);">${escapeHTML(t.keyword.toUpperCase())}</td>
                <td><span class="badge" style="background-color:rgba(255,255,255,0.05); font-family:var(--font-mono);">${escapeHTML(t.matchType)}</span></td>
                <td><span class="badge" style="background-color:rgba(189,0,255,0.1); color:var(--neon-purple);">${escapeHTML(t.action.toUpperCase())}</span></td>
                <td style="font-family:var(--font-mono); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML(t.param)}</td>
                <td style="text-align: center;">
                    <button class="btn btn-icon btn-delete" data-id="${t.id}" title="Delete Trigger">
                        <i class="fa-solid fa-trash" style="color:var(--error);"></i>
                    </button>
                </td>
            `;
            tableTextBody.appendChild(tr);
        });

        // Bind delete listeners
        tableTextBody.querySelectorAll(".btn-delete").forEach(btn => {
            btn.addEventListener("click", () => {
                const id = btn.getAttribute("data-id");
                currentConfig.textTriggers = currentConfig.textTriggers.filter(t => t.id !== id);
                saveConfig();
                updateTables();
                updateJsonEditor();
            });
        });
    }

    function renderImageTable() {
        tableImageBody.innerHTML = "";

        if (currentConfig.imageTargets.length === 0) {
            tableImageBody.innerHTML = `<tr><td colspan="5" class="empty-row" style="text-align:center; color:var(--text-muted); font-style:italic; padding:15px;">No image targets mapped.</td></tr>`;
            return;
        }

        currentConfig.imageTargets.forEach(t => {
            const isDeletable = t.deletable !== false;
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="font-weight:700; color:var(--neon-cyan);">${escapeHTML(t.name)}</td>
                <td><span class="badge" style="background-color:rgba(0,240,255,0.05);">${isDeletable ? "Custom Upload" : "Built-in Preset"}</span></td>
                <td><span class="badge" style="background-color:rgba(189,0,255,0.1); color:var(--neon-purple);">${escapeHTML(t.action.toUpperCase())}</span></td>
                <td style="font-family:var(--font-mono);">${escapeHTML(t.param)}</td>
                <td style="text-align: center;">
                    ${isDeletable ? `
                        <button class="btn btn-icon btn-delete" data-id="${t.id}">
                            <i class="fa-solid fa-trash" style="color:var(--error);"></i>
                        </button>
                    ` : `<i class="fa-solid fa-lock" style="color:var(--text-muted); font-size:0.85rem;" title="System Lock"></i>`}
                </td>
            `;
            tableImageBody.appendChild(tr);
        });

        // Bind delete custom image target listeners
        tableImageBody.querySelectorAll(".btn-delete").forEach(btn => {
            btn.addEventListener("click", () => {
                const id = btn.getAttribute("data-id");
                currentConfig.imageTargets = currentConfig.imageTargets.filter(t => t.id !== id);
                saveConfig();
                updateTables();
                updateJsonEditor();
            });
        });
    }

    function renderQrTable() {
        tableQrBody.innerHTML = "";

        if (currentConfig.qrTriggers.length === 0) {
            tableQrBody.innerHTML = `<tr><td colspan="4" class="empty-row" style="text-align:center; color:var(--text-muted); font-style:italic; padding:15px;">No QR rules configured.</td></tr>`;
            return;
        }

        currentConfig.qrTriggers.forEach(t => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="font-weight:700; color:var(--neon-cyan); font-family:var(--font-mono);">${escapeHTML(t.pattern)}</td>
                <td><span class="badge" style="background-color:rgba(189,0,255,0.1); color:var(--neon-purple);">${escapeHTML(t.action.toUpperCase())}</span></td>
                <td style="font-family:var(--font-mono); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML(t.param)}</td>
                <td style="text-align: center;">
                    <button class="btn btn-icon btn-delete" data-id="${t.id}">
                        <i class="fa-solid fa-trash" style="color:var(--error);"></i>
                    </button>
                </td>
            `;
            tableQrBody.appendChild(tr);
        });

        // Bind delete listeners
        tableQrBody.querySelectorAll(".btn-delete").forEach(btn => {
            btn.addEventListener("click", () => {
                const id = btn.getAttribute("data-id");
                currentConfig.qrTriggers = currentConfig.qrTriggers.filter(t => t.id !== id);
                saveConfig();
                updateTables();
                updateJsonEditor();
            });
        });
    }

    // -------------------------------------------------------------
    // Forms Handling (Creating items)
    // -------------------------------------------------------------
    function bindEvents() {
        // Text trigger form submit
        formAddText.addEventListener("submit", (e) => {
            e.preventDefault();
            
            const keyword = document.getElementById("text-keyword").value.trim().toLowerCase();
            const matchType = document.getElementById("text-match").value;
            const action = document.getElementById("text-action").value;
            const param = document.getElementById("text-param").value.trim();
            
            // Check if keyword already exists
            const duplicate = currentConfig.textTriggers.find(t => t.keyword === keyword);
            if (duplicate) {
                alert("A trigger keyword '" + keyword.toUpperCase() + "' already exists!");
                return;
            }
            
            currentConfig.textTriggers.push({
                id: "txt_" + Date.now(),
                keyword: keyword,
                matchType: matchType,
                action: action,
                param: param
            });
            
            saveConfig();
            updateTables();
            updateJsonEditor();
            formAddText.reset();
        });

        // QR Code Trigger form submit
        formAddQr.addEventListener("submit", (e) => {
            e.preventDefault();
            
            const pattern = document.getElementById("qr-pattern").value.trim().toLowerCase();
            const action = document.getElementById("qr-action").value;
            const param = document.getElementById("qr-param").value.trim();
            
            const duplicate = currentConfig.qrTriggers.find(t => t.pattern === pattern);
            if (duplicate) {
                alert("A QR trigger pattern '" + pattern + "' already exists!");
                return;
            }
            
            currentConfig.qrTriggers.push({
                id: "qr_" + Date.now(),
                pattern: pattern,
                action: action,
                param: param
            });
            
            saveConfig();
            updateTables();
            updateJsonEditor();
            formAddQr.reset();
        });

        // Custom Image Target form submit
        formAddImage.addEventListener("submit", (e) => {
            e.preventDefault();
            
            const fileInput = document.getElementById("image-file");
            const name = document.getElementById("image-name").value.trim();
            const action = document.getElementById("image-action").value;
            const param = document.getElementById("image-param").value.trim();
            
            if (!fileInput.files || !fileInput.files[0]) {
                alert("Please select an image file to upload!");
                return;
            }
            
            const file = fileInput.files[0];
            const reader = new FileReader();
            
            setLogStatus("Processing uploaded custom image target... resizing to fit storage...", "warning");
            
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    // Resize to max 256px to save space in localStorage and fit easily under 5MB limit
                    const maxDim = 256;
                    let w = img.width;
                    let h = img.height;
                    
                    if (w > maxDim || h > maxDim) {
                        if (w > h) {
                            h = Math.round((h * maxDim) / w);
                            w = maxDim;
                        } else {
                            w = Math.round((w * maxDim) / h);
                            h = maxDim;
                        }
                    }
                    
                    const canvas = document.createElement("canvas");
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0, w, h);
                    
                    // Convert back to lightweight dataurl representation
                    const base64Url = canvas.toDataURL("image/png");
                    
                    currentConfig.imageTargets.push({
                        id: "custom_" + Date.now(),
                        name: name,
                        action: action,
                        param: param,
                        imageDataUrl: base64Url,
                        deletable: true
                    });
                    
                    saveConfig();
                    updateTables();
                    updateJsonEditor();
                    formAddImage.reset();
                    setLogStatus("Custom image target mapping added successfully!", "success");
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });

        // Global buttons
        btnSaveDb.addEventListener("click", () => saveConfig());
        
        btnResetDb.addEventListener("click", () => {
            if (confirm("Are you sure you want to reset all configurations to default presets?")) {
                currentConfig = JSON.parse(JSON.stringify(defaultConfig));
                saveConfig();
                updateTables();
                updateJsonEditor();
                setLogStatus("Reset completed. All parameters restored to defaults.", "warning");
            }
        });
        
        // JSON editor validate and save
        btnValidateJson.addEventListener("click", validateJsonText);
        btnSaveJson.addEventListener("click", saveJsonText);
    }

    // -------------------------------------------------------------
    // Raw JSON Editor Sync
    // -------------------------------------------------------------
    function updateJsonEditor() {
        jsonEditor.value = JSON.stringify(currentConfig, null, 4);
    }

    function validateJsonText() {
        try {
            JSON.parse(jsonEditor.value);
            setLogStatus("JSON syntax check: VALID.", "success");
            return true;
        } catch (err) {
            setLogStatus("JSON syntax check: INVALID. " + err.message, "error");
            alert("Error in JSON layout. Details:\n" + err.message);
            return false;
        }
    }

    function saveJsonText() {
        if (!validateJsonText()) return;
        
        try {
            currentConfig = JSON.parse(jsonEditor.value);
            saveConfig();
            updateTables();
            setLogStatus("JSON payload successfully updated in memory DB.", "success");
        } catch (err) {
            setLogStatus("Error saving JSON: " + err.message, "error");
        }
    }

    // Helper functions
    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    }

    // Run initializer
    init();
});
