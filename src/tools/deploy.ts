import { CloudBuildClient } from "@google-cloud/cloudbuild";
import { GCP_CONFIG } from "../utils/gcp-config.js";

export interface DeploymentResult {
    buildId: string;
    status: string;
    environment: string;
    logUrl?: string;
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

    /**
     * Triggers a real Cloud Build for a given service.
     * Assumes service name maps to a build trigger ID or configuration.
     */
    async triggerDeployment(serviceName: string, approval: boolean, projectId: string = GCP_CONFIG.DEFAULT_PROJECT_ID): Promise<DeploymentResult> {
        if (!approval) {
            throw new Error("Safety check: Production deployment requires explicit approval flag.");
        }

        try {
            // Create a build request. In a real scenario, you'd specify the source 
            // (GitHub, GCP bucket) OR trigger a pre-defined trigger ID.
            const [operation] = await this.cb.createBuild({
                projectId: projectId,
                build: {
                    steps: [
                        {
                            name: "gcr.io/cloud-builders/gcloud",
                            args: ["deploy", "run", serviceName, "--platform", "managed"],
                        },
                    ],
                },
            });

            const build = operation.metadata as any;

            return {
                buildId: build?.build?.id || "unknown",
                status: build?.build?.status || "QUEUED",
                environment: "production",
                logUrl: build?.build?.logUrl,
            };
        } catch (error: any) {
            console.error(`Error triggering Cloud Build: ${error.message}`);
            throw new Error(`GCP Cloud Build Error: ${error.message}`);
        }
    }

    /**
     * Fetches real CI status from Cloud Build history.
     */
    async getCiPipelineStatus(repo: string, projectId: string = GCP_CONFIG.DEFAULT_PROJECT_ID): Promise<CIStatus> {
        try {
            const [builds] = await this.cb.listBuilds({
                projectId: projectId,
                pageSize: 1,
                // filter: `substitutions.REPO_NAME = "${repo}"` // Requires substituted build triggers
            });

            if (builds.length === 0) {
                throw new Error(`No build history found for repo ${repo} in project ${projectId}.`);
            }

            const lastBuild = builds[0];
            const duration = lastBuild.finishTime && lastBuild.startTime ?
                (new Date(lastBuild.finishTime.seconds as number * 1000).getTime() - new Date(lastBuild.startTime.seconds as number * 1000).getTime()) / 1000 : 0;

            return {
                repo: repo,
                lastStatus: lastBuild.status as string,
                durationSeconds: Math.round(duration),
                lastCommit: lastBuild.substitutions?.COMMIT_SHA || "unknown",
            };
        } catch (error: any) {
            console.error(`Error fetching build history: ${error.message}`);
            throw new Error(`GCP Build History Error: ${error.message}`);
        }
    }
}
