// draw/main.js

import {
    initializeApiClient,
    generateImageWithInput,
    getJobStatus,
    getUploadLink,
    getCognitoIdentityId,
    uploadImageToS3,
} from "../api/api-client.js";
import * as utils from "../util/utils.js";
import * as config from "../config/config.js";

/* constants */
const IS_PROD = config.isProd();
const DEFAULT_BRUSH_COLOR = "#000";
const COMFYUI_WORKFLOW = "sdxl_lightning_6step_juggernaut_xi_scribble";
// LocalStorage keys
const STORAGE_KEY_HISTORY = "sketch-app-history";
const STORAGE_KEY_CURRENT_STEP = "sketch-app-current-step";
const STORAGE_KEY_LAST_SAVED = "sketch-app-last-saved";

/* memory */
let currentJobId = null;
let pollingInterval = null;
let styleKnobs = [];
// Canvas history for undo functionality
let history = [];
let currentStep = -1;
// Drawing state variables
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let hasDrawnSinceLastSave = false;
let currentTool = "pen"; // pen or eraser
// UI elements
let canvas,
    canvasContainer,
    ctx,
    controlsContainer,
    brushSizeButtons,
    promptInput,
    submitButton,
    statusIndicator;
let resultContainer, generatedImage, resultPlaceholder, toggleResultBtn;

/* app methods */
const initializeApi = async () => {
    initializeApiClient(
        config.getCognitoIdentityPoolId(),
        config.getAwsRegion(),
        config.getBaseUrl()
    ).catch(console.error);
};

function generateImageWithCanvasInput() {
    const timestampMs = Date.now();

    // Get prompt
    let prompt = promptInput.value.trim();
    const styleKnobsData = collectStyleKnobsData();
    const styleKnobsString = formatStyleKnobsString(styleKnobsData);
    prompt = prompt + styleKnobsString;
    if (!prompt) {
        showStatus("Please add a description!", 60000);
        return;
    }

    // Show status to user
    showStatus("Processing your sketch...");
    console.log('Processing sketch with prompt "' + prompt + '"');

    // Get the image as PNG from canvas
    const imageData = getCanvasImageAsPNG();
    // Get other input arguments
    const aspectRatio = getCanvasAspectRatio();
    const userId = getCognitoIdentityId();
    const workflow = COMFYUI_WORKFLOW;
    const imageType = "png";
    const fileName = `sketch_user_${userId}_time_${timestampMs}.${imageType}`;
    const fileType = `image/${imageType}`;

    // Get upload link from API
    uploadImageToS3(imageData, fileName, fileType)
        .then((finalInputFileName) => {
            console.log(`File uploaded to S3 as ${finalInputFileName}`);
            console.log(
                `Generating image with prompt="${prompt}", workflow="${workflow}", ` +
                    `aspectRatio="${aspectRatio}", inputFilename="${finalInputFileName}"`
            );
            return generateImageWithInput(
                prompt,
                workflow,
                aspectRatio,
                finalInputFileName
            );
        })
        .then((response) => {
            console.log(response);
            const jobId = response.id;
            updateUrlWithParams(jobId, prompt);
            startPolling(jobId);

            // Handle successful upload
            showStatus("Processing your sketch...");
        })
        .catch((error) => {
            console.error("Error in upload process:", error);
            showStatus("Upload failed. Please try again.", 3000);
        });
}

function updateProgress(progress) {
    console.log(progress);
    if (progress.details) {
        showStatus(progress.details);
    }
}

const checkDirectImageAccess = async (jobId) => {
    const imageUrl = `/output/${jobId}.png`;
    try {
        const response = await fetch(imageUrl, {
            method: "HEAD", // Use HEAD request to check existence without downloading
        });

        if (response.ok) {
            // Image exists, display it with expiring message
            displayImage(imageUrl);
            updateProgress(config.EXPIRING_PROGRESS_STATE);
            // setLoading(false); // Enable the generate button
            clearInterval(pollingInterval); // Clear any existing polling
            return true;
        }
        return false;
    } catch (error) {
        console.error(error);
        return false;
    }
};

