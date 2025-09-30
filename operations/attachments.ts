/**
 * @fileoverview Attachment operations for the MCP Kanban server
 *
 * This module provides functions for managing file attachments on cards in the Planka Kanban board,
 * including uploading, retrieving, and deleting attachments.
 */

import { z } from "zod";
import { getAuthenticationToken, plankaRequest } from "../common/utils.js";
import { PlankaAttachmentSchema } from "../common/types.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as http from "http";
import * as https from "https";
import FormData from "form-data";

// Schema definitions
/**
 * Schema for uploading an attachment to a card
 * @property {string} cardId - The ID of the card
 * @property {string} filePath - The local file path to upload
 */
export const UploadAttachmentSchema = z.object({
    cardId: z.string().describe("Card ID"),
    filePath: z.string().describe("Local file path to upload"),
});

/**
 * Schema for uploading an attachment from a URL
 * @property {string} cardId - The ID of the card
 * @property {string} url - The URL to download the file from
 * @property {string} [filename] - Optional filename (will be extracted from URL if not provided)
 */
export const UploadAttachmentFromUrlSchema = z.object({
    cardId: z.string().describe("Card ID"),
    url: z.string().describe("URL to download the file from"),
    filename: z.string().optional().describe(
        "Optional filename (will be extracted from URL if not provided)",
    ),
});

/**
 * Schema for deleting an attachment
 * @property {string} id - The ID of the attachment to delete
 */
export const DeleteAttachmentSchema = z.object({
    id: z.string().describe("Attachment ID"),
});

/**
 * Schema for getting attachments for a card
 * @property {string} cardId - The ID of the card
 */
export const GetAttachmentsSchema = z.object({
    cardId: z.string().describe("Card ID"),
});

// Type exports
export type UploadAttachmentOptions = z.infer<typeof UploadAttachmentSchema>;
export type UploadAttachmentFromUrlOptions = z.infer<
    typeof UploadAttachmentFromUrlSchema
>;
export type DeleteAttachmentOptions = z.infer<typeof DeleteAttachmentSchema>;
export type GetAttachmentsOptions = z.infer<typeof GetAttachmentsSchema>;

// Response schemas
const AttachmentResponseSchema = z.object({
    item: PlankaAttachmentSchema,
    included: z.record(z.any()).optional(),
});

// Function implementations
/**
 * Uploads a file as an attachment to a card
 *
 * @param {UploadAttachmentOptions} options - Options for uploading the attachment
 * @param {string} options.cardId - The ID of the card
 * @param {string} options.filePath - The local file path to upload
 * @returns {Promise<object>} The created attachment
 * @throws {Error} If the upload fails
 */
