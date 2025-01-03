// main

import { themeToggle } from "./theme.js";

const ENDPOINT_ID = "bz5tarexkvylim";
const API_KEY = "rpa_2IT9HHCR3O3A76NG4RAQ4Y12GJDBGQ10PZ3Q11TPatb1jp";
const BASE_URL = `https://api.runpod.ai/v2/${ENDPOINT_ID}`;
const WORKFLOWS = [
    {
        param: "sd_1_5",
        name: "Stable Diffusion 1.5",
    },
    {
        param: "sdxl_lightning_4step",
        name: "SDXL Lightning 4-step",
    },
    {
        param: "sdxl_lightning_8step",
        name: "SDXL Lightning 8-step",
    },
    {
        param: "sdxl_lightning_6step_juggernaut_xi",
        name: "SDXL Lightning 6-step Juggernaut",
    },
];
const ASPECT_RATIOS = [
    {
        param: "1_1",
        name: "1:1 Square",
    },
    {
        param: "9_16",
        name: "9:16 Portrait",
    },
    {
        param: "16_9",
        name: "16:9 Landscape",
    },
    {
        param: "3_2",
        name: "3:2 Classic",
    },
    {
        param: "4_3",
        name: "4:3 Standard",
    },
];

const PLACEHOLDER_TEXT = "Generated image will appear here";

const COMPLETED_PROGRESS_STATE = {
    value: 100,
    status: "Completed",
    details: "Generation complete!",
};

const QUEUED_PROGRESS_STATE = {
    value: 0,
    status: "In Queue",
    details: "Waiting for robot...",
};

const LOADING_PROGRESS_STATE = {
    value: 0,
    status: "In Progress",
    details: "Loading model...",
};

let currentJobId = null;
let pollingInterval = null;

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
};

const setLoading = (loading) => {
    elements.generateBtn.disabled = loading;
    elements.progressContainer.style.display = loading ? "block" : "none";
    if (!loading) {
        elements.progressFill.style.width = "0%";
        elements.progressStatus.textContent = "Loading...";
        elements.statusDetails.textContent = "";
    }
};

const showPlaceholder = () => {
    elements.placeholderText.style.display = "block";
    elements.placeholderText.innerHTML = PLACEHOLDER_TEXT;
};

const hidePlaceholder = () => {
    elements.placeholderText.style.display = "none";
};

const showError = (message) => {
    elements.errorMessage.textContent = message;
    elements.errorMessage.style.display = "block";
    elements.loadingSpinner.style.display = "none";
};

const hideError = () => {
    elements.errorMessage.style.display = "none";
};

const displayImage = (imageData) => {
    const isBase64 =
        imageData.startsWith("iVBORw0") || imageData.startsWith("data:image");
    elements.generatedImage.src = isBase64
        ? `data:image/png;base64,${imageData.replace(
              /^data:image\/\w+;base64,/,
              ""
          )}`
        : imageData;
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

const extractProgress = (data) => {
    if (
        data.output &&
        typeof data.output === "string" &&
        data.output.includes("%") &&
        data.output != "0%"
    ) {
        const progress = parseInt(data.output);
        return {
            value: progress,
            details: `Progress: ${progress}%`,
            status: "In Progress",
        };
    }
    return LOADING_PROGRESS_STATE;
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
        // Only remove prompt if we're also removing job ID
        url.searchParams.delete("p");
    }
    if (model) {
        url.searchParams.set("m", model);
    } else {
        // Keep the model parameter unless explicitly cleared
        const currentModel = url.searchParams.get("m");
        if (!currentModel) {
            url.searchParams.set("m", elements.workflowSelect.value);
        }
    }
    url.searchParams.set("ar", elements.aspectRatioSelect.value);
    window.history.pushState({}, "", url);
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
        const response = await fetch(`${BASE_URL}/status/${jobId}`, {
            headers: {
                Authorization: `Bearer ${API_KEY}`,
            },
        });

        if (!response.ok) throw new Error("Failed to fetch status");

        const data = await response.json();

        switch (data.status) {
            case "IN_QUEUE":
                updateProgress(QUEUED_PROGRESS_STATE);
                break;

            case "IN_PROGRESS":
                updateProgress(extractProgress(data));
                break;

            case "COMPLETED":
                if (
                    typeof data.output === "string" &&
                    data.output === "ERROR"
                ) {
                    throw new Error(
                        "Something went wrong. Please try again later."
                    );
                }

                updateProgress(COMPLETED_PROGRESS_STATE);
                clearInterval(pollingInterval);
                setLoading(false);
                hidePlaceholder();

                if (typeof data.output === "string") {
                    displayImage(data.output);
                }
                break;

            case "FAILED":
                throw new Error(data.error || "Generation failed");
        }
    } catch (error) {
        clearInterval(pollingInterval);
        setLoading(false);
        showPlaceholder();
        showError(error.message);
        updateUrlWithParams(null); // Remove failed job ID from URL
    }
};

const generateImage = async () => {
    const prompt = elements.promptInput.value.trim();
    if (!prompt) return;

    setLoading(true);
    hidePlaceholder();
    hideError();
    elements.generatedImage.style.display = "none";
    elements.imagePlaceholder.style.display = "flex";
    elements.loadingSpinner.style.display = "flex";
    elements.placeholderText.style.display = "none";

    try {
        const response = await fetch(`${BASE_URL}/run`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${API_KEY}`,
            },
            body: JSON.stringify({
                input: {
                    prompt: prompt,
                    workflow: elements.workflowSelect.value,
                    aspect_ratio: elements.aspectRatioSelect.value,
                },
            }),
        });

        if (!response.ok) throw new Error("Failed to submit job");

        const data = await response.json();
        updateUrlWithParams(data.id, prompt, elements.workflowSelect.value);
        startPolling(data.id);
    } catch (error) {
        setLoading(false);
        showPlaceholder();
        showError(error.message);
    }
};

const loadParamsFromUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const jobId = urlParams.get("i");
    const prompt = urlParams.get("p");
    const model = urlParams.get("m");
    const aspectRatio = urlParams.get("ar");

    if (prompt) {
        elements.promptInput.value = decodeURIComponent(prompt);
    }

    if (model && WORKFLOWS.some((w) => w.param === model)) {
        elements.workflowSelect.value = model;
    }

    if (aspectRatio) {
        elements.aspectRatioSelect.value = aspectRatio;
    }

    if (jobId) {
        startPolling(jobId);
    } else {
        showPlaceholder();
    }
};

elements.generateBtn.addEventListener("click", generateImage);
elements.promptInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter" && !elements.generateBtn.disabled) {
        generateImage();
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

// Handle browser back/forward navigation
window.addEventListener("popstate", () => {
    loadParamsFromUrl();
});

// Populate options
const populateWorkflowOptions = () => {
    const select = elements.workflowSelect;
    WORKFLOWS.forEach((workflow) => {
        const option = document.createElement("option");
        option.value = workflow.param;
        option.textContent = workflow.name;
        select.appendChild(option);
    });
};
const populateAspectRatioOptions = () => {
    const select = elements.aspectRatioSelect;
    ASPECT_RATIOS.forEach((ratio) => {
        const option = document.createElement("option");
        option.value = ratio.param;
        option.textContent = ratio.name;
        select.appendChild(option);
    });
};

// Initialize dropdowns and check URL params
populateWorkflowOptions();
populateAspectRatioOptions();
loadParamsFromUrl();
