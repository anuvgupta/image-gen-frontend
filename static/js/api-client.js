// api-client.js

import { fromCognitoIdentityPool } from "@aws-sdk/credential-providers";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { HttpRequest } from "@aws-sdk/protocol-http";
import { Sha256 } from "@aws-crypto/sha256-js";

let signer = null;
let baseUrl = null;
let cognitoIdentityId;

export const initializeApiClient = async (
    identityPoolId,
    region,
    apiBaseUrl
) => {
    const credentials = await fromCognitoIdentityPool({
        clientConfig: { region },
        identityPoolId,
    })();

    // Store the identity ID
    cognitoIdentityId = credentials.identityId;
    console.log("Cognito Identity ID:", cognitoIdentityId);

    signer = new SignatureV4({
        credentials,
        region,
        service: "execute-api",
        sha256: Sha256,
    });

    baseUrl = apiBaseUrl;

    return cognitoIdentityId;
};

// Add a getter method to access the identity ID
export const getCognitoIdentityId = () => {
    return cognitoIdentityId;
};

const signAndFetch = async (path, method, body) => {
    if (!signer) throw new Error("API client not initialized");
    if (!baseUrl) throw new Error("Base URL not set");

    const url = new URL(path, baseUrl);

    const request = new HttpRequest({
        hostname: url.hostname,
        path: url.pathname,
        method,
        headers: {
            host: url.hostname,
            "content-type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    const signedRequest = await signer.sign(request);

    const fetchOptions = {
        method: signedRequest.method,
        headers: signedRequest.headers,
        body: signedRequest.body,
    };

    const response = await fetch(url.toString(), fetchOptions);
    if (!response.ok) {
        const error = new Error(`HTTP error! status: ${response.status}`);
        error.httpStatus = response.status;
        error.errorType = response.headers.get("x-amzn-errortype");
        throw error;
    }
    return response.json();
};

export const generateImage = async (prompt, workflow, aspectRatio) => {
    const body = {
        input: {
            prompt,
            workflow,
            aspect_ratio: aspectRatio,
        },
    };

    return signAndFetch("/run", "POST", body);
};

export const generateImageWithInput = async (
    image,
    prompt,
    workflow,
    aspectRatio
) => {
    const body = {
        input: {
            image,
            prompt,
            workflow,
            aspect_ratio: aspectRatio,
        },
    };

    return signAndFetch("/run", "POST", body);
};

export const getJobStatus = async (jobId) => {
    return signAndFetch(`/status/${jobId}`, "GET");
};

export const getUploadLink = async (fileName, fileType) => {
    const body = {
        fileName,
        fileType,
    };

    console.log("Sending post request to /upload with body: ", body);

    return signAndFetch("/upload", "POST", body);
};

export const uploadImageToS3 = async (imageFile, fileName, fileType) => {
    try {
        // Get the presigned POST URL from the API
        const uploadData = await getUploadLink(fileName, fileType);

        // Create a FormData object to build the POST request
        const formData = new FormData();

        // Add all the fields from the presigned POST response to the form
        Object.entries(uploadData.fields).forEach(([key, value]) => {
            formData.append(key, value);
        });

        // Add the file as the last field in the form
        // The file must be the last field in the form for S3 to process it correctly
        formData.append("file", imageFile);

        console.log(
            `Sending post upload request to S3 bucket to upload link ${uploadData.url} with file key ${uploadData.fileKey}`
        );

        // Make the POST request to S3
        const uploadResponse = await fetch(uploadData.url, {
            method: "POST",
            body: formData,
            // Don't set Content-Type header - the browser will set it correctly with the boundary
        });

        // Check if the upload was successful
        if (!uploadResponse.ok) {
            // If we get XML back from S3, it's an error
            const errorText = await uploadResponse.text();
            console.error("S3 upload failed:", errorText);
            throw new Error(
                `S3 upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`
            );
        }

        console.log(`S3 upload successful for file key ${uploadData.fileKey}`);

        // Return the S3 file key, which can be used to reference this file later
        return uploadData.fileKey;
    } catch (error) {
        console.error("Error uploading to S3:", error);
        throw error;
    }
};