const startPolling = (jobId) => {
    currentJobId = jobId;
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
    // setLoading(true);
    // hidePlaceholder();
    // hideError();
    // elements.generatedImage.style.display = "none";
    // elements.imagePlaceholder.style.display = "flex";
    // elements.loadingSpinner.style.display = "flex";
    // elements.placeholderText.style.display = "none";
    pollingInterval = setInterval(async () => pollStatus(jobId), 2000);
};

const pollStatus = async (jobId) => {
    try {
        const response = await getJobStatus(jobId);

        switch (response.status) {
            case "IN_QUEUE":
                updateProgress(config.QUEUED_PROGRESS_STATE);
                break;
            case "IN_PROGRESS":
                updateProgress(utils.extractProgress(response));
                break;
            case "COMPLETED":
                if (response.output === "ERROR") {
                    throw new Error(response.error || "Generation failed");
                }
                updateProgress(config.COMPLETED_PROGRESS_STATE);
                clearInterval(pollingInterval);
                // setLoading(false);
                // hidePlaceholder();
                if (typeof response.output === "string") {
                    console.log(response.output);
                    displayImage(response.output);
                }
                break;
            case "FAILED":
                throw new Error(response.error || "Generation failed");
        }
    } catch (error) {
        let errorMessage = config.DEFAULT_ERROR_MESSAGE;

        // Check specifically for WAF throttling
        if (utils.isFirewallThrottlingError(error)) {
            errorMessage = config.FIREWALL_THROTTLING_ERROR_MESSAGE;
        } else if (utils.is404Error(error)) {
            if (config.CHECK_BUCKET_FIRST) {
                errorMessage = "Image not found! Images expire after a day.";
            } else {
                // If the SDK throws a 404 error, try direct image access
                console.log("404 - checking direct image access");
                const imageExists = await checkDirectImageAccess(jobId);
                if (!imageExists) {
                    errorMessage =
                        "Image not found! Images expire after a day.";
                }
            }
        }

        console.error(error);
        console.log(errorMessage);
        clearInterval(pollingInterval);
        // setLoading(false);
        // showPlaceholder();
        // showError(errorMessage);
        updateUrlWithParams(null, null);
    }
};

/* storage methods */

// Load saved state from localStorage if available
function loadFromLocalStorage() {
    try {
        const savedHistory = localStorage.getItem(STORAGE_KEY_HISTORY);
        const savedCurrentStep = localStorage.getItem(STORAGE_KEY_CURRENT_STEP);

        if (savedHistory && savedCurrentStep) {
            history = JSON.parse(savedHistory);
            currentStep = parseInt(savedCurrentStep);

            // If we have a valid state, restore it
            if (
                // history.length > 0 &&
                history.length > 1 &&
                currentStep >= 0 &&
                currentStep < history.length
            ) {
                console.log(
                    `Loaded saved sketch with ${history.length} steps, currently at step ${currentStep}`
                );

                // Ensure we wait for the canvas to be sized correctly before loading image

                setTimeout(() => {
                    showStatus("Found your last sketch", 3000);
                }, 100);

                return true;
            }
        }
    } catch (error) {
        console.error("Error loading from localStorage:", error);
        // If there's an error parsing JSON, clear the corrupt data
        localStorage.removeItem(STORAGE_KEY_HISTORY);
        localStorage.removeItem(STORAGE_KEY_CURRENT_STEP);
        localStorage.removeItem(STORAGE_KEY_LAST_SAVED);
    }
    return false;
}

// Save current state to localStorage
function saveToLocalStorage(showStatusNotification) {
    try {
        localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
        localStorage.setItem(STORAGE_KEY_CURRENT_STEP, currentStep.toString());
        localStorage.setItem(STORAGE_KEY_LAST_SAVED, new Date().toISOString());
        console.log(
            `Saved sketch to localStorage with ${history.length} steps, currently at step ${currentStep}`
        );
        if (showStatusNotification) {
            showStatus("Sketch saved");
        }
    } catch (error) {
        console.error("Error saving to localStorage:", error);
        // If storage quota is exceeded, we could implement a cleanup strategy here
        // For example, remove older history states or compress the data
    }
}

function clearUrlParams() {
    const url = new URL(window.location);
    url.searchParams.delete("i");
    url.searchParams.delete("p");
    window.history.pushState({}, "", url);
}

