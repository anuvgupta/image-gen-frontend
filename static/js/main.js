// main.js

import {
    initializeApiClient,
    generateImage,
    getJobStatus,
} from "./api/api-client.js";
import * as utils from "./util/utils.js";
import * as config from "./config/config.js";
import * as themeSystem from "./theme/system.js";

/* memory */
let currentJobId = null;
let pollingInterval = null;
let sliders = []; // Array to store slider data
let sliderCount = 0;

/* ui elements */
const elements = {
    promptInput: document.getElementById("promptInput"),
    workflowSelect: document.getElementById("workflowSelect"),
    generateBtn: document.getElementById("generateBtn"),
    errorMessage: document.getElementById("errorMessage"),
    progressContainer: document.getElementById("progressContainer"),
    progressFill: document.getElementById("progressFill"),
    progressStatus: document.getElementById("progressStatus"),
    statusDetails: document.getElementById("statusDetails"),
    imagePlaceholder: document.getElementById("imagePlaceholder"),
    generatedImage: document.getElementById("generatedImage"),
    loadingSpinner: document.getElementById("loadingSpinner"),
    placeholderText: document.getElementById("placeholderText"),
    aspectRatioSelect: document.getElementById("aspectRatioSelect"),
    sliderSection: document.getElementById("sliderSection"),
    sliderGrid: document.getElementById("sliderGrid"),
    addSliderBtn: document.getElementById("addSliderBtn"),
};

/* ui methods */
const setLoading = (loading) => {
    elements.generateBtn.disabled = loading;
    showProgressSection();
};

const showPlaceholder = () => {
    elements.placeholderText.style.display = "block";
    elements.placeholderText.innerHTML = config.PLACEHOLDER_TEXT;
};

const hidePlaceholder = () => {
    elements.placeholderText.style.display = "none";
};

const showProgressSection = () => {
    elements.progressContainer.style.display = "block";
};

const hideProgressSection = () => {
    elements.progressContainer.style.display = "none";
};

const resetProgressSection = () => {
    elements.progressFill.style.width = "0%";
    elements.progressStatus.textContent = "Loading...";
    elements.statusDetails.innerHTML = "&nbsp;";
};

const showError = (message = config.DEFAULT_ERROR_MESSAGE) => {
    elements.errorMessage.textContent = message;
    elements.errorMessage.style.display = "block";
    elements.loadingSpinner.style.display = "none";
    hideProgressSection();
};

const hideError = () => {
    elements.errorMessage.style.display = "none";
};

const displayImage = (imageData) => {
    elements.generatedImage.src = utils.isBase64(imageData)
        ? utils.getBase64Image(imageData)
        : utils.getImageUrl(imageData);
    elements.generatedImage.style.display = "block";
    elements.imagePlaceholder.style.display = "none";
    elements.loadingSpinner.style.display = "none";
    showPlaceholder();
};

const updateProgress = (progressData) => {
    elements.progressFill.style.width = `${progressData.value}%`;
    elements.progressStatus.textContent = progressData.status;
    elements.statusDetails.textContent = progressData.details;
};

/* app methods */
const initializeApi = async () => {
    initializeApiClient(
        config.getCognitoIdentityPoolId(),
        config.getAwsRegion(),
        config.getBaseUrl()
    ).catch(console.error);
};

const updateUrlWithParams = (jobId, prompt, model) => {
    const url = new URL(window.location);
    if (jobId) {
        url.searchParams.set("i", jobId);
    } else {
        url.searchParams.delete("i");
    }
    if (prompt) {
        url.searchParams.set("p", prompt);
    } else if (!jobId) {
        url.searchParams.delete("p");
    }
    if (model) {
        url.searchParams.set("m", model);
    } else {
        const currentModel = url.searchParams.get("m");
        if (!currentModel) {
            url.searchParams.set("m", elements.workflowSelect.value);
        }
    }
    url.searchParams.set("ar", elements.aspectRatioSelect.value);

    // Add slider data to URL
    const sliderData = collectSliderValues();
    if (sliderData.length > 0) {
        const sliderString = JSON.stringify(
            sliderData.map((s) => ({
                name: s.name,
                value: s.value,
            }))
        );
        url.searchParams.set("s", encodeURIComponent(sliderString));
    } else {
        url.searchParams.delete("s");
    }

    window.history.pushState({}, "", url);
};

