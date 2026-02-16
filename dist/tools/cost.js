"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CostService = void 0;
const bigquery_1 = require("@google-cloud/bigquery");
class CostService {
    bq;
    constructor() {
        this.bq = new bigquery_1.BigQuery();
    }
    /**
     * Mock implementation of fetching costs from BigQuery billing export.
     */
    async fetchCostData(project) {
        console.error(`Querying BigQuery billing export for project ${project}`);
        // Simulate query delay
        await new Promise(resolve => setTimeout(resolve, 800));
        // Mock data for V1
        const seed = project.length;
        const monthTotal = 2000 + (seed * 150);
        const prevMonthTotal = monthTotal * (0.9 + (seed % 5) * 0.1);
        const diff = ((monthTotal - prevMonthTotal) / prevMonthTotal) * 100;
        return {
            project: project,
            monthTotal: Math.round(monthTotal),
            topCostService: seed % 2 === 0 ? "Compute Engine" : "Cloud Storage",
            percentageChange: `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`,
            anomalyDetected: diff > 20,
        };
    }
    generateInsight(data) {
        if (data.anomalyDetected) {
            return `⚠️ ANOMALY DETECTED: Cost increased by ${data.percentageChange}. Review ${data.topCostService} usage immediately.`;
        }
        return `Monthly spend is stable at $${data.monthTotal}. ${data.topCostService} remains the highest driver.`;
    }
}
exports.CostService = CostService;
//# sourceMappingURL=cost.js.map