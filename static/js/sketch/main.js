// Canvas setup
const canvas = document.getElementById("drawing-canvas");
const ctx = canvas.getContext("2d");
const canvasContainer = document.getElementById("canvas-container");

// Canvas history for undo functionality
let history = [];
let currentStep = -1;

// LocalStorage keys
const STORAGE_KEY_HISTORY = "sketch-app-history";
const STORAGE_KEY_CURRENT_STEP = "sketch-app-current-step";
const STORAGE_KEY_LAST_SAVED = "sketch-app-last-saved";

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
                history.length > 0 &&
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
function saveToLocalStorage() {
    try {
        localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
        localStorage.setItem(STORAGE_KEY_CURRENT_STEP, currentStep.toString());
        localStorage.setItem(STORAGE_KEY_LAST_SAVED, new Date().toISOString());
        console.log(
            `Saved sketch to localStorage with ${history.length} steps, currently at step ${currentStep}`
        );
    } catch (error) {
        console.error("Error saving to localStorage:", error);
        // If storage quota is exceeded, we could implement a cleanup strategy here
        // For example, remove older history states or compress the data
    }
}

// Resize canvas to fill container
function resizeCanvas() {
    canvas.width = canvasContainer.clientWidth;
    canvas.height = canvasContainer.clientHeight;
    console.log(
        `Canvas resized to: ${canvas.width}x${canvas.height}, container: ${canvasContainer.clientWidth}x${canvasContainer.clientHeight}`
    );
    redrawCanvas();
}
// Initial canvas sizing and set initial drawing properties
function initialResizeCanvas() {
    window.addEventListener("load", function () {
        // First resize immediately after load
        resizeCanvas();

        // Then do another resize after a short delay to ensure Safari has completed layout
        setTimeout(function () {
            resizeCanvas();
        }, 100);
    });

    // Keep the existing resize event handler
    window.addEventListener("resize", resizeCanvas);
}
initialResizeCanvas();

// Drawing settings - set these before loading
ctx.lineJoin = "round";
ctx.lineCap = "round";
ctx.lineWidth = 5;
ctx.strokeStyle = "#000";

// Resize canvas when window size changes
window.addEventListener("resize", resizeCanvas);

// Save the current state of the canvas
function saveState() {
    // Limit history size to prevent memory issues
    if (currentStep < history.length - 1) {
        history.splice(currentStep + 1);
    }

    currentStep++;
    history.push(canvas.toDataURL());

    // Save to localStorage after updating history
    saveToLocalStorage();

    // Enable/disable undo button based on history
    document.getElementById("undo-button").disabled = currentStep <= 0;
}

// Restore canvas to a previous state
function restoreState(step) {
    if (step < 0 || step >= history.length) return;

    currentStep = step;

    const img = new Image();
    img.onload = function () {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Important: Reset the composite operation to default before drawing
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(img, 0, 0);

        // Reset to current tool setting after redrawing
        if (currentTool === "eraser") {
            ctx.globalCompositeOperation = "destination-out";
        } else {
            ctx.globalCompositeOperation = "source-over";
        }

        // Save to localStorage after restoring state
        saveToLocalStorage();
    };
    img.src = history[currentStep];

    // Enable/disable undo button based on history
    document.getElementById("undo-button").disabled = currentStep <= 0;
}

// Redraw the canvas from current state
function redrawCanvas() {
    if (currentStep >= 0) {
        restoreState(currentStep);
    }
}

// Clear the canvas
function clearCanvas() {
    // Store the current composite operation
    const currentCompositeOperation = ctx.globalCompositeOperation;

    // Reset to default for clearing
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Restore the composite operation
    ctx.globalCompositeOperation = currentCompositeOperation;

    saveState();
}

// Try to load existing sketch, or initialize with a blank state
if (!loadFromLocalStorage()) {
    saveState(); // Initialize with a blank state if nothing to load
} else {
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
    img.src = history[currentStep];
}

// Drawing state variables

