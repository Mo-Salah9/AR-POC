// AETHERIS APPS COORDINATOR - Main App Logic
document.addEventListener("DOMContentLoaded", () => {
    // -------------------------------------------------------------
    // DOM Elements
    // -------------------------------------------------------------
    const btnCamera = document.getElementById("btn-camera");
    const btnFreeze = document.getElementById("btn-freeze");
    const btnClearConsole = document.getElementById("btn-clear-console");
    const btnShowTarget = document.getElementById("btn-show-target");
    const btnCloseModal = document.getElementById("btn-close-modal");
    const btnResetView = document.getElementById("btn-reset-view");
    const btnQrLink = document.getElementById("btn-qr-link");
    
    const videoFeed = document.getElementById("video-feed");
    const canvasOverlay = document.getElementById("canvas-overlay");
    const cameraPlaceholder = document.getElementById("camera-placeholder-ui");
    const cameraSelect = document.getElementById("camera-select");
    const cameraResolution = document.getElementById("camera-resolution");
    const hudLayer = document.querySelector(".hud-layer");
    const hudStatusText = document.getElementById("hud-status-text");
    
    const opencvStatus = document.getElementById("opencv-status");
    const ocrStatus = document.getElementById("ocr-status");
    const valFps = document.getElementById("val-fps");
    const thresholdVal = document.getElementById("threshold-val");
    const paramThreshold = document.getElementById("param-threshold");
    
    const templateGallery = document.getElementById("template-gallery");
    const targetUpload = document.getElementById("target-upload");
    const canvasTargetPreview = document.getElementById("canvas-target-preview");
    const targetBadge = document.getElementById("target-badge");
    const targetName = document.getElementById("target-name");
    const targetResolution = document.getElementById("target-resolution");
    
    const ocrLiveText = document.getElementById("ocr-live-text");
    const ocrSpeed = document.getElementById("ocr-speed");
    const ocrConfidence = document.getElementById("ocr-confidence");
    const keywordTags = document.querySelectorAll(".keyword-tag");
    
    const qrResultBox = document.getElementById("qr-result-box");
    const qrActionArea = document.getElementById("qr-action-area");
    
    const rendererContainer = document.getElementById("renderer-container");
    const rendererStatusText = document.getElementById("renderer-status");
    const chkOverlayAR = document.getElementById("chk-overlay-ar");
    
    const targetModal = document.getElementById("target-modal");
    const canvasModalTarget = document.getElementById("canvas-modal-target");
    const linkDownloadTarget = document.getElementById("link-download-target");
    const consoleLogs = document.getElementById("console-logs");

    // -------------------------------------------------------------
    // App State Variables
    // -------------------------------------------------------------
    let isCameraStreaming = false;
    let isFrameFrozen = false;
    let localStream = null;
    let activeTab = "tab-image";
    let cvWorker = null;
    let isCvReady = false;
    let isOcrReady = false;
    let isOcrScanning = false;
    
    // Configuration Object
    let config = null;
    
    // OpenCV options
    let cvMatchThreshold = parseInt(paramThreshold.value);
    let activeTemplate = {
        name: "Geometric Core",
        width: 256,
        height: 256,
        canvas: null
    };
    
    // Frame stats & loops
    let lastFrameTime = performance.now();
    let fps = 0;
    let fpsInterval = 1000;
    let fpsLastUpdated = performance.now();
    let frameCount = 0;
    
    let trackingLoopId = null;
    let isWorkerBusy = false;
    let trackedCorners = null;
    let trackedInliers = 0;
    
    // Template cycling state variables
    let allTemplates = [];
    let cycleIndex = 0;
    let isTargetLocked = false;
    let lockedTemplateId = null;
    let lastDetectionTime = 0;
    let cycleTimer = null;
    
    // Image templates data cache
    const templateImages = [
        { id: "core", name: "Geometric Core", draw: drawGeometricCore },
        { id: "cyber", name: "Cyber Matrix", draw: drawCyberMatrix },
        { id: "shield", name: "OpenCV Shield", draw: drawOpenCVShield }
    ];
    
    // OCR variables
    let ocrIntervalId = null;
    let ocrWorker = null;
    let arModelHoldUntil = 0;
    let lastOcrTriggerKey = "";
    let lastOcrTriggerTime = 0;
    
    // Three.js variables
    let scene, camera, renderer;
    let modelGroup, activeModelName = "cube";
    let meshCube, meshTorus, meshCore;
    let threeCanvas = null;

    // -------------------------------------------------------------
    // Initializer
    // -------------------------------------------------------------
    function init() {
        logConsole("Aetheris Client Initializing...");
        
        // 0. Load Configuration from LocalStorage
        loadConfig();
        
        // 1. Generate local targets gallery
        generateTargetsGallery();
        
        // 2. Setup Three.js 3D viewport
        initThreeJS();
        
        // 3. Initialize CV Web Worker
        initCvWorker();
        
        // 4. Bind UI Event listeners
        bindEvents();
        
        // 5. Populate cameras list
        enumerateCameras();
        
        // Load default template target into engine
        selectTemplate("core");
        
        // Listen for storage updates (Admin changes)
        window.addEventListener("storage", (e) => {
            if (e.key === "aetheris_config") {
                logConsole("System configuration updated in admin dashboard. Syncing...", "warning");
                loadConfig();
                generateTargetsGallery();
                updateKeywordTagsUI();
                
                if (isCameraStreaming) {
                    startTemplateCycling();
                }
            }
        });

        // Force overlay AR mode on startup
        if (chkOverlayAR) {
            chkOverlayAR.checked = true;
            handleOverlayARChange();
        }

        // 6. Initialize OCR (immersive mode scans text without tab UI)
        initOCR();
    }

    function loadConfig() {
        const stored = localStorage.getItem("aetheris_config");
        if (stored) {
            try {
                config = JSON.parse(stored);
            } catch (e) {
                console.error("Failed to parse config", e);
            }
        }
        
        if (!config) {
            config = {
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
            localStorage.setItem("aetheris_config", JSON.stringify(config));
        }
        
        // Dynamically update UI text scanner keyword tags
        updateKeywordTagsUI();
    }

    function updateKeywordTagsUI() {
        const container = document.querySelector(".keyword-tags");
        if (!container) return;
        
        container.innerHTML = "";
        config.textTriggers.forEach(t => {
            const span = document.createElement("span");
            span.className = "keyword-tag";
            span.setAttribute("data-keyword", t.keyword);
            
            let icon = "fa-solid fa-tag";
            if (t.action === "model") icon = "fa-solid fa-cube";
            else if (t.action === "link") icon = "fa-solid fa-globe";
            else if (t.action === "alert") icon = "fa-solid fa-comment-dots";
            
            span.innerHTML = `<i class="${icon}"></i> "${t.keyword.toUpperCase()}"`;
            container.appendChild(span);
            
            span.addEventListener("click", () => {
                logConsole(`Keyword selected manually: ${t.keyword.toUpperCase()}`);
                triggerKeywordAction(t.keyword);
            });
        });
    }

    // -------------------------------------------------------------
    // UI Logic & Tabs
    // -------------------------------------------------------------
    function bindEvents() {
        // Tab switching
        document.querySelectorAll(".tab-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const tabId = btn.getAttribute("data-tab");
                if (tabId === activeTab) return;
                
                // Toggle tab button active state
                document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                
                // Toggle tab content visibility
                document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
                document.getElementById(tabId).classList.add("active");
                
                activeTab = tabId;
                logConsole(`Switched mode to: ${tabId.replace("tab-", "").toUpperCase()}`);
                
                // Handle tab switch side effects
                handleTabChange(tabId);
            });
        });
        
        // Camera button
        btnCamera.addEventListener("click", toggleCamera);
        
        // Freeze button
        btnFreeze.addEventListener("click", toggleFreezeFrame);
        
        // Camera select change
        cameraSelect.addEventListener("change", () => {
            if (isCameraStreaming) {
                stopCamera();
                startCamera();
            }
        });
        
        // Sensitivity slider
        paramThreshold.addEventListener("input", (e) => {
            cvMatchThreshold = parseInt(e.target.value);
            thresholdVal.textContent = cvMatchThreshold;
        });
        
        // Upload Custom Target Image
        targetUpload.addEventListener("change", handleCustomTargetUpload);
        
        // Modal Target Printout
        btnShowTarget.addEventListener("click", openTargetModal);
        btnCloseModal.addEventListener("click", closeTargetModal);
        targetModal.addEventListener("click", (e) => {
            if (e.target === targetModal) closeTargetModal();
        });
        
        // Clear Console
        btnClearConsole.addEventListener("click", () => {
            consoleLogs.innerHTML = `<div class="log-line system">[SYSTEM] Console logs cleared.</div>`;
        });
        
        // 3D Model buttons
        document.querySelectorAll(".model-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll(".model-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                
                const modelName = btn.getAttribute("data-model");
                switchModel(modelName);
            });
        });
        
        // Overlay checkbox change
        chkOverlayAR.addEventListener("change", handleOverlayARChange);
        
        // Reset View button
        btnResetView.addEventListener("click", () => {
            if (camera) {
                camera.position.set(0, 0, 4);
                camera.lookAt(0, 0, 0);
            }
        });
        
        // Keyword tags (rebuilt dynamically) — use delegation
        const keywordsPanel = document.getElementById("keywords-hud-panel");
        if (keywordsPanel) {
            keywordsPanel.addEventListener("click", (e) => {
                const tag = e.target.closest(".keyword-tag");
                if (!tag) return;
                const word = tag.getAttribute("data-keyword");
                if (word) triggerKeywordAction(word);
            });
        }
    }
    
    function handleTabChange(tabId) {
        // Clear canvases
        clearOverlayCanvas();
        
        // Stop text OCR loops if not on text tab
        if (tabId !== "tab-text") {
            stopOCRScanner();
        } else {
            // Start text OCR engine on demand
            if (!isOcrReady) {
                initOCR();
            } else {
                startOCRScanner();
            }
        }
        
        // Reset QR code results
        if (tabId === "tab-qr") {
            resetQRUI();
        }
        
        // Toggle dynamic HUD panel visibility
        const ocrPanel = document.getElementById("ocr-hud-panel");
        const keywordsPanel = document.getElementById("keywords-hud-panel");
        const qrPanel = document.getElementById("qr-hud-panel");
        const toggleDrawerBtn = document.getElementById("btn-toggle-drawer");
        const drawer = document.getElementById("targets-drawer");
        
        if (ocrPanel) ocrPanel.style.display = (tabId === "tab-text" && isCameraStreaming) ? "block" : "none";
        if (keywordsPanel) keywordsPanel.style.display = (tabId === "tab-text" && isCameraStreaming) ? "block" : "none";
        if (qrPanel) qrPanel.style.display = (tabId === "tab-qr" && isCameraStreaming) ? "block" : "none";
        if (toggleDrawerBtn) toggleDrawerBtn.style.display = (tabId === "tab-image" && isCameraStreaming) ? "flex" : "none";
        if (drawer && tabId !== "tab-image") drawer.classList.remove("open");
        
        // Adjust HUD styling and messaging based on mode
        if (isCameraStreaming) {
            if (tabId === "tab-image") {
                hudStatusText.textContent = "ORB PATTERN MATCHING ACTIVE";
                hudLayer.querySelector(".hud-reticle").style.display = "none";
                hudLayer.querySelector(".hud-laser").style.animationDuration = "3s";
            } else if (tabId === "tab-text") {
                hudStatusText.textContent = "OCR TEXT DIGITIZER ACTIVE";
                hudLayer.querySelector(".hud-reticle").style.display = "none";
                hudLayer.querySelector(".hud-laser").style.animationDuration = "1.5s";
            } else if (tabId === "tab-qr") {
                hudStatusText.textContent = "ALIGNED SCANNER GRID";
                hudLayer.querySelector(".hud-reticle").style.display = "block";
                hudLayer.querySelector(".hud-laser").style.animationDuration = "2s";
            }
        }
    }

    // -------------------------------------------------------------
    // Logging Console Helper
    // -------------------------------------------------------------
    function logConsole(message, type = "system") {
        const time = new Date().toTimeString().split(" ")[0];
        const logLine = document.createElement("div");
        logLine.className = `log-line ${type}`;
        logLine.textContent = `[${time}] ${message}`;
        consoleLogs.appendChild(logLine);
        
        // Auto scroll to bottom
        consoleLogs.scrollTop = consoleLogs.scrollHeight;
    }

    // -------------------------------------------------------------
    // Camera Handling
    // -------------------------------------------------------------
    async function enumerateCameras() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === "videoinput");
            
            cameraSelect.innerHTML = "";
            
            if (videoDevices.length === 0) {
                const opt = document.createElement("option");
                opt.value = "";
                opt.textContent = "No camera found";
                cameraSelect.appendChild(opt);
                return;
            }
            
            videoDevices.forEach((device, index) => {
                const option = document.createElement("option");
                option.value = device.deviceId;
                option.textContent = device.label || `Camera ${index + 1}`;
                cameraSelect.appendChild(option);
            });
            logConsole(`Found ${videoDevices.length} camera source(s).`);
        } catch (err) {
            logConsole("Error scanning video sources: " + err.message, "error");
        }
    }

    async function toggleCamera() {
        if (isCameraStreaming) {
            stopCamera();
        } else {
            await startCamera();
        }
    }

    function activateCameraStream() {
        const width = videoFeed.videoWidth;
        const height = videoFeed.videoHeight;
        if (!width || !height) return;
        if (isCameraStreaming) return;

        canvasOverlay.width = width;
        canvasOverlay.height = height;

        cameraResolution.textContent = `${width} x ${height} px`;
        logConsole(`Camera stream initialized at ${width}x${height}px.`, "success");

        isCameraStreaming = true;
        isFrameFrozen = false;

        hudLayer.style.display = "block";
        const viewport = document.querySelector(".camera-viewport-container");
        if (viewport) viewport.classList.add("scanning");
        btnFreeze.disabled = false;
        btnFreeze.innerHTML = `<i class="fa-solid fa-pause"></i> Freeze Frame`;
        if (btnCamera.classList.contains("btn-icon-hud")) {
            btnCamera.innerHTML = `<i class="fa-solid fa-square"></i>`;
            btnCamera.className = "btn-icon-hud btn-camera-toggle btn-hud-power active";
        } else {
            btnCamera.innerHTML = `<i class="fa-solid fa-square"></i> Stop Scanner`;
            btnCamera.className = "btn btn-secondary btn-camera-toggle";
        }

        cameraPlaceholder.style.display = "none";
        showImmersiveScanHud();
        startTemplateCycling();
        startOCRScanner();
        startProcessingLoop();
    }

    function showImmersiveScanHud() {
        const ocrPanel = document.getElementById("ocr-hud-panel");
        const keywordsPanel = document.getElementById("keywords-hud-panel");
        if (ocrPanel) ocrPanel.style.display = "block";
        if (keywordsPanel) keywordsPanel.style.display = "block";
        if (hudStatusText) hudStatusText.textContent = "MULTITASK SCANNER ACTIVE";
    }

    function shouldShowARModel() {
        return isTargetLocked || performance.now() < arModelHoldUntil;
    }

    function hideARModelIfAllowed() {
        if (modelGroup && !shouldShowARModel()) {
            modelGroup.visible = false;
        }
    }

    function showTextTriggeredAR(modelName) {
        if (!chkOverlayAR.checked || !modelGroup) return;

        arModelHoldUntil = performance.now() + 8000;
        switchModel(modelName);

        const w = videoFeed.videoWidth || canvasOverlay.width || window.innerWidth;
        const h = videoFeed.videoHeight || canvasOverlay.height || window.innerHeight;
        modelGroup.visible = true;
        positionModelInAR({ x: w * 0.5, y: h * 0.5 }, { x: 0.12, y: 0.12 }, 0);
    }

    async function startCamera() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            logConsole("Camera API not available. Use HTTPS and a supported browser.", "error");
            alert("Camera is not available. Open this page over HTTPS (required on iPhone).");
            return;
        }

        const deviceId = cameraSelect.value;
        const videoConstraints = deviceId
            ? { deviceId: { ideal: deviceId } }
            : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } };
        const constraints = { video: videoConstraints, audio: false };

        logConsole("Requesting camera hardware access...");
        hudStatusText.textContent = "SYSTEM STANDBY";

        try {
            try {
                localStream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (primaryErr) {
                if (!deviceId) throw primaryErr;
                logConsole("Selected camera failed, using default: " + primaryErr.message, "warning");
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: "environment" } },
                    audio: false
                });
            }

            videoFeed.setAttribute("playsinline", "");
            videoFeed.setAttribute("webkit-playsinline", "");
            videoFeed.playsInline = true;
            videoFeed.muted = true;
            videoFeed.srcObject = localStream;

            videoFeed.onloadedmetadata = () => activateCameraStream();

            try {
                await videoFeed.play();
            } catch (playErr) {
                logConsole("Video play() failed: " + playErr.message, "error");
            }

            videoFeed.style.opacity = 1;

            if (videoFeed.readyState >= HTMLMediaElement.HAVE_METADATA) {
                activateCameraStream();
            }
        } catch (err) {
            logConsole("Camera access denied or failed: " + err.message, "error");
            alert("Unable to open camera. Please grant camera permissions and ensure no other application is using it.");
        }
    }

    function stopCamera() {
        logConsole("Stopping camera hardware stream...");
        
        // Stop tracking loops
        stopProcessingLoop();
        stopTemplateCycling();
        stopOCRScanner();
        
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        
        videoFeed.srcObject = null;
        videoFeed.style.opacity = 0;
        isCameraStreaming = false;
        isFrameFrozen = false;
        
        // Reset controls
        hudLayer.style.display = "none";
        const viewport = document.querySelector(".camera-viewport-container");
        if (viewport) viewport.classList.remove("scanning");
        btnFreeze.disabled = true;
        btnFreeze.innerHTML = `<i class="fa-solid fa-pause"></i> Freeze Frame`;
        
        if (btnCamera.classList.contains("btn-icon-hud")) {
            btnCamera.innerHTML = `<i class="fa-solid fa-power-off"></i>`;
            btnCamera.className = "btn-icon-hud btn-camera-toggle btn-hud-power";
        } else {
            btnCamera.innerHTML = `<i class="fa-solid fa-video"></i> Start Scanner`;
            btnCamera.className = "btn btn-primary btn-camera-toggle";
        }
        
        // Reset UI dimensions
        cameraResolution.textContent = "No active stream";
        cameraPlaceholder.style.display = "flex";
        
        // Hide dynamic HUD panels
        const ocrPanel = document.getElementById("ocr-hud-panel");
        const keywordsPanel = document.getElementById("keywords-hud-panel");
        const qrPanel = document.getElementById("qr-hud-panel");
        const toggleDrawerBtn = document.getElementById("btn-toggle-drawer");
        const drawer = document.getElementById("targets-drawer");
        
        if (ocrPanel) ocrPanel.style.display = "none";
        if (keywordsPanel) keywordsPanel.style.display = "none";
        arModelHoldUntil = 0;
        if (qrPanel) qrPanel.style.display = "none";
        if (toggleDrawerBtn) toggleDrawerBtn.style.display = "none";
        if (drawer) drawer.classList.remove("open");
        
        clearOverlayCanvas();
        
        // Hide 3D mesh in AR overlay mode
        if (chkOverlayAR.checked && modelGroup) {
            modelGroup.visible = false;
        }
    }

    function toggleFreezeFrame() {
        if (!isCameraStreaming) return;

        if (isFrameFrozen) {
            videoFeed.play();
            isFrameFrozen = false;
            btnFreeze.innerHTML = `<i class="fa-solid fa-pause"></i> Freeze Frame`;
            logConsole("Resumed live feed.");
            startProcessingLoop();
            startTemplateCycling();
            startOCRScanner();
        } else {
            videoFeed.pause();
            isFrameFrozen = true;
            btnFreeze.innerHTML = `<i class="fa-solid fa-play"></i> Resume Feed`;
            logConsole("Frozen feed image framework.");
            stopProcessingLoop();
            stopTemplateCycling();
            stopOCRScanner();
        }
    }

    function startTemplateCycling() {
        stopTemplateCycling();
        cycleIndex = 0;
        isTargetLocked = false;
        lockedTemplateId = null;
        trackedCorners = null;
        
        if (allTemplates.length > 0) {
            selectTemplate(allTemplates[0].id, true);
        }
        
        cycleTimer = setInterval(() => {
            if (!isTargetLocked && allTemplates.length > 1) {
                cycleIndex = (cycleIndex + 1) % allTemplates.length;
                selectTemplate(allTemplates[cycleIndex].id, true);
            }
        }, 500);
    }
    
    function stopTemplateCycling() {
        if (cycleTimer) {
            clearInterval(cycleTimer);
            cycleTimer = null;
        }
    }

    // -------------------------------------------------------------
    // Core Engine Processing Loop
    // -------------------------------------------------------------
    function startProcessingLoop() {
        stopProcessingLoop();
        
        // Temp canvas for capturing video frames
        const tempCanvas = document.createElement("canvas");
        const tempCtx = tempCanvas.getContext("2d");
        
        function process() {
            if (!isCameraStreaming || isFrameFrozen) return;
            
            // Frame rate stats calculation
            frameCount++;
            const currentTime = performance.now();
            
            // Update FPS count every 1s
            if (currentTime - fpsLastUpdated >= fpsInterval) {
                fps = Math.round((frameCount * 1000) / (currentTime - fpsLastUpdated));
                valFps.textContent = fps.toString().padStart(2, "0");
                frameCount = 0;
                fpsLastUpdated = currentTime;
            }
            
            const width = videoFeed.videoWidth;
            const height = videoFeed.videoHeight;
            
            if (width && height) {
                tempCanvas.width = width;
                tempCanvas.height = height;
                tempCtx.drawImage(videoFeed, 0, 0, width, height);
                const frameData = tempCtx.getImageData(0, 0, width, height);
                
                // 1. Image Feature Matching (CV Worker)
                if (isCvReady && !isWorkerBusy && allTemplates.length > 0) {
                    isWorkerBusy = true;
                    const workerFrameData = new ImageData(
                        new Uint8ClampedArray(frameData.data),
                        frameData.width,
                        frameData.height
                    );
                    cvWorker.postMessage({
                        type: "PROCESS_FRAME",
                        imageData: workerFrameData,
                        threshold: cvMatchThreshold
                    }, [workerFrameData.data.buffer]);
                }
                
                // 2. QR Scanning (Local jsQR decoder)
                const code = jsQR(frameData.data, frameData.width, frameData.height, {
                    inversionAttempts: "dontInvert",
                });
                
                // 3. Clear canvas overlay once per frame and draw active targets
                const ctx = canvasOverlay.getContext("2d");
                ctx.clearRect(0, 0, canvasOverlay.width, canvasOverlay.height);
                
                // A. Draw central scanning brackets (ROI) guide
                drawOCRScanArea(width, height);
                
                // B. Draw CV Bounding Box if locked and tracked
                if (isTargetLocked && trackedCorners) {
                    drawBoundingBox(trackedCorners, trackedInliers);
                }
                
                // C. Draw QR Box if detected on current frame
                if (code) {
                    drawQRBox(code);
                    handleQRCodeMatch(code);
                }
            }
            
            trackingLoopId = requestAnimationFrame(process);
        }
        
        trackingLoopId = requestAnimationFrame(process);
    }

    function stopProcessingLoop() {
        if (trackingLoopId) {
            cancelAnimationFrame(trackingLoopId);
            trackingLoopId = null;
        }
        isWorkerBusy = false;
    }

    // -------------------------------------------------------------
    // OpenCV.js Web Worker Integration
    // -------------------------------------------------------------
    function initCvWorker() {
        logConsole("Initializing OpenCV.js Web Worker thread...");
        
        cvWorker = new Worker("cv-worker.js");
        
        cvWorker.onmessage = (e) => {
            const data = e.data;
            
            switch (data.type) {
                case "CV_READY":
                    isCvReady = true;
                    opencvStatus.className = "status-pill cv-status ready";
                    opencvStatus.innerHTML = `<i class="fa-solid fa-check-circle"></i> OpenCV.js: Ready`;
                    logConsole("OpenCV.js CV engine successfully initialized.", "success");
                    
                    // Re-set target templates if ready
                    uploadActiveTemplateToWorker();
                    break;
                    
                case "TEMPLATE_READY":
                    logConsole(`Template tracking features loaded. Matches ready.`);
                    break;
                    
                case "FRAME_PROCESSED":
                    isWorkerBusy = false;
                    handleCVWorkerResult(data);
                    break;
                    
                case "LOG":
                    logConsole(`[Worker] ${data.text}`, data.logType);
                    break;
                    
                default:
                    console.warn("Unknown message from CV worker", data);
            }
        };
        
        cvWorker.onerror = (err) => {
            logConsole("Worker error: " + err.message, "error");
            isWorkerBusy = false;
        };
    }

    function uploadActiveTemplateToWorker() {
        if (!isCvReady || !activeTemplate.canvas) return;
        
        const ctx = activeTemplate.canvas.getContext("2d");
        const w = activeTemplate.canvas.width;
        const h = activeTemplate.canvas.height;
        const imgData = ctx.getImageData(0, 0, w, h);
        
        logConsole(`Uploading template image '${activeTemplate.name}' to worker...`);
        cvWorker.postMessage({
            type: "SET_TEMPLATE",
            imageData: imgData,
            name: activeTemplate.name
        }, [imgData.data.buffer]);
    }

    function handleCVWorkerResult(result) {
        const hasMatch = result.detected;
        
        if (hasMatch && result.corners) {
            isTargetLocked = true;
            // CycleIndex tracks the current index of allTemplates being sent to worker
            if (allTemplates[cycleIndex]) {
                lockedTemplateId = allTemplates[cycleIndex].id;
            }
            lastDetectionTime = performance.now();
            
            trackedCorners = result.corners;
            trackedInliers = result.inliersCount;
            
            opencvStatus.className = "status-pill cv-status scanning";
            opencvStatus.innerHTML = `<i class="fa-solid fa-expand-arrows-alt scan-pulse" style="color: var(--neon-purple);"></i> CV: Locked [${activeTemplate.name}]`;
            
            // Find active target in config to decide action
            const targetConfig = config.imageTargets.find(t => t.id === lockedTemplateId);
            
            if (targetConfig) {
                if (targetConfig.action === "model") {
                    if (activeModelName !== targetConfig.param.toLowerCase()) {
                        switchModel(targetConfig.param.toLowerCase());
                    }
                    
                    if (chkOverlayAR.checked && modelGroup) {
                        modelGroup.visible = true;
                        positionModelInAR(result.center, result.scale, result.angle);
                    }
                    
                    const linkOverlay = document.getElementById("ocr-link-overlay");
                    if (linkOverlay) linkOverlay.remove();
                } else if (targetConfig.action === "link") {
                    arModelHoldUntil = 0;
                    if (modelGroup) modelGroup.visible = false;
                    displayLinkOverlayCard(targetConfig.param);
                }
            } else {
                if (chkOverlayAR.checked && modelGroup) {
                    modelGroup.visible = true;
                    positionModelInAR(result.center, result.scale, result.angle);
                }
            }
        } else {
            // Target is lost or not detected in this frame
            if (isTargetLocked) {
                if (performance.now() - lastDetectionTime > 1500) {
                    logConsole(`Tracking target '${activeTemplate.name}' lost. Resuming search cycle.`);
                    isTargetLocked = false;
                    lockedTemplateId = null;
                    trackedCorners = null;
                    hideARModelIfAllowed();
                    
                    opencvStatus.className = "status-pill cv-status ready";
                    opencvStatus.innerHTML = `<i class="fa-solid fa-check-circle"></i> CV: Searching`;
                }
            } else {
                trackedCorners = null;
                hideARModelIfAllowed();
                
                opencvStatus.className = "status-pill cv-status ready";
                opencvStatus.innerHTML = `<i class="fa-solid fa-check-circle"></i> CV: Searching`;
            }
        }
    }

    // -------------------------------------------------------------
    // QR Code Detection Handler
    // -------------------------------------------------------------
    let lastDecodedQR = null;
    let qrResetTimeout = null;

    function handleQRCodeMatch(code) {
        // Show QR HUD Panel
        const qrPanel = document.getElementById("qr-hud-panel");
        if (qrPanel) qrPanel.style.display = "block";

        // Skip duplicate logging within short time
        if (code.data === lastDecodedQR) {
            resetQRTimeout();
            return;
        }
        
        lastDecodedQR = code.data;
        logConsole(`QR Code Detected: ${code.data}`, "success");
        
        // Update QR Results panel
        qrResultBox.innerHTML = `
            <div class="qr-decoded-info">
                <div class="title"><i class="fa-solid fa-circle-check"></i> DECODED CONTENT</div>
                <div class="url-text">${escapeHTML(code.data)}</div>
            </div>
        `;
        
        const normalizedQR = code.data.toLowerCase().trim();
        let matchedTrigger = false;
        
        // Match against config.qrTriggers
        config.qrTriggers.forEach(t => {
            const pat = t.pattern.toLowerCase().trim();
            let isMatch = false;
            
            if (pat === "http" || pat === "https") {
                isMatch = code.data.startsWith("http://") || code.data.startsWith("https://");
            } else {
                isMatch = (normalizedQR === pat || normalizedQR.includes(pat));
            }
            
            if (isMatch) {
                matchedTrigger = true;
                const finalParam = (t.param === "auto") ? code.data : t.param;
                executeTriggerAction(t.action, finalParam, `QR Pattern: '${t.pattern}'`);
            }
        });
        
        // Fallback action if no trigger matched
        if (!matchedTrigger) {
            if (isValidURL(code.data)) {
                btnQrLink.href = code.data;
                qrActionArea.style.display = "block";
                logConsole("No explicit QR action found, displaying URL launch button.");
            } else {
                qrActionArea.style.display = "none";
            }
        } else {
            // If it matched a link action, display the launch button
            const linkTrigger = config.qrTriggers.find(t => {
                const pat = t.pattern.toLowerCase().trim();
                const isMatch = (pat === "http") ? code.data.startsWith("http") : normalizedQR.includes(pat);
                return isMatch && t.action === "link";
            });
            if (linkTrigger) {
                const finalLink = (linkTrigger.param === "auto") ? code.data : linkTrigger.param;
                btnQrLink.href = finalLink;
                qrActionArea.style.display = "block";
            } else {
                qrActionArea.style.display = "none";
            }
        }
        
        resetQRTimeout();
    }

    function executeTriggerAction(action, param, sourceInfo) {
        if (action === "model") {
            logConsole(`${sourceInfo} triggered model switch to ${param.toUpperCase()}`, "success");
            const modelId = param.toLowerCase();
            switchModel(modelId);
            showTextTriggeredAR(modelId);

            if (hudStatusText) {
                hudStatusText.textContent = `KEYWORD MATCH: ${param.toUpperCase()}`;
            }

            document.querySelectorAll(".model-btn").forEach(b => {
                if (b.getAttribute("data-model") === modelId) b.classList.add("active");
                else b.classList.remove("active");
            });
        } else if (action === "link") {
            logConsole(`${sourceInfo} triggered link opening for ${param}`, "success");
            displayLinkOverlayCard(param);
        } else if (action === "alert") {
            logConsole(`${sourceInfo} triggered notification alert: "${param}"`, "warning");
            displayCustomToast(param);
        }
    }

    function displayCustomToast(message) {
        let container = document.getElementById("aetheris-toast");
        if (container) container.remove(); // remove old one
        
        container = document.createElement("div");
        container.id = "aetheris-toast";
        container.style.position = "absolute";
        container.style.top = "20px";
        container.style.left = "50%";
        container.style.transform = "translateX(-50%)";
        container.style.zIndex = "100";
        container.style.backgroundColor = "rgba(189, 0, 255, 0.9)"; // Purple backdrop
        container.style.border = "1px solid var(--neon-pink)";
        container.style.boxShadow = "0 0 25px rgba(189, 0, 255, 0.5)";
        container.style.borderRadius = "8px";
        container.style.padding = "12px 24px";
        container.style.display = "flex";
        container.style.alignItems = "center";
        container.style.gap = "15px";
        container.style.color = "#fff";
        container.style.fontWeight = "600";
        container.style.fontSize = "0.9rem";
        container.style.fontFamily = "var(--font-sans)";
        container.style.animation = "fadeIn 0.3s ease";
        
        container.innerHTML = `
            <i class="fa-solid fa-bell" style="color: var(--neon-cyan); font-size:1.1rem; animation: pulse-ring 1.5s infinite;"></i>
            <span>${escapeHTML(message)}</span>
            <button id="btn-close-toast" style="background:transparent; border:none; color:#fff; cursor:pointer; font-size:1.2rem; font-weight:bold; margin-left:10px;">&times;</button>
        `;
        
        videoFeed.parentNode.appendChild(container);
        
        document.getElementById("btn-close-toast").onclick = () => {
            container.remove();
        };
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (container.parentNode) container.remove();
        }, 5000);
    }
    
    function resetQRTimeout() {
        if (qrResetTimeout) clearTimeout(qrResetTimeout);
        qrResetTimeout = setTimeout(() => {
            // Auto reset UI logs after 4 seconds of inactivity
            resetQRUI();
        }, 4000);
    }
    
    function resetQRUI() {
        lastDecodedQR = null;
        qrActionArea.style.display = "none";
        qrResultBox.innerHTML = `
            <div class="qr-placeholder">
                <i class="fa-solid fa-qrcode scan-pulse"></i>
                <span>Align a QR code within the camera frame</span>
            </div>
        `;
        const qrPanel = document.getElementById("qr-hud-panel");
        if (qrPanel) qrPanel.style.display = "none";
    }

    function drawQRBox(code) {
        const ctx = canvasOverlay.getContext("2d");
        const loc = code.location;
        ctx.strokeStyle = varColor("--neon-green");
        ctx.lineWidth = 4;
        ctx.shadowColor = varColor("--neon-green");
        ctx.shadowBlur = 10;
        
        ctx.beginPath();
        ctx.moveTo(loc.topLeftCorner.x, loc.topLeftCorner.y);
        ctx.lineTo(loc.topRightCorner.x, loc.topRightCorner.y);
        ctx.lineTo(loc.bottomRightCorner.x, loc.bottomRightCorner.y);
        ctx.lineTo(loc.bottomLeftCorner.x, loc.bottomLeftCorner.y);
        ctx.closePath();
        ctx.stroke();
        
        ctx.shadowBlur = 0; // reset
    }

    // -------------------------------------------------------------
    // OCR text reader (Tesseract.js)
    // -------------------------------------------------------------
    async function initOCR() {
        if (isOcrReady) return;

        logConsole("Loading Tesseract.js language dataset (eng)...");
        ocrStatus.className = "status-pill ocr-status loading";
        ocrStatus.innerHTML = `<i class="fa-solid fa-sync fa-spin spinner-icon"></i> OCR: Loading`;
        
        try {
            if (typeof Tesseract.createWorker === "function") {
                ocrWorker = await Tesseract.createWorker("eng", 1, {
                    logger: () => {}
                });
            }
            isOcrReady = true;
            ocrStatus.className = "status-pill ocr-status ready";
            ocrStatus.innerHTML = `<i class="fa-solid fa-check-circle"></i> OCR: Ready`;
            logConsole("Tesseract OCR scanner initialized.", "success");
            
            if (isCameraStreaming) {
                startOCRScanner();
            }
        } catch (err) {
            if (typeof Tesseract.recognize === "function") {
                isOcrReady = true;
                ocrStatus.className = "status-pill ocr-status ready";
                ocrStatus.innerHTML = `<i class="fa-solid fa-check-circle"></i> OCR: Ready`;
                logConsole("OCR using lightweight mode (no worker).", "warning");
                if (isCameraStreaming) startOCRScanner();
            } else {
                logConsole("OCR Initialization failed: " + err.message, "error");
                ocrStatus.className = "status-pill ocr-status error";
                ocrStatus.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> OCR: Failed`;
            }
        }
    }

    function startOCRScanner() {
        if (ocrIntervalId) return;
        if (!isOcrReady || !isCameraStreaming || isFrameFrozen) return;
        
        logConsole("Starting Text Scanner parser background threads.");
        ocrLiveText.textContent = "Scanning camera frames... Keep camera steady.";
        ocrStatus.className = "status-pill ocr-status scanning";
        ocrStatus.innerHTML = `<i class="fa-solid fa-eye-slash-o scan-pulse"></i> OCR: Scanning`;
        
        // Show OCR HUD panels automatically
        const ocrPanel = document.getElementById("ocr-hud-panel");
        const keywordsPanel = document.getElementById("keywords-hud-panel");
        if (ocrPanel) ocrPanel.style.display = "block";
        if (keywordsPanel) keywordsPanel.style.display = "block";
        
        const tempCanvas = document.createElement("canvas");
        const tempCtx = tempCanvas.getContext("2d");
        
        // Start periodic frame analyzer loop
        ocrIntervalId = setInterval(async () => {
            if (isOcrScanning || !isCameraStreaming || isFrameFrozen) return;
            
            const w = videoFeed.videoWidth;
            const h = videoFeed.videoHeight;
            if (!w || !h) return;
            
            isOcrScanning = true;
            const ocrStartTime = performance.now();
            
            try {
                // Grab central portion of screen (ROI - region of interest) to improve speed and focus
                // OCR works best when focused on smaller bounding boxes
                tempCanvas.width = w * 0.8;
                tempCanvas.height = h * 0.4;
                
                // Crop middle of video feed
                tempCtx.drawImage(
                    videoFeed,
                    w * 0.1, h * 0.3, w * 0.8, h * 0.4, // src
                    0, 0, tempCanvas.width, tempCanvas.height // dst
                );
                
                const result = ocrWorker
                    ? await ocrWorker.recognize(tempCanvas)
                    : await Tesseract.recognize(tempCanvas, "eng");
                const { text, confidence } = result.data;
                
                const elapsed = (performance.now() - ocrStartTime).toFixed(0);
                ocrSpeed.textContent = `Latency: ${elapsed} ms`;
                ocrConfidence.textContent = `Confidence: ${Math.round(confidence)}%`;
                
                const cleanedText = text.trim();
                if (cleanedText) {
                    ocrLiveText.textContent = cleanedText;
                    parseRecognizedText(cleanedText);
                } else {
                    ocrLiveText.textContent = "[No text detected in scan box]";
                }
            } catch (err) {
                console.error("OCR parse error", err);
            } finally {
                isOcrScanning = false;
            }
        }, 1500); // OCR checks every 1.5 seconds to limit CPU consumption
    }

    function stopOCRScanner() {
        if (ocrIntervalId) {
            clearInterval(ocrIntervalId);
            ocrIntervalId = null;
        }
        isOcrScanning = false;
        
        if (isOcrReady) {
            ocrStatus.className = "status-pill ocr-status ready";
            ocrStatus.innerHTML = `<i class="fa-solid fa-check-circle"></i> OCR: Ready`;
        } else {
            ocrStatus.className = "status-pill ocr-status idle";
            ocrStatus.innerHTML = `<i class="fa-solid fa-language"></i> OCR: Idle`;
        }
        
        ocrLiveText.textContent = "Waiting for scanner... Select mode and click Start.";
    }

    function drawOCRScanArea(vw, vh) {
        const ctx = canvasOverlay.getContext("2d");
        
        const rx = vw * 0.1;
        const ry = vh * 0.3;
        const rw = vw * 0.8;
        const rh = vh * 0.4;
        
        // Draw dark translucent layer outside scanner area
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fillRect(0, 0, vw, ry);
        ctx.fillRect(0, ry + rh, vw, vh - (ry + rh));
        ctx.fillRect(0, ry, rx, rh);
        ctx.fillRect(rx + rw, ry, vw - (rx + rw), rh);
        
        // Draw neon border for scanning area
        ctx.strokeStyle = varColor("--neon-cyan");
        ctx.lineWidth = 2;
        ctx.strokeRect(rx, ry, rw, rh);
        
        // Highlight corners
        ctx.fillStyle = varColor("--neon-cyan");
        const sz = 12;
        ctx.fillRect(rx, ry, sz, 4);
        ctx.fillRect(rx, ry, 4, sz);
        
        ctx.fillRect(rx + rw - sz, ry, sz, 4);
        ctx.fillRect(rx + rw - 4, ry, 4, sz);
        
        ctx.fillRect(rx, ry + rh - 4, sz, 4);
        ctx.fillRect(rx, ry + rh - sz, 4, sz);
        
        ctx.fillRect(rx + rw - sz, ry + rh - 4, sz, 4);
        ctx.fillRect(rx + rw - 4, ry + rh - sz, 4, sz);
    }

    function parseRecognizedText(text) {
        const normalized = text.toLowerCase().trim();
        
        // Reset all keyword tags in UI
        document.querySelectorAll(".keyword-tag").forEach(tag => tag.classList.remove("matched"));
        
        let matchedAny = false;
        
        config.textTriggers.forEach(t => {
            const kw = t.keyword.toLowerCase().trim();
            let isMatch = false;
            
            if (t.matchType === "exact") {
                isMatch = (normalized === kw);
            } else { // contains
                isMatch = normalized.includes(kw);
            }
            
            if (isMatch) {
                matchedAny = true;
                
                const tag = document.querySelector(`.keyword-tag[data-keyword="${CSS.escape(t.keyword)}"]`)
                    || document.querySelector(`.keyword-tag[data-keyword="${t.keyword}"]`);
                if (tag) {
                    tag.classList.add("matched");
                    setTimeout(() => tag.classList.remove("matched"), 2500);
                }

                const triggerKey = `${t.keyword}|${t.action}|${t.param}`;
                const now = performance.now();
                if (triggerKey !== lastOcrTriggerKey || now - lastOcrTriggerTime > 3000) {
                    lastOcrTriggerKey = triggerKey;
                    lastOcrTriggerTime = now;
                    executeTriggerAction(t.action, t.param, `OCR Keyword: '${t.keyword.toUpperCase()}'`);
                } else if (t.action === "model" && chkOverlayAR.checked) {
                    arModelHoldUntil = now + 8000;
                }
            }
        });
        
        if (!matchedAny) {
            // Check for links
            const urlMatch = text.match(/(https?:\/\/[^\s]+)/gi);
            if (urlMatch && urlMatch[0]) {
                const detectedUrl = urlMatch[0];
                logConsole(`OCR link detected: ${detectedUrl}`, "success");
                displayLinkOverlayCard(detectedUrl);
            }
        }
    }
    
    function triggerKeywordAction(keyword) {
        logConsole(`Keyword selected: ${keyword.toUpperCase()}`);

        const tag = document.querySelector(`.keyword-tag[data-keyword="${CSS.escape(keyword)}"]`)
            || document.querySelector(`.keyword-tag[data-keyword="${keyword}"]`);
        if (tag) {
            tag.classList.add("matched");
            setTimeout(() => tag.classList.remove("matched"), 2500);
        }
        
        const trigger = config.textTriggers.find(t => t.keyword.toLowerCase().trim() === keyword.toLowerCase().trim());
        if (trigger) {
            executeTriggerAction(trigger.action, trigger.param, `Manual Keyword: '${keyword.toUpperCase()}'`);
        } else {
            logConsole(`Loading model ${keyword.toUpperCase()}...`, "success");
            showTextTriggeredAR(keyword.toLowerCase());
        }
    }
    
    function displayLinkOverlayCard(url) {
        // Check if there is already a link overlay card
        let container = document.getElementById("ocr-link-overlay");
        if (!container) {
            container = document.createElement("div");
            container.id = "ocr-link-overlay";
            container.style.position = "absolute";
            container.style.bottom = "20px";
            container.style.left = "50%";
            container.style.transform = "translateX(-50%)";
            container.style.zIndex = "10";
            container.style.backgroundColor = "rgba(10, 12, 16, 0.9)";
            container.style.border = "1px solid var(--neon-cyan)";
            container.style.boxShadow = "0 0 20px rgba(0, 240, 255, 0.3)";
            container.style.borderRadius = "8px";
            container.style.padding = "10px 20px";
            container.style.display = "flex";
            container.style.alignItems = "center";
            container.style.gap = "15px";
            container.style.animation = "fadeIn 0.3s ease";
            
            videoFeed.parentNode.appendChild(container);
        }
        
        container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:2px;">
                <span style="font-family:var(--font-mono); font-size:0.6rem; color:var(--neon-cyan); font-weight:700;">WEB LINK DETECTED</span>
                <span style="font-size:0.8rem; font-family:var(--font-mono); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${url}</span>
            </div>
            <a href="${url}" target="_blank" class="btn btn-small btn-primary" style="padding:6px 12px; font-size:0.7rem;">
                <i class="fa-solid fa-arrow-up-right-from-square"></i> Open
            </a>
            <button id="btn-close-link-overlay" style="background:transparent; border:none; color:var(--text-secondary); cursor:pointer; font-size:1.1rem;">&times;</button>
        `;
        
        document.getElementById("btn-close-link-overlay").onclick = () => {
            container.remove();
        };
        
        // Auto remove after 8 seconds
        setTimeout(() => {
            if (container.parentNode) container.remove();
        }, 8000);
    }

    // -------------------------------------------------------------
    // Dynamic Canvas Drawing Functions (HUD / CV Highlights)
    // -------------------------------------------------------------
    function clearOverlayCanvas() {
        const ctx = canvasOverlay.getContext("2d");
        ctx.clearRect(0, 0, canvasOverlay.width, canvasOverlay.height);
    }

    function drawBoundingBox(corners, inliers) {
        const ctx = canvasOverlay.getContext("2d");
        
        // Line styling
        ctx.strokeStyle = varColor("--neon-cyan");
        ctx.lineWidth = 4;
        ctx.lineJoin = "round";
        ctx.shadowColor = varColor("--neon-cyan");
        ctx.shadowBlur = 12;
        
        // Draw projected bounding quad
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        ctx.lineTo(corners[1].x, corners[1].y);
        ctx.lineTo(corners[2].x, corners[2].y);
        ctx.lineTo(corners[3].x, corners[3].y);
        ctx.closePath();
        ctx.stroke();
        
        // Draw keypoint indicators on corners
        ctx.shadowBlur = 0; // reset glow
        ctx.fillStyle = varColor("--neon-purple");
        corners.forEach((pt, idx) => {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 6, 0, 2 * Math.PI);
            ctx.fill();
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            
            // Draw numeric index badge
            ctx.fillStyle = "#fff";
            ctx.font = "bold 9px var(--font-mono)";
            ctx.fillText(idx.toString(), pt.x - 3, pt.y - 10);
            ctx.fillStyle = varColor("--neon-purple");
        });
        
        // Draw dynamic status HUD card right above object bounding box
        const minX = Math.min(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
        const minY = Math.min(corners[0].y, corners[1].y, corners[2].y, corners[3].y);
        
        ctx.fillStyle = "rgba(10, 12, 16, 0.85)";
        ctx.strokeStyle = varColor("--neon-purple");
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(minX, Math.max(10, minY - 35), 140, 25, 4);
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = "#fff";
        ctx.font = "9px var(--font-mono)";
        ctx.fillText(`TARGET: LOCK // INLIERS:${inliers}`, minX + 8, Math.max(25, minY - 20));
    }

    // -------------------------------------------------------------
    // Canvas procedural target drawings
    // -------------------------------------------------------------
    function generateTargetsGallery() {
        templateGallery.innerHTML = "";
        allTemplates = [];
        
        // 1. Draw built-in presets
        templateImages.forEach(t => {
            const item = document.createElement("div");
            item.className = "template-item";
            item.setAttribute("data-id", t.id);
            
            const canvas = document.createElement("canvas");
            canvas.width = 128;
            canvas.height = 128;
            t.draw(canvas);
            
            const label = document.createElement("span");
            label.textContent = t.name;
            
            item.appendChild(canvas);
            item.appendChild(label);
            templateGallery.appendChild(item);
            
            allTemplates.push({
                id: t.id,
                name: t.name,
                builtIn: true,
                draw: t.draw
            });
            
            item.addEventListener("click", () => {
                selectTemplate(t.id);
            });
        });
        
        // 2. Draw custom templates from config
        config.imageTargets.forEach(t => {
            if (t.deletable) {
                const item = document.createElement("div");
                item.className = "template-item";
                item.setAttribute("data-id", t.id);
                
                const canvas = document.createElement("canvas");
                canvas.width = 128;
                canvas.height = 128;
                
                const ctx = canvas.getContext("2d");
                const img = new Image();
                img.onload = () => {
                    ctx.drawImage(img, 0, 0, 128, 128);
                };
                img.src = t.imageDataUrl;
                
                const label = document.createElement("span");
                label.textContent = t.name;
                
                item.appendChild(canvas);
                item.appendChild(label);
                templateGallery.appendChild(item);
                
                allTemplates.push({
                    id: t.id,
                    name: t.name,
                    builtIn: false,
                    imageDataUrl: t.imageDataUrl
                });
                
                item.addEventListener("click", () => {
                    selectTemplate(t.id);
                });
            }
        });
    }

    function selectTemplate(id, quiet = false) {
        document.querySelectorAll(".template-item").forEach(item => {
            if (item.getAttribute("data-id") === id) {
                item.classList.add("active");
            } else {
                item.classList.remove("active");
            }
        });
        
        // Check if it's a built-in template
        const builtIn = templateImages.find(t => t.id === id);
        if (builtIn) {
            activeTemplate.name = builtIn.name;
            activeTemplate.width = 256;
            activeTemplate.height = 256;
            
            const canvas = document.createElement("canvas");
            canvas.width = 256;
            canvas.height = 256;
            builtIn.draw(canvas);
            activeTemplate.canvas = canvas;
            
            const ctxPreview = canvasTargetPreview.getContext("2d");
            ctxPreview.clearRect(0, 0, 128, 128);
            ctxPreview.drawImage(canvas, 0, 0, 128, 128);
            
            targetBadge.textContent = "Default Target";
            targetName.textContent = builtIn.name;
            targetResolution.textContent = "256 x 256 px";
            
            if (!quiet) logConsole(`Swapped tracking target model to '${builtIn.name}'.`);
            uploadActiveTemplateToWorker();
        } else {
            // Check custom template from config
            const custom = config.imageTargets.find(t => t.id === id);
            if (custom) {
                activeTemplate.name = custom.name;
                
                const img = new Image();
                img.onload = () => {
                    activeTemplate.width = img.width;
                    activeTemplate.height = img.height;
                    
                    const canvas = document.createElement("canvas");
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0, img.width, img.height);
                    activeTemplate.canvas = canvas;
                    
                    const ctxPreview = canvasTargetPreview.getContext("2d");
                    ctxPreview.clearRect(0, 0, 128, 128);
                    ctxPreview.drawImage(canvas, 0, 0, 128, 128);
                    
                    targetBadge.textContent = "Custom Target";
                    targetName.textContent = custom.name;
                    targetResolution.textContent = `${img.width} x ${img.height} px`;
                    
                    if (!quiet) logConsole(`Swapped tracking target model to custom '${custom.name}'.`);
                    uploadActiveTemplateToWorker();
                };
                img.src = custom.imageDataUrl;
            }
        }
    }

    function handleCustomTargetUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                // Resize image to max 256px for efficient keypoint processing in OpenCV
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
                
                activeTemplate.name = file.name.substring(0, 15) + (file.name.length > 15 ? "..." : "");
                activeTemplate.width = w;
                activeTemplate.height = h;
                activeTemplate.canvas = canvas;
                
                // Draw preview
                const ctxPreview = canvasTargetPreview.getContext("2d");
                ctxPreview.clearRect(0, 0, 128, 128);
                ctxPreview.drawImage(canvas, 0, 0, 128, 128);
                
                // Update text details
                targetBadge.textContent = "Custom Image";
                targetName.textContent = activeTemplate.name;
                targetResolution.textContent = `${w} x ${h} px`;
                
                document.querySelectorAll(".template-item").forEach(item => item.classList.remove("active"));
                
                logConsole(`Loaded custom template target '${activeTemplate.name}' successfully.`, "success");
                
                // Upload to worker
                uploadActiveTemplateToWorker();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    // --- Dynamic Target Procedural Graphics Drawings ---
    function drawGeometricCore(canvas) {
        const ctx = canvas.getContext("2d");
        const w = canvas.width;
        const h = canvas.height;
        const cx = w / 2;
        const cy = h / 2;
        
        // Draw deep tech circular card background
        ctx.fillStyle = "#0c0f13";
        ctx.fillRect(0, 0, w, h);
        
        // Circular design base structure
        ctx.strokeStyle = "#00f0ff";
        ctx.lineWidth = w / 50;
        ctx.beginPath();
        ctx.arc(cx, cy, w * 0.4, 0, 2 * Math.PI);
        ctx.stroke();
        
        // Outer tech ring fragments
        ctx.strokeStyle = "#bd00ff";
        ctx.lineWidth = w / 80;
        ctx.beginPath();
        ctx.arc(cx, cy, w * 0.44, 0, 0.4 * Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, w * 0.44, 0.6 * Math.PI, 1.1 * Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, w * 0.44, 1.3 * Math.PI, 1.8 * Math.PI);
        ctx.stroke();
        
        // Concentric inner ring
        ctx.strokeStyle = "#00f0ff";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, w * 0.3, 0, 2 * Math.PI);
        ctx.stroke();
        
        // Hexagonal tech elements (rich features)
        ctx.strokeStyle = "#00f0ff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i * 2 * Math.PI) / 6;
            const x = cx + w * 0.22 * Math.cos(angle);
            const y = cy + w * 0.22 * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        
        // Asymmetric keypoint markers inside
        ctx.fillStyle = "#ffd700";
        for (let i = 0; i < 4; i++) {
            const angle = (i * 2 * Math.PI) / 4 + 0.3; // slightly offset
            const x = cx + w * 0.14 * Math.cos(angle);
            const y = cy + w * 0.14 * Math.sin(angle);
            ctx.beginPath();
            ctx.arc(x, y, w / 40, 0, 2 * Math.PI);
            ctx.fill();
        }
        
        // Draw crosshairs
        ctx.strokeStyle = "rgba(0, 240, 255, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.48, cy); ctx.lineTo(cx - w * 0.32, cy);
        ctx.moveTo(cx + w * 0.32, cy); ctx.lineTo(cx + w * 0.48, cy);
        ctx.moveTo(cx, cy - h * 0.48); ctx.lineTo(cx, cy - h * 0.32);
        ctx.moveTo(cx, cy + h * 0.32); ctx.lineTo(cx, cy + h * 0.48);
        ctx.stroke();
        
        // Central core star shape (for massive corner features)
        ctx.fillStyle = "#ff007f";
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const angle = (i * 2 * Math.PI) / 8;
            const radius = (i % 2 === 0) ? w * 0.08 : w * 0.035;
            const x = cx + radius * Math.cos(angle);
            const y = cy + radius * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
    }

    function drawCyberMatrix(canvas) {
        const ctx = canvas.getContext("2d");
        const w = canvas.width;
        const h = canvas.height;
        
        ctx.fillStyle = "#09090b";
        ctx.fillRect(0, 0, w, h);
        
        // Background Matrix grid lines
        ctx.strokeStyle = "rgba(189, 0, 255, 0.15)";
        ctx.lineWidth = 1;
        for (let i = 1; i < 8; i++) {
            ctx.beginPath();
            ctx.moveTo((w / 8) * i, 0); ctx.lineTo((w / 8) * i, h);
            ctx.moveTo(0, (h / 8) * i); ctx.lineTo(w, (h / 8) * i);
            ctx.stroke();
        }
        
        // Outer target frame box
        ctx.strokeStyle = "#bd00ff";
        ctx.lineWidth = 4;
        ctx.strokeRect(w * 0.1, h * 0.1, w * 0.8, h * 0.8);
        
        // Sub-rectangles inside to create crisp corner intersections
        ctx.strokeStyle = "#00f0ff";
        ctx.lineWidth = 2;
        ctx.strokeRect(w * 0.22, h * 0.22, w * 0.56, h * 0.56);
        ctx.strokeRect(w * 0.35, h * 0.35, w * 0.3, h * 0.3);
        
        // Crosshair ticks
        ctx.fillStyle = "#00f0ff";
        const tickSz = w / 25;
        // Corner shapes ticks
        ctx.fillRect(w * 0.1, h * 0.1, tickSz, 4);
        ctx.fillRect(w * 0.1, h * 0.1, 4, tickSz);
        ctx.fillRect(w * 0.9 - tickSz, h * 0.1, tickSz, 4);
        ctx.fillRect(w * 0.9 - 4, h * 0.1, 4, tickSz);
        ctx.fillRect(w * 0.1, h * 0.9 - 4, tickSz, 4);
        ctx.fillRect(w * 0.1, h * 0.9 - tickSz, 4, tickSz);
        ctx.fillRect(w * 0.9 - tickSz, h * 0.9 - 4, tickSz, 4);
        ctx.fillRect(w * 0.9 - 4, h * 0.9 - tickSz, 4, tickSz);
        
        // Add random high contrast details
        ctx.fillStyle = "#ffd700";
        // Block clusters (high contrast descriptors)
        ctx.fillRect(w * 0.15, h * 0.15, 10, 10);
        ctx.fillRect(w * 0.77, h * 0.15, 10, 10);
        ctx.fillRect(w * 0.15, h * 0.77, 10, 10);
        ctx.fillRect(w * 0.77, h * 0.77, 10, 10);
        
        // Binary codes writing (high detail edges)
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${w / 20}px var(--font-mono)`;
        ctx.fillText("1", w * 0.47, h * 0.17);
        ctx.fillText("0", w * 0.18, h * 0.48);
        ctx.fillText("0", w * 0.76, h * 0.48);
        ctx.fillText("1", w * 0.47, h * 0.82);
    }

    function drawOpenCVShield(canvas) {
        const ctx = canvas.getContext("2d");
        const w = canvas.width;
        const h = canvas.height;
        const cx = w / 2;
        const cy = h / 2;
        
        ctx.fillStyle = "#0c0d12";
        ctx.fillRect(0, 0, w, h);
        
        // Draw shield polygon outline
        ctx.strokeStyle = "#ff007f";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx, h * 0.08); // Top middle
        ctx.lineTo(w * 0.85, h * 0.22); // Top right
        ctx.lineTo(w * 0.85, h * 0.55); // Mid right
        ctx.quadraticCurveTo(w * 0.85, h * 0.85, cx, h * 0.95); // Curved Bottom tip
        ctx.quadraticCurveTo(w * 0.15, h * 0.85, w * 0.15, h * 0.55); // Curved Left
        ctx.lineTo(w * 0.15, h * 0.22); // Mid left
        ctx.closePath();
        ctx.stroke();
        
        // OpenCV dynamic 3-ring alignment (circles)
        const rad = w * 0.12;
        
        // Top Ring (Red-ish magenta)
        ctx.strokeStyle = "#ff0055";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(cx, cy - rad - 5, rad, 0, 2 * Math.PI);
        ctx.stroke();
        
        // Bottom Left Ring (Green)
        ctx.strokeStyle = "#39ff14";
        ctx.beginPath();
        ctx.arc(cx - rad - 5, cy + rad - 10, rad, 0, 2 * Math.PI);
        ctx.stroke();
        
        // Bottom Right Ring (Blue/Cyan)
        ctx.strokeStyle = "#00f0ff";
        ctx.beginPath();
        ctx.arc(cx + rad + 5, cy + rad - 10, rad, 0, 2 * Math.PI);
        ctx.stroke();
        
        // Tech cross lines in background
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(w, h);
        ctx.moveTo(w, 0); ctx.lineTo(0, h);
        ctx.stroke();
    }

    // -------------------------------------------------------------
    // Fullscreen Target Modal Layout
    // -------------------------------------------------------------
    function openTargetModal() {
        targetModal.classList.add("open");
        
        // Draw active template inside modal in high res (400x400)
        canvasModalTarget.width = 400;
        canvasModalTarget.height = 400;
        
        const template = templateImages.find(t => t.name === activeTemplate.name || activeTemplate.name.includes(t.name));
        if (template) {
            template.draw(canvasModalTarget);
        } else {
            // Draw custom template if chosen
            const ctx = canvasModalTarget.getContext("2d");
            ctx.clearRect(0, 0, 400, 400);
            ctx.drawImage(activeTemplate.canvas, 0, 0, 400, 400);
        }
        
        // Set up download anchor link
        linkDownloadTarget.href = canvasModalTarget.toDataURL("image/png");
        linkDownloadTarget.download = `${activeTemplate.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}_target.png`;
    }

    function closeTargetModal() {
        targetModal.classList.remove("open");
    }

    // -------------------------------------------------------------
    // Three.js 3D Viewport engine
    // -------------------------------------------------------------
    function initThreeJS() {
        logConsole("Setting up Three.js 3D engine scene...");
        
        const w = rendererContainer.clientWidth;
        const h = rendererContainer.clientHeight;
        
        // 1. Create Scene
        scene = new THREE.Scene();
        
        // 2. Camera setup
        camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
        camera.position.set(0, 0, 4);
        camera.lookAt(0, 0, 0);
        
        // 3. Renderer setup
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0); // Transparent background by default
        
        threeCanvas = renderer.domElement;
        rendererContainer.appendChild(threeCanvas);
        
        // 4. Lighting setup
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        scene.add(ambientLight);
        
        const dirLight1 = new THREE.DirectionalLight(0x00f0ff, 0.8); // Cyan tech light
        dirLight1.position.set(2, 4, 3);
        scene.add(dirLight1);
        
        const dirLight2 = new THREE.DirectionalLight(0xbd00ff, 0.6); // Purple backlight
        dirLight2.position.set(-2, -4, -3);
        scene.add(dirLight2);
        
        // Add subtle cyber grid in scene
        const gridHelper = new THREE.GridHelper(6, 12, 0x00f0ff, 0x1a202c);
        gridHelper.position.y = -1;
        gridHelper.material.opacity = 0.25;
        gridHelper.material.transparent = true;
        scene.add(gridHelper);
        
        // 5. Models Group
        modelGroup = new THREE.Group();
        scene.add(modelGroup);
        
        // Build the 3 default models
        createModels();
        
        // Set default active model
        switchModel("cube");
        
        // 6. Animation loop
        const clock = new THREE.Clock();
        
        function animate() {
            requestAnimationFrame(animate);
            
            const elapsedTime = clock.getElapsedTime();
            
            // Apply idle animations to whichever mesh is active
            if (activeModelName === "cube" && meshCube) {
                meshCube.rotation.y = elapsedTime * 0.4;
                meshCube.rotation.x = elapsedTime * 0.25;
                
                // Pulse wireframe scale
                const pulse = 1.0 + Math.sin(elapsedTime * 3) * 0.05;
                const wf = meshCube.children[0];
                if (wf) wf.scale.set(pulse, pulse, pulse);
            } 
            else if (activeModelName === "torus" && meshTorus) {
                meshTorus.rotation.y = -elapsedTime * 0.5;
                meshTorus.rotation.z = elapsedTime * 0.3;
                
                // Rotate outer rings opposite directions
                const ring = meshTorus.children[0];
                if (ring) {
                    ring.rotation.x = elapsedTime * 0.8;
                    ring.rotation.y = elapsedTime * 0.4;
                }
            } 
            else if (activeModelName === "core" && meshCore) {
                meshCore.rotation.y = elapsedTime * 0.3;
                
                // Pulse core emission light intensity
                const coreSphere = meshCore.children[0];
                if (coreSphere) {
                    coreSphere.material.emissiveIntensity = 0.5 + Math.sin(elapsedTime * 4) * 0.3;
                }
                
                // Gyroscopic rings rotation
                if (meshCore.children[1]) meshCore.children[1].rotation.x = elapsedTime * 1.2;
                if (meshCore.children[2]) meshCore.children[2].rotation.y = elapsedTime * 0.8;
                if (meshCore.children[3]) meshCore.children[3].rotation.z = elapsedTime * 1.5;
            }
            
            renderer.render(scene, camera);
        }
        
        animate();
        
        // Handle window resizes
        window.addEventListener("resize", onViewportResize);
    }
    
    function createModels() {
        // --- 1. Neon Glass Cyber Cube ---
        meshCube = new THREE.Group();
        
        const boxGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
        // Glassmorphic translucent mesh material
        const glassMat = new THREE.MeshPhysicalMaterial({
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.6,
            roughness: 0.1,
            metalness: 0.1,
            transmission: 0.8, // glass refraction index
            thickness: 0.5,
            side: THREE.DoubleSide
        });
        const glassBox = new THREE.Mesh(boxGeo, glassMat);
        meshCube.add(glassBox);
        
        // Inner neon wireframe frame (slightly larger)
        const wfGeo = new THREE.BoxGeometry(1.25, 1.25, 1.25);
        const edgeGeo = new THREE.EdgesGeometry(wfGeo);
        const lineMat = new THREE.LineBasicMaterial({
            color: 0xbd00ff,
            linewidth: 3,
            transparent: true,
            opacity: 0.9
        });
        const wireframe = new THREE.LineSegments(edgeGeo, lineMat);
        meshCube.add(wireframe);
        
        
        // --- 2. Metallic Chrome Torus Knot ---
        meshTorus = new THREE.Group();
        
        const knotGeo = new THREE.TorusKnotGeometry(0.5, 0.18, 100, 16);
        const chromeMat = new THREE.MeshStandardMaterial({
            color: 0xff007f, // Neon Pink
            roughness: 0.1,
            metalness: 0.9,
            flatShading: false
        });
        const knot = new THREE.Mesh(knotGeo, chromeMat);
        meshTorus.add(knot);
        
        // Surrounding orbital ring
        const ringGeo = new THREE.TorusGeometry(1.0, 0.02, 8, 64);
        const ringMat = new THREE.MeshStandardMaterial({
            color: 0x00f0ff,
            emissive: 0x0055ff,
            roughness: 0.2
        });
        const outerRing = new THREE.Mesh(ringGeo, ringMat);
        outerRing.rotation.x = Math.PI / 2;
        meshTorus.add(outerRing);
        
        
        // --- 3. Cyber Sphere Core (Gyroscope) ---
        meshCore = new THREE.Group();
        
        // Inner glowing core
        const sphereGeo = new THREE.SphereGeometry(0.4, 32, 32);
        const sphereMat = new THREE.MeshStandardMaterial({
            color: 0xffd700,
            emissive: 0xff8800,
            emissiveIntensity: 0.8,
            roughness: 0.0
        });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        meshCore.add(sphere);
        
        // Gyro Ring 1
        const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.025, 8, 48), new THREE.MeshStandardMaterial({ color: 0x00f0ff, roughness: 0.1 }));
        meshCore.add(ring1);
        
        // Gyro Ring 2
        const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.025, 8, 48), new THREE.MeshStandardMaterial({ color: 0xbd00ff, roughness: 0.1 }));
        ring2.rotation.y = Math.PI / 3;
        meshCore.add(ring2);
        
        // Gyro Ring 3
        const ring3 = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.025, 8, 48), new THREE.MeshStandardMaterial({ color: 0xff007f, roughness: 0.1 }));
        ring3.rotation.x = Math.PI / 4;
        meshCore.add(ring3);
    }
    
    function switchModel(modelName) {
        activeModelName = modelName;
        
        // Remove current mesh child from group
        while (modelGroup.children.length > 0) {
            modelGroup.remove(modelGroup.children[0]);
        }
        
        // Append chosen mesh group
        if (modelName === "cube") {
            modelGroup.add(meshCube);
            rendererStatusText.textContent = "Active model: Cyber Cube";
        } else if (modelName === "torus") {
            modelGroup.add(meshTorus);
            rendererStatusText.textContent = "Active model: Chrome Torus";
        } else if (modelName === "core") {
            modelGroup.add(meshCore);
            rendererStatusText.textContent = "Active model: Gyro Core";
        }
        
        // Apply responsive resetting size
        if (!chkOverlayAR.checked && modelGroup) {
            modelGroup.position.set(0, 0.15, 0);
            modelGroup.scale.set(1, 1, 1);
            modelGroup.rotation.set(0, 0, 0);
            modelGroup.visible = true;
        }
    }
    
    function onViewportResize() {
        if (!camera || !renderer) return;
        
        const container = chkOverlayAR.checked ? document.querySelector(".camera-viewport-container") : rendererContainer;
        const w = container.clientWidth;
        const h = container.clientHeight;
        
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }

    // -------------------------------------------------------------
    // AR Mode Layout Overlay Swapping
    // -------------------------------------------------------------
    function handleOverlayARChange() {
        const isOverlay = chkOverlayAR.checked;
        
        if (isOverlay) {
            // Append Three.js Canvas to overlay the live video card container
            threeCanvas.style.position = "absolute";
            threeCanvas.style.top = "0";
            threeCanvas.style.left = "0";
            threeCanvas.style.width = "100%";
            threeCanvas.style.height = "100%";
            threeCanvas.style.zIndex = "4";
            threeCanvas.style.pointerEvents = "none"; // Let mouse clicks fall through to video card
            
            document.querySelector(".camera-viewport-container").appendChild(threeCanvas);
            
            // Set 3D model hidden initially until a match occurs
            modelGroup.visible = false;
        } else {
            // Restore Three.js Canvas back to the sidebar viewport container
            threeCanvas.style.position = "static";
            threeCanvas.style.width = "100%";
            threeCanvas.style.height = "100%";
            threeCanvas.style.zIndex = "1";
            threeCanvas.style.pointerEvents = "auto";
            
            rendererContainer.appendChild(threeCanvas);
            
            // Restore default preview transformations (centered and visible)
            modelGroup.position.set(0, 0.15, 0);
            modelGroup.scale.set(1, 1, 1);
            modelGroup.rotation.set(0, 0, 0);
            modelGroup.visible = true;
        }
        
        onViewportResize();
        logConsole(`AR overlay renderer: ${isOverlay ? "ENABLED (Webcam mode)" : "DISABLED (Sidebar mode)"}`);
    }

    // Position 3D mesh model overlay inside transparent Three.js WebGL canvas
    function positionModelInAR(center, scale, angle) {
        if (!camera || !videoFeed.videoWidth || !videoFeed.videoHeight) return;
        
        const vw = videoFeed.videoWidth;
        const vh = videoFeed.videoHeight;
        
        // 1. Transform camera pixels to Normalized Device Coordinates (NDC) [-1, 1]
        // Note: X goes left-to-right, Y goes top-to-bottom (flip Y)
        const ndcX = (center.x / vw) * 2 - 1;
        const ndcY = -(center.y / vh) * 2 + 1;
        
        // 2. Unproject NDC to 3D world coordinates on Z = 0 plane
        const vector = new THREE.Vector3(ndcX, ndcY, 0.5);
        vector.unproject(camera);
        
        const dir = vector.sub(camera.position).normalize();
        const distance = -camera.position.z / dir.z;
        const worldPos = camera.position.clone().add(dir.multiplyScalar(distance));
        
        // Position mesh at matched location coordinates
        modelGroup.position.copy(worldPos);
        
        // 3. Set Scale (Map tracking dimensions to Three.js world size)
        // Adjust baseline multiplier to scale models appropriately
        const baseMultiplier = 3.6; 
        const sx = scale.x * baseMultiplier;
        const sy = scale.y * baseMultiplier;
        const sz = Math.max(sx, sy); // uniform Z thickness
        
        modelGroup.scale.set(sx, sy, sz);
        
        // 4. Set Rotation angle (around Z axis)
        modelGroup.rotation.z = -angle; // invert to match canvas 2D rotation direction
        
        // Give subtle pitch/yaw offsets to enhance 3D perception
        modelGroup.rotation.y = -angle * 0.5;
    }

    // -------------------------------------------------------------
    // Helper Functions
    // -------------------------------------------------------------
    function varColor(cssVarName) {
        return getComputedStyle(document.documentElement).getPropertyValue(cssVarName).trim();
    }
    
    function isValidURL(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;  
        }
    }
    
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

    // Initialize application
    init();
});
