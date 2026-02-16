import { CloudBuildClient } from "@google-cloud/cloudbuild";

export interface DeploymentResult {
    buildId: string;
    status: string;
    environment: string;
}

export interface CIStatus {
    repo: string;
    lastStatus: string;
    durationSeconds: number;
    lastCommit: string;
}

export class DeploymentService {
    private cb: CloudBuildClient;

    constructor() {
        this.cb = new CloudBuildClient();
    }

    async triggerDeployment(serviceName: string, approval: boolean): Promise<DeploymentResult> {
        console.error(`Triggering deployment for ${serviceName} (Approval: ${approval})`);

        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        return {
            buildId: Math.random().toString(36).substring(7),
            status: "STARTED",
            environment: "production",
        };
    }

    async getCiPipelineStatus(repo: string): Promise<CIStatus> {
        console.error(`Fetching CI pipeline status for ${repo}`);

        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 600));

        const seed = repo.length;
        const statuses = ["SUCCESS", "FAILURE", "WORKING", "QUEUED"];

        return {
            repo: repo,
            lastStatus: statuses[seed % statuses.length] || "UNKNOWN",
            durationSeconds: 120 + (seed * 10) % 300,
            lastCommit: Math.random().toString(16).substring(2, 9),
        };
    }
}
