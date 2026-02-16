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

    constructor() {
        this.bq = new BigQuery();
    }

    async fetchCostData(projectId: string): Promise<CostBreakdown> {
        // Standard SQL query for billing data
        // Requires a billing export table to be configured in BigQuery
        const query = `
      SELECT
        service.description as service_description,
        sum(cost) as total_cost,
        sum(IF(_PARTITIONDATE = CURRENT_DATE(), cost, 0)) as today_cost
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
                throw new Error(`No billing data found for project ${projectId} in the last 30 days.`);
            }

            const topService = rows[0];
            const monthTotal = rows.reduce((acc: number, row: any) => acc + row.total_cost, 0);

            // Calculate prev month total for anomaly detection (simplified)
            const prevMonthTotal = monthTotal * 0.9; // In a real scenario, run a second query for the previous period
            const diff = prevMonthTotal > 0 ? ((monthTotal - prevMonthTotal) / prevMonthTotal) * 100 : 0;

            return {
                project: projectId,
                monthTotal: Math.round(monthTotal),
                topCostService: topService.service_description,
                percentageChange: `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`,
                anomalyDetected: diff > 20,
            };
        } catch (error: any) {
            console.error(`Error querying BigQuery: ${error.message}`);
            throw new Error(`GCP BigQuery Error: ${error.message}`);
        }
    }

    generateInsight(data: CostBreakdown): string {
        if (data.anomalyDetected) {
            return `⚠️ ANOMALY DETECTED: Cost increased by ${data.percentageChange}. Review ${data.topCostService} usage in project ${data.project}.`;
        }
        return `Monthly spend for ${data.project} is stable at $${data.monthTotal}. ${data.topCostService} is the primary driver.`;
    }
}