const updateUrlWithParams = (jobId, prompt) => {
    const url = new URL(window.location);
    if (jobId) {
        url.searchParams.set("i", jobId);
    } else {
        url.searchParams.delete("i");
    }
    if (prompt) {
        url.searchParams.set("p", prompt);
    } else if (!jobId) {
        // Only remove prompt if we're also removing job ID
        url.searchParams.delete("p");
    }
    window.history.pushState({}, "", url);
};

const loadParamsFromUrl = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    let jobId = urlParams.get("i");
    let prompt = urlParams.get("p");

    if (!prompt) {
        prompt = getPromptFromHistory();
    }
    if (prompt) {
        promptInput.value = decodeURIComponent(prompt);
    }

    if (!jobId) {
        jobId = getJobIdFromHistory();
    }
    if (jobId) {
        if (config.CHECK_BUCKET_FIRST) {
            // Try to load image directly first
            const imageExists = await checkDirectImageAccess(jobId);
            if (!imageExists) {
                // If direct image access fails, start polling
                startPolling(jobId);
            }
        } else {
            startPolling(jobId);
        }
    } else {
        // showPlaceholder();
    }
};

function getPromptFromHistory() {
    if (currentStep < 0) {
        return null;
    }
    const savedState = history[currentStep];
    const prompt = typeof savedState === "object" ? savedState.prompt : null;
    return prompt;
}

function getJobIdFromHistory() {
    if (currentStep < 0) {
        return null;
    }
    const savedState = history[currentStep];
    const jobId = typeof savedState === "object" ? savedState.jobId : null;
    return jobId;
}

/* ui methods */

// Function to show a status message temporarily
let statusTimeout = null;
function showStatus(message, duration = 2000) {
    statusIndicator.textContent = message;
    statusIndicator.style.opacity = "1";

    if (statusTimeout) {
        clearTimeout(statusTimeout);
    }

    statusTimeout = setTimeout(() => {
        statusIndicator.style.opacity = "0";
    }, duration);
}

// Get inverted canvas image
function getInvertedCanvas(sourceCanvas) {
    // Create a temporary canvas for processing
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = sourceCanvas.width;
    tempCanvas.height = sourceCanvas.height;
    const tempCtx = tempCanvas.getContext("2d");

    // Fill with white background
    tempCtx.fillStyle = "white";
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    // Draw the original canvas content onto the temp canvas
    tempCtx.drawImage(sourceCanvas, 0, 0);

    // Get the image data for inverting
    const imageData = tempCtx.getImageData(
        0,
        0,
        tempCanvas.width,
        tempCanvas.height
    );
    const data = imageData.data;

    // Invert the colors
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i]; // Red
        data[i + 1] = 255 - data[i + 1]; // Green
        data[i + 2] = 255 - data[i + 2]; // Blue
        // Alpha channel (data[i + 3]) remains unchanged
    }

    // Put the modified image data back
    tempCtx.putImageData(imageData, 0, 0);

    return tempCanvas;
}

// Function to get canvas image as PNG
function getCanvasImageAsPNG() {
    // Get the inverted canvas
    const invertedCanvas = getInvertedCanvas(canvas);

    // Get the PNG data URL from the inverted canvas
    const dataUrl = invertedCanvas.toDataURL("image/png");

    // Convert data URL to a Blob
    const binaryString = atob(dataUrl.split(",")[1]);
    const array = [];
    for (let i = 0; i < binaryString.length; i++) {
        array.push(binaryString.charCodeAt(i));
    }

    // Create a Blob from the binary data
    const blob = new Blob([new Uint8Array(array)], { type: "image/png" });
    return blob;
}

function displayLastSavedTime() {
    // Display last saved time if available
    const lastSaved = localStorage.getItem(STORAGE_KEY_LAST_SAVED);
    if (lastSaved) {
        const date = new Date(lastSaved);
        const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
        showStatus(`Last saved: ${formattedDate}`, 3000);
    }
}

function displayImage(s3ImageUrl) {
    const imageDisplayUrl = utils.getImageUrl(s3ImageUrl);
    console.log(imageDisplayUrl);

    // Show the generated image
    generatedImage.src = imageDisplayUrl;
    generatedImage.style.display = "block";
    resultPlaceholder.style.display = "none";

    // // On mobile, expand the panel when an image is ready
    // if (window.innerWidth <= 768) {
    //     resultContainer.classList.add("open");
    // }

    // Show a status message
    showStatus("Your sketch is done!", 4000);
}

