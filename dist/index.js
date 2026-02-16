"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const zod_1 = require("zod");
const health_js_1 = require("./tools/health.js");
const cost_js_1 = require("./tools/cost.js");
const deploy_js_1 = require("./tools/deploy.js");
// Initialize Services
const healthService = new health_js_1.HealthService();
const costService = new cost_js_1.CostService();
const deploymentService = new deploy_js_1.DeploymentService();
// Initialize the GCP Control Plane MCP Server
const server = new index_js_1.Server({
    name: "gcp-control-plane-mcp",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
/**
 * Define tool schemas
 */
const GetServiceHealthSchema = zod_1.z.object({
    service: zod_1.z.string().describe("The name of the GCP service (e.g., 'payments-api', 'frontend-svc')"),
    project: zod_1.z.string().optional().default("prod-project").describe("Optional project ID"),
});
const GetCloudCostBreakdownSchema = zod_1.z.object({
    project: zod_1.z.string().describe("The GCP project ID to analyze"),
});
const TriggerDeploymentSchema = zod_1.z.object({
    service: zod_1.z.string().describe("The name of the service to deploy"),
    approval: zod_1.z.boolean().describe("Explicit approval flag for production deployments"),
});
const GetCiPipelineStatusSchema = zod_1.z.object({
    repo: zod_1.z.string().describe("The repository name to check CI status for"),
});
/**
 * Register Tool Listing
 */
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "get_service_health",
                description: "Fetch real-time health metrics and compute an intelligent health score for a GCP service.",
                inputSchema: {
                    type: "object",
                    properties: {
                        service: { type: "string" },
                        project: { type: "string" },
                    },
                    required: ["service"],
                },
            },
            {
                name: "get_cloud_cost_breakdown",
                description: "Analyze GCP billing data to provide cost summaries and intelligent anomaly detection.",
                inputSchema: {
                    type: "object",
                    properties: {
                        project: { type: "string" },
                    },
                    required: ["project"],
                },
            },
            {
                name: "trigger_deployment",
                description: "Trigger a new deployment/build for a specific GCP service with integrated safety checks.",
                inputSchema: {
                    type: "object",
                    properties: {
                        service: { type: "string" },
                        approval: { type: "boolean" },
                    },
                    required: ["service", "approval"],
                },
            },
            {
                name: "get_ci_pipeline_status",
                description: "Retrieve the status and duration of the most recent CI/CD pipeline runs for a repository.",
                inputSchema: {
                    type: "object",
                    properties: {
                        repo: { type: "string" },
                    },
                    required: ["repo"],
                },
            },
        ],
    };
});
/**
 * Handle Tool Calls
 */
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case "get_service_health": {
                const { service, project } = GetServiceHealthSchema.parse(args);
                const metrics = await healthService.fetchMetrics(service, project);
                const score = healthService.computeHealthScore(metrics);
                const status = healthService.getStatus(score);
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                service,
                                status,
                                health_score: score,
                                metrics: {
                                    cpu_usage: `${metrics.cpuUsage}%`,
                                    error_rate: `${metrics.errorRate}%`,
                                    latency_p95: `${metrics.latencyP95}ms`,
                                    pod_health: `${metrics.podHealth}%`
                                }
                            }, null, 2)
                        }],
                };
            }
            case "get_cloud_cost_breakdown": {
                const { project } = GetCloudCostBreakdownSchema.parse(args);
                const costData = await costService.fetchCostData(project);
                const insight = costService.generateInsight(costData);
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                ...costData,
                                ai_insight: insight
                            }, null, 2)
                        }],
                };
            }
            case "trigger_deployment": {
                const { service, approval } = TriggerDeploymentSchema.parse(args);
                if (!approval) {
                    return {
                        content: [{ type: "text", text: "Error: Deployment requires explicit 'approval: true' for safety." }],
                        isError: true,
                    };
                }
                const result = await deploymentService.triggerDeployment(service, approval);
                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                };
            }
            case "get_ci_pipeline_status": {
                const { repo } = GetCiPipelineStatusSchema.parse(args);
                const status = await deploymentService.getCiPipelineStatus(repo);
                return {
                    content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
                };
            }
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
    catch (error) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true,
        };
    }
});
/**
 * Start the server
 */
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error("GCP Control Plane MCP Server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map