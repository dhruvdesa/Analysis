const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2');
const { analyzeImage } = require('./ml-model'); // Ensure this import path is correct

const IP_ADDRESS = '192.168.1.226'; // Replace with your correct IP address

// Set up Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads')); // Serve uploaded files
app.use(express.json()); // For handling JSON requests

// MySQL connection using a connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root19',
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
app.post('/upload', upload.single('image'), async (req, res) => {
    const { sampleName } = req.body; // Get sample name from the form

    // Check if file and sampleName are provided
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    if (!sampleName) {
        return res.status(400).send('Sample name is required.');
    }

    try {
        // Analyze the uploaded image using the ML model
        const analysisResults = await analyzeImage(req.file.path); // Correct path

        // Log the analysis results for debugging
        console.log('Analysis Results:', analysisResults);

        // SQL query to insert the sample name and analysis results into the database
        const sql = `INSERT INTO scans (sample_name, image_name, oil, protein, ffa) 
                     VALUES (?, ?, ?, ?, ?)`;

        const values = [
            sampleName, // Insert sample name
            req.file.originalname, // Original file name
            parseFloat(analysisResults.oil) || null,
            parseFloat(analysisResults.protein) || null,
            parseFloat(analysisResults.ffa) || null
        ];

        // Use the connection pool to execute the query
        pool.query(sql, values, (error, results) => {
            if (error) {
                console.error('Database error:', error.message);
                return res.status(500).json({ error: 'Failed to save data to the database.' });
            }
            console.log('Data saved to the database.');

            // Send back the analysis results along with a success message
            res.json({
                message: 'Analysis complete and data saved successfully.',
                results: analysisResults,
                accuracy: calculateAccuracy(analysisResults), // Example accuracy calculation
            });
        });
    } catch (error) {
        console.error('Error during analysis or saving data:', error.message);
        res.status(500).json({ error: 'Failed to analyze the image or save data.' });
    }
});

// Function to calculate accuracy (implement your own logic)
function calculateAccuracy(analysisResults) {
    // Dummy accuracy calculation based on some arbitrary logic
    const accuracy = (100 - Math.abs(analysisResults.ffa)) / 100; // Just an example
    return (accuracy * 100).toFixed(2) + '%'; // Return formatted accuracy
}

// Fetch last 5 samples from the database
app.get('/api/last-samples', (req, res) => {
    const sql = `SELECT sample_name, oil, protein, ffa, upload_date 
                 FROM scans 
                 ORDER BY upload_date DESC 
                 LIMIT 2`;  // Fetch last 5 samples

    pool.query(sql, (error, results) => {
        if (error) {
            console.error('Error fetching last samples:', error.message);
            return res.status(500).json({ error: 'Failed to fetch last samples from the database.' });
        }
        res.json(results); // Send the results as JSON
    });
});

// Fetch enhanced accuracy data
app.get('/api/get-enhanced-accuracy', (req, res) => {
    // Example logic for fetching enhanced accuracy from a stored model or database
    const sql = `SELECT accuracy FROM accuracy_data ORDER BY date DESC LIMIT 1`; // Adjust to your database structure

    pool.query(sql, (error, results) => {
        if (error) {
            console.error('Error fetching accuracy:', error.message);
            return res.status(500).json({ error: 'Failed to fetch accuracy data.' });
        }

        const accuracy = results.length > 0 ? results[0].accuracy : 0;
        res.json({ accuracy });
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Server is running on http://${IP_ADDRESS}:${PORT}`);
});
