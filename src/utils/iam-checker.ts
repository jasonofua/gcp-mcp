import { GoogleAuth } from "google-auth-library";
import { ProjectsClient } from "@google-cloud/resource-manager";

export interface PermissionReport {
    identity: string;
    projectId: string;
    capabilities: {
        health: boolean;
        cost: boolean;
        deployment: boolean;
        billing: boolean;
    };
    missingPermissions: string[];
}

export class IAMService {
    private auth: GoogleAuth;
    private projectsClient: ProjectsClient;

    // Real permission strings for Project resource
    private readonly REQUIRED_PERMISSIONS = {
        health: ["monitoring.timeSeries.list"],
        cost: ["bigquery.jobs.create", "bigquery.tables.list"],
        deployment: ["cloudbuild.builds.list"],
        billing: ["resourcemanager.projects.get"], // Basic check if project is accessible
    };

    constructor() {
        this.auth = new GoogleAuth({
            scopes: ["https://www.googleapis.com/auth/cloud-platform"],
        });
        this.projectsClient = new ProjectsClient();
    }

    async getIdentity(): Promise<{ email: string; projectId: string; authMethod: string }> {
        const client = await this.auth.getClient();
        const project = await this.auth.getProjectId();

        let email = "User Identity (Authenticated)";

        // Service Accounts have email, User Credentials often don't in the base client
        if ("email" in client) {
            email = (client as any).email;
        } else if ("getServiceAccountEmail" in client) {
            email = await (client as any).getServiceAccountEmail();
        } else if ((client as any)._clientId) {
            email = `User Credential (${project})`;
        }

        return {
            email,
            projectId: project,
            authMethod: client.constructor.name,
        };
    }

    /**
   * Lists all projects the authenticated user has access to.
   */
    async listProjects() {
        try {
            const [projects] = await this.projectsClient.searchProjects();
            return projects.map(p => ({
                projectId: p.projectId,
                displayName: p.displayName,
                state: p.state,
            }));
        } catch (error: any) {
            console.error("Failed to list projects:", error.message);
            throw new Error(`GCP Resource Manager Error: ${error.message}`);
        }
    }

    /**
     * Fully functioning permission check using testIamPermissions.
     */
    async verifyPermissions(projectId: string): Promise<PermissionReport> {
        const identity = await this.getIdentity();
        const targetProject = projectId || identity.projectId;

        if (!targetProject) {
            throw new Error("Project ID is required for permission check.");
        }

        const allPermissions = Object.values(this.REQUIRED_PERMISSIONS).flat();

        try {
            const [response] = await this.projectsClient.testIamPermissions({
                resource: `projects/${targetProject}`,
                permissions: allPermissions,
            });

            const grantedSet = new Set(response.permissions || []);

            const capabilities = {
                health: this.REQUIRED_PERMISSIONS.health.every(p => grantedSet.has(p)),
                cost: this.REQUIRED_PERMISSIONS.cost.every(p => grantedSet.has(p)),
                deployment: this.REQUIRED_PERMISSIONS.deployment.every(p => grantedSet.has(p)),
                billing: this.REQUIRED_PERMISSIONS.billing.every(p => grantedSet.has(p)),
            };

            const missingPermissions = allPermissions.filter(p => !grantedSet.has(p));

            return {
                identity: identity.email,
                projectId: targetProject,
                capabilities,
                missingPermissions,
            };
        } catch (error: any) {
            console.error("IAM verification failed:", error.message);
            throw new Error(`GCP Resource Manager Error: ${error.message}`);
        }
    }
}
