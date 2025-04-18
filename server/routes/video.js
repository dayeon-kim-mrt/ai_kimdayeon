const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process'); // Using spawn for better stream handling if needed later
const path = require('path');
const fs = require('fs'); // For checking file existence before download

const router = express.Router();

// --- Multer Configuration ---
// Define storage strategy (saving to disk in 'uploads/' folder)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../uploads');
    // Ensure the directory exists
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Use original filename + timestamp to avoid conflicts (or use a UUID library)
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Filter for MP4 files
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'video/mp4') {
    cb(null, true);
  } else {
    cb(new Error('Only .mp4 files are allowed!'), false);
  }
};

const upload = multer({ storage: storage, fileFilter: fileFilter });

// --- Directory Paths ---
const UPLOADS_DIR = path.join(__dirname, '../uploads');
const PROCESSING_DIR = path.join(__dirname, '../processing');
const OUTPUT_DIR = path.join(__dirname, '../output');

// Ensure processing and output directories exist
fs.mkdirSync(PROCESSING_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });


// --- Helper function to run external scripts ---
async function runScript(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    // Ensure options includes cwd if provided
    const defaultOptions = { cwd: undefined, env: process.env };
    const spawnOptions = { ...defaultOptions, ...options, stdio: 'pipe' };

    console.log(`Executing: ${command} ${args.join(' ')} ${spawnOptions.cwd ? `in ${spawnOptions.cwd}` : ''}`);

    const childProcess = spawn(command, args, spawnOptions);

    let stdout = '';
    let stderr = '';

    childProcess.stdout.on('data', (data) => {
      console.log(`[${command} stdout]: ${data}`);
      stdout += data.toString();
    });

    childProcess.stderr.on('data', (data) => {
      console.error(`[${command} stderr]: ${data}`);
      stderr += data.toString();
    });

    childProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`${command} process exited successfully.`);
        resolve({ code, stdout, stderr });
      } else {
        console.error(`${command} process exited with code ${code}`);
        reject(new Error(`${command} failed with code ${code}. Args: [${args.join(', ')}]. CWD: ${spawnOptions.cwd}. Stderr: ${stderr || 'N/A'}. Stdout: ${stdout || 'N/A'}`));
      }
    });

    childProcess.on('error', (err) => {
      console.error(`Failed to start ${command} process:`, err);
      reject(err);
    });
  });
}


// --- API Endpoints ---

// POST /api/video/process-video
// Handles video upload, SRT generation, and subtitling
router.post('/process-video', upload.single('video'), async (req, res) => {
  console.log('Received file:', req.file); // Log uploaded file info

  if (!req.file) {
    return res.status(400).json({ message: 'No video file uploaded or invalid file type.' });
  }

  const originalVideoPath = req.file.path;
  const originalFilename = req.file.originalname;
  const baseFilename = path.basename(originalFilename, path.extname(originalFilename));
  const uniqueInputFilename = path.basename(req.file.filename, path.extname(req.file.filename));
  const srtFilename = `${uniqueInputFilename}.srt`;
  const srtOutputPath = path.join(PROCESSING_DIR, srtFilename);
  const finalVideoFilename = `${uniqueInputFilename}_subtitled.mp4`;
  const finalVideoPath = path.join(OUTPUT_DIR, finalVideoFilename);

  // Define the working directory for poetry commands (relative to WORKDIR /usr/src/app)
  // const poetryCwd = path.join(__dirname, '../../video-automator'); // Path to video-automator from server/routes
  const containerPoetryCwd = 'video-automator'; // Use relative path inside container for commands

  try {
    // Step 1: Run transcriber using poetry run
    console.log(`Starting SRT generation for: ${originalVideoPath}`);
    await runScript('poetry', [
        'run',
        'transcriber',
        '--source-file', originalVideoPath, // Provide absolute path inside container
        '--output-file', srtOutputPath     // Provide absolute path inside container
        // Add other arguments like --model, --filter-filler if needed based on README
    ], { cwd: containerPoetryCwd }); // Specify CWD for poetry
    console.log(`SRT file generation command finished. Checking for: ${srtOutputPath}`);

    if (!fs.existsSync(srtOutputPath)) {
        throw new Error(`SRT file generation failed: ${srtOutputPath} not found after script execution.`);
    }
    console.log(`SRT file found at: ${srtOutputPath}`);

    // Step 2: Run subtitle-burner using poetry run
    console.log(`Starting subtitle burning: Input: ${originalVideoPath}, SRT: ${srtOutputPath}, Output: ${finalVideoPath}`);
    await runScript('poetry', [
        'run',
        'subtitle-burner',
        '--video-file', originalVideoPath,    // Absolute path inside container
        '--subtitle-file', srtOutputPath,   // Absolute path inside container
        '--output-file', finalVideoPath     // Absolute path inside container
        // Add other arguments like --preset, --font-size if needed
    ], { cwd: containerPoetryCwd }); // Specify CWD for poetry
    console.log(`Subtitle burning command finished. Checking for: ${finalVideoPath}`);

    if (!fs.existsSync(finalVideoPath)) {
       throw new Error(`Subtitle burning failed: ${finalVideoPath} not found after script execution.`);
    }
    console.log(`Final video found at: ${finalVideoPath}`);

    // Clean up original uploaded file and SRT file
    fs.unlinkSync(originalVideoPath);
    fs.unlinkSync(srtOutputPath);

    console.log('Video processing successful');
    res.json({ message: 'Video processed successfully', processedFilename: finalVideoFilename });

  } catch (error) {
    console.error('Error processing video:', error);
    // Clean up potentially created files on error
    try { if (fs.existsSync(originalVideoPath)) fs.unlinkSync(originalVideoPath); } catch (e) { console.error(`Cleanup Error: Failed to delete original file: ${originalVideoPath}`, e); }
    try { if (fs.existsSync(srtOutputPath)) fs.unlinkSync(srtOutputPath); } catch (e) { console.error(`Cleanup Error: Failed to delete SRT file: ${srtOutputPath}`, e); }
    try { if (fs.existsSync(finalVideoPath)) fs.unlinkSync(finalVideoPath); } catch (e) { console.error(`Cleanup Error: Failed to delete final video file: ${finalVideoPath}`, e); }

    // Send only the error message part to the frontend
    const errorMessage = (error instanceof Error) ? error.message : String(error);
    res.status(500).json({ message: 'Error processing video', error: errorMessage });
  }
});

// GET /api/video/download-video/:filename
// Allows downloading the processed video
router.get('/download-video/:filename', (req, res) => {
  const filename = req.params.filename;
  // Basic security check: prevent directory traversal
  if (filename.includes('..') || filename.includes('/')) {
    return res.status(400).send('Invalid filename.');
  }
  const filePath = path.join(OUTPUT_DIR, filename);

  console.log(`Download requested for: ${filePath}`);

  // Check if file exists before attempting download
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error('File not found for download:', filePath);
      return res.status(404).send('File not found.');
    }

    // Send the file for download
    res.download(filePath, filename, (err) => {
      if (err) {
        // Handle errors that occur during streaming the file
        console.error('Error downloading file:', err);
        // Avoid sending another response if headers were already sent
        if (!res.headersSent) {
            res.status(500).send('Could not download the file.');
        }
      } else {
        console.log('File downloaded successfully:', filename);
        // Optional: Clean up the file after download? Decide based on requirements.
        // fs.unlinkSync(filePath);
      }
    });
  });
});

module.exports = router; 