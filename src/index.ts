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
import { LoggingService } from "./tools/logging.js";
import { ResourceService } from "./tools/resources.js";
import { SecurityService } from "./tools/security.js";
import { OptimizationService } from "./tools/recommender.js";
import { QuotaService } from "./tools/quotas.js";
import { ArchitectureService } from "./tools/architecture.js";
import { IAMService } from "./utils/iam-checker.js";
import { GCP_CONFIG } from "./utils/gcp-config.js";

// Initialize Services
const healthService = new HealthService();
const costService = new CostService();
const deploymentService = new DeploymentService();
const loggingService = new LoggingService();
const resourceService = new ResourceService();
const securityService = new SecurityService();
const optimizationService = new OptimizationService();
const quotaService = new QuotaService();
const architectureService = new ArchitectureService();
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
    project: z.string().optional().describe("Optional project ID override"),
});

const GetCloudCostBreakdownSchema = z.object({
    project: z.string().optional().describe("Optional project ID override"),
});

const TriggerDeploymentSchema = z.object({
    service: z.string().describe("The name of the service to deploy"),
    approval: z.boolean().describe("Explicit approval flag"),
    project: z.string().optional().describe("Optional project ID override"),
});

const GetCiPipelineStatusSchema = z.object({
    repo: z.string().describe("Repository name"),
    project: z.string().optional().describe("Optional project ID override"),
});

const TestIamIdentitySchema = z.object({
    project: z.string().optional().describe("Optional project ID override"),
});

const ExploreLogsSchema = z.object({
    query: z.string().optional().describe("Search keyword or error pattern"),
    limit: z.number().optional().default(50).describe("Number of logs to fetch"),
    severity: z.string().optional().describe("Minimum severity level (DEFAULT, DEBUG, INFO, NOTICE, WARNING, ERROR, CRITICAL, ALERT, EMERGENCY)"),
    resourceType: z.string().optional().describe("GCP resource type (e.g., cloud_run_revision, gce_instance)"),
    project: z.string().optional().describe("Optional project ID override"),
});

const ManageResourceSchema = z.object({
    resourceType: z.enum(["gce", "run"]).describe("Type of resource to manage"),
    resourceName: z.string().describe("Name of the resource (instance name or service name)"),
    action: z.enum(["start", "stop", "restart"]).describe("Action to perform"),
    location: z.string().describe("Zone for GCE or Region for Cloud Run (e.g., us-central1-a, us-central1)"),
    project: z.string().optional().describe("Optional project ID override"),
});

const AuditSecurityFindingsSchema = z.object({
    severity: z.string().optional().default("HIGH").describe("Minimum severity level (CRITICAL, HIGH, MEDIUM, LOW)"),
    project: z.string().optional().describe("Optional project ID override"),
});

const GetOptimizationRecommendationsSchema = z.object({
    location: z.string().optional().default("global").describe("GCP location for recommendations (e.g., us-central1, global)"),
    project: z.string().optional().describe("Optional project ID override"),
});

const CheckQuotaStatusSchema = z.object({
    project: z.string().optional().describe("Optional project ID override"),
});

const GenerateArchitectureDiagramSchema = z.object({
    project: z.string().optional().describe("Optional project ID override"),
});

const SetActiveProjectSchema = z.object({
    projectId: z.string().describe("The GCP project ID to set as active"),
});

/**
 * Helper to ensure a project is selected before running functional tools.
 */
function ensureProject(projectArg?: string): string {
    const target = projectArg || activeProjectId;
    if (!target) {
        throw new Error(
            "No project selected. Please run 'list_projects' and then 'set_active_project' to choose a project to work with."
        );
    }
    return target;
}

