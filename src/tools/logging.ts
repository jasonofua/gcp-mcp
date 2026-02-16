import { Logging } from "@google-cloud/logging";

export interface LogSearchParams {
    query?: string;
    limit?: number;
    severity?: string;
    resourceType?: string;
}

export class LoggingService {
    private logging: Logging;

    constructor() {
        this.logging = new Logging();
    }

    /**
     * Searches for logs based on specified filters.
     */
    async fetchLogs(projectId: string, params: LogSearchParams) {
        const { query, limit = 50, severity, resourceType } = params;

        // Build the basic filter
        let filterParts: string[] = [];

        if (severity) {
            filterParts.push(`severity >= "${severity}"`);
        }

        if (resourceType) {
            filterParts.push(`resource.type = "${resourceType}"`);
        }

        if (query) {
            filterParts.push(`(textPayload:"${query}" OR jsonPayload:"${query}" OR protoPayload:"${query}")`);
        }

        const filter = filterParts.join(" AND ");

        try {
            // Re-initialize logging for the specific target project if needed, 
            // or pass it in the filter if the client supports it.
            // For multi-project support, we use the projectId in the constructor or options.
            const loggingClient = new Logging({ projectId });
            const [entries] = await loggingClient.getEntries({
                filter,
                pageSize: limit,
            });

            return entries.map((entry: any) => ({
                timestamp: entry.metadata.timestamp,
                severity: entry.metadata.severity,
                resource: entry.metadata.resource?.type,
                payload: entry.data,
                insertId: entry.metadata.insertId,
            }));
        } catch (error: any) {
            console.error("Error fetching logs from GCP:", error.message);
            throw new Error(`Cloud Logging API Error: ${error.message}`);
        }
    }

    /**
     * Simplified helper to specifically find errors for troubleshooting.
     */
    async troubleshootingSearch(projectId: string, serviceName?: string) {
        return this.fetchLogs(projectId, {
            severity: "ERROR",
            resourceType: serviceName ? undefined : undefined, // Could expand to filter by service labels
            limit: 20
        });
    }
}