function createStyleKnob(label, value = 100) {
    const knobDiv = document.createElement("div");
    knobDiv.className = "style-knob";

    knobDiv.innerHTML = `
        <button class="delete-knob-btn" title="Delete ${label}">×</button>
        <div class="knob-label">${label}</div>
        <input type="range" class="knob-slider" min="0" max="250" value="${value}">
        <div class="knob-value">${value}%</div>
    `;

    const slider = knobDiv.querySelector(".knob-slider");
    const valueDisplay = knobDiv.querySelector(".knob-value");
    const deleteBtn = knobDiv.querySelector(".delete-knob-btn");

    slider.addEventListener("input", (e) => {
        valueDisplay.textContent = e.target.value + "%";
    });

    deleteBtn.addEventListener("click", () => {
        if (confirm(`Delete "${label}" style knob?`)) {
            deleteStyleKnob(knobDiv);
        }
    });

    return knobDiv;
}

function addNewKnob(label) {
    const knob = createStyleKnob(label);
    const grid = document.getElementById("style-knobs-grid");
    const addButton = document.getElementById("add-knob-btn");

    // Insert knob before the add button
    grid.insertBefore(knob, addButton);

    // Store knob data
    styleKnobs.push({
        label: label,
        element: knob,
    });
}

function deleteStyleKnob(knobElement) {
    // Find and remove from styleKnobs array
    const index = styleKnobs.findIndex((knob) => knob.element === knobElement);
    if (index !== -1) {
        styleKnobs.splice(index, 1);
    }

    // Remove from DOM
    knobElement.remove();
}

function collectStyleKnobsData() {
    const knobData = [];

    styleKnobs.forEach((knob) => {
        const slider = knob.element.querySelector(".knob-slider");
        const value = parseInt(slider.value);

        // Skip sliders at 0%
        if (value === 0) return;

        const fraction = value / 100; // Convert percentage to fraction

        knobData.push({
            label: knob.label,
            value: value,
            fraction: fraction,
        });
    });

    // Sort by fraction descending
    knobData.sort((a, b) => b.fraction - a.fraction);

    return knobData;
}

function formatStyleKnobsString(knobData) {
    if (knobData.length === 0) return "";

    const formattedPairs = knobData.map(
        (knob) => `(${knob.label}:${knob.fraction.toFixed(2)})`
    );

    return ", " + formattedPairs.join(", ") + ", ";
}

// Resize canvas to fill container
function resizeCanvas(initial) {
    // Save current brush size and tool
    const currentLineWidth = ctx.lineWidth;
    const currentStrokeStyle = ctx.strokeStyle;

    canvas.width = canvasContainer.clientWidth;
    canvas.height = canvasContainer.clientHeight;

    // Restore drawing settings after canvas resize
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = currentLineWidth;
    ctx.strokeStyle = currentStrokeStyle;

    // Set composite operation based on current tool
    if (currentTool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
    } else {
        ctx.globalCompositeOperation = "source-over";
    }

    console.log(
        `Canvas resized to: ${canvas.width}x${canvas.height}, brush size: ${ctx.lineWidth}`
    );
    redrawCanvas(initial);
}

// Initial canvas sizing and set initial drawing properties
function initialResizeCanvas() {
    // First resize immediately after load
    resizeCanvas(true);

    // Then do another resize after a short delay to ensure Safari has completed layout
    setTimeout(function () {
        resizeCanvas(true);
    }, 100);

    // Resize event handler
    window.addEventListener("resize", (_) => {
        resizeCanvas(false);
    });
}

// Save the current state of the canvas
function saveState(showStatusNotification) {
    // Limit history size to prevent memory issues
    if (currentStep < history.length - 1) {
        history.splice(currentStep + 1);
    }

    currentStep++;

    // Save the image data along with current canvas dimensions
    const prompt = promptInput.value.trim();
    history.push({
        imageData: canvas.toDataURL(),
        width: canvas.width,
        height: canvas.height,
        jobId: currentJobId,
        prompt: prompt,
    });

    // Save to localStorage after updating history
    saveToLocalStorage(showStatusNotification);

    // Enable/disable undo button based on history
    document.getElementById("undo-button").disabled = currentStep <= 0;
}

