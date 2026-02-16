import { QueryServiceClient } from "@google-cloud/monitoring";

export class QuotaService {
    private client: QueryServiceClient;

    constructor() {
        this.client = new QueryServiceClient();
    }

    /**
     * Checks for quotas that are heavily utilized in a project.
     */
    async getQuotaStatus(projectId: string) {
        const projectPath = `projects/${projectId}`;

        // MQL query to fetch quota allocation usage
        // This looks for all quotas and groups them to show those with high usage.
        const query = `
          fetch consumer_quota
          | metric 'serviceruntime.googleapis.com/quota/allocation/usage'
          | filter (resource.project_id == '${projectId}')
          | group_by 1d, [value_usage_max: max(value.usage)]
          | top 10, value_usage_max
        `;

        try {
            const [results] = await this.client.queryTimeSeries({
                name: projectPath,
                query: query,
            });

            const timeSeriesData = (results as any).timeSeriesData || [];

            if (timeSeriesData.length === 0) {
                return {
                    message: "No significant quota usage detected or Cloud Quotas monitoring is not enabled for this project.",
                    quotas: [],
                };
            }

            return timeSeriesData.map((result: any) => ({
                quotaName: result.labelValues?.[0]?.stringValue || "Unknown Quota",
                usage: result.pointData?.[0]?.values?.[0]?.doubleValue || result.pointData?.[0]?.values?.[0]?.int64Value,
                timestamp: result.pointData?.[0]?.timeInterval?.endTime,
            }));
        } catch (error: any) {
            console.error(`Error fetching quota status for ${projectId}:`, error.message);
            throw new Error(`GCP Monitoring Quota Error: ${error.message}`);
        }
    }
}
