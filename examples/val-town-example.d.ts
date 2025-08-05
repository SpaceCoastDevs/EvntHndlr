/**
 * Example: Val.town implementation for EvntHndlr
 * Copy this code to a Val.town endpoint for automated event updates
 */
/**
 * Manual trigger for event updates
 * Call this endpoint to manually update events
 */
export default function manualEventUpdate(req: any): Promise<Response>;
/**
 * Scheduled weekly update
 * Set this to run on a schedule in Val.town
 */
export declare function weeklyEventUpdate(): Promise<{
    success: boolean;
    message: string;
    month: string;
    timestamp: string;
    error?: undefined;
} | {
    success: boolean;
    error: any;
    timestamp: string;
    message?: undefined;
    month?: undefined;
}>;
/**
 * Health check endpoint
 * Verifies GitHub API access without making changes
 */
export declare function healthCheck(): Promise<Response>;
//# sourceMappingURL=val-town-example.d.ts.map