const checkDirectImageAccess = async (jobId) => {
    try {
        const response = await fetch(`/output/${jobId}.png`, {
            method: "HEAD", // Use HEAD request to check existence without downloading
        });

        if (response.ok) {
            // Image exists, display it with expiring message
            displayImage(`/output/${jobId}.png`);
            updateProgress(config.EXPIRING_PROGRESS_STATE);
            setLoading(false); // Enable the generate button
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
    if (pollingInterval) clearInterval(pollingInterval);
    setLoading(true);
    hidePlaceholder();
    hideError();
    elements.generatedImage.style.display = "none";
    elements.imagePlaceholder.style.display = "flex";
    elements.loadingSpinner.style.display = "flex";
    elements.placeholderText.style.display = "none";
    pollingInterval = setInterval(() => pollStatus(jobId), 2000);
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
                setLoading(false);
                hidePlaceholder();
                if (typeof response.output === "string") {
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
                const imageExists = await checkDirectImageAccess(jobId);
                if (!imageExists) {
                    errorMessage =
                        "Image not found! Images expire after a day.";
                }
            }
        }

        console.error(error);
        clearInterval(pollingInterval);
        setLoading(false);
        showPlaceholder();
        showError(errorMessage);
        updateUrlWithParams(null);
    }
};

const generateImageHandler = async () => {
    let prompt = elements.promptInput.value.trim();
    if (!prompt) return;

    // Collect and format slider values
    const sliderValues = collectSliderValues();
    const sliderString = formatSliderString(sliderValues);

    // Append slider string to prompt
    prompt += sliderString;

    resetProgressSection();
    setLoading(true);
    hidePlaceholder();
    hideError();
    elements.generatedImage.style.display = "none";
    elements.imagePlaceholder.style.display = "flex";
    elements.loadingSpinner.style.display = "flex";
    elements.placeholderText.style.display = "none";

    try {
        const response = await generateImage(
            prompt,
            elements.workflowSelect.value,
            elements.aspectRatioSelect.value
        );

        updateUrlWithParams(response.id, prompt, elements.workflowSelect.value);
        startPolling(response.id);
    } catch (error) {
        console.error("Error generating image:", error);
        setLoading(false);
        showPlaceholder();
        let errorMessage = config.DEFAULT_ERROR_MESSAGE;
        // Check specifically for WAF throttling
        if (utils.isFirewallThrottlingError(error)) {
            errorMessage = config.FIREWALL_THROTTLING_ERROR_MESSAGE;
        }
        showError(errorMessage);
    }
};

const loadParamsFromUrl = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const jobId = urlParams.get("i");
    const prompt = urlParams.get("p");
    const model = urlParams.get("m");
    const aspectRatio = urlParams.get("ar");
    const slidersParam = urlParams.get("s");

    if (prompt) {
        elements.promptInput.value = decodeURIComponent(prompt);
    }

    if (model && config.WORKFLOWS.some((w) => w.param === model)) {
        elements.workflowSelect.value = model;
    }

    if (aspectRatio) {
        elements.aspectRatioSelect.value = aspectRatio;
    }

    // Load sliders from URL
    if (slidersParam) {
        try {
            const sliderData = JSON.parse(decodeURIComponent(slidersParam));
            sliderData.forEach((slider, index) => {
                createSlider(slider.name, index);
                // Set the slider value after creation
                setTimeout(() => {
                    const sliderInput = elements.sliderGrid.querySelector(
                        `input[data-name="${slider.name}"]`
                    );
                    if (sliderInput) {
                        sliderInput.value = slider.value;
                        const valueDisplay =
                            sliderInput.parentElement.querySelector(
                                ".slider-value"
                            );
                        valueDisplay.textContent = `${slider.value}%`;
                    }
                }, 0);
            });
        } catch (error) {
            console.error("Error loading sliders from URL:", error);
        }
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
        showPlaceholder();
    }
};

