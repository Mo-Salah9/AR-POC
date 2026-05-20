// CV-WORKER.JS - Asynchronous Computer Vision Web Worker for Aetheris
let cv = null;
let orb = null;

// Template variables (cached)
let templateMat = null;
let grayTemplate = null;
let kp1 = null;
let desc1 = null;
let templateWidth = 0;
let templateHeight = 0;

// Log helper to send console messages back to main thread
function log(msg, type = 'system') {
    postMessage({ type: 'LOG', text: msg, logType: type });
}

// Configuration options
self.Module = {
    onRuntimeInitialized: function() {
        cv = self.cv;
        orb = new cv.ORB(500, 1.2, 8, 31, 0, 2, 0, 31, 20); // 500 features
        log("OpenCV.js successfully loaded in Web Worker.", "success");
        postMessage({ type: 'CV_READY' });
    }
};

// Load OpenCV.js from a fast CDN
log("Loading OpenCV.js WebAssembly binary...");
importScripts('https://docs.opencv.org/4.5.4/opencv.js');

// Handle incoming messages from main thread
self.onmessage = function(e) {
    if (!cv) {
        log("Worker received message, but OpenCV.js is not yet initialized.", "error");
        return;
    }
    
    const data = e.data;
    
    switch (data.type) {
        case 'SET_TEMPLATE':
            setTemplate(data.imageData, data.name);
            break;
            
        case 'PROCESS_FRAME':
            processFrame(data.imageData, data.threshold);
            break;
            
        default:
            log("Unknown worker message type: " + data.type, "error");
    }
};

// Set and cache the tracking target template
function setTemplate(imgData, name) {
    const startTime = performance.now();
    
    try {
        // Clean up previous template data from WASM memory
        cleanupTemplate();
        
        templateWidth = imgData.width;
        templateHeight = imgData.height;
        
        // Create Mat from image data
        templateMat = cv.matFromImageData(imgData);
        grayTemplate = new cv.Mat();
        cv.cvtColor(templateMat, grayTemplate, cv.COLOR_RGBA2GRAY);
        
        kp1 = new cv.KeyPointVector();
        desc1 = new cv.Mat();
        
        // Compute ORB keypoints & descriptors
        const tempMask = new cv.Mat();
        orb.detectAndCompute(grayTemplate, tempMask, kp1, desc1);
        tempMask.delete();
        
        const duration = (performance.now() - startTime).toFixed(1);
        log(`Cached template '${name}' (${templateWidth}x${templateHeight}) with ${kp1.size()} keypoints in ${duration}ms.`, "success");
        
        postMessage({
            type: 'TEMPLATE_READY',
            keypointsCount: kp1.size()
        });
    } catch (err) {
        log("Error setting template: " + err.message, "error");
        cleanupTemplate();
    }
}