export async function uploadAttachment(options: UploadAttachmentOptions) {
    try {
        // Check if file exists
        if (!fs.existsSync(options.filePath)) {
            throw new Error(`File not found: ${options.filePath}`);
        }

        const baseUrl = process.env.PLANKA_BASE_URL || "http://localhost:3000";
        const normalizedBaseUrl = baseUrl.endsWith("/api")
            ? baseUrl.slice(0, -4)
            : baseUrl;

        // Get auth token from the shared cache (same as other operations)
        const token = await getAuthenticationToken();

        // Create FormData with file stream
        const formData = new FormData();
        const fileStream = fs.createReadStream(options.filePath);
        const fileName = path.basename(options.filePath);

        formData.append("file", fileStream, fileName);

        // Upload using form-data's submit method (works with streams)
        const uploadUrl = new URL(
            `/api/cards/${options.cardId}/attachments`,
            normalizedBaseUrl,
        );

        const result = await new Promise<any>((resolve, reject) => {
            const protocol = uploadUrl.protocol === "https:" ? https : http;

            formData.submit(
                {
                    host: uploadUrl.hostname,
                    port: uploadUrl.port || (uploadUrl.protocol === "https:" ? 443 : 80),
                    path: uploadUrl.pathname,
                    protocol: uploadUrl.protocol as "https:" | "http:",
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                },
                (err, res) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    let data = "";
                    res.on("data", (chunk) => {
                        data += chunk;
                    });

                    res.on("end", () => {
                        if (
                            res.statusCode && res.statusCode >= 200 &&
                            res.statusCode < 300
                        ) {
                            try {
                                resolve(JSON.parse(data));
                            } catch (parseError) {
                                reject(
                                    new Error(
                                        `Failed to parse response: ${data}`,
                                    ),
                                );
                            }
                        } else {
                            reject(
                                new Error(
                                    `Upload failed (${res.statusCode}): ${data}`,
                                ),
                            );
                        }
                    });

                    res.on("error", (error) => {
                        reject(error);
                    });
                },
            );
        });

        const parsedResponse = AttachmentResponseSchema.parse(result);
        return parsedResponse.item;
    } catch (error) {
        throw new Error(
            `Failed to upload attachment: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}

/**
 * Downloads a file from a URL and uploads it as an attachment to a card
 *
 * @param {UploadAttachmentFromUrlOptions} options - Options for uploading from URL
 * @param {string} options.cardId - The ID of the card
 * @param {string} options.url - The URL to download the file from
 * @param {string} [options.filename] - Optional filename
 * @returns {Promise<object>} The created attachment
 * @throws {Error} If the download or upload fails
 */
export async function uploadAttachmentFromUrl(
    options: UploadAttachmentFromUrlOptions,
) {
    // Use OS temp directory for better compatibility
    const tempDir = path.join(os.tmpdir(), "kanban-mcp-attachments");
    let tempFilePath: string | null = null;

    try {
        // Create temp directory if it doesn't exist
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Download the file first with proper headers to avoid blocking
        const response = await fetch(options.url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; KanbanMCP/1.0)",
                "Accept": "*/*",
            },
        });

        if (!response.ok) {
            throw new Error(
                `Failed to download file from ${options.url}: HTTP ${response.status} ${response.statusText}`,
            );
        }

        // Determine filename (after download, so we can check Content-Type)
        let filename = options.filename;
        if (!filename) {
            // Try to extract filename from URL first
            const urlPath = new URL(options.url).pathname;
            const urlFilename = path.basename(urlPath);

            // Check if URL has a proper filename with extension
            if (
                urlFilename &&
                urlFilename !== "/" &&
                urlFilename !== "" &&
                /\.[a-z0-9]{2,4}$/i.test(urlFilename)
            ) {
                filename = urlFilename;
            } else {
                // Generate filename based on Content-Type
                const contentType = response.headers.get("content-type");
                let extension = "";

                if (contentType) {
                    const mimeToExt: Record<string, string> = {
                        "image/jpeg": ".jpg",
                        "image/jpg": ".jpg",
                        "image/png": ".png",
                        "image/gif": ".gif",
                        "image/svg+xml": ".svg",
                        "image/webp": ".webp",
                        "application/pdf": ".pdf",
                        "text/plain": ".txt",
                        "application/json": ".json",
                        "application/msword": ".doc",
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
                            ".docx",
                    };
                    extension = mimeToExt[contentType.split(";")[0].trim()] || "";
                }

                // Fallback to regex on URL if no Content-Type match
                if (!extension) {
                    extension =
                        options.url.match(
                            /\.(jpg|jpeg|png|gif|pdf|doc|docx|txt|svg|webp|json)$/i,
                        )?.[0] || ".bin";
                }

                filename = `download_${Date.now()}${extension}`;
            }
        }

        tempFilePath = path.join(tempDir, filename);

        // Save to temp file
        const buffer = await response.arrayBuffer();
        const bufferData = Buffer.from(buffer);

        // Validate we actually got content
        if (bufferData.length === 0) {
            throw new Error(
                `Downloaded file is empty (0 bytes) from ${options.url}`,
            );
        }

        fs.writeFileSync(tempFilePath, bufferData);

        // Upload to Planka
        const result = await uploadAttachment({
            cardId: options.cardId,
            filePath: tempFilePath,
        });

        return result;
    } catch (error) {
        throw new Error(
            `Failed to upload attachment from URL: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    } finally {
        // Clean up temp file
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
            } catch (cleanupError) {
                console.error(
                    `Failed to clean up temp file: ${tempFilePath}`,
                    cleanupError,
                );
            }
        }
    }
}

/**
 * Deletes an attachment by ID
 *
 * @param {string} id - The ID of the attachment to delete
 * @returns {Promise<{success: boolean}>} Success indicator
 */
export async function deleteAttachment(id: string) {
    await plankaRequest(`/api/attachments/${id}`, {
        method: "DELETE",
    });
    return { success: true };
}

/**
 * Gets all attachments for a specific card
 *
 * @param {string} cardId - The ID of the card
 * @returns {Promise<Array<object>>} Array of attachments for the card
 */
export async function getAttachments(cardId: string) {
    try {
        // Get the card which includes attachments in the response
        const response = (await plankaRequest(`/api/cards/${cardId}`)) as {
            item: any;
            included?: {
                attachments?: any[];
            };
        };

        // Extract attachments from the included field
        const attachments = response?.included?.attachments || [];

        return attachments;
    } catch (error) {
        throw new Error(
            `Failed to get attachments: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}