const createSlider = (name, position) => {
    const sliderItem = document.createElement("div");
    sliderItem.className = "slider-item";
    sliderItem.style.gridColumn = `${(position % 2) + 1}`;
    sliderItem.style.gridRow = `${Math.floor(position / 2) + 1}`;

    const sliderId = `slider-${sliderCount++}`;

    sliderItem.innerHTML = `
        <label for="${sliderId}">${name}</label>
        <input type="range" id="${sliderId}" min="0" max="500" value="100" data-name="${name}">
        <div class="slider-value">100%</div>
    `;

    const slider = sliderItem.querySelector('input[type="range"]');
    const valueDisplay = sliderItem.querySelector(".slider-value");

    slider.addEventListener("input", (e) => {
        valueDisplay.textContent = `${e.target.value}%`;
    });

    elements.sliderGrid.appendChild(sliderItem);
    sliders.push({ element: sliderItem, name: name });

    updateAddButtonPosition();
};

const updateAddButtonPosition = () => {
    const nextPosition = sliders.length;
    const column = (nextPosition % 2) + 1;
    const row = Math.floor(nextPosition / 2) + 1;

    elements.addSliderBtn.style.gridColumn = `${column}`;
    elements.addSliderBtn.style.gridRow = `${row}`;
};

const collectSliderValues = () => {
    const sliderValues = [];
    const sliderInputs = elements.sliderGrid.querySelectorAll(
        'input[type="range"]'
    );

    sliderInputs.forEach((slider) => {
        const name = slider.getAttribute("data-name");
        const value = parseInt(slider.value);
        const fraction = value / 100;
        sliderValues.push({ name, value, fraction });
    });

    // Sort by fraction descending (highest to lowest)
    sliderValues.sort((a, b) => b.fraction - a.fraction);

    return sliderValues;
};

const formatSliderString = (sliderValues) => {
    if (sliderValues.length === 0) return "";

    const formatted = sliderValues
        .map((slider) => `(${slider.name}:${slider.fraction})`)
        .join(", ");

    return `, ${formatted}, `;
};

/* app initialization */
elements.generateBtn.addEventListener("click", generateImageHandler);
elements.promptInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter" && !elements.generateBtn.disabled) {
        generateImageHandler();
    }
});

// Handle selection changes
elements.workflowSelect.addEventListener("change", () => {
    updateUrlWithParams(
        currentJobId,
        elements.promptInput.value,
        elements.workflowSelect.value
    );
});
elements.aspectRatioSelect.addEventListener("change", () => {
    updateUrlWithParams(
        currentJobId,
        elements.promptInput.value,
        elements.workflowSelect.value
    );
});
elements.addSliderBtn.addEventListener("click", () => {
    const name = prompt("Enter slider name:");
    if (name && name.trim()) {
        createSlider(name.trim(), sliders.length);
    }
});

// Handle browser back/forward navigation
window.addEventListener("popstate", () => {
    loadParamsFromUrl();
});

// Populate options
const populateSelectOptions = (
    select,
    options,
    defaultValue,
    valueKey = "param",
    textKey = "name"
) => {
    options.forEach((option) => {
        const existingOption = select.querySelector(
            `option[value="${option[valueKey]}"]`
        );
        if (existingOption) {
            select.removeChild(existingOption);
        }
        const newOption = document.createElement("option");
        newOption.value = option[valueKey];
        newOption.textContent = option[textKey];
        if (newOption.value === defaultValue) {
            newOption.selected = true;
        }
        select.appendChild(newOption);
    });
};
const initializeDropdowns = () => {
    populateSelectOptions(
        elements.workflowSelect,
        config.WORKFLOWS,
        config.DEFAULT_WORKFLOW
    );
    populateSelectOptions(
        elements.aspectRatioSelect,
        config.ASPECT_RATIOS,
        config.DEFAULT_ASPECT_RATIO
    );
};

// Main method
const main = () => {
    initializeDropdowns();
    loadParamsFromUrl();
    initializeApi();
};

// Entry point
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => main());
} else {
    main();
}
