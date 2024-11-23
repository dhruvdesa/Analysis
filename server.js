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
// Update the IP_ADDRESS default to a safer option (localhost)
const IP_ADDRESS = process.env.IP_ADDRESS || '127.0.0.1';

// Use dynamic allowed origins in CORS
const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'],
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

// Error handling for invalid file type
const fileFilter = (req, file, cb) => {
    const acceptedFileTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (acceptedFileTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        const error = new Error('Invalid file type. Only JPG, PNG, and GIF are allowed.');
        error.status = 400;
        cb(error);
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

// Adjust the SQL query in `/last-samples` for clarity
app.get('/last-samples', (req, res) => {
    const sql = `SELECT sample_name, oil, protein, ffa, upload_date 
                 FROM scans 
                 ORDER BY upload_date DESC 
                 LIMIT 2`; // Change limit from 2 to 5
    pool.query(sql, (error, results) => {
        if (error) {
            console.error('Error fetching samples:', error.message);
            return res.status(500).json({ error: 'Failed to fetch last samples.' });
        }
        res.json(results);
    });
});

// Use actual logic for enhanced accuracy in `/api/get-enhanced-accuracy`
app.get('/api/get-enhanced-accuracy', async (req, res) => {
    try {
        const [results] = await pool.promise().query('SELECT AVG(oil) as avgOil, AVG(protein) as avgProtein, AVG(ffa) as avgFFA FROM scans');
        const enhancedAccuracy = calculateEnhancedAccuracy(results[0]);
        res.json({ overallAccuracy: `${enhancedAccuracy.toFixed(2)}%` });
    } catch (error) {
        console.error('Error calculating enhanced accuracy:', error.message);
        res.status(500).json({ error: 'Failed to calculate enhanced accuracy.' });
    }
});

// Improved error handling in global middleware
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(err.status || 500).json({ error: err.message, stack: process.env.NODE_ENV === 'development' ? err.stack : undefined });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://${IP_ADDRESS}:${PORT}`);
});
