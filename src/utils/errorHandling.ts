/**
 * Error handling utilities for MCP tool responses
 *
 * Provides consistent error and success response formatting
 * following the MCP protocol specifications.
 */

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import { AxiosError } from "axios";

/**
 * Creates a standardized error result for MCP tool responses
 *
 * @param message - The error message to display
 * @param details - Optional additional error details
 * @returns An Ok result containing the error information
 *
 * @example
 * ```typescript
 * return createErrorResult("User not found", { username: "test" });
 * ```
 */
export function createErrorResult(
  message: string,
  details?: Record<string, unknown>
): Ok<CallToolResult> {
  const errorText = details
    ? `Error: ${message}\n\nDetails: ${JSON.stringify(details, null, 2)}`
    : `Error: ${message}`;

  return Ok({
    content: [
      {
        type: "text",
        text: errorText
      }
    ],
    isError: true
  });
}

/**
 * Creates a standardized success result for MCP tool responses
 *
 * @param data - The data to return (will be stringified if not a string)
 * @returns An Ok result containing the success data
 *
 * @example
 * ```typescript
 * return createSuccessResult({ username: "test", workbooks: 42 });
 * ```
 */
export function createSuccessResult(data: unknown): Ok<CallToolResult> {
  const text = typeof data === "string"
    ? data
    : JSON.stringify(data, null, 2);

  return Ok({
    content: [
      {
        type: "text",
        text
      }
    ],
    isError: false
  });
}

/**
 * Handles Axios errors and converts them to user-friendly error results
 *
 * Provides specific error messages based on HTTP status codes and
 * error types to help users understand what went wrong.
 *
 * @param error - The error that occurred
 * @param context - Context about what operation failed
 * @returns A formatted error result
 *
 * @example
 * ```typescript
 * try {
 *   const response = await apiClient.get('/user/profile');
 * } catch (error) {
 *   return handleApiError(error, "fetching user profile");
 * }
 * ```
 */
export function handleApiError(
  error: unknown,
  context: string
): Ok<CallToolResult> {
  // Handle Axios errors with response
  if (error instanceof AxiosError) {
    if (error.response) {
      const status = error.response.status;
      const url = error.config?.url || "unknown endpoint";

      switch (status) {
        case 404:
          return createErrorResult(
            `Resource not found while ${context}`,
            {
              url,
              status,
              suggestion: "Please verify the username, workbook name, or other identifiers are correct"
            }
          );

        case 400:
          return createErrorResult(
            `Invalid request while ${context}`,
            {
              url,
              status,
              message: error.response.data?.message || "Bad request",
              suggestion: "Please check that all parameters are valid"
            }
          );

        case 403:
          return createErrorResult(
            `Access forbidden while ${context}`,
            {
              url,
              status,
              suggestion: "The requested resource may be private or restricted"
            }
          );

        case 429:
          return createErrorResult(
            `Rate limit exceeded while ${context}`,
            {
              url,
              status,
              suggestion: "Please wait before making more requests"
            }
          );

        case 500:
        case 502:
        case 503:
        case 504:
          return createErrorResult(
            `Tableau Public server error while ${context}`,
            {
              url,
              status,
              suggestion: "The Tableau Public service may be experiencing issues. Please try again later"
            }
          );

        default:
          return createErrorResult(
            `HTTP error ${status} while ${context}`,
            {
              url,
              status,
              statusText: error.response.statusText
            }
          );
      }
    }

    // Handle network errors (no response)
    if (error.request) {
      return createErrorResult(
        `Network error while ${context}`,
        {
          message: "No response received from Tableau Public",
          suggestion: "Please check your internet connection and try again"
        }
      );
    }

    // Handle request setup errors
    return createErrorResult(
      `Request configuration error while ${context}`,
      { message: error.message }
    );
  }

  // Handle generic errors
  if (error instanceof Error) {
    return createErrorResult(
      `Unexpected error while ${context}`,
      {
        message: error.message,
        name: error.name
      }
    );
  }

  // Handle unknown error types
  return createErrorResult(
    `Unknown error while ${context}`,
    { error: String(error) }
  );
}

/**
 * Creates a result containing image data for MCP tool responses
 *
 * Returns an image content block along with optional metadata text.
 * The image is returned as base64-encoded data with the specified MIME type.
 *
 * @param imageData - Base64-encoded image data
 * @param mimeType - MIME type of the image (e.g., "image/jpeg")
 * @param metadata - Optional metadata to include as text content
 * @returns An Ok result containing the image and metadata
 *
 * @example
 * ```typescript
 * return createImageResult(base64Data, "image/jpeg", {
 *   originalSize: 500000,
 *   processedSize: 50000,
 *   width: 800,
 *   height: 600
 * });
 * ```
 */
export function createImageResult(
  imageData: string,
  mimeType: string,
  metadata?: Record<string, unknown>
): Ok<CallToolResult> {
  // Build content array with proper MCP types
  const content: CallToolResult["content"] = [
    {
      type: "image" as const,
      data: imageData,
      mimeType
    }
  ];

  if (metadata) {
    content.push({
      type: "text" as const,
      text: JSON.stringify(metadata, null, 2)
    });
  }

  return Ok({
    content,
    isError: false
  });
}

/**
 * Validates that required parameters are present
 *
 * @param params - Object containing parameters to validate
 * @param required - Array of required parameter names
 * @returns Error result if validation fails, null if successful
 *
 * @example
 * ```typescript
 * const validationError = validateRequiredParams(
 *   args,
 *   ['username', 'workbookId']
 * );
 * if (validationError) return validationError;
 * ```
 */
export function validateRequiredParams(
  params: Record<string, unknown>,
  required: string[]
): Ok<CallToolResult> | null {
  const missing = required.filter(param => !params[param]);

  if (missing.length > 0) {
    return createErrorResult(
      "Missing required parameters",
      {
        missing,
        received: Object.keys(params)
      }
    );
  }

  return null;
}