/**
 * Register Tool Listing
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "list_projects",
                description: "Step 1: List all GCP projects you have access to. Use this if you haven't selected a project yet.",
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "set_active_project",
                description: "Step 2: Set the active project for this session. This is required before using other tools.",
                inputSchema: {
                    type: "object",
                    properties: {
                        projectId: { type: "string" },
                    },
                    required: ["projectId"],
                },
            },
            {
                name: "test_iam_identity",
                description: "Check your current authentication status and verify if you have the required permissions in a project.",
                inputSchema: {
                    type: "object",
                    properties: {
                        project: { type: "string" },
                    },
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
                name: "explore_logs",
                description: "Search and troubleshoot service logs. Use this to find root causes of errors.",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: { type: "string" },
                        limit: { type: "number" },
                        severity: { type: "string" },
                        resourceType: { type: "string" },
                        project: { type: "string" },
                    },
                },
            },
            {
                name: "manage_resource",
                description: "Start, stop, or restart GCP resources (GCE instances or Cloud Run services).",
                inputSchema: {
                    type: "object",
                    properties: {
                        resourceType: { type: "string", enum: ["gce", "run"] },
                        resourceName: { type: "string" },
                        action: { type: "string", enum: ["start", "stop", "restart"] },
                        location: { type: "string" },
                        project: { type: "string" },
                    },
                    required: ["resourceType", "resourceName", "action", "location"],
                },
            },
            {
                name: "audit_security_findings",
                description: "List active security findings from Cloud Security Command Center.",
                inputSchema: {
                    type: "object",
                    properties: {
                        severity: { type: "string", enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] },
                        project: { type: "string" },
                    },
                },
            },
            {
                name: "get_optimization_recommendations",
                description: "Get AI-powered cost and resource optimization recommendations from GCP.",
                inputSchema: {
                    type: "object",
                    properties: {
                        location: { type: "string" },
                        project: { type: "string" },
                    },
                },
            },
            {
                name: "check_quota_status",
                description: "Monitor GCP service quotas and identify those approaching limits.",
                inputSchema: {
                    type: "object",
                    properties: {
                        project: { type: "string" },
                    },
                },
            },
            {
                name: "generate_architecture_diagram",
                description: "Generate a Mermaid.js architecture diagram of the GCP project resources.",
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
        // Special case: check auth/projects even without a selected project
        if (name === "list_projects") {
            const projects = await iamService.listProjects();
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({ activeProjectId: activeProjectId || "NONE", projects }, null, 2)
                }],
            };
        }

        if (name === "set_active_project") {
            const { projectId } = SetActiveProjectSchema.parse(args);
            // Verify project exists/accessible before setting
            await iamService.verifyPermissions(projectId);
            activeProjectId = projectId;
            return {
                content: [{
                    type: "text",
                    text: `Project context successfully set to: ${activeProjectId}`
                }],
            };
        }

        if (name === "test_iam_identity") {
            const { project } = TestIamIdentitySchema.parse(args);
            const targetProject = project || activeProjectId;
            const result = await iamService.verifyPermissions(targetProject || "");
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        // Functional tools require a project set
        switch (name) {
            case "get_service_health": {
                const { service, project } = GetServiceHealthSchema.parse(args);
                const targetProject = ensureProject(project);
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
                const targetProject = ensureProject(parsed.project);
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
                const targetProject = ensureProject(project);
                const result = await deploymentService.triggerDeployment(service, approval, targetProject);
                return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
            }

            case "get_ci_pipeline_status": {
                const { repo, project } = GetCiPipelineStatusSchema.parse(args);
                const targetProject = ensureProject(project);
                const status = await deploymentService.getCiPipelineStatus(repo, targetProject);
                return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
            }

            case "explore_logs": {
                const { query, limit, severity, resourceType, project } = ExploreLogsSchema.parse(args);
                const targetProject = ensureProject(project);
                const logs = await loggingService.fetchLogs(targetProject, { query, limit, severity, resourceType });
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ project: targetProject, count: logs.length, logs }, null, 2)
                    }],
                };
            }

            case "manage_resource": {
                const { resourceType, resourceName, action, location, project } = ManageResourceSchema.parse(args);
                const targetProject = ensureProject(project);

                let result;
                if (resourceType === "gce") {
                    if (action === "restart") {
                        throw new Error("Restart not directly supported for GCE via this tool. Use stop then start.");
                    }
                    result = await resourceService.manageGceInstance(targetProject, location, resourceName, action as "start" | "stop");
                } else {
                    if (action !== "restart") {
                        throw new Error("Only 'restart' action is supported for Cloud Run services via this tool.");
                    }
                    result = await resourceService.restartCloudRunService(targetProject, location, resourceName);
                }

                return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
            }

            case "audit_security_findings": {
                const { severity, project } = AuditSecurityFindingsSchema.parse(args);
                const targetProject = ensureProject(project);
                const findings = await securityService.getSecurityFindings(targetProject, severity);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ project: targetProject, count: findings.length, findings }, null, 2)
                    }],
                };
            }

            case "get_optimization_recommendations": {
                const { location, project } = GetOptimizationRecommendationsSchema.parse(args);
                const targetProject = ensureProject(project);
                const recommendations = await optimizationService.getRecommendations(targetProject, location);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ project: targetProject, count: recommendations.length, recommendations }, null, 2)
                    }],
                };
            }

            case "check_quota_status": {
                const { project } = CheckQuotaStatusSchema.parse(args);
                const targetProject = ensureProject(project);
                const quotas = await quotaService.getQuotaStatus(targetProject);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ project: targetProject, quotas }, null, 2)
                    }],
                };
            }

            case "generate_architecture_diagram": {
                const { project } = GenerateArchitectureDiagramSchema.parse(args);
                const targetProject = ensureProject(project);
                const result = await architectureService.generateDiagram(targetProject);
                if (typeof result === "string") {
                    return { content: [{ type: "text", text: result }] };
                }
                return {
                    content: [{
                        type: "text",
                        text: `Architecture Diagram for ${targetProject}:\n\n\`\`\`mermaid\n${result.diagram}\n\`\`\`\n\n${result.explanation}`
                    }],
                };
            }

            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error: any) {
        // If it's a "No credentials" error from Google Auth, provide clear login instructions
        if (error.message.includes("Could not load the default credentials")) {
            return {
                content: [{
                    type: "text",
                    text: "Error: GCP Authentication failed. Please run 'gcloud auth application-default login' on your machine to authenticate the MCP server."
                }],
                isError: true,
            };
        }
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
});

async function main() {
    const transport = new StdioServerTransport();

    // Validate identity at startup
    try {
        const identity = await iamService.getIdentity();
        console.error(`GCP Control Plane MCP Server running as: ${identity.email}`);
        if (!activeProjectId) {
            console.error("No default project detected. Onboarding required via 'list_projects'.");
        } else {
            console.error(`Default project from environment: ${activeProjectId}`);
        }
    } catch (err) {
        console.error("WARNING: Startup authentication check failed. User must run 'gcloud auth application-default login'.");
    }

    await server.connect(transport);
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