// Process a single live camera frame
function processFrame(imgData, matchThreshold) {
    if (!desc1 || desc1.rows === 0) {
        postMessage({ type: 'FRAME_PROCESSED', detected: false, reason: 'No template cached' });
        return;
    }
    
    const startTime = performance.now();
    let frameMat = null;
    let grayFrame = null;
    let kp2 = null;
    let desc2 = null;
    let matches = null;
    let matcher = null;
    let mask = null;
    let H = null;
    let srcCornersMat = null;
    let dstCornersMat = null;
    
    try {
        // 1. Create Mat from frame imageData
        frameMat = cv.matFromImageData(imgData);
        grayFrame = new cv.Mat();
        cv.cvtColor(frameMat, grayFrame, cv.COLOR_RGBA2GRAY);
        
        // 2. Detect & Compute frame keypoints & descriptors
        kp2 = new cv.KeyPointVector();
        desc2 = new cv.Mat();
        const tempMask = new cv.Mat();
        orb.detectAndCompute(grayFrame, tempMask, kp2, desc2);
        tempMask.delete();
        
        // If frame has no descriptors, exit early
        if (desc2.rows === 0) {
            postMessage({ type: 'FRAME_PROCESSED', detected: false, matchesCount: 0 });
            cleanupFrameMats();
            return;
        }
        
        // 3. Match template descriptors with frame descriptors
        // Brute-force matcher using Hamming distance for binary descriptors (ORB)
        matcher = new cv.BFMatcher(cv.NORM_HAMMING, true); // true = crossCheck enabled
        matches = new cv.DMatchVector();
        matcher.match(desc1, desc2, matches);
        
        const rawMatchesCount = matches.size();
        
        // If not enough raw matches, exit early
        if (rawMatchesCount < matchThreshold) {
            postMessage({ 
                type: 'FRAME_PROCESSED', 
                detected: false, 
                matchesCount: rawMatchesCount,
                inliersCount: 0,
                latency: (performance.now() - startTime).toFixed(1)
            });
            cleanupFrameMats();
            return;
        }
        
        // 4. Filter matches and extract coordinates
        let matchesList = [];
        for (let i = 0; i < rawMatchesCount; i++) {
            let m = matches.get(i);
            matchesList.push({
                queryIdx: m.queryIdx,
                trainIdx: m.trainIdx,
                distance: m.distance
            });
        }
        
        // Sort matches by distance (best match first)
        matchesList.sort((a, b) => a.distance - b.distance);
        
        // Keep top matches (up to 40)
        const topMatches = matchesList.slice(0, 40);
        
        if (topMatches.length < 8) {
            postMessage({ 
                type: 'FRAME_PROCESSED', 
                detected: false, 
                matchesCount: topMatches.length,
                inliersCount: 0,
                latency: (performance.now() - startTime).toFixed(1)
            });
            cleanupFrameMats();
            return;
        }
        
        // Extract 2D coordinates for homography computation
        let srcPoints = [];
        let dstPoints = [];
        for (let i = 0; i < topMatches.length; i++) {
            let p1 = kp1.get(topMatches[i].queryIdx).pt;
            let p2 = kp2.get(topMatches[i].trainIdx).pt;
            srcPoints.push(p1.x, p1.y);
            dstPoints.push(p2.x, p2.y);
        }
        
        // 5. Compute Homography matrix using RANSAC
        let srcMat = cv.matFromArray(srcPoints.length / 2, 1, cv.CV_32FC2, srcPoints);
        let dstMat = cv.matFromArray(dstPoints.length / 2, 1, cv.CV_32FC2, dstPoints);
        mask = new cv.Mat();
        
        H = cv.findHomography(srcMat, dstMat, cv.RANSAC, 5.0, mask);
        
        srcMat.delete();
        dstMat.delete();
        
        // Count inliers
        let inliersCount = 0;
        for (let i = 0; i < mask.rows; i++) {
            if (mask.data[i] === 1) {
                inliersCount++;
            }
        }
        
        // 6. Verify if match is robust enough
        // We require at least 8 inliers, and inliers to represent at least 25% of matches
        const isInlierValid = inliersCount >= 8 && inliersCount >= (topMatches.length * 0.2);
        
        if (isInlierValid && H.rows > 0 && H.cols > 0) {
            // 7. Project template corner points into the camera frame coordinates
            const tw = templateWidth;
            const th = templateHeight;
            const corners = [
                0, 0,
                tw, 0,
                tw, th,
                0, th
            ];
            
            srcCornersMat = cv.matFromArray(4, 1, cv.CV_32FC2, corners);
            dstCornersMat = new cv.Mat();
            cv.perspectiveTransform(srcCornersMat, dstCornersMat, H);
            
            // Extract projected corner points
            const p0 = { x: dstCornersMat.data32F[0], y: dstCornersMat.data32F[1] };
            const p1 = { x: dstCornersMat.data32F[2], y: dstCornersMat.data32F[3] };
            const p2 = { x: dstCornersMat.data32F[4], y: dstCornersMat.data32F[5] };
            const p3 = { x: dstCornersMat.data32F[6], y: dstCornersMat.data32F[7] };
            
            // 8. Calculate 2.5D parameters (Center, Rotation angle, Scale)
            // Center is the centroid of the quadrilateral
            const cx = (p0.x + p1.x + p2.x + p3.x) / 4;
            const cy = (p0.y + p1.y + p2.y + p3.y) / 4;
            
            // Rotation is angle of the top edge (p0 to p1)
            const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
            
            // Scale is computed from top edge length and left edge length relative to template size
            const topEdge = Math.hypot(p1.x - p0.x, p1.y - p0.y);
            const leftEdge = Math.hypot(p3.x - p0.x, p3.y - p0.y);
            
            const scaleX = topEdge / tw;
            const scaleY = leftEdge / th;
            
            // Send tracking coordinates and details back to main thread
            postMessage({
                type: 'FRAME_PROCESSED',
                detected: true,
                matchesCount: rawMatchesCount,
                inliersCount: inliersCount,
                corners: [p0, p1, p2, p3],
                center: { x: cx, y: cy },
                scale: { x: scaleX, y: scaleY },
                angle: angle,
                latency: (performance.now() - startTime).toFixed(1)
            });
        } else {
            postMessage({
                type: 'FRAME_PROCESSED',
                detected: false,
                matchesCount: rawMatchesCount,
                inliersCount: inliersCount,
                latency: (performance.now() - startTime).toFixed(1)
            });
        }
        
    } catch (err) {
        log("Error processing frame: " + err.message, "error");
        postMessage({ type: 'FRAME_PROCESSED', detected: false, error: err.message });
    } finally {
        cleanupFrameMats();
    }
    
    // Helper function to safely release frame-specific WASM memory
    function cleanupFrameMats() {
        if (frameMat) frameMat.delete();
        if (grayFrame) grayFrame.delete();
        if (kp2) kp2.delete();
        if (desc2) desc2.delete();
        if (matches) matches.delete();
        if (matcher) matcher.delete();
        if (mask) mask.delete();
        if (H) H.delete();
        if (srcCornersMat) srcCornersMat.delete();
        if (dstCornersMat) dstCornersMat.delete();
    }
}

// Clean up template cached variables to prevent leaks
function cleanupTemplate() {
    if (templateMat) { templateMat.delete(); templateMat = null; }
    if (grayTemplate) { grayTemplate.delete(); grayTemplate = null; }
    if (kp1) { kp1.delete(); kp1 = null; }
    if (desc1) { desc1.delete(); desc1 = null; }
}
