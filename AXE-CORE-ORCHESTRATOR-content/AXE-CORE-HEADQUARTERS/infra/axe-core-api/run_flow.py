#!/usr/bin/env python3
"""
run_flow.py — standalone runner for a crewai.flow/v1 declarative Flow.

    python run_flow.py <flow.json> <inputs.json> <result.json>

Mirrors run_crew.py's pattern: read inputs from a file, write the result to
a file (not stdout), so verbose flow logging can never corrupt the result.
"""
import sys
import json
import traceback

def main():
    flow_path, inputs_path, result_path = sys.argv[1], sys.argv[2], sys.argv[3]
    with open(inputs_path) as f:
        inputs = json.load(f)

    from crewai.flow.flow import Flow
    flow = Flow.from_declaration(path=flow_path)
    try:
        result = flow.kickoff(inputs=inputs)
        with open(result_path, "w") as f:
            json.dump({"status": "ok", "result": str(result), "state": dict(flow.state) if hasattr(flow.state, "items") else str(flow.state)}, f, default=str)
    except Exception as e:
        with open(result_path, "w") as f:
            json.dump({"status": "error", "error": f"{type(e).__name__}: {e}", "traceback": traceback.format_exc()}, f)

if __name__ == "__main__":
    main()
