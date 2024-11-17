// Global variable to hold the chart instance
let analysisChart; 
// Variable to hold the interval for fetching accuracy metrics
let accuracyInterval;
let previousAccuracy = 0; // Track previous accuracy to detect improvements 

const accuracyPercentage = document.getElementById('accuracy-percentage');
const accuracyBar = document.getElementById('accuracy-bar');

// Function to update accuracy meter dynamically with Overall Enhanced Accuracy
function updateAccuracyMeter(accuracy) {
    // Check if accuracy is a valid number before updating
    if (typeof accuracy === 'number' && !isNaN(accuracy) && accuracy >= 0 && accuracy <= 100) {
        // Only update if the accuracy is higher than the previous value
        if (accuracy > previousAccuracy) {
            accuracyPercentage.textContent = `${accuracy.toFixed(2)}%`;
            accuracyBar.value = accuracy; 
            previousAccuracy = accuracy; // Update previous accuracy value
        }
    } else {
        console.error('Invalid accuracy value:', accuracy, typeof accuracy); 
        accuracyPercentage.textContent = '0%'; 
        accuracyBar.value = 0; 
        
        throw new Error(`Invalid accuracy value: ${accuracy}`);
    }
}

// Function to show initial accuracy when the page loads
function displayInitialAccuracy() {
    updateAccuracyMeter(previousAccuracy);
}

document.addEventListener('DOMContentLoaded', displayInitialAccuracy);

// Function to preview the image
function previewImage(file) {
    if (!(file instanceof File)) {
        console.error('Invalid file type for previewing:', file);
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const imgElement = document.getElementById('imagePreview');
        if (imgElement) { // Check if the image element exists
            imgElement.src = e.target.result;
            imgElement.style.display = 'block'; // Show the image element
        } else {
            console.error('Image preview element not found');
        }
    };

    reader.readAsDataURL(file); // Read the file only if it's valid
}

// Example function to fetch Overall Enhanced Accuracy from backend
async function fetchOverallEnhancedAccuracy() {
    try {
        const response = await fetch('/api/get-enhanced-accuracy'); // Endpoint to fetch accuracy
        const data = await response.json();
        if (data && data.accuracy) {
            updateAccuracyMeter(data.accuracy);
        } else {
            console.error('Accuracy data not found in response');
        }
    } catch (error) {
        console.error('Error fetching enhanced accuracy:', error);
    }
}

// Fetch accuracy on page load
document.addEventListener('DOMContentLoaded', fetchOverallEnhancedAccuracy);

// Function to upload the image
async function uploadImage() {
    const fileInput = document.getElementById('fileInput');
    const cameraInput = document.getElementById('cameraInput');
    const sampleName = document.getElementById('sampleName').value.trim(); // Get the sample name and trim whitespace
    const uploadButton = document.getElementById('uploadButton'); // Define the button correctly

    let file = null;

    // Check if a file was selected from file input
    if (fileInput.files.length > 0) {
        file = fileInput.files[0];
    } 
    // If not, check if a file was captured from the camera input
    else if (cameraInput.files.length > 0) {
        file = cameraInput.files[0];
    }

    // Ensure the file is of the correct type before proceeding
    const acceptedFileTypes = ['image/jpeg', 'image/png', 'image/gif']; // Acceptable image types
    if (file instanceof File && acceptedFileTypes.includes(file.type) && sampleName) {
        const formData = new FormData();
        formData.append('image', file); // Append the image file to the form data
        formData.append('sampleName', sampleName); // Append the sample name

        try {
            // Show loading spinner and disable button while uploading
            document.getElementById('loadingSpinner').style.display = 'block';
            uploadButton.disabled = true; // Disable button only if it exists

            // Load the selected/captured image for preview
            previewImage(file); // Call preview image function

            // Send the image file and sample name to the server
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const analysisResults = await response.json();
                console.log('Analysis Results:', analysisResults.results); // Log the results for debugging

                // Check if results structure is valid
                if (analysisResults.results) {
                    // Update the analysis results in the HTML
                    updateAnalysisResults(analysisResults.results); // Make sure results have correct structure

                    // Render the chart with the sample name
                    renderChart(analysisResults.results, sampleName);

                    // Update accuracy meter once after showing the report
                    const accuracy = parseFloat(analysisResults.accuracy);
                    updateAccuracyMeter(accuracy); // Update accuracy meter directly

                    // No need to start accuracy update interval
                } else {
                    alert('Invalid results structure in the response.');
                }
            } else {
                const errorData = await response.json();
                alert(`Error: ${errorData.error || 'Error uploading image. Please try again.'}`);
            }
        } catch (error) {
            console.error('Error occurred:', error); // Log error for debugging
            alert('An error occurred: ' + error.message);
        } finally {
            // Hide loading spinner and enable button after upload
            document.getElementById('loadingSpinner').style.display = 'none';
            uploadButton.disabled = false; // Enable button only if it exists
        }
    } else {
        alert("Please choose a valid image file (JPG, PNG, GIF) and enter a sample name.");
    }
}

