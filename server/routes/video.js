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
  const containerPoetryCwd = 'video_processing_scripts'; // Use the new folder name

  try {
    // Step 1: Run transcriber using poetry run
    console.log(`Starting SRT generation for: ${originalVideoPath}`);
    await runScript('poetry', [
        'run',
        'transcriber',
        '--source-file', originalVideoPath, // Provide absolute path inside container
        '--output-file', srtOutputPath     // Provide absolute path inside container
        // Add other arguments like --model, --filter-filler if needed based on README
    ], { cwd: containerPoetryCwd }); // Use updated cwd
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
    ], { cwd: containerPoetryCwd }); // Use updated cwd
    console.log(`Subtitle burning command finished. Checking for: ${finalVideoPath}`);

    if (!fs.existsSync(finalVideoPath)) {
       throw new Error(`Subtitle burning failed: ${finalVideoPath} not found after script execution.`);
    }
    console.log(`Final video found at: ${finalVideoPath}`);

    // Clean up original uploaded file (optional, do it after success)
    fs.unlinkSync(originalVideoPath);
    // --- Keep the SRT file for potential Wiki creation ---
    // fs.unlinkSync(srtOutputPath); // <-- Comment out or remove this line

    console.log('Video processing successful');
    // --- Return both video and SRT filenames ---
    res.json({
      message: 'Video processed successfully',
      processedFilename: finalVideoFilename,
      srtFilename: srtFilename // <-- Add srtFilename here
    });

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

// POST /api/video/upload-to-drive
// Handles uploading the processed video file to Google Drive
router.post('/upload-to-drive', async (req, res) => {
  const { processedFilename } = req.body; // Get filename from request body

  if (!processedFilename) {
    return res.status(400).json({ message: 'Processed filename is required.' });
  }

  // Basic security check
  if (processedFilename.includes('..') || processedFilename.includes('/')) {
    return res.status(400).send('Invalid filename.');
  }

  const finalVideoPath = path.join(OUTPUT_DIR, processedFilename);
  const containerPoetryCwd = 'video_processing_scripts'; // Use the new folder name

  // --- Specify the target Google Shared Drive and folder ---
  const targetSharedDrive = 'MY REALTRIP'; // Correct Shared Drive name
  const targetDriveFolder = 'AI Lab';      // Correct folder name

  console.log(`Upload to Shared Drive requested for: ${finalVideoPath} to Shared Drive: "${targetSharedDrive}", Folder: "${targetDriveFolder}"`);

  try {
    // Check if the file actually exists before trying to upload
    if (!fs.existsSync(finalVideoPath)) {
      console.error(`File not found for Drive upload: ${finalVideoPath}`);
      return res.status(404).json({ message: 'Processed video file not found.' });
    }

    // Step 3: Run drive-uploader using poetry run
    console.log(`Starting Google Drive upload for: ${finalVideoPath}`);
    const uploadArgs = [
        'run',
        'drive-uploader',
        'upload',
        '--file', finalVideoPath, // Absolute path inside container
        '--credentials', '/usr/src/app/credentials.json', // Path to credentials
        '--token', '/usr/src/app/token.pickle'           // Path to token file
    ];

    // Add shared drive option if defined
    if (targetSharedDrive) {
        uploadArgs.push('--shared-drive', targetSharedDrive);
    }
    // Add folder option if defined (for within the shared drive)
    if (targetDriveFolder) {
        uploadArgs.push('--folder', targetDriveFolder); // Add the --folder option
    }

    const uploadResult = await runScript('poetry', uploadArgs, { cwd: containerPoetryCwd }); // Use updated cwd

    console.log('Google Drive upload command finished.');
    console.log('Drive uploader stdout:', uploadResult.stdout);

    // Try to parse the Drive link from stdout (adjust based on actual script output)
    const driveLinkMatch = uploadResult.stdout.match(/https?:\/\/drive\.google\.com\/file\/d\/[^\s]+/);
    const driveLink = driveLinkMatch ? driveLinkMatch[0] : 'Upload successful (Link not found in output)';

    res.json({ message: 'Successfully uploaded to Google Drive.', driveLink: driveLink });

  } catch (error) {
    console.error('Error uploading to Google Drive:', error);
    const errorMessage = (error instanceof Error) ? error.message : String(error);
    res.status(500).json({ message: 'Error uploading to Google Drive', error: errorMessage });
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

// GET /api/video/srt-content?filename=...
// Returns the content of a generated SRT file
router.get('/srt-content', (req, res) => {
  const srtFilename = req.query.filename;

  if (!srtFilename || typeof srtFilename !== 'string') {
    return res.status(400).json({ message: 'SRT filename query parameter is required.' });
  }

  // Basic security check: prevent directory traversal and ensure it's an SRT file
  if (srtFilename.includes('..') || srtFilename.includes('/') || !srtFilename.endsWith('.srt')) {
    return res.status(400).send('Invalid or potentially unsafe filename.');
  }

  const srtFilePath = path.join(PROCESSING_DIR, srtFilename);
  console.log(`SRT content requested for: ${srtFilePath}`);

  // Check if file exists and read content
  fs.readFile(srtFilePath, 'utf8', (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        console.error(`SRT file not found: ${srtFilePath}`);
        return res.status(404).json({ message: 'SRT file not found.' });
      } else {
        console.error(`Error reading SRT file: ${srtFilePath}`, err);
        return res.status(500).json({ message: 'Error reading SRT file.' });
      }
    }
    // Send content as plain text
    res.setHeader('Content-Type', 'text/plain');
    res.send(data);
  });
});

module.exports = router; 