// Drawing state
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let hasDrawnSinceLastSave = false;
let currentTool = "pen"; // pen or eraser
const defaultBrushColor = "#000";

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
        saveState();
    }
    isDrawing = false;
});

canvas.addEventListener("mouseout", () => {
    if (isDrawing && hasDrawnSinceLastSave) {
        saveState();
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
        saveState();
    }
    isDrawing = false;
});

// Tool selection controls
document.getElementById("pen-button").addEventListener("click", function () {
    currentTool = "pen";
    ctx.strokeStyle = defaultBrushColor;
    ctx.globalCompositeOperation = "source-over";

    // Update UI
    document.getElementById("pen-button").classList.add("active");
    document.getElementById("eraser-button").classList.remove("active");
});

document.getElementById("eraser-button").addEventListener("click", function () {
    currentTool = "eraser";
    ctx.globalCompositeOperation = "destination-out";

    // Update UI
    document.getElementById("eraser-button").classList.add("active");
    document.getElementById("pen-button").classList.remove("active");
});

// Brush size controls
const brushSizeButtons = document.querySelectorAll(".brush-size-btn");
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
        restoreState(currentStep - 1);
    }
});

document.getElementById("clear-button").addEventListener("click", () => {
    if (
        confirm(
            "Are you sure you want to clear the canvas?" // + " This cannot be undone."
        )
    ) {
        clearCanvas();
        // After clearing, we should update localStorage
        saveToLocalStorage();
    }
});

// Add a button to delete saved data
const controlsContainer = document.getElementById("canvas-controls");
const resetStorageButton = document.createElement("button");
resetStorageButton.id = "reset-storage-button";
resetStorageButton.innerHTML = `
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path>
        <line x1="18" y1="9" x2="12" y2="15"></line>
        <line x1="12" y1="9" x2="18" y2="15"></line>
    </svg>
   Forget Sketch
`;

// Create a new tool group for the reset button
const resetToolGroup = document.createElement("div");
resetToolGroup.className = "tool-group";
resetToolGroup.appendChild(resetStorageButton);
controlsContainer.appendChild(resetToolGroup);

// Add event listener for the reset storage button
resetStorageButton.addEventListener("click", () => {
    if (
        confirm(
            "This will forget your sketch and your undo history. Are you sure?"
        )
    ) {
        localStorage.removeItem(STORAGE_KEY_HISTORY);
        localStorage.removeItem(STORAGE_KEY_CURRENT_STEP);
        localStorage.removeItem(STORAGE_KEY_LAST_SAVED);

        // Reset the canvas and history
        history = [];
        currentStep = -1;
        clearCanvas();
        saveState(); // Initialize with a blank state

        alert("Sketch & history have been forgotten.");
    }
});

// Handle prompt submission
const promptInput = document.getElementById("prompt-input");
const submitButton = document.getElementById("submit-button");

submitButton.addEventListener("click", () => {
    const prompt = promptInput.value.trim();
    if (prompt) {
        console.log("Prompt submitted:", prompt);
        // You can add functionality here to process the prompt
        alert(`Prompt received: ${prompt}`);
        promptInput.value = "";
    }
});

// Allow submitting with Enter key
promptInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        submitButton.click();
    }
});

// Create status indicator
const statusIndicator = document.createElement("div");
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

// Function to show a status message temporarily
function showStatus(message, duration = 2000) {
    statusIndicator.textContent = message;
    statusIndicator.style.opacity = "1";

    setTimeout(() => {
        statusIndicator.style.opacity = "0";
    }, duration);
}

// Override saveToLocalStorage to show status
const originalSaveToLocalStorage = saveToLocalStorage;
saveToLocalStorage = function () {
    originalSaveToLocalStorage();
    showStatus("Sketch saved");
};

// Display last saved time if available
const lastSaved = localStorage.getItem(STORAGE_KEY_LAST_SAVED);
if (lastSaved) {
    const date = new Date(lastSaved);
    const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
    showStatus(`Last saved: ${formattedDate}`, 3000);
}
