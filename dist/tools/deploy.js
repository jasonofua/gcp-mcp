"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeploymentService = void 0;
const cloudbuild_1 = require("@google-cloud/cloudbuild");
class DeploymentService {
    cb;
    constructor() {
        this.cb = new cloudbuild_1.CloudBuildClient();
    }
    async triggerDeployment(serviceName, approval) {
        console.error(`Triggering deployment for ${serviceName} (Approval: ${approval})`);
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        return {
            buildId: Math.random().toString(36).substring(7),
            status: "STARTED",
            environment: "production",
        };
    }
    async getCiPipelineStatus(repo) {
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
exports.DeploymentService = DeploymentService;
//# sourceMappingURL=deploy.js.map