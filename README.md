# Immersive Web AR & Computer Vision Multitasking Scanner

A premium, fully client-side Web Augmented Reality (AR) and Computer Vision application. It features a multitasking scanner that simultaneously cycles and matches image templates (via OpenCV.js), decodes QR codes (via jsQR), and reads text keywords (via Tesseract.js) to display 3D models and interactive web overlays.

---

## 🚀 Key Features

* **Unified Multitasking Scanner**: Point the camera and simultaneously detect custom image targets, QR codes, and text keywords with zero manual toggle buttons.
* **OpenCV Image Tracking with Auto-Cycling & Locking**: 
  - Uses an ORB (Oriented FAST and Rotated BRIEF) feature-matching pipeline running inside a background Web Worker.
  - Automatically cycles through all active targets every 500ms.
  - Locks onto a matching template for stable 3D AR positioning and releases/resumes search when lost.
* **Instant QR Code Execution**: Decodes QR patterns and triggers configured reactions (loading models, displaying custom alerts, launching web links).
* **OCR Keyword Triggering**: Automatically reads text inside the camera viewport and flashes matching keyword tags on the HUD.
* **Admin Control Panel Dashboard**: Manage all text keywords, QR patterns, and custom image templates. Updates sync to the camera client instantly in real-time.
* **Sleek Futuristic HUD**: Fully responsive, fullscreen camera viewport with high-fidelity glassmorphic cards, sci-fi overlays, and neon indicator status pills.

---

## 🛠️ Tech Stack

* **Frontend**: HTML5, Vanilla JavaScript (ES6+), Vanilla CSS variables and layout modules.
* **3D AR Engine**: [Three.js](https://threejs.org/) (transparent canvas rendering, WebGL projection).
* **Computer Vision**: [OpenCV.js](https://docs.opencv.org/3.4/d5/d10/tutorial_js_root.html) running inside Web Workers.
* **QR Decoding**: [jsQR](https://github.com/cozmo/jsQR) (high-speed synchronous scanning).
* **Text Reader (OCR)**: [Tesseract.js](https://tesseract.projectnaptha.com/) (OCR language models).
* **Icons & Styling**: FontAwesome icons, Outfit & JetBrains Mono typography.

---

## 📂 Project Directory Structure

```
web-ar-opencv/
├── index.html       # Player Camera Client Page
├── index.css        # Futuristic Glassmorphic Styles
├── app.js           # Core Engine, Cycles, and Three.js AR Render
├── cv-worker.js     # OpenCV.js Background Thread (Feature Matching)
├── admin.html       # Admin Panel Dashboard HTML
├── admin.js         # Configuration management and target uploads
└── .gitignore       # Git ignores for IDE/OS configuration files
```

---

## 💻 Local Quickstart

### 1. Clone or Download
Download the files into your local directory.

### 2. Start a Local Server
Because Web Workers require an origin and OpenCV needs scripts loaded, run a local web server in the project folder.

**Using Python:**
```bash
python -m http.server 8000
```

**Using Node.js (http-server):**
```bash
npx http-server -p 8000
```

### 3. Open in Browser
* **Player View**: [http://localhost:8000](http://localhost:8000)
* **Admin Control Dashboard**: [http://localhost:8000/admin.html](http://localhost:8000/admin.html)

---

## 🌐 Deploying to GitHub Pages

Since this application is 100% serverless and runs entirely in the browser, you can host it for free on **GitHub Pages**!

1. Create a new public repository on GitHub.
2. Push this project code to the repository (see commands below).
3. On GitHub, go to your repository **Settings** > **Pages**.
4. Under **Build and deployment**, set Source to **Deploy from a branch**.
5. Select the `main` branch and `/ (root)` folder, then click **Save**.
6. Within a few minutes, your site will be live at `https://<your-username>.github.io/<repository-name>/`!

---

## 📝 License
This project is open-source and free to use.
