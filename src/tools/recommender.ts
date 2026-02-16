import { RecommenderClient } from "@google-cloud/recommender";

export class OptimizationService {
    private recommenderClient: RecommenderClient;

    constructor() {
        this.recommenderClient = new RecommenderClient();
    }

    /**
     * Common Recommender IDs in GCP
     */
    private readonly RECOMMENDERS = [
        "google.compute.instance.IdleResourceRecommendation",
        "google.compute.instance.MachineTypeRecommendation",
        "google.cloud.billing.CostInsight",
        "google.resourcemanager.project.ServiceLimitRecommendation",
    ];

    /**
     * Fetches recommendations across common categories for a project.
     */
    async getRecommendations(projectId: string, location: string = "global") {
        const results = [];

        for (const recommenderId of this.RECOMMENDERS) {
            try {
                const parent = `projects/${projectId}/locations/${location}/recommenders/${recommenderId}`;
                const [recommendations] = await this.recommenderClient.listRecommendations({ parent });

                if (recommendations.length > 0) {
                    results.push(...recommendations.map(rec => {
                        const cost = rec.primaryImpact?.costProjection?.cost;
                        const savings = cost ? (Number(cost.units || 0) + (cost.nanos || 0) / 1e9) : 0;

                        return {
                            recommenderId,
                            description: rec.description,
                            priority: rec.priority,
                            savings,
                            currency: cost?.currencyCode,
                            state: rec.stateInfo?.state,
                        };
                    }));
                }
            } catch (error: any) {
                // Silently skip recommenders that aren't applicable or enabled
                console.error(`Skipping recommender ${recommenderId}:`, error.message);
            }
        }

        return results;
    }
}
