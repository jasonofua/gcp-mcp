export const GCP_CONFIG = {
    // Default project ID. In production, this can be fetched from the environment.
    DEFAULT_PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT || "",

    // Billing BigQuery dataset and table
    BILLING_DATASET: process.env.BILLING_DATASET || "billing_export",
    BILLING_TABLE: process.env.BILLING_TABLE || "gcp_billing_export_v1",
};
