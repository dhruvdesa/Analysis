const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2');
const { analyzeImage } = require('./ml-model'); 

// const IP_ADDRESS = '192.168.1.226';
const IP_ADDRESS = '192.168.42.57';
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads')); 
app.use(express.json());

// MySQL connection using a connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root19',
    database: process.env.DB_NAME || 'gnoc',
    connectionLimit: 10,
});

// Ensure the uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, file.originalname),
});

const fileFilter = (req, file, cb) => {
    const acceptedFileTypes = ['image/jpeg', 'image/png', 'image/gif'];
    acceptedFileTypes.includes(file.mimetype) ? cb(null, true) : cb(new Error('Invalid file type.'));
};

const upload = multer({ storage, fileFilter });

// Serve the main HTML page
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Handle image upload and analysis
app.post('/api/upload', upload.single('image'), async (req, res) => {
    if (!req.file || !req.body.sampleName) {
        return res.status(400).send('Missing file or sample name.');
    }

    try {
        const analysisResults = await analyzeImage(req.file.path);

        const sql = `INSERT INTO scans (sample_name, image_name, oil, protein, ffa) 
                     VALUES (?, ?, ?, ?, ?)`;

        const values = [
            req.body.sampleName,
            req.file.originalname,
            parseFloat(analysisResults.oil) || null,
            parseFloat(analysisResults.protein) || null,
            parseFloat(analysisResults.ffa) || null
        ];

        pool.query(sql, values, (error) => {
            if (error) {
                console.error('Database error:', error.message);
                return res.status(500).json({ error: 'Failed to save data.' });
            }

            res.json({
                message: 'Analysis complete and data saved successfully.',
                results: analysisResults,
            });
        });
    } catch (error) {
        console.error('Error during analysis or saving data:', error.message);
        res.status(500).json({ error: 'Failed to analyze the image.' });
    }
});

// Fetch last 2 samples from the database
app.get('/api/last-samples', (req, res) => {
    const sql = `SELECT sample_name, oil, protein, ffa, upload_date 
                 FROM scans 
                 ORDER BY upload_date DESC 
                 LIMIT 2`;

    pool.query(sql, (error, results) => {
        if (error) {
            console.error('Error fetching last samples:', error.message);
            return res.status(500).json({ error: 'Failed to fetch samples.' });
        }
        res.json(results);
    });
});

// Start the server
app.listen(PORT, IP_ADDRESS, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Server is running on http://${IP_ADDRESS}:${PORT}`);
});
