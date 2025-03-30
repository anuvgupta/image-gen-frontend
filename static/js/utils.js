/* utilities */

export const isBase64 = (imageData) => {
    return (
        imageData.startsWith("iVBORw0") || imageData.startsWith("data:image")
    );
};

export const getBase64Image = (imageDataAsBase64) => {
    return `data:image/png;base64,${imageDataAsBase64.replace(
        /^data:image\/\w+;base64,/,
        ""
    )}`;
};

export const getImageUrl = (imageDataAsUrl) => {
    try {
        if (imageDataAsUrl.startsWith("/output/")) {
            return imageDataAsUrl;
        }
        if (imageDataAsUrl.startsWith("output/")) {
            return `/${imageDataAsUrl}`;
        }
        const urlObj = new URL(imageDataAsUrl);
        const path = urlObj.pathname;
        const outputIndex = path.indexOf("/output/");
        if (outputIndex !== -1) {
            return path.slice(outputIndex);
        }
        throw new Error("URL does not contain expected /output/ path");
    } catch (error) {
        console.error(error);
        throw new Error(`Invalid URL or unexpected format: ${error.message}`);
    }
};

export const is404Error = (error) => {
    return error.httpStatus === 404 || error.httpStatus === "404";
};

export const isFirewallThrottlingError = (error) => {
    // console.error(error);

    if (error.httpStatus === 403 && error.errorType === "ForbiddenException") {
        return true;
    }

    // Check for Failed to fetch errors (which could be from preflight failure)
    if (error instanceof TypeError && error.message === "Failed to fetch") {
        return true;
    }

    // Check for explicit CORS preflight errors
    if (error.message?.includes("CORS error")) {
        return true;
    }

    return false;
};
