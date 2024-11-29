// Global variables
let analysisChart; // To hold the Chart.js instance
let accuracyInterval; // Interval for fetching accuracy updates
let previousAccuracy = 0; // Track previous accuracy for improvements

// DOM elements
const accuracyPercentage = document.getElementById('accuracy-percentage');
const accuracyBar = document.getElementById('accuracy-bar');
const fileInput = document.getElementById('fileInput');
const cameraInput = document.getElementById('cameraInput');
const sampleNameInput = document.getElementById('sampleName');
const uploadButton = document.getElementById('uploadButton');
const loadingSpinner = document.getElementById('loadingSpinner');

// Helper function: Update accuracy meter
function updateAccuracyMeter(accuracy) {
    if (typeof accuracy === 'number' && accuracy >= 0 && accuracy <= 100) {
        if (accuracy > previousAccuracy) {
            accuracyPercentage.textContent = `${accuracy.toFixed(2)}%`;
            accuracyBar.value = accuracy;
            previousAccuracy = accuracy;
        }
    } else {
        console.error('Invalid accuracy value:', accuracy);
        accuracyPercentage.textContent = '0%';
        accuracyBar.value = 0;
    }
}

// Function: Preview selected image
function previewImage(file) {
    if (file instanceof File) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const imgElement = document.getElementById('imagePreview');
            if (imgElement) {
                imgElement.src = e.target.result;
                imgElement.style.display = 'block';
            }
        };
        reader.readAsDataURL(file);
    }
}

// Function: Upload image and analyze
async function uploadImage() {
    let file = fileInput.files[0] || cameraInput.files[0];
    const sampleName = sampleNameInput.value.trim();

    if (!file || !sampleName) {
        alert('Please select a valid image and enter a sample name.');
        return;
    }

    const acceptedFileTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (!acceptedFileTypes.includes(file.type)) {
        alert('Invalid file type. Please upload a JPG, PNG, or GIF image.');
        return;
    }

    const formData = new FormData();
    formData.append('image', file);
    formData.append('sampleName', sampleName);

    try {
        loadingSpinner.style.display = 'block';
        uploadButton.disabled = true;

        previewImage(file);

        const response = await fetch('/upload', {
            method: 'POST',
            body: formData,
        });

        if (response.ok) {
            const analysisResults = await response.json();
            updateAnalysisResults(analysisResults.results);
            renderChart(analysisResults.results, sampleName);
            updateAccuracyMeter(parseFloat(analysisResults.accuracy));
        } else {
            const errorData = await response.json();
            alert(`Error: ${errorData.error || 'Image upload failed.'}`);
        }
    } catch (error) {
        console.error('Error uploading image:', error.message);
        alert('An error occurred while uploading the image.');
    } finally {
        loadingSpinner.style.display = 'none';
        uploadButton.disabled = false;
    }
}

// Function: Update analysis results in the UI
function updateAnalysisResults(results) {
    const resultElements = {
        oil: document.getElementById('oil'),
        protein: document.getElementById('protein'),
        ffa: document.getElementById('ffa'),
    };

    for (const key in resultElements) {
        if (results[key]) {
            resultElements[key].textContent = `${parseFloat(results[key]).toFixed(2)}%`;
        }
    }
}

// Function: Render chart with analysis data
function renderChart(results, sampleName) {
    const ctx = document.getElementById('analysisChart').getContext('2d');

    if (analysisChart) analysisChart.destroy();

    analysisChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Oil', 'Protein', 'FFA'],
            datasets: [
                {
                    label: 'Analysis Results',
                    data: [results.oil, results.protein, results.ffa],
                    backgroundColor: ['rgba(255, 99, 132, 0.2)', 'rgba(54, 162, 235, 0.2)', 'rgba(255, 206, 86, 0.2)'],
                    borderColor: ['rgba(255, 99, 132, 1)', 'rgba(54, 162, 235, 1)', 'rgba(255, 206, 86, 1)'],
                    borderWidth: 1,
                },
            ],
        },
        options: {
            plugins: {
                title: {
                    display: true,
                    text: `Analysis Results for ${sampleName}`,
                },
            },
        },
    });
}

// Function: Fetch and display last 5 samples
async function fetchLastSamples() {
    try {
        const response = await fetch('/last-samples');
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const samples = await response.json();

        const sampleContainer = document.getElementById('sampleContainer');
        sampleContainer.innerHTML = '';

        samples.forEach((sample) => {
            const sampleElement = document.createElement('div');
            sampleElement.classList.add('sample');
            sampleElement.innerHTML = `
                <p><strong>Sample Name:</strong> ${sample.sample_name}</p>
                <p><strong>Oil:</strong> ${sample.oil}%</p>
                <p><strong>Protein:</strong> ${sample.protein}%</p>
                <p><strong>FFA:</strong> ${sample.ffa}%</p>
                <p><strong>Date:</strong> ${new Date(sample.upload_date).toLocaleDateString()}</p>
            `;
            sampleContainer.appendChild(sampleElement);
        });
    } catch (error) {
        console.error('Error fetching last samples:', error.message);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    fetchLastSamples();
});
