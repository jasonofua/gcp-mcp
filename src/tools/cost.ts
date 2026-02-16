import { CloudBillingClient } from "@google-cloud/billing";
import { BigQuery } from "@google-cloud/bigquery";
import { GCP_CONFIG } from "../utils/gcp-config.js";

export interface CostBreakdown {
    project: string;
    monthTotal: number;
    topCostService: string;
    percentageChange: string;
    anomalyDetected: boolean;
}

export class CostService {
    private bq: BigQuery;
    private billing: CloudBillingClient;

    constructor() {
        this.bq = new BigQuery();
        this.billing = new CloudBillingClient();
    }

    /**
     * Fetches account-level billing info using Cloud Billing API.
     * This is for "everything billing" at the management level.
     */
    async getBillingAccountStatus(projectId: string) {
        try {
            const [info] = await this.billing.getProjectBillingInfo({
                name: `projects/${projectId}`,
            });
            return {
                billingEnabled: info.billingEnabled,
                billingAccountName: info.billingAccountName,
            };
        } catch (error: any) {
            console.error("Error fetching billing info:", error.message);
            throw new Error(`Cloud Billing API Error: ${error.message}`);
        }
    }

    /**
     * Drill-down analytics using BigQuery.
     * This provides the "why" and "where" of the costs.
     */
    async fetchCostData(projectId: string): Promise<CostBreakdown> {
        const query = `
      SELECT
        service.description as service_description,
        sum(cost) as total_cost
      FROM \`${GCP_CONFIG.DEFAULT_PROJECT_ID}.${GCP_CONFIG.BILLING_DATASET}.${GCP_CONFIG.BILLING_TABLE}\`
      WHERE project.id = @projectId
      AND _PARTITIONDATE >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 1
    `;

        const options = {
            query: query,
            params: { projectId: projectId },
        };

        try {
            const [rows] = await this.bq.query(options);

            if (rows.length === 0) {
                return {
                    project: projectId,
                    monthTotal: 0,
                    topCostService: "None",
                    percentageChange: "0%",
                    anomalyDetected: false
                };
            }

            const topService = rows[0];
            const monthTotal = rows.reduce((acc: number, row: any) => acc + row.total_cost, 0);

            return {
                project: projectId,
                monthTotal: Math.round(monthTotal),
                topCostService: topService.service_description,
                percentageChange: "+5%", // Mock diff for now
                anomalyDetected: false,
            };
        } catch (error: any) {
            throw new Error(`BigQuery Billing Query Error: ${error.message}`);
        }
    }

    generateInsight(data: CostBreakdown): string {
        return `Spend for ${data.project} is $${data.monthTotal}. ${data.topCostService} is the highest service.`;
    }
}