// Function to update the analysis results in the HTML
function updateAnalysisResults(results) {
    const resultElements = {
        oil: document.getElementById('oil'),
        protein: document.getElementById('protein'),
        ffa: document.getElementById('ffa')
    };
    Object.keys(resultElements).forEach(key => {
        resultElements[key].textContent = formatResult(results[key]);
    });
}

// Function to safely format results with percentage sign
function formatResult(value) {
    if (typeof value === 'number' && value) {
        return `${value.toFixed(2)}%`;
    } else if (typeof value === 'string' && value.includes('%')) {
        return value; // Return the string value directly if it already contains a percentage sign
    }
}

// Function to render the chart with analysis data
function renderChart(results, sampleName) {
    const ctx = document.getElementById('analysisChart').getContext('2d');

    // Destroy the previous chart instance if it exists to avoid duplication
    if (analysisChart) {
        analysisChart.destroy();
    }

    // Create the chart
    analysisChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Oil', 'Protein', 'FFA'],
            datasets: [{
                label: 'Analysis Results',
                data: [
                    parseFloat(results.oil),
                    parseFloat(results.protein), 
                    parseFloat(results.ffa),
                ],
                backgroundColor: [
                    'rgba(255, 99, 132, 0.2)', 
                    'rgba(54, 162, 235, 0.2)',  
                    'rgba(255, 206, 86, 0.2)' 
                ],
                borderColor: [
                    'rgba(255, 99, 132, 1)',
                    'rgba(54, 162, 235, 1)',
                    'rgba(255, 206, 86, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            plugins: {
                title: {
                    display: true,
                    text: `Analysis Results for ${sampleName}`
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: false,
                    }
                },
                x: {
                    title: {
                        display: false,
                    }
                }
            }
        }
    });
}

// Fetch last 5 samples
async function fetchLastSamples() {
    try {
        const response = await fetch('/last-samples');
        const samples = await response.json();

        const sampleContainer = document.getElementById('sampleContainer');
        sampleContainer.innerHTML = '';

        samples.forEach(sample => {
            const sampleElement = document.createElement('div');
            sampleElement.classList.add('sample');
            sampleElement.innerHTML = `
                <p><strong>Sample Name:</strong> ${sample.sample_name}</p>
                <p><strong>Oil:</strong> ${sample.oil}</p>
                <p><strong>Protein:</strong> ${sample.protein}</p>
                <p><strong>FFA:</strong> ${sample.ffa}</p>
                <p><strong>Date:</strong> ${new Date(sample.upload_date).toLocaleDateString()}</p>
            `;
            sampleContainer.appendChild(sampleElement);
        });
    } catch (error) {
        displayErrorMessage('Error fetching last samples: ' + error.message);
    }
}

// Initialize functions on page load
document.addEventListener('DOMContentLoaded', () => {
    fetchLastSamples();
    updateAccuracyMeter(previousAccuracy);
});

// Stop accuracy updates if needed
function stopAccuracyUpdate() {
    if (accuracyInterval) {
        clearInterval(accuracyInterval);
        accuracyInterval = null;
    }
}
