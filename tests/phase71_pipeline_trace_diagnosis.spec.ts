import { buildPipelineTraceDiagnosisReport, PIPELINE_TRACE_DIAGNOSIS_SCHEMA_VERSION } from "../src/reporting/export_pipeline_trace_diagnosis";

describe("Phase 71 pipeline trace diagnosis", () => {
  it("buildPipelineTraceDiagnosisReport returns deterministic schema", () => {
    const r = buildPipelineTraceDiagnosisReport(process.cwd());
    expect(r.schemaVersion).toBe(PIPELINE_TRACE_DIAGNOSIS_SCHEMA_VERSION);
    expect(r.sections.ppZeroOutput.dominantReasonCode).toContain("early_exit");
    expect(r.sections.udExtremePriceTrace.conclusionCode).toBeDefined();
  });
});
