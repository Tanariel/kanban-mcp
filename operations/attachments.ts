/**
 * @fileoverview Attachment operations for the MCP Kanban server
 *
 * This module provides functions for managing file attachments on cards in the Planka Kanban board,
 * including uploading, retrieving, and deleting attachments.
 */

import { z } from "zod";
import { plankaRequest } from "../common/utils.js";
import { PlankaAttachmentSchema } from "../common/types.js";
import * as fs from "fs";
import * as path from "path";
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

        // Get environment variables
        const baseUrl = process.env.PLANKA_BASE_URL;
        const email = process.env.PLANKA_AGENT_EMAIL;
        const password = process.env.PLANKA_AGENT_PASSWORD;

        if (!baseUrl || !email || !password) {
            throw new Error(
                "Missing required environment variables: PLANKA_BASE_URL, PLANKA_AGENT_EMAIL, PLANKA_AGENT_PASSWORD",
            );
        }

        // First, authenticate to get the token
        const authResponse = await fetch(`${baseUrl}/api/access-tokens`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                emailOrUsername: email,
                password: password,
            }),
        });

        if (!authResponse.ok) {
            throw new Error(`Authentication failed: ${authResponse.statusText}`);
        }

        const authData = (await authResponse.json()) as {
            item: string;
        };
        const token = authData.item;

        // Create form data with the file
        const form = new FormData();
        const fileStream = fs.createReadStream(options.filePath);
        const fileName = path.basename(options.filePath);

        form.append("file", fileStream, fileName);

        // Upload the file
        const uploadResponse = await fetch(
            `${baseUrl}/api/cards/${options.cardId}/attachments`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    ...form.getHeaders(),
                },
                body: form as any, // Type assertion needed for form-data compatibility
            },
        );

        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            throw new Error(
                `Upload failed (${uploadResponse.status}): ${errorText}`,
            );
        }

        const response = await uploadResponse.json();
        const parsedResponse = AttachmentResponseSchema.parse(response);
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
    const tempDir = path.join(process.cwd(), ".tmp");
    let tempFilePath: string | null = null;

    try {
        // Create temp directory if it doesn't exist
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Determine filename
        let filename = options.filename;
        if (!filename) {
            // Extract filename from URL
            const urlPath = new URL(options.url).pathname;
            filename = path.basename(urlPath);

            // If still no filename or it's generic, generate one
            if (!filename || filename === "/" || filename === "") {
                const extension = options.url.match(/\.(jpg|jpeg|png|gif|pdf|doc|docx|txt|svg)$/i)?.[0] || "";
                filename = `download_${Date.now()}${extension}`;
            }
        }

        tempFilePath = path.join(tempDir, filename);

        // Download the file
        const response = await fetch(options.url);
        if (!response.ok) {
            throw new Error(
                `Failed to download file: ${response.statusText}`,
            );
        }

        // Save to temp file
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(tempFilePath, Buffer.from(buffer));

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