const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2');
const dotenv = require('dotenv');
const { analyzeImage } = require('./ml-model'); // Ensure this import path is correct

dotenv.config(); // Load environment variables

// Set up Express app
const app = express();
const PORT = process.env.PORT || 3000;
const IP_ADDRESS = process.env.IP_ADDRESS || '192.168.1.226'; // Replace with your correct IP address

// Middleware
const corsOptions = {
    origin: ['http://localhost:3000'], // Adjust to allow specific origins
    methods: ['GET', 'POST'],
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads')); // Serve uploaded files

// MySQL connection using a connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'gnoc',
    connectionLimit: 10, // Set the connection limit for the pool
});

// Connect to the database (for debugging)
pool.getConnection((err) => {
    if (err) {
        console.error('Error connecting to the database:', err.message);
    } else {
        console.log('Connected to the MySQL database.');
    }
});

// Ensure the uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir); // Directory to save uploaded files
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); // Use original file name
    },
});

// File filter for validating uploaded files
const fileFilter = (req, file, cb) => {
    const acceptedFileTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (acceptedFileTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPG, PNG, and GIF are allowed.'));
    }
};

const upload = multer({ storage, fileFilter });

// Serve the main HTML page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle image upload
app.post('/upload', (req, res) => {
    upload.single('image')(req, res, async (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ error: `Multer Error: ${err.message}` });
        } else if (err) {
            return res.status(400).json({ error: `File Upload Error: ${err.message}` });
        }

        const { sampleName } = req.body;
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
        if (!sampleName) return res.status(400).json({ error: 'Sample name is required.' });

        try {
            const analysisResults = await analyzeImage(req.file.path);

            if (!analysisResults || Object.keys(analysisResults).length === 0) {
                throw new Error('Analysis returned empty results.');
            }

            const sql = `INSERT INTO scans (sample_name, image_name, oil, protein, ffa, upload_date) 
                         VALUES (?, ?, ?, ?, ?, NOW())`;
            const values = [
                sampleName,
                req.file.filename,
                parseFloat(analysisResults.oil) || null,
                parseFloat(analysisResults.protein) || null,
                parseFloat(analysisResults.ffa) || null,
            ];

            pool.query(sql, values, (dbErr) => {
                if (dbErr) {
                    console.error('Database Error:', dbErr.message);
                    return res.status(500).json({ error: 'Failed to save data to the database.' });
                }

                res.json({
                    message: 'Analysis complete and data saved successfully.',
                    results: analysisResults,
                    accuracy: calculateAccuracy(analysisResults),
                });
            });
        } catch (analysisError) {
            console.error('Analysis Error:', analysisError.message);
            res.status(500).json({ error: `Analysis failed: ${analysisError.message}` });
        }
    });
});

// Function to calculate accuracy (implement your own logic)
function calculateAccuracy(analysisResults, expectedResults = { oil: 10, protein: 50, ffa: 40 }) {
    const totalComponents = 3;
    let accuracySum = 0;

    ['oil', 'protein', 'ffa'].forEach((key) => {
        const diff = Math.abs((analysisResults[key] - expectedResults[key]) / expectedResults[key]);
        accuracySum += 1 - diff;
    });

    return ((accuracySum / totalComponents) * 100).toFixed(2) + '%';
}

// Fetch the last 5 samples
app.get('/last-samples', (req, res) => {
    const sql = `SELECT sample_name, oil, protein, ffa, upload_date 
                 FROM scans 
                 ORDER BY upload_date DESC 
                 LIMIT 2`;

    pool.query(sql, (error, results) => {
        if (error) {
            console.error('Error fetching samples:', error.message);
            return res.status(500).json({ error: 'Failed to fetch last samples.' });
        }
        res.json(results);
    });
});

// Fetch overall enhanced accuracy
app.get('/api/get-enhanced-accuracy', (req, res) => {
    // Placeholder logic for enhanced accuracy (replace with your actual logic)
    res.json({ overallAccuracy: '95.12%' });
});

// Error handler for centralized logging
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://${IP_ADDRESS}:${PORT}`);
});
