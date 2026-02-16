import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { HealthService } from "./tools/health.js";
import { CostService } from "./tools/cost.js";
import { DeploymentService } from "./tools/deploy.js";

// Initialize Services
const healthService = new HealthService();
const costService = new CostService();
const deploymentService = new DeploymentService();

// Initialize the GCP Control Plane MCP Server
const server = new Server(
    {
        name: "gcp-control-plane-mcp",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

/**
 * Define tool schemas
 */
const GetServiceHealthSchema = z.object({
    service: z.string().describe("The name of the GCP service (e.g., 'payments-api', 'frontend-svc')"),
    project: z.string().optional().default("prod-project").describe("Optional project ID"),
});

const GetCloudCostBreakdownSchema = z.object({
    project: z.string().describe("The GCP project ID to analyze"),
});

const TriggerDeploymentSchema = z.object({
    service: z.string().describe("The name of the service to deploy"),
    approval: z.boolean().describe("Explicit approval flag for production deployments"),
});

const GetCiPipelineStatusSchema = z.object({
    repo: z.string().describe("The repository name to check CI status for"),
});

/**
 * Register Tool Listing
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
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
server.setRequestHandler(CallToolRequestSchema, async (request) => {
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
    } catch (error: any) {
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
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("GCP Control Plane MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
