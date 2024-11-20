const fs = require('fs');
const mysql = require('mysql2/promise');
const { normalizeData, detectOutliers, advancedRecalibration } = require('./enhancedAccuracyUtils'); // Utility functions

let model; // ML model
const calibrationData = []; // Store historical calibration data

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root19',
    database: process.env.DB_NAME || 'gnoc',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Initialize the database connection pool
const pool = mysql.createPool(dbConfig);

// Load or train the model
async function loadOrTrainModel() {
    try {
        if (fs.existsSync('model.json')) {
            model = JSON.parse(fs.readFileSync('model.json', 'utf8'));
            console.log('Loaded existing model.');
        } else {
            model = await trainModel();
            fs.writeFileSync('model.json', JSON.stringify(model));
            console.log('Trained and saved new model.');
        }
    } catch (error) {
        console.error('Error loading or training model:', error.message);
        throw new Error('Failed to load or train model');
    }
}

// Analyze an image for chemical composition
async function performChemicalAnalysis(imagePath) {
    const oil = calculateOilContent();
    const protein = calculateProteinContent();
    const ffa = calculateFFAContent();

    validateAnalysisResults(oil, protein, ffa);

    return {
        oil: oil,
        protein: protein,
        ffa: ffa
    };
}

// Simulated calculation functions
function calculateOilContent() { return (Math.random() * (10 - 8) + 8).toFixed(2); }
function calculateProteinContent() { return (Math.random() * (60 - 40) + 40).toFixed(2); }
function calculateFFAContent() { return (Math.random() * 50).toFixed(2); }

// Validate analysis results
function validateAnalysisResults(oil, protein, ffa) {
    const maxOilGhani = 12, maxProtein = 60, maxFFA = 50;
    if (parseFloat(oil) > maxOilGhani) throw new Error('Oil content exceeds maximum allowed limit.');
    if (parseFloat(protein) > maxProtein) throw new Error('Protein content exceeds maximum allowed limit.');
    if (parseFloat(ffa) > maxFFA) throw new Error('FFA content exceeds maximum allowed limit.');
}

// Main function to analyze an image
async function analyzeImage(imagePath) {
    try {
        validateImage(imagePath);
        checkImageQuality(imagePath); // New quality check
        await loadOrTrainModel();
        
        const analysisResults = await performChemicalAnalysis(imagePath);
        
        // Log analysis results for debugging
        console.log("Initial Analysis Results:", analysisResults);
        
        await checkAndAutoCalibrate();
        
        // Return the results so they can be accessed by the calling code
        return analysisResults;
    } catch (error) {
        console.error('Error analyzing image:', error.message);
        throw new Error('Error during image analysis: ' + error.message);
    } 
}

// Image validation
function validateImage(imagePath) {
    if (!fs.existsSync(imagePath)) {
        throw new Error('Image file does not exist.');
    }
}

// New function to check image quality (Placeholder)
function checkImageQuality(imagePath) {
    // Placeholder for image quality check
    console.log('Checking image quality for optimal analysis.');
    // If quality issues are found, throw an error or log warnings
}

// Fetch data from the database
async function fetchReportAndScanData() {
    try {
        const [manualData] = await pool.query('SELECT sample_id, oil, protein, ffa FROM manual_reports');
        const [scanData] = await pool.query('SELECT sample_name, oil, protein, ffa FROM scans');
        return { manualData, scanData };
    } catch (error) {
        console.error('Error fetching data:', error);
        throw error;
    }
}

// Calculate enhanced accuracy
function calculateEnhancedAccuracy(manualData, scanData) {
    let totalAccuracy = 0, matchedCount = 0;
    const normalizedManualData = detectOutliers(normalizeData(manualData));
    const normalizedScanData = detectOutliers(normalizeData(scanData));

    normalizedManualData.forEach(manualEntry => {
        const scanEntry = normalizedScanData.find(scan => scan.id === manualEntry.id);
        if (scanEntry) {
            const oilAccuracy = 100 - Math.abs((manualEntry.oil - scanEntry.oil) / manualEntry.oil * 100);
            const proteinAccuracy = 100 - Math.abs((manualEntry.protein - scanEntry.protein) / manualEntry.protein * 100);
            const ffaAccuracy = 100 - Math.abs((manualEntry.ffa - scanEntry.ffa) / manualEntry.ffa * 100);

            const entryAccuracy = (0.4 * oilAccuracy + 0.3 * proteinAccuracy + 0.3 * ffaAccuracy);
            totalAccuracy += entryAccuracy;
            matchedCount++;
        }
    });

    return matchedCount > 0 ? (totalAccuracy / matchedCount) : 0;
}

// Auto-calibration if accuracy is below threshold
const MIN_OVERALL_ACCURACY = 95;

async function checkAndAutoCalibrate() {
    try {
        const { manualData, scanData } = await fetchReportAndScanData();
        const overallAccuracy = calculateEnhancedAccuracy(manualData, scanData);

        console.log(`Overall Enhanced Accuracy: ${overallAccuracy}%`);

        if (overallAccuracy < MIN_OVERALL_ACCURACY) {
            console.log('Accuracy below threshold. Starting advanced auto-calibration.');
            await advancedAutoCalibrateModel();
        } else {
            console.log('Accuracy is within acceptable range.');
        }
    } catch (error) {
        console.error('Error in checkAndAutoCalibrate:', error);
    }
}

// Advanced auto-calibration function
async function advancedAutoCalibrateModel() {
    const { manualData, scanData } = await fetchReportAndScanData();
    const errors = manualData.map(manualEntry => {
        const scanEntry = scanData.find(scan => scan.id === manualEntry.id);
        return scanEntry ? {
            oilError: manualEntry.oil - scanEntry.oil,
            proteinError: manualEntry.protein - scanEntry.protein,
            ffaError: manualEntry.ffa - scanEntry.ffa
        } : null;
    }).filter(Boolean);

    model.coefficients = advancedRecalibration(errors);
    await saveModel(model);
    logCalibrationData(errors, model.coefficients);
}

// Save model to a file
async function saveModel(model) {
    fs.writeFileSync('model.json', JSON.stringify(model, null, 2));
    console.log('Model saved.');
}

// Log calibration data
function logCalibrationData(errors, adjustedCoefficients) {
    const calibrationEntry = { timestamp: new Date(), errors, adjustedCoefficients };
    calibrationData.push(calibrationEntry);
    saveCalibrationData();
}

// Save calibration data to file
function saveCalibrationData() {
    fs.writeFileSync('calibrationData.json', JSON.stringify(calibrationData, null, 2));
    console.log('Calibration data saved.');
}

// Load calibration data at startup
function loadCalibrationData() {
    if (fs.existsSync('calibrationData.json')) {
        const data = fs.readFileSync('calibrationData.json', 'utf8');
        calibrationData.push(...JSON.parse(data));
        console.log('Loaded existing calibration data.');
    }
}

// Train model (replace with actual logic)
async function trainModel() {
    return { coefficients: [0.12, 0.22, 0.35, 0.41], timestamp: new Date() };
}

// Initialize by loading calibration data
loadCalibrationData();

// Export analyzeImage for external use
module.exports = { analyzeImage };