function forgetState() {
    localStorage.removeItem(STORAGE_KEY_HISTORY);
    localStorage.removeItem(STORAGE_KEY_CURRENT_STEP);
    localStorage.removeItem(STORAGE_KEY_LAST_SAVED);

    // Reset the canvas and history
    promptInput.value = "";
    generatedImage.style.display = "none";
    resultPlaceholder.style.display = "block";
    setTimeout((_) => {
        generatedImage.src = "";
    }, 300);
    clearUrlParams();
    clearCanvas(false);
    history = [];
    currentStep = -1;
    saveState(false); // Initialize with a blank state

    alert("Sketch & history have been forgotten.");
}

// Restore canvas to a previous state
function restoreState(step, showStatusNotification) {
    if (step < 0 || step >= history.length) return;

    currentStep = step;

    // Get the saved state
    const savedState = history[currentStep];
    console.log("Restoring state");
    console.log(savedState);

    // Handle both the new format (object) and old format (string)
    const imageDataSrc =
        typeof savedState === "object" ? savedState.imageData : savedState;
    const originalWidth =
        typeof savedState === "object" ? savedState.width : canvas.width;
    const originalHeight =
        typeof savedState === "object" ? savedState.height : canvas.height;
    const jobId = typeof savedState === "object" ? savedState.jobId : null;
    const prompt = typeof savedState === "object" ? savedState.prompt : null;

    // if (prompt) {
    //     promptInput.value = `${prompt}`;
    // }

    const img = new Image();
    img.onload = function () {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Important: Reset the composite operation to default before drawing
        ctx.globalCompositeOperation = "source-over";

        // Draw the image scaled appropriately to the current canvas size
        if (typeof savedState === "object") {
            // No stretching needed if dimensions match
            if (
                originalWidth === canvas.width &&
                originalHeight === canvas.height
            ) {
                ctx.drawImage(img, 0, 0);
            } else {
                // Preserve aspect ratio when scaling
                const scale = Math.min(
                    canvas.width / originalWidth,
                    canvas.height / originalHeight
                );

                // Calculate centered position
                const scaledWidth = originalWidth * scale;
                const scaledHeight = originalHeight * scale;
                const posX = (canvas.width - scaledWidth) / 2;
                const posY = (canvas.height - scaledHeight) / 2;

                ctx.drawImage(img, posX, posY, scaledWidth, scaledHeight);
            }
        } else {
            // Legacy format - just draw as is
            ctx.drawImage(img, 0, 0);
        }

        // Reset to current tool setting after redrawing
        if (currentTool === "eraser") {
            ctx.globalCompositeOperation = "destination-out";
        } else {
            ctx.globalCompositeOperation = "source-over";
        }

        // Save to localStorage after restoring state
        saveToLocalStorage(showStatusNotification);
    };
    img.src = imageDataSrc;

    // Enable/disable undo button based on history
    document.getElementById("undo-button").disabled = currentStep <= 0;
}

// Redraw the canvas from current state
function redrawCanvas(initial) {
    if (currentStep >= 0) {
        restoreState(currentStep, !initial);
    }
}

// Clear the canvas
function clearCanvas(showStatusNotification) {
    // Store the current composite operation
    const currentCompositeOperation = ctx.globalCompositeOperation;

    // Reset to default for clearing
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Restore the composite operation
    ctx.globalCompositeOperation = currentCompositeOperation;

    saveState(showStatusNotification);
}

export const getCanvasAspectRatio = (useDecimals = false, delimiter = ":") => {
    const width = canvas.width;
    const height = canvas.height;

    if (width === 0 || height === 0) {
        console.error("Canvas has zero width or height");
        return "1:1"; // Default fallback
    }

    if (useDecimals) {
        // For decimal representation (e.g., "1.778:1" for 16:9)
        if (width >= height) {
            const ratio = (width / height).toFixed(3);
            return `${ratio}${delimiter}1`;
        } else {
            const ratio = (height / width).toFixed(3);
            return `1${delimiter}${ratio}`;
        }
    } else {
        // For integer representation (e.g., "16:9")
        const gcd = utils.calculateGCD(width, height);
        const simplifiedWidth = width / gcd;
        const simplifiedHeight = height / gcd;

        return `${simplifiedWidth}${delimiter}${simplifiedHeight}`;
    }
};

