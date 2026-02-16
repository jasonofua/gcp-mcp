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
import { IAMService } from "./utils/iam-checker.js";
import { GCP_CONFIG } from "./utils/gcp-config.js";

// Initialize Services
const healthService = new HealthService();
const costService = new CostService();
const deploymentService = new DeploymentService();
const iamService = new IAMService();

// Session State
let activeProjectId: string = GCP_CONFIG.DEFAULT_PROJECT_ID;

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
    service: z.string().describe("The name of the GCP service"),
    project: z.string().optional().describe("Optional project ID, defaults to active project"),
});

const GetCloudCostBreakdownSchema = z.object({
    project: z.string().optional().describe("Optional project ID, defaults to active project"),
});

const TriggerDeploymentSchema = z.object({
    service: z.string().describe("The name of the service to deploy"),
    approval: z.boolean().describe("Explicit approval flag"),
    project: z.string().optional().describe("Optional project ID, defaults to active project"),
});

const GetCiPipelineStatusSchema = z.object({
    repo: z.string().describe("Repository name"),
    project: z.string().optional().describe("Optional project ID, defaults to active project"),
});

const TestIamIdentitySchema = z.object({
    project: z.string().optional().describe("Optional project ID, defaults to active project"),
});

const SetActiveProjectSchema = z.object({
    projectId: z.string().describe("The GCP project ID to set as active"),
});

/**
 * Register Tool Listing
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "list_projects",
                description: "List all GCP projects the authenticated user can access.",
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "set_active_project",
                description: "Set the default project for all subsequent GCP tool calls.",
                inputSchema: {
                    type: "object",
                    properties: {
                        projectId: { type: "string" },
                    },
                    required: ["projectId"],
                },
            },
            {
                name: "get_service_health",
                description: "Fetch real-time metrics and compute health scores for a GCP service.",
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
                description: "Detailed service-level cost breakdown (BigQuery) + Project Billing Status (Billing API).",
                inputSchema: {
                    type: "object",
                    properties: {
                        project: { type: "string" },
                    },
                },
            },
            {
                name: "trigger_deployment",
                description: "Trigger a deployment via Cloud Build with safety checks.",
                inputSchema: {
                    type: "object",
                    properties: {
                        service: { type: "string" },
                        approval: { type: "boolean" },
                        project: { type: "string" },
                    },
                    required: ["service", "approval"],
                },
            },
            {
                name: "get_ci_pipeline_status",
                description: "Check recent build history and CI status.",
                inputSchema: {
                    type: "object",
                    properties: {
                        repo: { type: "string" },
                        project: { type: "string" },
                    },
                    required: ["repo"],
                },
            },
            {
                name: "test_iam_identity",
                description: "Perform granular verification of GCP IAM permissions and identity.",
                inputSchema: {
                    type: "object",
                    properties: {
                        project: { type: "string" },
                    },
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
            case "list_projects": {
                const projects = await iamService.listProjects();
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ activeProjectId, projects }, null, 2)
                    }],
                };
            }

            case "set_active_project": {
                const { projectId } = SetActiveProjectSchema.parse(args);
                activeProjectId = projectId;
                return {
                    content: [{
                        type: "text",
                        text: `Active project context set to: ${activeProjectId}`
                    }],
                };
            }

            case "get_service_health": {
                const { service, project } = GetServiceHealthSchema.parse(args);
                const targetProject = project || activeProjectId;
                const metrics = await healthService.fetchMetrics(service, targetProject);
                const score = healthService.computeHealthScore(metrics);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ service, project: targetProject, score, metrics }, null, 2)
                    }],
                };
            }

            case "get_cloud_cost_breakdown": {
                const parsed = GetCloudCostBreakdownSchema.parse(args);
                const targetProject = parsed.project || activeProjectId;
                const billingStatus = await costService.getBillingAccountStatus(targetProject);
                const costData = await costService.fetchCostData(targetProject);

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            project_id: targetProject,
                            ...billingStatus,
                            top_service_drilldown: costData,
                            ai_insight: costService.generateInsight(costData)
                        }, null, 2)
                    }],
                };
            }

            case "trigger_deployment": {
                const { service, approval, project } = TriggerDeploymentSchema.parse(args);
                const targetProject = project || activeProjectId;
                const result = await deploymentService.triggerDeployment(service, approval, targetProject);
                return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
            }

            case "get_ci_pipeline_status": {
                const { repo, project } = GetCiPipelineStatusSchema.parse(args);
                const targetProject = project || activeProjectId;
                const status = await deploymentService.getCiPipelineStatus(repo, targetProject);
                return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
            }

            case "test_iam_identity": {
                const { project } = TestIamIdentitySchema.parse(args);
                const targetProject = project || activeProjectId;
                const result = await iamService.verifyPermissions(targetProject);
                return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
            }

            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error: any) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`GCP Control Plane MCP Server running. Default Project: ${activeProjectId}`);
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
