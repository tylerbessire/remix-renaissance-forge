import os
import supabase
import traceback
from flask import Flask, request, jsonify

app = Flask(__name__)

# --- Environment Setup ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase_client = supabase.create_client(SUPABASE_URL, SUPABASE_KEY)

# --- Main Route ---
@app.route('/', methods=['POST'])
def create_mashup_job():
    """
    Creates a new mashup job in the database and returns the job ID.
    This function is designed to be very fast and never time out.
    The actual processing is handled by the 'process-job-queue' worker.
    """
    try:
        data = request.get_json()
        songs = data.get('songs')
        if not songs or len(songs) < 2:
            return jsonify({"error": "At least two songs are required"}), 400

        # 1. Create a new job in the database with status 'queued'
        job_data = {'songs': songs}
        insert_payload = {'job_data': job_data, 'status': 'queued'}

        response = supabase_client.table('mashup_jobs').insert(insert_payload).execute()

        if not response.data:
            raise RuntimeError("Failed to insert new job into the database.")

        job_id = response.data[0]['id']

        # 2. Immediately return the job ID to the client
        return jsonify({"success": True, "jobId": job_id})

    except Exception as e:
        print("Error creating mashup job:")
        traceback.print_exc()
        return jsonify({"error": "Failed to create mashup job", "details": str(e)}), 500

if __name__ == '__main__':
    # This part is for local testing and will not run in the Supabase environment
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))
