import { SecurityCenterClient } from "@google-cloud/security-center";

export class SecurityService {
    private sccClient: SecurityCenterClient;

    constructor() {
        this.sccClient = new SecurityCenterClient();
    }

    /**
     * Lists security findings for a given project.
     * Note: In SCC, findings are often scoped at the organization level,
     * but we'll attempt to list them via the project resource if possible or use the project filter.
     */
    async getSecurityFindings(projectId: string, severity: string = "HIGH") {
        const sourceName = `projects/${projectId}/sources/-`;

        try {
            const [responses] = await this.sccClient.listFindings({
                parent: sourceName,
                filter: `state="ACTIVE" AND severity="${severity}"`,
                pageSize: 10,
            });

            return responses.map(response => ({
                resourceName: response.finding?.resourceName,
                category: response.finding?.category,
                severity: response.finding?.severity,
                eventTime: response.finding?.eventTime,
                explanation: response.finding?.description,
                recommendation: response.finding?.nextSteps,
            }));
        } catch (error: any) {
            console.error(`Error fetching security findings for ${projectId}:`, error.message);
            // SCC often requires Org-level permissions or specific setup. 
            // We'll provide a helpful error if it's not enabled.
            if (error.message.includes("not enabled") || error.message.includes("PERMISSION_DENIED")) {
                throw new Error(`Security Command Center is not enabled or accessible for project ${projectId}. Visit https://console.cloud.google.com/security/vulnerability-reports/findings to set it up.`);
            }
            throw new Error(`GCP SCC API Error: ${error.message}`);
        }
    }
}