function initializeCanvas() {
    // Drawing settings - set these before loading
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#000";

    // Try to load existing sketch, or initialize with a blank state
    if (!loadFromLocalStorage()) {
        saveState(false); // Initialize with a blank state if nothing to load
    } else {
        console.log("Restoring initial state");
        // If we loaded history successfully, we need to restore the canvas
        // using the current step from history
        const img = new Image();
        img.onload = function () {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.globalCompositeOperation = "source-over";
            ctx.drawImage(img, 0, 0);

            // Reset to current tool setting after redrawing
            if (currentTool === "eraser") {
                ctx.globalCompositeOperation = "destination-out";
            }

            // Update the undo button state
            document.getElementById("undo-button").disabled = currentStep <= 0;
        };
        const savedState = history[currentStep];
        console.log(savedState);
        const imageDataSrc =
            typeof savedState === "object" ? savedState.imageData : savedState;
        img.src = imageDataSrc;
    }

    // Start drawing on mouse down
    canvas.addEventListener("mousedown", (e) => {
        isDrawing = true;
        hasDrawnSinceLastSave = false;
        [lastX, lastY] = [e.offsetX, e.offsetY];
    });

    // Draw on mouse move if drawing is active
    canvas.addEventListener("mousemove", (e) => {
        if (!isDrawing) return;

        // Calculate the current mouse position
        const currentX = e.offsetX;
        const currentY = e.offsetY;

        // Use quadratic curves for smoother lines
        ctx.beginPath();

        // If this is the start of a new stroke, just move to the point
        if (!hasDrawnSinceLastSave) {
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(currentX, currentY);
        } else {
            // For continuing strokes, use quadratic curves for smoother lines
            // Calculate a midpoint between the last point and current point
            const midX = (lastX + currentX) / 2;
            const midY = (lastY + currentY) / 2;

            // Use the midpoint as the control point for a quadratic curve
            ctx.moveTo(lastX, lastY);
            ctx.quadraticCurveTo(lastX, lastY, midX, midY);
            ctx.lineTo(currentX, currentY);
        }

        ctx.stroke();

        // Update the last position for the next move
        [lastX, lastY] = [currentX, currentY];
        hasDrawnSinceLastSave = true;
    });

    // Stop drawing when mouse is released or leaves canvas
    canvas.addEventListener("mouseup", () => {
        if (isDrawing && hasDrawnSinceLastSave) {
            saveState(true);
        }
        isDrawing = false;
    });

    canvas.addEventListener("mouseout", () => {
        if (isDrawing && hasDrawnSinceLastSave) {
            saveState(true);
        }
        isDrawing = false;
    });

    // Touch support for mobile devices
    canvas.addEventListener("touchstart", (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const touchX = touch.clientX - rect.left;
        const touchY = touch.clientY - rect.top;

        isDrawing = true;
        hasDrawnSinceLastSave = false;
        [lastX, lastY] = [touchX, touchY];
    });

    canvas.addEventListener("touchmove", (e) => {
        e.preventDefault();
        if (!isDrawing) return;

        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const touchX = touch.clientX - rect.left;
        const touchY = touch.clientY - rect.top;

        // Use quadratic curves for smoother lines
        ctx.beginPath();

        // If this is the start of a new stroke, just move to the point
        if (!hasDrawnSinceLastSave) {
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(touchX, touchY);
        } else {
            // For continuing strokes, use quadratic curves for smoother lines
            const midX = (lastX + touchX) / 2;
            const midY = (lastY + touchY) / 2;

            ctx.moveTo(lastX, lastY);
            ctx.quadraticCurveTo(lastX, lastY, midX, midY);
            ctx.lineTo(touchX, touchY);
        }

        ctx.stroke();

        [lastX, lastY] = [touchX, touchY];
        hasDrawnSinceLastSave = true;
    });

    canvas.addEventListener("touchend", (e) => {
        e.preventDefault();
        if (isDrawing && hasDrawnSinceLastSave) {
            saveState(true);
        }
        isDrawing = false;
    });
}

