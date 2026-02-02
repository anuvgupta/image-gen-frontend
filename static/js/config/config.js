// config.js

/* constants */
export const CHECK_BUCKET_FIRST = true;
export const DEFAULT_ASPECT_RATIO = "9_16";
export const DEFAULT_WORKFLOW = "sdxl_lightning_6step_juggernaut_xi";
export const WORKFLOWS = [
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
const SCRIBBLE_WORKFLOW = "sdxl_lightning_6step_juggernaut_xi_scribble";
export const ASPECT_RATIOS = [
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
export const PLACEHOLDER_TEXT = "Your image will be imagined here";
export const FLAVOR_PROMPT_TEXT =
    'Add a flavor like "spice" or "weirdness" or "dreamy":';
export const DEFAULT_ERROR_MESSAGE =
    "Something went wrong. Please try again later.";
export const FIREWALL_THROTTLING_ERROR_MESSAGE =
    "Too many images! Please wait 5 minutes and try again...";

export const COMPLETED_PROGRESS_STATE = {
    value: 100,
    status: "Imagined", // Generated
    details: "Your image is ready!",
};
export const EXPIRING_PROGRESS_STATE = {
    value: 100,
    status: "Imagined", // Generated
    details: "⚠️ This image is expiring soon!",
};
export const QUEUED_PROGRESS_STATE = {
    value: 0,
    status: "Imagining", // In queue
    details: "Waiting in line...", // Waiting for worker
};
export const LOADING_PROGRESS_STATE = {
    value: 0,
    status: "Imagining", // In Progress
    details: "Loading imagination...", // Loading model
};

/* smart constants */
export const isProd = () => {
    const HOST_NAME = `${window.location.hostname}`;
    return (
        !HOST_NAME.includes("-dev") &&
        !HOST_NAME.includes("dev.") &&
        window.location.hostname != "localhost"
    );
};
export const onAlternateDomain = () => {
    const BASE_DOMAIN_ALT = "sketchy.sh";
    return window.location.hostname.endsWith(BASE_DOMAIN_ALT);
};
export const getBaseUrl = () => {
    const BASE_DOMAIN_ORIG_DEV = "images-api-dev.anuv.me";
    const BASE_DOMAIN_ORIG_PROD = "images-api.anuv.me";
    const BASE_DOMAIN_ALT_DEV = "api-dev.sketchy.sh";
    const BASE_DOMAIN_ALT_PROD = "api.sketchy.sh";
    const BASE_DOMAIN_PROD = onAlternateDomain()
        ? BASE_DOMAIN_ALT_PROD
        : BASE_DOMAIN_ORIG_PROD;
    const BASE_DOMAIN_DEV = onAlternateDomain()
        ? BASE_DOMAIN_ALT_DEV
        : BASE_DOMAIN_ORIG_DEV;
    const BASE_DOMAIN = isProd() ? BASE_DOMAIN_PROD : BASE_DOMAIN_DEV;
    return `https://${BASE_DOMAIN}`;
};
export const getCognitoIdentityPoolId = () => {
    const COGNITO_IDENTITY_POOL_ID_DEV =
        "us-east-1:3076c426-e44d-4a4f-bc62-6621dc0500c6";
    const COGNITO_IDENTITY_POOL_ID_PROD =
        "us-east-1:475ceb5c-9c31-4d8c-a480-f478d62fec25";
    const COGNITO_IDENTITY_POOL_ID = isProd()
        ? COGNITO_IDENTITY_POOL_ID_PROD
        : COGNITO_IDENTITY_POOL_ID_DEV;
    return COGNITO_IDENTITY_POOL_ID;
};
export const getAwsRegion = () => {
    const AWS_REGION = "us-east-1";
    return AWS_REGION;
};
