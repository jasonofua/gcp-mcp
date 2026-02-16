import { InstancesClient } from "@google-cloud/compute";
import { ServicesClient } from "@google-cloud/run";

export class ArchitectureService {
    private computeClient: any;
    private runClient: ServicesClient;

    constructor() {
        this.computeClient = new InstancesClient();
        this.runClient = new ServicesClient();
    }

    /**
     * Discovers resources and generates a Mermaid.js diagram.
     */
    async generateDiagram(projectId: string) {
        const diagramLines: string[] = ["graph TD"];
        const resources: { id: string; type: string; label: string }[] = [];

        try {
            // 1. Discover Cloud Run Services
            const parent = `projects/${projectId}/locations/-`;
            const [runServices] = await this.runClient.listServices({ parent });

            for (const service of runServices) {
                const id = service.name?.split("/").pop() || "unknown";
                resources.push({ id, type: "CloudRun", label: id });
                diagramLines.push(`  ${id}["Cloud Run: ${id}"]`);
            }

            // 2. Discover GCE Instances
            // aggregatedList returns an iterable of [zone, instancesObject]
            const [instancesMap]: any = await this.computeClient.aggregatedList({
                project: projectId,
            });

            for (const zone in instancesMap) {
                const zoneInstances = instancesMap[zone].instances || [];
                for (const instance of zoneInstances) {
                    const id = instance.name || "unknown";
                    resources.push({ id, type: "GCE", label: id });
                    diagramLines.push(`  ${id}["GCE: ${id}"]`);
                }
            }

            // 3. Simple relationship inference (Experimental)
            // Just linking all Cloud Run to a generic "Load Balancer" icon if it exists 
            // or making them top level. For now, let's just group them.
            if (resources.length > 0) {
                // Future expansion: Inspect VPC connectors, backend services, etc.
                diagramLines.push(`  subgraph Project_${projectId.replace(/-/g, "_")}`);
                resources.forEach(res => {
                    diagramLines.push(`    ${res.id}`);
                });
                diagramLines.push("  end");
            } else {
                return "No supported resources found to generate a diagram.";
            }

            return {
                diagram: diagramLines.join("\n"),
                explanation: `Generated architecture diagram for project ${projectId} including ${runServices.length} Cloud Run services and ${resources.filter(r => r.type === "GCE").length} GCE instances.`,
            };
        } catch (error: any) {
            console.error(`Error generating architecture diagram for ${projectId}:`, error.message);
            throw new Error(`GCP Architecture Discovery Error: ${error.message}`);
        }
    }
}
