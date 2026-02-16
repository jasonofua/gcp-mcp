import { InstancesClient } from "@google-cloud/compute";
import { ServicesClient } from "@google-cloud/run";

export class ResourceService {
    private computeClient: InstancesClient;
    private runClient: ServicesClient;

    constructor() {
        this.computeClient = new InstancesClient();
        this.runClient = new ServicesClient();
    }

    /**
     * Manage GCE instance state (start/stop).
     */
    async manageGceInstance(projectId: string, zone: string, instanceName: string, action: "start" | "stop") {
        try {
            let operation;
            if (action === "start") {
                [operation] = await this.computeClient.start({
                    project: projectId,
                    zone,
                    instance: instanceName,
                });
            } else {
                [operation] = await this.computeClient.stop({
                    project: projectId,
                    zone,
                    instance: instanceName,
                });
            }

            return {
                status: "Operation triggered",
                operationId: operation.name,
                target: `GCE instance ${instanceName} in ${zone}`,
                action,
            };
        } catch (error: any) {
            console.error(`Error managing GCE instance ${instanceName}:`, error.message);
            throw new Error(`GCP Compute API Error: ${error.message}`);
        }
    }

    /**
     * Restarts a Cloud Run service by triggering a new revision.
     * Note: Cloud Run services don't have a "restart" button, so we update a dummy label.
     */
    async restartCloudRunService(projectId: string, location: string, serviceName: string) {
        const name = `projects/${projectId}/locations/${location}/services/${serviceName}`;

        try {
            const [service] = await this.runClient.getService({ name });

            // To trigger a restart (new revision), we add/update a timestamp annotation
            // In Cloud Run v2 SDK, annotations can move to the template directly
            const serviceUpdate = {
                ...service,
                template: {
                    ...(service.template || {}),
                    annotations: {
                        ...(service.template?.annotations || {}),
                        "antigravity.mcp/restart-at": new Date().toISOString(),
                    }
                }
            };

            const [operation] = await this.runClient.updateService({
                service: serviceUpdate as any,
            });

            return {
                status: "Restart triggered (new revision created)",
                operationId: operation.name,
                target: `Cloud Run service ${serviceName} in ${location}`,
            };
        } catch (error: any) {
            console.error(`Error restarting Cloud Run service ${serviceName}:`, error.message);
            throw new Error(`GCP Cloud Run API Error: ${error.message}`);
        }
    }
}