function initializeUI() {
    canvas = document.getElementById("drawing-canvas");
    canvasContainer = document.getElementById("canvas-container");
    ctx = canvas.getContext("2d");
    controlsContainer = document.getElementById("canvas-controls");
    brushSizeButtons = document.querySelectorAll(".brush-size-btn");
    promptInput = document.getElementById("prompt-input");
    submitButton = document.getElementById("submit-button");
    statusIndicator = document.createElement("div");

    resultContainer = document.getElementById("result-container");
    generatedImage = document.getElementById("generated-image");
    resultPlaceholder = document.getElementById("result-placeholder");
    toggleResultBtn = document.getElementById("toggle-result");

    // // Toggle the result panel on mobile
    // toggleResultBtn.addEventListener("click", () => {
    //     resultContainer.classList.toggle("open");
    // });
    // // Make the header also toggle the panel on mobile
    // document.querySelector(".result-header").addEventListener("click", (e) => {
    //     if (window.innerWidth <= 768 && e.target !== toggleResultBtn) {
    //         resultContainer.classList.toggle("open");
    //     }
    // });
    // // Handle window resize to adjust layout
    // window.addEventListener("resize", () => {
    //     if (window.innerWidth > 768) {
    //         resultContainer.classList.remove("open");
    //     }
    // });

    promptInput.addEventListener("change", () => {
        saveState(false);
    });

    // Tool selection controls
    document
        .getElementById("pen-button")
        .addEventListener("click", function () {
            currentTool = "pen";
            ctx.strokeStyle = DEFAULT_BRUSH_COLOR;
            ctx.globalCompositeOperation = "source-over";

            // Update UI
            document.getElementById("pen-button").classList.add("active");
            document.getElementById("eraser-button").classList.remove("active");
        });

    document
        .getElementById("eraser-button")
        .addEventListener("click", function () {
            currentTool = "eraser";
            ctx.globalCompositeOperation = "destination-out";

            // Update UI
            document.getElementById("eraser-button").classList.add("active");
            document.getElementById("pen-button").classList.remove("active");
        });

    // Brush size controls
    brushSizeButtons.forEach((button) => {
        button.addEventListener("click", function () {
            // Update line width
            ctx.lineWidth = parseInt(this.getAttribute("data-size"));

            // Update UI
            brushSizeButtons.forEach((btn) => btn.classList.remove("active"));
            this.classList.add("active");
        });
    });

    // Button controls
    document.getElementById("undo-button").addEventListener("click", () => {
        if (currentStep > 0) {
            restoreState(currentStep - 1, true);
        }
    });

    document.getElementById("clear-button").addEventListener("click", () => {
        if (
            confirm(
                "Are you sure you want to clear the canvas?" // + " This cannot be undone."
            )
        ) {
            clearCanvas(true);
            // After clearing, we should update localStorage
            saveToLocalStorage(true);
        }
    });

    // Add event listener for the reset storage button
    document
        .getElementById("reset-storage-button")
        .addEventListener("click", () => {
            const confirmation = confirm(
                "This will forget your sketch and your undo history. Are you sure?"
            );
            if (confirmation) {
                forgetState();
            }
        });

    // Handle prompt submission
    submitButton.addEventListener("click", () => {
        generateImageWithCanvasInput();
    });

    // Allow submitting with Enter key
    promptInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            submitButton.click();
        }
    });

    // Add knob button functionality
    document.getElementById("add-knob-btn").addEventListener("click", () => {
        const label = prompt(config.FLAVOR_PROMPT_TEXT);
        if (label && label.trim()) {
            addNewKnob(label.trim());
        }
    });

    // Create status indicator
    statusIndicator.id = "storage-status";
    statusIndicator.style.position = "absolute";
    statusIndicator.style.bottom = "10px";
    statusIndicator.style.left = "10px";
    statusIndicator.style.backgroundColor = "rgba(0,0,0,0.5)";
    statusIndicator.style.color = "white";
    statusIndicator.style.padding = "5px 10px";
    statusIndicator.style.borderRadius = "4px";
    statusIndicator.style.fontSize = "12px";
    statusIndicator.style.opacity = "0";
    statusIndicator.style.transition = "opacity 0.3s";
    canvasContainer.appendChild(statusIndicator);
}

/* init methods */

// Main method
const main = async () => {
    initializeUI();
    initializeCanvas();
    initialResizeCanvas();
    // displayLastSavedTime();
    await initializeApi();
    await loadParamsFromUrl();
};

// Entry point
window.addEventListener("load", async () => {
    await main();
});
