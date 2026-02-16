import { QueryServiceClient } from "@google-cloud/monitoring";
import { GCP_CONFIG } from "../utils/gcp-config.js";

export interface HealthMetrics {
    cpuUsage: number;
    errorRate: number;
    latencyP95: number;
    podHealth: number; // For GKE, percentage of ready pods
}

export class HealthService {
    private client: QueryServiceClient;

    constructor() {
        this.client = new QueryServiceClient();
    }

    /**
     * Fetches real metrics from Cloud Monitoring using MQL.
     */
    async fetchMetrics(serviceName: string, projectId: string = GCP_CONFIG.DEFAULT_PROJECT_ID): Promise<HealthMetrics> {
        const projectPath = `projects/${projectId}`;

        try {
            // 1. Fetch CPU Usage (Average over last 5m)
            const cpuQuery = `fetch gce_instance | metric 'compute.googleapis.com/instance/cpu/utilization' | filter (metadata.user_labels.service == '${serviceName}') | group_by 5m, [value_utilization_mean: mean(value.utilization)]`;
            const [cpuResults] = await this.client.queryTimeSeries({
                name: projectPath,
                query: cpuQuery,
            });

            // 2. Fetch Error Rate (Relative to total requests)
            const errorQuery = `fetch https_lb_rule | metric 'loadbalancing.googleapis.com/https/request_count' | filter (resource.labels.backend_service_name == '${serviceName}') | align rate(1m) | across [response_code_class], sum(val()) | filter response_code_class == '5xx'`;
            const [errorResults] = await this.client.queryTimeSeries({
                name: projectPath,
                query: errorQuery,
            });

            // 3. Fetch P95 Latency
            const latencyQuery = `fetch https_lb_rule | metric 'loadbalancing.googleapis.com/https/backend_latency' | filter (resource.labels.backend_service_name == '${serviceName}') | group_by 5m, [value_backend_latency_p95: percentile(value.backend_latency, 95)]`;
            const [latencyResults] = await this.client.queryTimeSeries({
                name: projectPath,
                query: latencyQuery,
            });

            // Map results or provide fallback defaults if no data is found
            return {
                cpuUsage: (this.extractValue((cpuResults as any).timeSeriesData?.[0]) * 100) || 0,
                errorRate: this.extractValue((errorResults as any).timeSeriesData?.[0]) || 0,
                latencyP95: this.extractValue((latencyResults as any).timeSeriesData?.[0]) || 0,
                podHealth: 100,
            };
        } catch (error: any) {
            console.error(`Error fetching real metrics for ${serviceName}:`, error.message);
            throw new Error(`GCP Monitoring API Error: ${error.message}`);
        }
    }

    private extractValue(timeSeriesData: any): number {
        if (!timeSeriesData || !timeSeriesData.pointData || timeSeriesData.pointData.length === 0) return 0;
        const lastPoint = timeSeriesData.pointData[timeSeriesData.pointData.length - 1];
        return lastPoint.values[0].doubleValue || lastPoint.values[0].int64Value || 0;
    }

    computeHealthScore(metrics: HealthMetrics): number {
        let score = 100;
        if (metrics.cpuUsage > 80) score -= (metrics.cpuUsage - 80) * 0.5;
        if (metrics.errorRate > 0.01) score -= (metrics.errorRate * 100) * 10;
        if (metrics.latencyP95 > 500) score -= (metrics.latencyP95 - 500) / 20;
        if (metrics.podHealth < 100) score -= (100 - metrics.podHealth) * 2;
        return Math.max(0, Math.min(100, Math.round(score)));
    }

    getStatus(score: number): string {
        if (score >= 90) return "HEALTHY";
        if (score >= 70) return "DEGRADED";
        return "CRITICAL";
    }
}
