// api-client.js

import { fromCognitoIdentityPool } from "@aws-sdk/credential-providers";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { HttpRequest } from "@aws-sdk/protocol-http";
import { Sha256 } from "@aws-crypto/sha256-js";

let signer = null;
let baseUrl = null;

export const initializeApiClient = async (
    identityPoolId,
    region,
    apiBaseUrl
) => {
    const credentials = await fromCognitoIdentityPool({
        clientConfig: { region },
        identityPoolId,
    })();

    signer = new SignatureV4({
        credentials,
        region,
        service: "execute-api",
        sha256: Sha256,
    });

    baseUrl = apiBaseUrl;
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

export const getJobStatus = async (jobId) => {
    return signAndFetch(`/status/${jobId}`, "GET");
};
