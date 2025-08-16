import assert from 'assert';
import { JobStateManager } from "./jobStateManager.ts";
import * as orchestrator from "../generate-mashup/index.ts";

async function runTest() {
  console.log('🧪 Running End-to-End Orchestrator Integration Test (Node.js)...');
  const testJobId = 'integration-test-node-123';
  const testSongs = [
    { song_id: 'song1', name: 'Song One', storage_path: 'path/1' },
    { song_id: 'song2', name: 'Song Two', storage_path: 'path/2' },
  ];

  // Store original functions
  const original_makeServiceRequest = orchestrator.makeServiceRequest;
  const original_renderMashup = orchestrator.renderMashup;
  const original_supabase_storage_from = orchestrator.supabase.storage.from;

  // Mock the dependencies
  orchestrator.makeServiceRequest = async (url) => {
    if (url.includes("/analyze")) {
      return new Response(JSON.stringify({
        success: true,
        analysis: { rhythmic: { bpm: 120, beat_confidence: 0.9 }, harmonic: { key: "C major" }, spectral: {} },
      }));
    }
    if (url.includes("/calculate-mashability")) {
      return new Response(JSON.stringify({ overall_score: 85 }));
    }
    if (url.includes("/create-masterplan")) {
      return new Response(JSON.stringify({
        creative_vision: "A test vision",
        masterplan: { title: "Test Mashup", timeline: [{ layers: [{ songId: "song1" }, { songId: "song2" }] }] },
      }));
    }
    return new Response(JSON.stringify({ error: "Unknown service" }), { status: 500 });
  };

  orchestrator.renderMashup = async () => Promise.resolve("generated/mashup.wav");

  // @ts-ignore
  orchestrator.supabase.storage.from = () => ({
    createSignedUrl: () => Promise.resolve({ data: { signedUrl: 'http://fake.url/song.mp3' }, error: null })
  });

  try {
    // Setup and Execute
    JobStateManager.deleteJob(testJobId);
    JobStateManager.createJob(testJobId, testSongs);
    await orchestrator.processBackground(testJobId, testSongs);

    // Assertions
    const finalJobState = JobStateManager.getJob(testJobId);
    assert.strictEqual(finalJobState.status, 'complete', 'Job status should be complete');
    assert.strictEqual(finalJobState.analyses.length, 2, 'Should have 2 analysis results');
    assert.ok(finalJobState.mashabilityScores, 'Mashability scores should be present');
    assert.ok(finalJobState.masterplan, 'Masterplan should be present');
    assert.strictEqual(finalJobState.result_url, 'generated/mashup.wav', 'Result URL should be set');

    console.log('🎉 Integration Test Passed Successfully!');
  } catch (err) {
    console.error('❌ Integration Test Failed:', err);
    process.exit(1);
  } finally {
    // Restore original functions
    orchestrator.makeServiceRequest = original_makeServiceRequest;
    orchestrator.renderMashup = original_renderMashup;
    orchestrator.supabase.storage.from = original_supabase_storage_from;
  }
}

runTest();
