const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { authenticate, adminOnly } = require('../middleware/auth');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');
const ORIGINALS_DIR = path.join(UPLOADS_DIR, 'originals');
const HLS_DIR = path.join(UPLOADS_DIR, 'hls');

fs.mkdirSync(ORIGINALS_DIR, { recursive: true });
fs.mkdirSync(HLS_DIR, { recursive: true });

const upload = multer({
  dest: ORIGINALS_DIR,
  limits: { fileSize: 10 * 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const types = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
    if (types.includes(file.mimetype) || file.originalname.match(/\.(mp4|webm|mov|avi|mkv)$/i)) {
      cb(null, true);
    } else { cb(new Error('Invalid video format')); }
  }
});

function transcodeToHLS(inputPath, outputDir, filename) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(outputDir, `${filename}.m3u8`);
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-profile:v', 'main',
      '-vf', 'scale=trunc(oh*a/2)*2:720',
      '-c:v', 'libx264',
      '-crf', '23',
      '-c:a', 'aac',
      '-ar', '48000',
      '-b:a', '128k',
      '-hls_time', '6',
      '-hls_list_size', '0',
      '-hls_segment_filename', path.join(outputDir, `${filename}_%03d.ts`),
      '-f', 'hls',
      outputPath
    ]);

    ffmpeg.stderr.on('data', () => {});
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve(`/uploads/hls/${filename}.m3u8`);
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
    ffmpeg.on('error', reject);
  });
}

function uploadRoutes(db) {
  const router = express.Router();

  router.post('/video', authenticate, adminOnly, upload.single('video'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const { content_id, episode_id } = req.body;
      const ext = path.extname(req.file.originalname);
      const baseName = path.basename(req.file.filename, ext);
      const outputDir = path.join(HLS_DIR, baseName);
      fs.mkdirSync(outputDir, { recursive: true });

      const hlsPath = await transcodeToHLS(req.file.path, outputDir, 'index');

      // Get duration via ffprobe
      const { execSync } = require('child_process');
      let duration = 0;
      try {
        const probe = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${req.file.path}"`, { timeout: 10000 });
        duration = Math.round(parseFloat(probe.toString().trim()));
      } catch {}

      // Clean up original
      fs.unlinkSync(req.file.path);

      if (content_id) {
        db.prepare('UPDATE content SET hls_path = ?, duration_seconds = ? WHERE id = ?').run(hlsPath, duration, content_id);
        res.json({ content_id: Number(content_id), hls_path: hlsPath, duration_seconds: duration });
      } else if (episode_id) {
        db.prepare('UPDATE episodes SET hls_path = ?, duration_seconds = ? WHERE id = ?').run(hlsPath, duration, episode_id);
        res.json({ episode_id: Number(episode_id), hls_path: hlsPath, duration_seconds: duration });
      } else {
        res.json({ hls_path: hlsPath, duration_seconds: duration, filename: req.file.originalname });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = uploadRoutes;
